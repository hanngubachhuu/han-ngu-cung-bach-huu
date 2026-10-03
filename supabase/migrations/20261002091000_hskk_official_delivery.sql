-- Extend the existing official assignment model. No authoring/history rows change.
-- This migration does not publish, enable Speaking, start attempts or schedule jobs.
create table account_internal.hskk_delivery_versions (
 assignment_version_id uuid primary key references public.assignment_versions(id),
 exam_id text not null references account_internal.admin_exams(id),
 authoring_revision_id uuid not null references account_internal.hskk_exam_draft_revisions(id),
 fingerprint text not null, created_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default clock_timestamp(), unique(exam_id,fingerprint)
);
create table account_internal.hskk_prompt_assets (
 sha256 text primary key check(sha256 ~ '^[a-f0-9]{64}$'),
 object_path text unique not null check(object_path=sha256||'.mp3'),
 duration_ms integer not null check(duration_ms>0 and duration_ms<=300000),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default clock_timestamp()
);
create table account_internal.hskk_delivery_questions (
 question_version_id uuid primary key references public.assignment_question_versions(id),
 assignment_version_id uuid not null references account_internal.hskk_delivery_versions(assignment_version_id),
 position integer not null check(position between 1 and 27),
 section_id text not null, question_type text not null,
 prompt_mode text not null check(prompt_mode in ('audio','text')),
 response_seconds integer not null check(response_seconds>0),
 clip_sha256 text not null references account_internal.hskk_prompt_assets(sha256),
 provenance jsonb not null, unique(assignment_version_id,position),
 foreign key(assignment_version_id,question_version_id) references public.assignment_version_questions(assignment_version_id,question_version_id)
);
-- A browser cannot attest that bytes have been verified. Only the authorized server
-- can append a receipt after re-reading the private stored object and hashing it.
create table account_internal.hskk_prompt_receipts (
 sha256 text primary key references account_internal.hskk_prompt_assets(sha256),
 byte_size integer not null check(byte_size>0 and byte_size<=1048576),
 verified_by uuid not null references public.profiles(user_id),
 verified_at timestamptz not null default clock_timestamp()
);
create table account_internal.hskk_controlled_access (
 exam_id text not null references account_internal.admin_exams(id),
 owner_id uuid not null references public.profiles(user_id),
 granted_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default clock_timestamp(), primary key(exam_id,owner_id)
);
do $$declare t text;begin
 foreach t in array array['hskk_delivery_versions','hskk_prompt_assets','hskk_delivery_questions','hskk_prompt_receipts','hskk_controlled_access'] loop
  execute format('alter table account_internal.%I enable row level security',t);
  execute format('revoke all on account_internal.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on account_internal.%I for each row execute function account_internal.assignment_metadata_immutable()',t||'_immutable',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hskk-prompt-clips','hskk-prompt-clips',false,1048576,array['audio/mpeg']);
create function account_internal.hskk_prompt_admin_allowed(object_name text) returns boolean
 language sql stable security definer set search_path='' as $$
 select account_internal.is_admin() and exists(select 1 from account_internal.hskk_prompt_assets where object_path=object_name)
$$;
revoke all on function account_internal.hskk_prompt_admin_allowed(text) from public,anon;
grant execute on function account_internal.hskk_prompt_admin_allowed(text) to authenticated;
create policy hskk_prompt_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='hskk-prompt-clips' and account_internal.hskk_prompt_admin_allowed(name));
create policy hskk_prompt_admin_read on storage.objects for select to authenticated
 using(bucket_id='hskk-prompt-clips' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and account_internal.hskk_prompt_admin_allowed(name));

create function public.hskk_delivery_admin(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); code text:=payload->>'exam_code'; d account_internal.hskk_exam_draft_revisions;
 entry account_internal.admin_exams; v account_internal.hskk_delivery_versions;
 q jsonb; clip jsonb; segment jsonb; made jsonb; ids uuid[]:='{}'; rubric uuid; definition jsonb;
 request_fingerprint text; delivery text; course text; pos integer:=0; qid uuid; student uuid;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if code is distinct from 'H71002' then raise exception 'EXAM_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-delivery:'||code,0));
 select * into entry from account_internal.admin_exams where id=code;
 if command='prepare' then
  select * into d from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
  if d.revision is distinct from (payload->>'expected_revision')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
  if d.configuration->>'level' is distinct from 'elementary' or d.source_sha256 is distinct from '101dc744ac9923f9a2925baa52899133944661bee153912443da89f4fe4c39f0'
    or (d.configuration->'timing'->>'countdown_seconds')::integer is distinct from 3
    or d.configuration->'sections' is distinct from '[{"id":"part1","title_zh":"第一部分 · 听后重复","title_vi":"Nghe và nhắc lại","preparation_seconds":0,"duration_minutes":4},{"id":"part2","title_zh":"第二部分 · 听后回答","title_vi":"Nghe và trả lời","preparation_seconds":0,"duration_minutes":3},{"id":"part3","title_zh":"第三部分 · 回答问题","title_vi":"Trả lời câu hỏi","preparation_seconds":420,"preparation_warning_seconds":60,"duration_minutes":3}]'::jsonb
    or jsonb_array_length(d.configuration->'questions') is distinct from 27
    or jsonb_array_length(d.configuration->'audio'->'clip_provenance') is distinct from 27
    or jsonb_array_length(d.configuration->'audio'->'segmentation_runs') is distinct from 1
    or not exists(select 1 from account_internal.hskk_exam_source_assets a join storage.objects o on o.name=a.object_path and o.bucket_id='hskk-authoring-sources'
      where a.exam_code=code and a.sha256=d.source_sha256 and a.byte_size=(o.metadata->>'size')::bigint)
    then raise exception 'SOURCE_BINDING_REQUIRED';end if;
  request_fingerprint:=md5(d.id::text||coalesce(entry.working->>'title',d.configuration->>'title')||coalesce((select jsonb_agg(jsonb_build_object('id',q->>'id','prompt',coalesce((select x->>'prompt' from jsonb_array_elements(entry.working->'questions') x where coalesce(x->>'question_key',x->>'id')=q->>'id'),q->>'prompt')) order by (q->>'number')::integer)::text from jsonb_array_elements(d.configuration->'questions') q),''));
  select * into v from account_internal.hskk_delivery_versions where exam_id=code and hskk_delivery_versions.fingerprint=request_fingerprint;
  if v.assignment_version_id is not null then
   return jsonb_build_object('version_id',v.assignment_version_id,'prepared',true,'reused',true);
  end if;
  course:='hskk-elementary';delivery:='exam-'||code;
  if exists(select 1 from public.courses where program='HSKK' and level=1 and id<>course) then raise exception 'COURSE_BINDING_CONFLICT';end if;
  insert into public.courses(id,title,level,program) values(course,'HSKK Sơ cấp',1,'HSKK') on conflict(id)do nothing;
  insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,visibility,content,course_id)
   select delivery,1,coalesce(max(lesson_no),0)+1,'',d.configuration->>'title','student','{}',course
   from public.lesson_content where course_id=course on conflict(id)do nothing;
  if not exists(select 1 from public.lesson_content l join public.courses c on c.id=l.course_id where l.id=delivery and c.id=course and c.program='HSKK' and c.level=1) then raise exception 'COURSE_BINDING_CONFLICT';end if;
  if entry.id is null then
   insert into account_internal.admin_exams(id,exam_type,level,working,delivery_id,created_by)
    values(code,'HSKK','elementary',jsonb_build_object('id',code,'code',code,'type','HSKK','level','elementary','title',d.configuration->>'title','questions',d.configuration->'questions'),delivery,actor) returning * into entry;
  elsif entry.exam_type<>'HSKK' or entry.level<>'elementary' then raise exception 'COURSE_BINDING_CONFLICT';
  else update account_internal.admin_exams set delivery_id=delivery where id=code;end if;
  -- Manual teacher judgement on the existing ten-point storage scale. This is
  -- not an official HSKK rubric and does not generate any scores.
  select id into rubric from public.assignment_rubric_versions where rubric_key='hskk-teacher-review' order by version desc limit 1;
  if rubric is null then
   made:=account_internal.assignment_command('rubric_create',jsonb_build_object('rubric_key','hskk-teacher-review','kind','speaking',
    'criteria','[{"id":"teacher_review","label":"Đánh giá của giáo viên","weight":10}]'::jsonb));rubric:=(made->>'id')::uuid;
  end if;
  for q in select * from jsonb_array_elements(d.configuration->'questions') loop
   pos:=pos+1;segment:=q->'audio_segment';
   if q->>'id' is distinct from 'q'||pos or (q->>'number')::integer is distinct from pos
    or (segment->>'verified')::boolean is distinct from true or segment->>'status' not in ('CONFIRMED','MANUALLY_ADJUSTED')
    or segment->>'source_sha256' is distinct from d.source_sha256
    or coalesce(segment->>'reviewed_by','')='' or coalesce(segment->>'reviewed_at','')=''
    or (segment->>'start_ms')::integer<0 or (segment->>'end_ms')::integer<=(segment->>'start_ms')::integer
    or (segment->>'end_ms')::numeric>(d.configuration->'audio'->>'duration_seconds')::numeric*1000
    or segment->>'run_id' is distinct from d.configuration->'audio'->'segmentation_runs'->0->>'run_id'
    or (q->>'response_seconds')::integer is distinct from (case when pos<=15 then 7 when pos<=25 then 10 else 90 end)
    or q->>'section_id' is distinct from (case when pos<=15 then 'part1' when pos<=25 then 'part2' else 'part3' end)
    or q->>'type' is distinct from (case when pos<=15 then 'speaking_repeat' when pos<=25 then 'speaking_answer' else 'speaking_long_answer' end)
    or q->>'prompt_mode' is distinct from (case when pos<=25 then 'audio' else 'text' end)
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
    'prompt',coalesce((select x->>'prompt' from jsonb_array_elements(entry.working->'questions') x where coalesce(x->>'question_key',x->>'id')=q->>'id'),q->>'prompt'),'rubric_version_id',rubric));
   ids:=array_append(ids,(made->>'id')::uuid);
  end loop;
  perform set_config('assignment.authoring_metadata','',true);
  definition:=account_internal.assignment_command('definition_create',jsonb_build_object('lesson_id',delivery,'title',entry.working->>'title','question_version_ids',to_jsonb(ids)));
  insert into account_internal.hskk_delivery_versions values((definition->>'id')::uuid,code,d.id,request_fingerprint,actor,clock_timestamp());
  pos:=0;
  for q in select * from jsonb_array_elements(d.configuration->'questions') loop
   pos:=pos+1;qid:=ids[pos];select x into clip from jsonb_array_elements(d.configuration->'audio'->'clip_provenance') x where x->>'question_id'=q->>'id';
   insert into account_internal.hskk_delivery_questions values(qid,(definition->>'id')::uuid,pos,q->>'section_id',q->>'type',q->>'prompt_mode',(q->>'response_seconds')::integer,clip->>'clip_sha256',clip);
  end loop;
  perform account_internal.assignment_audit('hskk_delivery_prepared',(definition->>'id')::uuid,jsonb_build_object('exam_id',code,'authoring_revision',d.revision));
  return jsonb_build_object('prepared',true,'version_id',definition->>'id','question_count',27,'published',false);
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
end $$;
revoke all on function public.hskk_delivery_admin(text,jsonb) from public,anon;
grant execute on function public.hskk_delivery_admin(text,jsonb) to authenticated;

create function public.hskk_prompt_verified(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset account_internal.hskk_prompt_assets; receipt account_internal.hskk_prompt_receipts; object_row storage.objects; actor uuid:=(payload->>'actor')::uuid;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where user_id=actor and role='ADMIN' and status='APPROVED') then raise exception 'ADMIN_REQUIRED';end if;
 select * into asset from account_internal.hskk_prompt_assets where sha256=payload->>'sha256';
 select * into object_row from storage.objects where bucket_id='hskk-prompt-clips' and name=asset.object_path;
 if asset.sha256 is null or object_row.id is null or (object_row.metadata->>'size')::integer is distinct from (payload->>'byte_size')::integer
   or split_part(object_row.metadata->>'mimetype',';',1)<>'audio/mpeg' then raise exception 'CLIP_STORAGE_MISMATCH';end if;
 insert into account_internal.hskk_prompt_receipts(sha256,byte_size,verified_by)values(asset.sha256,(payload->>'byte_size')::integer,actor)on conflict do nothing;
 select * into receipt from account_internal.hskk_prompt_receipts where sha256=asset.sha256;
 if receipt.byte_size<>(payload->>'byte_size')::integer then raise exception 'CLIP_STORAGE_MISMATCH';end if;
 return jsonb_build_object('verified',true);
end $$;
revoke all on function public.hskk_prompt_verified(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_prompt_verified(jsonb) to service_role;
notify pgrst,'reload schema';
