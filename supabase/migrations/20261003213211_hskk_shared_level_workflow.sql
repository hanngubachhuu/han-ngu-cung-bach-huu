-- Shared authoring contract. Existing immutable versions and history remain pinned.
create or replace function account_internal.hskk_validate_structure(config jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare level_name text:=config->>'level'; sizes integer[]; types text[]; modes text[]; q jsonb; part integer; pos integer:=0; expected integer;
begin
 case level_name
 when 'elementary' then sizes:=array[15,10,2];types:=array['speaking_repeat','speaking_answer','speaking_long_answer'];modes:=array['audio','audio','text'];
 when 'intermediate' then sizes:=array[10,2,2];types:=array['speaking_repeat','picture_description','long_response'];modes:=array['audio','image','text'];
 when 'advanced' then sizes:=array[3,1,2];types:=array['short_response','read_aloud','long_response'];modes:=array['audio','text','text'];
 else raise exception 'INVALID_LEVEL';end case;
 expected:=sizes[1]+sizes[2]+sizes[3];
 if jsonb_array_length(config->'questions') is distinct from expected
 or jsonb_array_length(config->'sections') is distinct from 3
 or not coalesce((config->'timing'->>'countdown_seconds')::integer between 1 and 10,false)
 then raise exception 'INVALID_LEVEL_STRUCTURE';end if;
 for part in 1..3 loop
  if config->'sections'->(part-1)->>'id' is distinct from 'part'||part
   or not coalesce((config->'sections'->(part-1)->>'preparation_seconds')::integer between 0 and 900,false)
   or (config->'sections'->(part-1) ? 'preparation_section_ids' and
    (jsonb_typeof(config->'sections'->(part-1)->'preparation_section_ids') is distinct from 'array'
     or exists(select 1 from jsonb_array_elements_text(config->'sections'->(part-1)->'preparation_section_ids') x where x not in ('part1','part2','part3'))))
  then raise exception 'INVALID_LEVEL_STRUCTURE';end if;
 end loop;
 for q in select * from jsonb_array_elements(config->'questions') loop
  pos:=pos+1;part:=case when pos<=sizes[1] then 1 when pos<=sizes[1]+sizes[2] then 2 else 3 end;
  if q->>'id' is distinct from 'q'||pos or (q->>'number')::integer is distinct from pos
   or q->>'section_id' is distinct from 'part'||part or q->>'type' is distinct from types[part]
   or q->>'prompt_mode' is distinct from modes[part]
   or not coalesce((q->>'response_seconds')::integer between 1 and 300,false)
   or (q->>'auto_start')::boolean is distinct from true or (q->>'auto_stop')::boolean is distinct from true
   or (q->>'allow_navigation')::boolean is distinct from false or (q->>'allow_replay')::boolean is distinct from false or (q->>'allow_rerecord')::boolean is distinct from false
   or (modes[part]='image' and not coalesce(q->'prompt_image'->>'sha256' ~ '^[a-f0-9]{64}$',false))
  then raise exception 'INVALID_LEVEL_STRUCTURE';end if;
 end loop;
end $$;
revoke all on function account_internal.hskk_validate_structure(jsonb) from public,anon,authenticated;
alter table account_internal.hskk_delivery_questions drop constraint hskk_delivery_questions_prompt_mode_check;
alter table account_internal.hskk_delivery_questions add constraint hskk_delivery_questions_prompt_mode_check check(prompt_mode in ('audio','text','image'));
alter table account_internal.hskk_controlled_test_authorizations drop constraint hskk_controlled_test_authorizations_exam_id_check;

create table account_internal.hskk_content_reviews(
 id uuid primary key default gen_random_uuid(), exam_code text not null, source_sha256 text not null,
 working_fingerprint text not null, configuration jsonb not null,
 reviewed_by uuid not null references public.profiles(user_id), reviewed_at timestamptz not null default clock_timestamp(),
 unique(exam_code,source_sha256,working_fingerprint)
);
create table account_internal.hskk_delivery_review_versions(
 assignment_version_id uuid primary key references account_internal.hskk_delivery_versions(assignment_version_id),
 configuration jsonb not null
);
alter table account_internal.hskk_content_reviews enable row level security;
alter table account_internal.hskk_delivery_review_versions enable row level security;
revoke all on account_internal.hskk_content_reviews,account_internal.hskk_delivery_review_versions from public,anon,authenticated;
create trigger hskk_content_review_immutable before update or delete on account_internal.hskk_content_reviews for each row execute function account_internal.hskk_draft_immutable();
create trigger hskk_delivery_review_immutable before update or delete on account_internal.hskk_delivery_review_versions for each row execute function account_internal.hskk_draft_immutable();
create function account_internal.hskk_review_configuration(source jsonb,working jsonb) returns jsonb
 language plpgsql immutable set search_path='' as $$
declare result jsonb:=source; questions jsonb:='[]'; q jsonb; w jsonb;
begin
 if working is null then return source;end if;
 if jsonb_array_length(working->'questions') is distinct from jsonb_array_length(source->'questions') then raise exception 'INVALID_LEVEL_STRUCTURE';end if;
 for q in select * from jsonb_array_elements(source->'questions') loop
  if (select count(*) from jsonb_array_elements(working->'questions') x where coalesce(x->>'question_key',x->>'id')=q->>'id')<>1 then raise exception 'INVALID_LEVEL_STRUCTURE';end if;
  select x into w from jsonb_array_elements(working->'questions') x where coalesce(x->>'question_key',x->>'id')=q->>'id';
  questions:=questions||jsonb_build_array(q||jsonb_build_object('prompt',coalesce(w->>'prompt',q->>'prompt'),
   'type',coalesce(w->>'kind',w->>'type',q->>'type'),'prompt_mode',coalesce(w->>'prompt_mode',q->>'prompt_mode'),
   'response_seconds',coalesce(w->'response_seconds',q->'response_seconds')));
 end loop;
 result:=jsonb_set(jsonb_set(jsonb_set(source,'{questions}',questions),'{sections}',coalesce(working->'sections',source->'sections')),'{title}',coalesce(working->'title',source->'title'));
 perform account_internal.hskk_validate_structure(result);
 return result;
end $$;
revoke all on function account_internal.hskk_review_configuration(jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hskk_delivery_admin(command text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare actor uuid:=auth.uid(); code text:=payload->>'exam_code'; d account_internal.hskk_exam_draft_revisions;
 entry account_internal.admin_exams; v account_internal.hskk_delivery_versions;
 q jsonb; clip jsonb; segment jsonb; made jsonb; ids uuid[]:='{}'; rubric uuid; definition jsonb;
 request_fingerprint text; delivery text; course text; pos integer:=0; qid uuid; student uuid; level_name text; level_number integer; expected_count integer; reviewed_config jsonb;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if code !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'EXAM_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-delivery:'||code,0));
 select * into entry from account_internal.admin_exams where id=code;
 if command='review_status' then
  select * into d from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
  if entry.id is null or d.id is null then raise exception 'EXAM_UNAVAILABLE';end if;
  return jsonb_build_object('reviewed',d.configuration->'provenance'->>'timing_review' is distinct from 'REQUIRED_SOURCE_AUDIO_REVIEW' or exists(
   select 1 from account_internal.hskk_content_reviews where exam_code=code and source_sha256=d.source_sha256 and working_fingerprint=md5((entry.working-'revision'-'active'-'backend_available')::text)));
 elsif command='review_content' then
  select * into d from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
  if entry.id is null or d.id is null or entry.revision is distinct from (payload->>'expected_revision')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
  reviewed_config:=account_internal.hskk_review_configuration(d.configuration,entry.working);
  if exists(select 1 from jsonb_array_elements(reviewed_config->'questions') q where q->>'prompt_mode'='text' and length(trim(coalesce(q->>'prompt','')))=0) then raise exception 'CONTENT_REVIEW_REQUIRED';end if;
  insert into account_internal.hskk_content_reviews(exam_code,source_sha256,working_fingerprint,configuration,reviewed_by)
   values(code,d.source_sha256,md5((entry.working-'revision'-'active'-'backend_available')::text),reviewed_config,actor)on conflict do nothing;
  perform account_internal.assignment_audit('hskk_content_reviewed',actor,jsonb_build_object('exam_code',code,'source_sha256',d.source_sha256,'working_revision',entry.revision));
  return jsonb_build_object('reviewed',true,'working_revision',entry.revision);
 elsif command='prepare' then
  select * into d from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
  if d.revision is distinct from (payload->>'expected_revision')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
  perform account_internal.hskk_validate_structure(d.configuration);
  reviewed_config:=account_internal.hskk_review_configuration(d.configuration,entry.working);
  if d.configuration->'provenance'->>'timing_review'='REQUIRED_SOURCE_AUDIO_REVIEW' and not exists(
   select 1 from account_internal.hskk_content_reviews where exam_code=code and source_sha256=d.source_sha256 and working_fingerprint=md5((entry.working-'revision'-'active'-'backend_available')::text))
   then raise exception 'CONTENT_REVIEW_REQUIRED';end if;
  level_name:=d.configuration->>'level';
  level_number:=case level_name when 'elementary' then 1 when 'intermediate' then 2 when 'advanced' then 3 end;
  expected_count:=jsonb_array_length(d.configuration->'questions');
  if d.configuration->>'exam_code' is distinct from code
    or d.source_sha256 is distinct from d.configuration->'audio'->>'source_audio_id'
    or jsonb_array_length(d.configuration->'audio'->'clip_provenance') is distinct from expected_count
    or not coalesce(jsonb_array_length(d.configuration->'audio'->'segmentation_runs')>=1,false)
    or not exists(select 1 from account_internal.hskk_exam_source_assets a join storage.objects o on o.name=a.object_path and o.bucket_id='hskk-authoring-sources'
      where a.exam_code=code and a.sha256=d.source_sha256 and a.byte_size=(o.metadata->>'size')::bigint)
    then raise exception 'SOURCE_BINDING_REQUIRED';end if;
  request_fingerprint:=md5(d.id::text||reviewed_config::text);
  select * into v from account_internal.hskk_delivery_versions where exam_id=code and hskk_delivery_versions.fingerprint=request_fingerprint;
  if v.assignment_version_id is not null then
   return jsonb_build_object('version_id',v.assignment_version_id,'prepared',true,'reused',true);
  end if;
  course:='hskk-'||level_name;delivery:='exam-'||code;
  if exists(select 1 from public.courses where program='HSKK' and level=level_number and id<>course) then raise exception 'COURSE_BINDING_CONFLICT';end if;
  insert into public.courses(id,title,level,program) values(course,'HSKK '||(case level_number when 1 then 'Sơ cấp' when 2 then 'Trung cấp' else 'Cao cấp' end),level_number,'HSKK') on conflict(id)do nothing;
  insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,visibility,content,course_id)
   select delivery,level_number,coalesce(max(lesson_no),0)+1,'',d.configuration->>'title','student','{}',course
   from public.lesson_content where course_id=course on conflict(id)do nothing;
  if not exists(select 1 from public.lesson_content l join public.courses c on c.id=l.course_id where l.id=delivery and c.id=course and c.program='HSKK' and c.level=level_number) then raise exception 'COURSE_BINDING_CONFLICT';end if;
  if entry.id is null then
   insert into account_internal.admin_exams(id,exam_type,level,working,delivery_id,created_by)
    values(code,'HSKK',level_name,jsonb_build_object('id',code,'code',code,'type','HSKK','level',level_name,'title',d.configuration->>'title','questions',d.configuration->'questions'),delivery,actor) returning * into entry;
  elsif entry.exam_type<>'HSKK' or entry.level<>level_name then raise exception 'COURSE_BINDING_CONFLICT';
  else update account_internal.admin_exams set delivery_id=delivery where id=code;end if;
  -- Manual teacher judgement on the existing ten-point storage scale. This is
  -- not an official HSKK rubric and does not generate any scores.
  select id into rubric from public.assignment_rubric_versions where rubric_key='hskk-teacher-review' order by version desc limit 1;
  if rubric is null then
   made:=account_internal.assignment_command('rubric_create',jsonb_build_object('rubric_key','hskk-teacher-review','kind','speaking',
    'criteria','[{"id":"teacher_review","label":"Đánh giá của giáo viên","weight":10}]'::jsonb));rubric:=(made->>'id')::uuid;
  end if;
  for q in select * from jsonb_array_elements(reviewed_config->'questions') loop
   pos:=pos+1;segment:=q->'audio_segment';
   if q->>'id' is distinct from 'q'||pos or (q->>'number')::integer is distinct from pos
    or (segment->>'verified')::boolean is distinct from true or segment->>'status' not in ('CONFIRMED','MANUALLY_ADJUSTED')
    or segment->>'source_sha256' is distinct from d.source_sha256
    or coalesce(segment->>'reviewed_by','')='' or coalesce(segment->>'reviewed_at','')=''
    or not exists(select 1 from public.profiles where user_id=(segment->>'reviewed_by')::uuid and role='ADMIN' and status='APPROVED')
    or (segment->>'start_ms')::integer<0 or (segment->>'end_ms')::integer<=(segment->>'start_ms')::integer
    or (segment->>'end_ms')::numeric>(d.configuration->'audio'->>'duration_seconds')::numeric*1000
    or not exists(select 1 from jsonb_array_elements(d.configuration->'audio'->'segmentation_runs') r where r->>'run_id'=segment->>'run_id')
    or (q->>'allow_navigation')::boolean is distinct from false
    or (q->>'allow_replay')::boolean is distinct from false or (q->>'allow_rerecord')::boolean is distinct from false
    or (q->>'auto_start')::boolean is distinct from true or (q->>'auto_stop')::boolean is distinct from true
    then raise exception 'UNVERIFIED_QUESTION';end if;
   select x into clip from jsonb_array_elements(d.configuration->'audio'->'clip_provenance') x where x->>'question_id'=q->>'id';
   if (select count(*) from jsonb_array_elements(d.configuration->'audio'->'clip_provenance') x where x->>'question_id'=q->>'id')<>1
    or clip->>'source_sha256' is distinct from d.source_sha256 or clip->>'run_id' is distinct from segment->>'run_id'
    or clip->'start_ms' is distinct from segment->'start_ms' or clip->'end_ms' is distinct from segment->'end_ms'
    or clip->>'reviewed_by' is distinct from segment->>'reviewed_by' or clip->>'reviewed_at' is distinct from segment->>'reviewed_at'
    or clip->'question_version' is distinct from q->'version' or clip->>'exam_code' is distinct from code
    or clip->'exam_version' is distinct from d.configuration->'exam_version'
    or clip->>'method' is distinct from 'ffmpeg_atrim_confirmed_ms'
    or abs((clip->>'duration_ms')::integer-((segment->>'end_ms')::integer-(segment->>'start_ms')::integer))>200
    or clip->>'clip_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'CLIP_BINDING_REQUIRED';end if;
   insert into account_internal.hskk_prompt_assets(sha256,object_path,duration_ms,created_by)
    values(clip->>'clip_sha256',(clip->>'clip_sha256')||'.mp3',(segment->>'end_ms')::integer-(segment->>'start_ms')::integer,actor)on conflict do nothing;
   perform set_config('assignment.authoring_metadata',jsonb_build_object('source','document','source_identifier',code,'source_revision',d.revision,'source_item_id',q->>'id','origin','manual')::text,true);
   made:=account_internal.assignment_command('question_create',jsonb_build_object('lesson_id',delivery,'question_key',q->>'id','kind','speaking',
    'prompt',coalesce(nullif((select x->>'prompt' from jsonb_array_elements(entry.working->'questions') x where coalesce(x->>'question_key',x->>'id')=q->>'id'),''),nullif(q->>'prompt',''),case q->>'prompt_mode' when 'image' then 'Tranh câu '||pos when 'audio' then 'Audio câu '||pos else null end),'rubric_version_id',rubric));
   ids:=array_append(ids,(made->>'id')::uuid);
  end loop;
  perform set_config('assignment.authoring_metadata','',true);
  definition:=account_internal.assignment_command('definition_create',jsonb_build_object('lesson_id',delivery,'title',entry.working->>'title','question_version_ids',to_jsonb(ids)));
  insert into account_internal.hskk_delivery_versions values((definition->>'id')::uuid,code,d.id,request_fingerprint,actor,clock_timestamp());
  insert into account_internal.hskk_delivery_review_versions values((definition->>'id')::uuid,reviewed_config);
  pos:=0;
  for q in select * from jsonb_array_elements(reviewed_config->'questions') loop
   pos:=pos+1;qid:=ids[pos];select x into clip from jsonb_array_elements(d.configuration->'audio'->'clip_provenance') x where x->>'question_id'=q->>'id';
   insert into account_internal.hskk_delivery_questions values(qid,(definition->>'id')::uuid,pos,q->>'section_id',q->>'type',q->>'prompt_mode',(q->>'response_seconds')::integer,clip->>'clip_sha256',clip);
  end loop;
  perform account_internal.assignment_audit('hskk_delivery_prepared',(definition->>'id')::uuid,jsonb_build_object('exam_id',code,'authoring_revision',d.revision));
  return jsonb_build_object('prepared',true,'version_id',definition->>'id','question_count',expected_count,'published',false);
 elsif command='grant_access' then
  student:=(payload->>'student_id')::uuid;
  if entry.delivery_id is null or not exists(select 1 from public.profiles where user_id=student and role='STUDENT' and status='APPROVED') then raise exception 'APPROVED_STUDENT_REQUIRED';end if;
  insert into account_internal.hskk_controlled_access values(code,student,actor,clock_timestamp())on conflict do nothing;
  insert into public.enrollments(user_id,course_id,access_mode)select student,course_id,'SELECTED' from public.lesson_content where id=entry.delivery_id on conflict(user_id,course_id)do nothing;
  insert into public.student_lesson_access(user_id,lesson_id)values(student,entry.delivery_id)on conflict(user_id,lesson_id)do nothing;
  perform account_internal.assignment_audit('hskk_access_granted',student,jsonb_build_object('exam_id',code));
  return jsonb_build_object('granted',account_internal.can_access_lesson(entry.delivery_id),'student_id',student);
 elsif command='get' then
  select * into v from account_internal.hskk_delivery_versions where exam_id=code order by created_at desc limit 1;
  if v.assignment_version_id is null then return jsonb_build_object('prepared',false);end if;
  return jsonb_build_object('prepared',true,'version_id',v.assignment_version_id,'published',coalesce(entry.active_version_id=v.assignment_version_id,false),
   'question_count',(select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=v.assignment_version_id),
   'verified_clips',(select count(*) from account_internal.hskk_delivery_questions q join account_internal.hskk_prompt_receipts r on r.sha256=q.clip_sha256 where q.assignment_version_id=v.assignment_version_id),
   'controlled_students',(select count(*) from account_internal.hskk_controlled_access where exam_id=code),
   'clips',(select jsonb_agg(jsonb_build_object('question_key',aq.question_key,'question_version_id',q.question_version_id,'sha256',q.clip_sha256,'path',a.object_path,'duration_ms',a.duration_ms)order by q.position)
     from account_internal.hskk_delivery_questions q join account_internal.hskk_prompt_assets a on a.sha256=q.clip_sha256 join public.assignment_question_versions aq on aq.id=q.question_version_id where q.assignment_version_id=v.assignment_version_id));
 end if;
 raise exception 'INVALID_COMMAND';
end $function$;


CREATE OR REPLACE FUNCTION account_internal.hskk_readiness(code text, version_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('ready',
  h.assignment_version_id is not null and v.status='draft' and
  h.authoring_revision_id=(select id from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1) and
  (select count(*) from account_internal.hskk_delivery_questions q join account_internal.hskk_prompt_receipts r on r.sha256=q.clip_sha256
   join account_internal.hskk_prompt_assets a on a.sha256=q.clip_sha256 join storage.objects o on o.name=a.object_path and o.bucket_id='hskk-prompt-clips'
   where q.assignment_version_id=v.id and (o.metadata->>'size')::integer=r.byte_size)=(select jsonb_array_length(d.configuration->'questions') from account_internal.hskk_exam_draft_revisions d where d.id=h.authoring_revision_id) and
  exists(select 1 from account_internal.hskk_controlled_access g join public.profiles p on p.user_id=g.owner_id and p.role='STUDENT' and p.status='APPROVED'
   join public.enrollments en on en.user_id=p.user_id and en.course_id=l.course_id and en.active
   join public.student_lesson_access la on la.user_id=p.user_id and la.lesson_id=e.delivery_id and la.active where g.exam_id=code) and
  exists(select 1 from account_internal.hskk_runtime_receipts where exam_id=code and runtime_version='hskk-official-v1'),
  'version_id',h.assignment_version_id,'question_count',(select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=v.id),
  'runtime_verified',exists(select 1 from account_internal.hskk_runtime_receipts where exam_id=code))
 from account_internal.admin_exams e left join account_internal.hskk_delivery_versions h on h.exam_id=e.id and h.assignment_version_id=version_id
 left join public.assignment_versions v on v.id=h.assignment_version_id left join public.lesson_content l on l.id=e.delivery_id where e.id=code
$function$;

CREATE OR REPLACE FUNCTION account_internal.hskk_delivery_config(version_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('exam_code',h.exam_id,'exam_version',v.version,'assignment_version_id',v.id,'title',v.title,
  'level',d.configuration->>'level','source_type','official','delivery_mode','private_clips',
  'timing',jsonb_build_object('countdown_seconds',(d.configuration->'timing'->>'countdown_seconds')::integer,'prompt_load_seconds',5,'prompt_start_grace_ms',250),
  'sections',coalesce(reviewed.configuration->'sections',d.configuration->'sections'),
  'questions',(select jsonb_agg(jsonb_build_object('id',q.question_key,'version',q.version,'version_id',q.id,'number',b.position,
   'section_id',b.section_id,'type',b.question_type,'prompt_mode',b.prompt_mode,'prompt',case when b.prompt_mode='audio' then '' else q.prompt end,
   'response_seconds',b.response_seconds,'auto_start',true,'auto_stop',true,'allow_replay',false,'allow_rerecord',false,'allow_navigation',false,
   'prompt_image',case when b.prompt_mode='image' then jsonb_build_object('available',true) else null end,
   'prompt_audio',jsonb_build_object('duration_ms',a.duration_ms))order by b.position)
    from account_internal.hskk_delivery_questions b join public.assignment_question_versions q on q.id=b.question_version_id
    join account_internal.hskk_prompt_assets a on a.sha256=b.clip_sha256 where b.assignment_version_id=v.id))
 from account_internal.hskk_delivery_versions h join public.assignment_versions v on v.id=h.assignment_version_id
 join account_internal.hskk_exam_draft_revisions d on d.id=h.authoring_revision_id
 left join account_internal.hskk_delivery_review_versions reviewed on reviewed.assignment_version_id=v.id where v.id=version_id
$function$;

CREATE OR REPLACE FUNCTION public.hskk_publication_before_makeup(command text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare code text:=payload->>'exam_code'; version_id uuid:=(payload->>'version_id')::uuid; ready jsonb; v public.assignment_versions; e account_internal.admin_exams; now_at timestamptz;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from account_internal.admin_exams where id=code and exam_type='HSKK') then raise exception 'EXAM_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-delivery:'||code,0));
 select * into e from account_internal.admin_exams where id=code for update;
 ready:=account_internal.hskk_readiness(code,version_id);
 if command='readiness' then return coalesce(ready,jsonb_build_object('ready',false));end if;
 if command='process_list' then
  if not exists(select 1 from account_internal.hskk_sessions s join account_internal.hskk_delivery_versions delivery_version on delivery_version.assignment_version_id=s.assignment_version_id
   join public.submission_details d on d.attempt_id=s.attempt_id and d.state='submitted' where s.attempt_id=(payload->>'attempt_id')::uuid and delivery_version.exam_id=code) then raise exception 'SUBMISSION_NOT_FOUND';end if;
  return jsonb_build_object('recording_ids',(select jsonb_agg(r.id order by q.position) from account_internal.speaking_recordings r join account_internal.hskk_delivery_questions q on q.question_version_id=r.question_version_id where r.attempt_id=(payload->>'attempt_id')::uuid and r.conversion_status<>'completed'));
 end if;
 if command<>'publish' then raise exception 'INVALID_COMMAND';end if;
 if e.active_version_id=version_id then return jsonb_build_object('published',true,'version_id',version_id);end if;
 if coalesce((ready->>'ready')::boolean,false) is distinct from true then raise exception 'HSKK_NOT_READY';end if;
 select * into v from public.assignment_versions where id=version_id for update;
 now_at:=clock_timestamp();
 -- Existing immutable version guards permit only this one-way draft publication.
 update public.assignment_question_versions set published_at=now_at,published_by=auth.uid() where id in(select question_version_id from public.assignment_version_questions where assignment_version_id=v.id) and published_at is null;
 update public.assignment_versions set previewed_at=now_at,published_at=now_at,published_by=auth.uid(),status='published' where id=v.id;
 update public.lesson_assignments set current_version_id=v.id,enabled=true,protected_at=coalesce(protected_at,now_at),updated_at=now_at where lesson_id=e.delivery_id;
 update account_internal.admin_exams set active_version_id=v.id,revision=revision+1,updated_at=now_at where id=code returning * into e;
 insert into account_internal.admin_exam_versions values(code,e.revision,e.working,v.id,auth.uid(),now_at);
 perform account_internal.assignment_audit('hskk_published',v.id,jsonb_build_object('exam_id',code,'revision',e.revision));
 return jsonb_build_object('published',true,'version_id',v.id,'revision',e.revision);
end $function$;

CREATE OR REPLACE FUNCTION public.hskk_runtime_verified(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED';end if;
 if not exists(select 1 from account_internal.hskk_delivery_versions where exam_id=payload->>'exam_code') or payload->>'runtime_version' is distinct from 'hskk-official-v1'
  or not exists(select 1 from public.profiles where user_id=(payload->>'actor')::uuid and role='ADMIN' and status='APPROVED') then raise exception 'ADMIN_REQUIRED';end if;
 insert into account_internal.hskk_runtime_receipts(exam_id,runtime_version)values(payload->>'exam_code',payload->>'runtime_version')on conflict do nothing;
 return jsonb_build_object('verified',true);
end $function$;

CREATE OR REPLACE FUNCTION public.hskk_recording_claim(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r account_internal.speaking_recordings; now_at timestamptz:=clock_timestamp();
begin
 if current_setting('role',true)<>'service_role' then raise exception 'WORKER_REQUIRED';end if;
 select r0.* into r from account_internal.speaking_recordings r0
 join account_internal.hskk_sessions s on s.attempt_id=r0.attempt_id and s.owner_id=r0.owner_id
 join account_internal.hskk_delivery_versions v on v.assignment_version_id=s.assignment_version_id
 join public.submission_details d on d.attempt_id=s.attempt_id and d.state='submitted'
 join public.submission_answers a on a.attempt_id=r0.attempt_id and a.question_version_id=r0.question_version_id and a.answer=jsonb_build_object('recording_id',r0.id)
 where r0.id=(payload->>'recording_id')::uuid and r0.raw_uploaded_at is not null and r0.cleaned_at is null and r0.drive_status<>'completed'
  and r0.next_attempt_at<=now_at and (r0.lease_until is null or r0.lease_until<now_at) for update of r0 skip locked;
 if r.id is null then return null;end if;
 update account_internal.speaking_recordings set lease_id=gen_random_uuid(),lease_until=now_at+interval '5 minutes' where id=r.id returning * into r;
 perform account_internal.speaking_event(r.id,'processing_claimed',jsonb_build_object('scope',(select exam_id from account_internal.hskk_delivery_versions where assignment_version_id=(select assignment_version_id from account_internal.hskk_sessions where attempt_id=r.attempt_id))));
 return to_jsonb(r)||jsonb_build_object('job','process','raw_path',r.id::text||'/raw','mp3_path',r.id::text||'/audio.mp3');
end $function$;

CREATE OR REPLACE FUNCTION public.hskk_session_command_before_preflight_recovery(command text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare actor uuid:=auth.uid(); code text:=payload->>'exam_code'; e account_internal.admin_exams; p account_internal.hskk_preflights; s account_internal.hskk_sessions;
 v public.assignment_versions; frames jsonb; finished integer; now_at timestamptz; states text[]:=array['CREATED','CANDIDATE_VERIFIED','DEVICE_CHECK','MIC_CHECK','READY','STRUCTURE','COUNTDOWN']; target text; answer public.submission_answers; r account_internal.speaking_recordings; result jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
 if command='catalog' then
  return coalesce((select jsonb_agg(jsonb_build_object('exam_code',e.id,'title',v.title,'exam_version',v.version,'level',e.level)||account_internal.hskk_catalog_projection(v.id))
   from account_internal.admin_exams e join public.assignment_versions v on v.id=e.active_version_id
   join public.lesson_assignments l on l.lesson_id=e.delivery_id and l.enabled
   join account_internal.hskk_controlled_access g on g.exam_id=e.id and g.owner_id=actor
   where e.exam_type='HSKK' and v.status='published' and account_internal.can_access_lesson(e.delivery_id)),'[]'::jsonb);
 end if;
 if command='load' then
  select * into e from account_internal.admin_exams where id=code and exam_type='HSKK';
  if e.active_version_id is null or not exists(select 1 from public.lesson_assignments where lesson_id=e.delivery_id and enabled)
    or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=e.id and owner_id=actor)
    or not account_internal.can_access_lesson(e.delivery_id) then raise exception 'EXAM_ACCESS_REQUIRED' using errcode='42501';end if;
  select * into v from public.assignment_versions where id=e.active_version_id and status='published';
  if v.id is null then raise exception 'EXAM_UNAVAILABLE';end if;
  -- Resume the pinned session, even after a later version was activated.
  select pf.* into p from account_internal.hskk_preflights pf join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=pf.assignment_version_id
   where pf.owner_id=actor and dv.exam_id=e.id and (pf.assignment_version_id=v.id or exists(select 1 from public.submission_details sd where sd.attempt_id=pf.id and sd.state='draft' and sd.deadline_at>clock_timestamp()))
   order by exists(select 1 from public.submission_details sd where sd.attempt_id=pf.id and sd.state='draft' and sd.deadline_at>clock_timestamp()) desc,pf.created_at desc limit 1;
  if p.id is null then
   insert into account_internal.hskk_preflights(owner_id,assignment_version_id)values(actor,v.id)on conflict(owner_id,assignment_version_id)do nothing;
   select * into p from account_internal.hskk_preflights where owner_id=actor and assignment_version_id=v.id;
  end if;
  return jsonb_build_object('exam',account_internal.hskk_delivery_config(p.assignment_version_id),'session',account_internal.hskk_session_read(p.id));
 end if;
 select * into p from account_internal.hskk_preflights where id=(payload->>'attempt_id')::uuid and owner_id=actor for update;
 if p.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 select a.* into e from account_internal.admin_exams a join account_internal.hskk_delivery_versions h on h.exam_id=a.id where h.assignment_version_id=p.assignment_version_id;
 if not account_internal.can_access_lesson(e.delivery_id) or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=e.id and owner_id=actor) then raise exception 'EXAM_ACCESS_REQUIRED' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=p.id;
 now_at:=clock_timestamp();
 if command='transition' then
  target:=payload->>'state';
  if s.attempt_id is not null then
   if target='COMPLETED' and now_at>=s.exam_deadline then return account_internal.hskk_session_read(p.id);end if;
   if target='COUNTDOWN' then return account_internal.hskk_session_read(p.id);end if;
   raise exception 'INVALID_TRANSITION';
  end if;
  if now_at>=p.expires_at then raise exception 'PREFLIGHT_EXPIRED';end if;
  if target=p.state then return account_internal.hskk_session_read(p.id);end if;
  if target is distinct from states[array_position(states,p.state)+1] then raise exception 'INVALID_TRANSITION';end if;
  if target='COUNTDOWN' then
   if e.active_version_id is distinct from p.assignment_version_id or not exists(select 1 from public.lesson_assignments where lesson_id=e.delivery_id and enabled) then raise exception 'EXAM_UNAVAILABLE';end if;
   frames:=account_internal.hskk_timeline(p.assignment_version_id);finished:=(frames->-1->>'end')::integer;
   if finished is null or finished<=0 then raise exception 'TIMING_INVALID';end if;
   insert into public.learning_attempts(id,user_id,lesson_id,client_attempt_id,score,max_score,source,submitted_at)values(p.id,actor,e.delivery_id,'hskk:'||p.id::text,null,null,'official',null);
   insert into public.submission_details(attempt_id,assignment_version_id,started_at,deadline_at)values(p.id,p.assignment_version_id,now_at,now_at+make_interval(secs=>finished/1000.0)+interval '30 minutes');
   insert into account_internal.hskk_sessions values(p.id,actor,p.assignment_version_id,now_at,now_at+make_interval(secs=>finished/1000.0),now_at+make_interval(secs=>finished/1000.0)+interval '30 minutes',frames);
   insert into public.submission_answers(attempt_id,question_version_id,position,prompt_snapshot)
    select p.id,q.id,aq.position,account_internal.assignment_question_projection(q) from public.assignment_version_questions aq join public.assignment_question_versions q on q.id=aq.question_version_id where aq.assignment_version_id=p.assignment_version_id;
   perform account_internal.assignment_audit('hskk_started',p.id,jsonb_build_object('assignment_version_id',p.assignment_version_id));
  end if;
  update account_internal.hskk_preflights set state=target where id=p.id;
 elsif command='bind_recording' then
  if s.attempt_id is null then raise exception 'SESSION_NOT_STARTED';end if;
  select * into r from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid and attempt_id=p.id and owner_id=actor;
  select * into answer from public.submission_answers where attempt_id=p.id and question_version_id=r.question_version_id for update;
  if r.id is null or answer.attempt_id is null then raise exception 'INVALID_RECORDING_REFERENCE';end if;
  perform account_internal.speaking_check_answer(p.id,r.question_version_id,jsonb_build_object('recording_id',r.id));
  if answer.answer<>'null'::jsonb and answer.answer<>jsonb_build_object('recording_id',r.id) then raise exception 'RECORDING_LOCKED';end if;
  if answer.answer='null'::jsonb then
   update public.submission_answers set answer=jsonb_build_object('recording_id',r.id) where attempt_id=p.id and question_version_id=r.question_version_id;
   update public.submission_details set revision=revision+1 where attempt_id=p.id;
  end if;
  return jsonb_build_object('recording_id',r.id,'owner_id',actor,'attempt_id',p.id,'question_version_id',r.question_version_id,'confirmed',true);
 elsif command='submit' then
  if s.attempt_id is null or now_at<s.exam_deadline then raise exception 'EXAM_NOT_COMPLETED';end if;
  if exists(select 1 from public.submission_details where attempt_id=p.id and state='submitted') then return account_internal.hskk_session_read(p.id);end if;
  if now_at>=s.upload_deadline then raise exception 'UPLOAD_WINDOW_EXPIRED';end if;
  if (select count(*) from public.submission_answers where attempt_id=p.id and answer<>'null'::jsonb)<>(select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=p.assignment_version_id) then raise exception 'RECORDING_REQUIRED';end if;
  for answer in select * from public.submission_answers where attempt_id=p.id loop perform account_internal.speaking_check_answer(p.id,answer.question_version_id,answer.answer);end loop;
  perform account_internal.assignment_finish(p.id);
 elsif command='result' then
  result:=account_internal.assignment_read(p.id,false)->'result';
  if result is null or result='null'::jsonb then return jsonb_build_object('source','official');end if;
  return jsonb_build_object('source','official','published_at',result->'published_at','score',result->'normalized_score','feedback',result->'questions');
 elsif command<>'get' then raise exception 'INVALID_COMMAND';
 end if;
 return account_internal.hskk_session_read(p.id);
end $function$;

CREATE OR REPLACE FUNCTION public.hskk_controlled_test(command text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); student uuid:=(payload->>'student_id')::uuid;
 e account_internal.admin_exams; v public.assignment_versions; prior account_internal.hskk_sessions;
 grant_row account_internal.hskk_controlled_test_authorizations; new_preflight uuid:=gen_random_uuid();
 request uuid:=(payload->>'request_id')::uuid;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096
  or coalesce(payload->>'exam_code','') !~ '^[A-Za-z0-9_-]{1,64}$' or command not in ('inspect','authorize')
 then raise exception 'INVALID_REQUEST';end if;
 select * into e from account_internal.admin_exams where id=payload->>'exam_code' and exam_type='HSKK';
 select * into v from public.assignment_versions where id=e.active_version_id and status='published';
 if v.id is null or not exists(select 1 from public.lesson_assignments where lesson_id=e.delivery_id and enabled and current_version_id=v.id)
  or (select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=v.id)<>(select count(*) from public.assignment_version_questions where assignment_version_id=v.id)
 then raise exception 'EXAM_UNAVAILABLE';end if;
 if not exists(select 1 from public.profiles where user_id=student and role='STUDENT' and status='APPROVED')
  or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=e.id and owner_id=student)
  or not exists(select 1 from public.enrollments en join public.lesson_content l on l.course_id=en.course_id
   where en.user_id=student and en.active and l.id=e.delivery_id
    and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access a where a.user_id=student and a.lesson_id=l.id and a.active)))
 then raise exception 'EXAM_ACCESS_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-preflight:'||student::text||v.id::text,0));
 select * into grant_row from account_internal.hskk_controlled_test_authorizations where owner_id=student and assignment_version_id=v.id;
 select s.* into prior from account_internal.hskk_sessions s where s.owner_id=student and s.assignment_version_id=v.id order by s.started_at desc limit 1;
 if command='inspect' then
  return jsonb_build_object('exam_code',e.id,'version_id',v.id,'student_id',student,'previous_attempt_id',prior.attempt_id,
   'can_authorize',grant_row.id is null and prior.attempt_id is not null and prior.upload_deadline<=clock_timestamp(),
   'authorized',grant_row.id is not null,'attempt_id',grant_row.preflight_id,'label',grant_row.label);
 end if;
 if request is null or (payload->>'expected_version_id')::uuid is distinct from v.id then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if grant_row.id is not null then
  if grant_row.request_id is distinct from request then raise exception 'TEST_ATTEMPT_ALREADY_AUTHORIZED' using errcode='40001';end if;
  return jsonb_build_object('authorized',true,'attempt_id',grant_row.preflight_id,'version_id',v.id,'student_id',student,'label',grant_row.label,'reused',true);
 end if;
 if prior.attempt_id is null or prior.attempt_id is distinct from (payload->>'expected_previous_attempt_id')::uuid
  or prior.upload_deadline>clock_timestamp()
  or exists(select 1 from account_internal.hskk_preflights p where p.owner_id=student and p.assignment_version_id=v.id
   and not exists(select 1 from account_internal.hskk_sessions s where s.attempt_id=p.id))
 then raise exception 'TEST_ATTEMPT_NOT_AVAILABLE' using errcode='40001';end if;
 insert into account_internal.hskk_controlled_test_authorizations(request_id,exam_id,owner_id,assignment_version_id,previous_attempt_id,preflight_id,authorized_by,label)
 values(request,e.id,student,v.id,prior.attempt_id,new_preflight,actor,'HOSTED E2E TEST ONLY') returning * into grant_row;
 insert into account_internal.hskk_preflights(id,owner_id,assignment_version_id)values(new_preflight,student,v.id);
 perform account_internal.assignment_audit('hskk_controlled_test_authorized',new_preflight,
  jsonb_build_object('exam_id',e.id,'assignment_version_id',v.id,'student_id',student,'previous_attempt_id',prior.attempt_id,'label',grant_row.label));
 return jsonb_build_object('authorized',true,'attempt_id',new_preflight,'version_id',v.id,'student_id',student,'label',grant_row.label,'reused',false);
end $function$;

CREATE OR REPLACE FUNCTION public.hskk_publication(command text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if command='process_list' and exists(select 1 from account_internal.hskk_makeup_submissions ms join account_internal.hskk_makeup_windows w on w.id=ms.window_id where w.attempt_id=(payload->>'attempt_id')::uuid) then
  if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  if not exists(select 1 from account_internal.hskk_delivery_versions dv join account_internal.hskk_sessions s on s.assignment_version_id=dv.assignment_version_id where s.attempt_id=(payload->>'attempt_id')::uuid and dv.exam_id=payload->>'exam_code') then raise exception 'EXAM_UNAVAILABLE';end if;
  return jsonb_build_object('recording_ids',(select jsonb_agg(r.id order by a.position)
   from public.submission_answers a join public.submission_details d on d.attempt_id=a.attempt_id and d.state='submitted'
   join account_internal.speaking_recordings r on r.id=(a.answer->>'recording_id')::uuid and r.attempt_id=a.attempt_id and r.question_version_id=a.question_version_id
   where a.attempt_id=(payload->>'attempt_id')::uuid and r.raw_uploaded_at is not null and r.conversion_status<>'completed'));
 end if;
 return public.hskk_publication_before_makeup(command,payload);
end $function$;

-- Canonical definitions and small source pictures stay in the private schema.
-- They are never projected into the Student catalog or public build.
create table account_internal.hskk_canonical_sources(
 exam_code text primary key check(exam_code ~ '^[A-Za-z0-9_-]{1,64}$'),
 configuration jsonb not null, pictures jsonb not null default '{}',
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default clock_timestamp()
);
alter table account_internal.hskk_canonical_sources enable row level security;
revoke all on account_internal.hskk_canonical_sources from public,anon,authenticated;
create trigger hskk_canonical_immutable before update or delete on account_internal.hskk_canonical_sources for each row execute function account_internal.hskk_draft_immutable();
create or replace function public.hskk_canonical_source(command text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved account_internal.hskk_canonical_sources; config jsonb:=payload->'configuration'; code text:=payload->>'exam_code';
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if command='catalog' then return coalesce((select jsonb_agg(jsonb_build_object('exam_code',exam_code)) from account_internal.hskk_canonical_sources),'[]');end if;
 if command='get' then select * into saved from account_internal.hskk_canonical_sources where exam_code=code;return case when saved.exam_code is null then null else to_jsonb(saved) end;end if;
 if command<>'register' or octet_length(payload::text)>1048576 or config->>'exam_code' is distinct from code then raise exception 'INVALID_REQUEST';end if;
 perform account_internal.hskk_validate_structure(config);
 perform pg_advisory_xact_lock(hashtextextended('hskk-canonical:'||code,0));
 if exists(select 1 from account_internal.hskk_canonical_sources where exam_code=code) or exists(select 1 from account_internal.admin_exams where id=code) then raise exception 'SOURCE_DEFINITION_LOCKED';end if;
 insert into account_internal.hskk_canonical_sources(exam_code,configuration,pictures,created_by)values(code,config,coalesce(payload->'pictures','{}'),auth.uid());
 perform account_internal.assignment_audit('hskk_source_registered',auth.uid(),jsonb_build_object('exam_code',code,'source_sha256',config->'audio'->>'source_audio_id'));
 return jsonb_build_object('registered',true,'exam_code',code);
end $$;
revoke all on function public.hskk_canonical_source(text,jsonb) from public,anon;
grant execute on function public.hskk_canonical_source(text,jsonb) to authenticated;

-- Learner pictures are resolved from the pinned reviewed version, never authoring APIs.
create or replace function public.hskk_current_picture(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s account_internal.hskk_sessions; b account_internal.hskk_delivery_questions; q jsonb; conf jsonb; frame jsonb; elapsed numeric; source_bytes text;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=(payload->>'attempt_id')::uuid and owner_id=(payload->>'owner_id')::uuid;
 if s.attempt_id is null or not exists(select 1 from public.profiles where user_id=s.owner_id and role='STUDENT' and status='APPROVED')
 or exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='submitted')
 or not exists(select 1 from account_internal.hskk_delivery_versions dv join account_internal.admin_exams e on e.id=dv.exam_id
  join public.lesson_content l on l.id=e.delivery_id join public.lesson_assignments la on la.lesson_id=l.id and la.enabled
  join public.enrollments en on en.course_id=l.course_id and en.user_id=s.owner_id and en.active
  join account_internal.hskk_controlled_access ca on ca.exam_id=e.id and ca.owner_id=s.owner_id
  where dv.assignment_version_id=s.assignment_version_id and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access a where a.user_id=s.owner_id and a.lesson_id=l.id and a.active)))
 then raise exception 'PROMPT_DENIED';end if;
 select * into b from account_internal.hskk_delivery_questions where assignment_version_id=s.assignment_version_id and question_version_id=(payload->>'question_version_id')::uuid and prompt_mode='image';
 select coalesce(reviewed.configuration,d.configuration) into conf from account_internal.hskk_exam_draft_revisions d
 join account_internal.hskk_delivery_versions dv on dv.authoring_revision_id=d.id
 left join account_internal.hskk_delivery_review_versions reviewed on reviewed.assignment_version_id=dv.assignment_version_id where dv.assignment_version_id=s.assignment_version_id;
 select x into q from jsonb_array_elements(conf->'questions') x where (x->>'number')::integer=b.position;
 elapsed:=extract(epoch from(clock_timestamp()-s.started_at))*1000;
 select x into frame from jsonb_array_elements(s.timeline) x where elapsed>=(x->>'start')::integer and elapsed<(x->>'end')::integer;
 if b.question_version_id is null or frame is null or not coalesce((
  (frame->>'question_version_id'=b.question_version_id::text and frame->>'state' in ('RECORDING','READY_TO_RESPOND'))
  or (frame->>'state'='PREPARATION' and exists(select 1 from jsonb_array_elements(conf->'sections') section where section->>'id'=frame->>'section_id' and (section->>'id'=b.section_id or section->'preparation_section_ids' ? b.section_id)))
 ),false) then raise exception 'PROMPT_DENIED';end if;
 select pictures->>(q->>'id') into source_bytes from account_internal.hskk_canonical_sources where exam_code=conf->>'exam_code';
 return jsonb_build_object('exam_code',conf->>'exam_code','question_id',q->>'id','picture',q->'prompt_image','bytes',source_bytes);
end $$;
revoke all on function public.hskk_current_picture(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_current_picture(jsonb) to service_role;

create function public.hskk_makeup_picture(payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare conf jsonb; question jsonb; source_bytes text;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED' using errcode='42501';end if;
 select coalesce(reviewed.configuration,draft.configuration) into conf
 from account_internal.hskk_makeup_windows w
 join account_internal.hskk_makeup_timing t on t.window_id=w.id and t.question_version_id=(payload->>'question_version_id')::uuid
 join account_internal.hskk_delivery_questions q on q.question_version_id=t.question_version_id and q.assignment_version_id=w.assignment_version_id and q.prompt_mode='image'
 join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=w.assignment_version_id
 join account_internal.hskk_exam_draft_revisions draft on draft.id=dv.authoring_revision_id
 left join account_internal.hskk_delivery_review_versions reviewed on reviewed.assignment_version_id=w.assignment_version_id
 join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
 join public.learning_attempts la on la.id=w.attempt_id
 join public.lesson_content l on l.id=la.lesson_id
 join public.enrollments en on en.user_id=w.owner_id and en.course_id=l.course_id and en.active
 join public.submission_details sd on sd.attempt_id=w.attempt_id and sd.state='draft'
 where w.id=(payload->>'makeup_window_id')::uuid and w.attempt_id=(payload->>'attempt_id')::uuid and w.owner_id=(payload->>'owner_id')::uuid
 and t.question_version_id=any(w.missing) and clock_timestamp()<w.expires_at and clock_timestamp()>=t.started_at and clock_timestamp()<t.record_end
 and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access ac where ac.user_id=w.owner_id and ac.lesson_id=l.id and ac.active))
 and exists(select 1 from account_internal.hskk_controlled_access ca where ca.exam_id=dv.exam_id and ca.owner_id=w.owner_id)
 and not exists(select 1 from public.submission_answers a where a.attempt_id=w.attempt_id and a.question_version_id=t.question_version_id and a.answer<>'null'::jsonb);
 if conf is null then raise exception 'PROMPT_DENIED' using errcode='42501';end if;
 select q into question from jsonb_array_elements(conf->'questions') q where (q->>'number')::integer=(select position from account_internal.hskk_delivery_questions where question_version_id=(payload->>'question_version_id')::uuid);
 select pictures->>(question->>'id') into source_bytes from account_internal.hskk_canonical_sources where exam_code=conf->>'exam_code';
 return jsonb_build_object('exam_code',conf->>'exam_code','question_id',question->>'id','picture',question->'prompt_image','bytes',source_bytes);
end $$;
revoke all on function public.hskk_makeup_picture(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_makeup_picture(jsonb) to service_role;

create or replace function account_internal.hskk_catalog_projection(version_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('question_count',jsonb_array_length(c->'questions'),'section_count',jsonb_array_length(c->'sections'),
  'approximate_minutes',ceil((select sum((q->>'response_seconds')::numeric+case when q->>'prompt_mode'='audio' then (q->'prompt_audio'->>'duration_ms')::numeric/1000+5.25 else 0 end) from jsonb_array_elements(c->'questions') q)/60+(select sum((s->>'preparation_seconds')::numeric)/60 from jsonb_array_elements(c->'sections') s)),
  'preparation_minutes',(select sum((s->>'preparation_seconds')::integer)/60 from jsonb_array_elements(c->'sections') s),
  'sections',(select jsonb_agg(jsonb_build_object('title',s->>'title_vi','questions',(select count(*) from jsonb_array_elements(c->'questions') q where q->>'section_id'=s->>'id'),'response_seconds',(select (q->>'response_seconds')::integer from jsonb_array_elements(c->'questions') q where q->>'section_id'=s->>'id' limit 1)) order by n) from jsonb_array_elements(c->'sections') with ordinality x(s,n)))
 from (select account_internal.hskk_delivery_config(version_id) c) x
$$;
revoke all on function account_internal.hskk_catalog_projection(uuid) from public,anon,authenticated;

-- Immutable supplied documents/videos and MP4-derived audio are authoring
-- inputs, separately retained from the final canonical MP3 source.
create table account_internal.hskk_import_assets(
 id uuid primary key default gen_random_uuid(), exam_code text not null check(exam_code ~ '^[A-Za-z0-9_-]{1,64}$'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), kind text not null check(kind in ('pdf','docx','mp3','mp4')),
 byte_size bigint not null check(byte_size between 1 and 268435456), object_path text not null unique,
 original_id uuid references account_internal.hskk_import_assets(id),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default clock_timestamp(),
 unique(exam_code,sha256,kind), check(object_path=exam_code||'/'||sha256||'.'||kind),
 check(kind='mp4' or byte_size<=case when kind='mp3' then 33554432 else 3145728 end)
);
alter table account_internal.hskk_import_assets enable row level security;
revoke all on account_internal.hskk_import_assets from public,anon,authenticated;
create trigger hskk_import_asset_immutable before update or delete on account_internal.hskk_import_assets for each row execute function account_internal.hskk_draft_immutable();
create table account_internal.hskk_import_asset_chunks(
 asset_id uuid not null references account_internal.hskk_import_assets(id), position integer not null check(position between 0 and 7),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_size integer not null check(byte_size between 1 and 33554432), object_path text not null unique,
 primary key(asset_id,position)
);
alter table account_internal.hskk_import_asset_chunks enable row level security;
revoke all on account_internal.hskk_import_asset_chunks from public,anon,authenticated;
create trigger hskk_import_chunk_immutable before update or delete on account_internal.hskk_import_asset_chunks for each row execute function account_internal.hskk_draft_immutable();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hskk-import-originals','hskk-import-originals',false,33554432,array['audio/mpeg','video/mp4','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream']);
create function account_internal.hskk_import_object_allowed(object_name text) returns boolean
 language sql stable security definer set search_path='' as $$
 select account_internal.is_admin() and (exists(select 1 from account_internal.hskk_import_assets a where object_path=object_name
   and not exists(select 1 from account_internal.hskk_import_asset_chunks c where c.asset_id=a.id))
   or exists(select 1 from account_internal.hskk_import_asset_chunks where object_path=object_name))
$$;
revoke all on function account_internal.hskk_import_object_allowed(text) from public,anon;
grant execute on function account_internal.hskk_import_object_allowed(text) to authenticated;
create policy hskk_import_admin_read on storage.objects for select to authenticated
 using(bucket_id='hskk-import-originals' and account_internal.hskk_import_object_allowed(name));
create policy hskk_import_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='hskk-import-originals' and account_internal.hskk_import_object_allowed(name));
create function public.hskk_import_asset(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a account_internal.hskk_import_assets; code text:=payload->>'exam_code'; hash text:=payload->>'sha256'; format text:=payload->>'kind'; size bigint; original uuid;
 chunks jsonb:=coalesce(payload->'chunks','[]'); item jsonb; chunk_position integer:=0;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if command='get' then
  select * into a from account_internal.hskk_import_assets where
   case when payload->>'id' is not null then id=(payload->>'id')::uuid
   else exam_code=code and sha256=hash and kind=format end;
 elsif command='reserve' then
  size:=(payload->>'byte_size')::bigint; original:=(payload->>'original_id')::uuid;
  if not coalesce(code ~ '^[A-Za-z0-9_-]{1,64}$' and hash ~ '^[a-f0-9]{64}$' and format in ('pdf','docx','mp3','mp4')
   and size between 1 and case when format='mp4' then 268435456 when format='mp3' then 33554432 else 3145728 end,false)
   or (original is not null and not exists(select 1 from account_internal.hskk_import_assets where id=original and exam_code=code and kind='mp4'))
  then raise exception 'INVALID_SOURCE';end if;
  if jsonb_typeof(chunks) is distinct from 'array' or jsonb_array_length(chunks)>8
   or (jsonb_array_length(chunks)>0 and format<>'mp4') or (size>33554432 and jsonb_array_length(chunks)=0)
   or (jsonb_array_length(chunks)>0 and (select sum((x->>'byte_size')::bigint) from jsonb_array_elements(chunks) x) is distinct from size)
   then raise exception 'INVALID_SOURCE';end if;
  perform pg_advisory_xact_lock(hashtextextended('hskk-import:'||code,0));
  insert into account_internal.hskk_import_assets(exam_code,sha256,kind,byte_size,object_path,original_id,created_by)
   values(code,hash,format,size,code||'/'||hash||'.'||format,original,auth.uid()) on conflict(exam_code,sha256,kind)do nothing;
  select * into a from account_internal.hskk_import_assets where exam_code=code and sha256=hash and kind=format;
  if a.byte_size is distinct from size or a.original_id is distinct from original then raise exception 'SOURCE_DEFINITION_LOCKED';end if;
  for item in select * from jsonb_array_elements(chunks) loop
   if not coalesce(item->>'sha256' ~ '^[a-f0-9]{64}$' and (item->>'byte_size')::integer between 1 and 33554432,false) then raise exception 'INVALID_SOURCE';end if;
   insert into account_internal.hskk_import_asset_chunks(asset_id,position,sha256,byte_size,object_path)
    values(a.id,chunk_position,item->>'sha256',(item->>'byte_size')::integer,a.object_path||'.parts/'||chunk_position||'-'||(item->>'sha256'))on conflict(asset_id,position)do nothing;
   if not exists(select 1 from account_internal.hskk_import_asset_chunks c where c.asset_id=a.id and c.position=chunk_position and c.sha256=item->>'sha256' and c.byte_size=(item->>'byte_size')::integer) then raise exception 'SOURCE_DEFINITION_LOCKED';end if;
   chunk_position:=chunk_position+1;
  end loop;
  if (select count(*) from account_internal.hskk_import_asset_chunks c where c.asset_id=a.id)<>jsonb_array_length(chunks) then raise exception 'SOURCE_DEFINITION_LOCKED';end if;
 else raise exception 'INVALID_REQUEST';end if;
 if a.id is null then raise exception 'INVALID_SOURCE';end if;
 return to_jsonb(a)||jsonb_build_object('bucket','hskk-import-originals','path',a.object_path,
  'chunks',(select coalesce(jsonb_agg(jsonb_build_object('position',c.position,'sha256',c.sha256,'byte_size',c.byte_size,'path',c.object_path)order by c.position),'[]') from account_internal.hskk_import_asset_chunks c where c.asset_id=a.id));
end $$;
revoke all on function public.hskk_import_asset(text,jsonb) from public,anon;
grant execute on function public.hskk_import_asset(text,jsonb) to authenticated;
