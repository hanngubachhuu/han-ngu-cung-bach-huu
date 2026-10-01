-- An explicit exam catalog. Existing lesson content/definitions are NEVER backfilled.
-- Delivery reuses the strict assignment/version/attempt engine through a private
-- exam-* container; this adapter is excluded from the lesson selectors.
create table account_internal.admin_exams (
 id text primary key check(length(id) between 1 and 64),
 exam_type text not null check(exam_type in ('HSK','HSKK')), level text not null,
 working jsonb not null, revision integer not null default 0,
 delivery_id text unique references public.lesson_content(id),
 active_version_id uuid references public.assignment_versions(id),
 created_by uuid not null references public.profiles(user_id),
 updated_at timestamptz not null default clock_timestamp(),
 check((exam_type='HSK' and level in ('1','2','3','4','5','6')) or
   (exam_type='HSKK' and level in ('elementary','intermediate','advanced')))
);
create table account_internal.admin_exam_versions (
 exam_id text not null references account_internal.admin_exams(id), revision integer not null,
 configuration jsonb not null, assignment_version_id uuid references public.assignment_versions(id),
 actor uuid not null references public.profiles(user_id), created_at timestamptz not null default clock_timestamp(),
 primary key(exam_id,revision)
);
create table account_internal.admin_exam_requests (
 id uuid primary key, actor uuid not null references public.profiles(user_id),
 payload_hash text not null, response jsonb not null
);
create table account_internal.exam_question_content (
 question_version_id uuid primary key references public.assignment_question_versions(id),
 student_content jsonb not null, teacher_content jsonb not null
);
alter table account_internal.admin_exams enable row level security;
alter table account_internal.admin_exam_versions enable row level security;
alter table account_internal.admin_exam_requests enable row level security;
alter table account_internal.exam_question_content enable row level security;
revoke all on account_internal.admin_exams,account_internal.admin_exam_versions,account_internal.admin_exam_requests,account_internal.exam_question_content from public,anon,authenticated;
create trigger admin_exam_versions_immutable before update or delete on account_internal.admin_exam_versions for each row execute function account_internal.assignment_metadata_immutable();
create trigger exam_question_content_immutable before update or delete on account_internal.exam_question_content for each row execute function account_internal.assignment_metadata_immutable();
create trigger admin_exam_requests_immutable before update or delete on account_internal.admin_exam_requests for each row execute function account_internal.assignment_metadata_immutable();

-- Only allow-listed learner media/text are copied into NEW attempt snapshots.
alter function account_internal.assignment_question_projection(public.assignment_question_versions) rename to assignment_question_projection_before_exams;
create function account_internal.assignment_question_projection(q public.assignment_question_versions) returns jsonb
language sql stable set search_path='' as $$
 select account_internal.assignment_question_projection_before_exams(q)||coalesce(
  (select student_content from account_internal.exam_question_content where question_version_id=q.id),'{}'::jsonb)
$$;
revoke all on function account_internal.assignment_question_projection(public.assignment_question_versions) from public,anon,authenticated;
create or replace function account_internal.inherit_question_context() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('assignment.exam_context',true)='on' then return new; end if;
 if new.parent_version_id is not null then
  insert into account_internal.assignment_question_contexts(question_version_id,context_version_id)
   select new.question_version_id,context_version_id from account_internal.assignment_question_contexts where question_version_id=new.parent_version_id;
 end if;
 return new;
end $$;

create function account_internal.admin_exam_command(command text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); model jsonb; entry account_internal.admin_exams;
 request_id uuid; prior account_internal.admin_exam_requests; result jsonb; hash text;
 exam_id text; delivery text; course text; question jsonb; made jsonb; definition jsonb;
 rubric uuid; kind text; ids uuid[]:='{}'; ordinal integer:=0; context jsonb;
 context_map jsonb:='{}'; context_id uuid; context_key text; level_number integer;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if command='summary' then
  return jsonb_build_object('active',(select count(*) from account_internal.admin_exams where active_version_id is not null));
 elsif command='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'type',exam_type,'level',level,
   'title',working->>'title','question_count',jsonb_array_length(working->'questions'),
   'active',active_version_id is not null,'updated_at',updated_at) order by updated_at desc)
   from account_internal.admin_exams),'[]'::jsonb);
 elsif command='get' then
  select * into entry from account_internal.admin_exams where id=payload->>'id';
  return jsonb_build_object('exam',case when entry.id is null then null else entry.working||jsonb_build_object('revision',entry.revision,'active',entry.active_version_id is not null) end);
 end if;
 if command not in ('publish','save_working') then raise exception 'INVALID_REQUEST'; end if;
 model:=payload->'exam'; exam_id:=model->>'id'; request_id:=(payload->>'request_id')::uuid;
 if request_id is null or coalesce(exam_id,'')!~'^[A-Za-z0-9_-]{1,64}$' or
  length(trim(coalesce(model->>'title',''))) not between 1 and 200 or
  model->>'type' not in ('HSK','HSKK') or jsonb_typeof(model->'questions') is distinct from 'array'
  then raise exception 'INVALID_EXAM'; end if;
 if jsonb_array_length(model->'questions') not between 1 and 200 then raise exception 'INVALID_QUESTIONS'; end if;
 hash:=md5(command||payload::text);
 perform pg_advisory_xact_lock(hashtextextended('exam-request:'||request_id::text,0));
 select * into prior from account_internal.admin_exam_requests where id=request_id;
 if prior.id is not null then
  if prior.actor is distinct from actor or prior.payload_hash<>hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return prior.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('exam:'||exam_id,0));
 select * into entry from account_internal.admin_exams where id=exam_id for update;
 if (payload->>'expected_revision')::integer is distinct from coalesce(entry.revision,0) then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if entry.id is not null and (entry.exam_type is distinct from model->>'type' or entry.level is distinct from model->>'level' or entry.working->'source' is distinct from model->'source') then raise exception 'SOURCE_DEFINITION_LOCKED'; end if;
 if entry.id is null then
  insert into account_internal.admin_exams(id,exam_type,level,working,created_by)
   values(exam_id,model->>'type',model->>'level',model,actor) returning * into entry;
 end if;
 -- No browser assertion can bypass the missing official HSKK session/version binding.
 if command='publish' and entry.exam_type='HSKK' then raise exception 'HSKK_OFFICIAL_BINDING_REQUIRED'; end if;
 if command='publish' then
  delivery:=entry.delivery_id;
  if delivery is null then
   level_number:=entry.level::integer;
   select id into course from public.courses where program='HSK' and level=level_number;
   if course is null then
    course:='hsk'||level_number;
    insert into public.courses(id,title,level,program) values(course,'HSK '||level_number,level_number,'HSK');
   end if;
   perform pg_advisory_xact_lock(hashtextextended('exam-container:'||course,0));
   delivery:='exam-'||exam_id;
   insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,visibility,content,course_id)
    select delivery,level_number,coalesce(max(lesson_no),0)+1,'',model->>'title','student','{}',course
    from public.lesson_content where course_id=course;
  end if;
  -- All writes (questions, contexts, activation and audit) share this transaction.
  for context in select * from jsonb_array_elements(coalesce(model->'contexts','[]')) loop
   context_key:=coalesce(context->>'localId',context->>'id');
   if context_key is null or length(trim(coalesce(context->>'text',context->>'content',''))) not between 1 and 50000 then raise exception 'INVALID_CONTEXT'; end if;
   insert into account_internal.assignment_context_versions(lesson_id,title,content,source_identifier,created_by)
    values(delivery,coalesce(context->>'title','Đoạn đọc chung'),coalesce(context->>'text',context->>'content'),exam_id,actor) returning id into context_id;
   context_map:=context_map||jsonb_build_object(context_key,context_id);
  end loop;
  perform set_config('assignment.exam_context','on',true);
  for question in select * from jsonb_array_elements(model->'questions') loop
   ordinal:=ordinal+1; kind:=question->>'kind'; rubric:=null;
   if length(trim(coalesce(question->>'prompt',''))) not between 1 and 12000 then raise exception 'INVALID_QUESTION'; end if;
   if exists(select 1 from jsonb_each_text(jsonb_build_object('image',coalesce(question->>'image',''),'audio',coalesce(question->>'audio',''))) x
     where x.value<>'' and (x.value!~'^(https://[^[:space:]<>]+|(\./)?[A-Za-z0-9_-][^:<>]*)$' or position('\' in x.value)>0)) then raise exception 'INVALID_MEDIA'; end if;
   if kind in ('writing','translation','speaking') then
    select id into rubric from public.assignment_rubric_versions where id=(question->>'rubric_version_id')::uuid and kind=question->>'kind';
    if rubric is null then
     select id into rubric from public.assignment_rubric_versions where rubric_key='exam-default-'||kind order by version desc limit 1;
     if rubric is null then
      made:=account_internal.assignment_command('rubric_create',jsonb_build_object('rubric_key','exam-default-'||kind,'kind',kind,
       'criteria','[{"id":"accuracy","label":"Độ chính xác","weight":4},{"id":"coherence","label":"Mạch lạc","weight":2},{"id":"appropriacy","label":"Phù hợp yêu cầu","weight":2},{"id":"naturalness","label":"Tự nhiên","weight":2}]'::jsonb));
      rubric:=(made->>'id')::uuid;
     end if;
    end if;
   end if;
   -- The source capture trigger derives provenance from prior versions of this key.
   perform set_config('assignment.authoring_metadata',jsonb_build_object('source','document','source_identifier',coalesce(model->'source'->>'filename',exam_id),
    'source_revision',coalesce(model->'source'->>'sha256','1'),'source_item_id',coalesce(question->>'question_key',question->>'id'),'origin','manual')::text,true);
   made:=account_internal.assignment_command('question_create',jsonb_build_object('lesson_id',delivery,
    'question_key',coalesce(question->>'question_key',question->>'id'),'kind',kind,'prompt',question->>'prompt',
    'options',coalesce(question->'options','[]'),'answer_key',case when rubric is not null then null else question->'answer_key' end,
    'explanation',coalesce(question->>'explanation',''),'tip',coalesce(question->>'tip',''),'rubric_version_id',rubric));
   ids:=array_append(ids,(made->>'id')::uuid);
   insert into account_internal.exam_question_content values((made->>'id')::uuid,
    jsonb_build_object('pinyin',coalesce(question->>'pinyin',''),'image',coalesce(question->>'image',''),'audio',coalesce(question->>'audio','')),question);
   -- A changed passage belongs to the new question version; never mutate old context.
   context_key:=question->>'contextId';
   if coalesce(context_key,'')<>'' then
    if not context_map ? context_key then raise exception 'INVALID_CONTEXT'; end if;
    if exists(select 1 from account_internal.assignment_question_contexts where question_version_id=(made->>'id')::uuid) then
     raise exception 'EXAM_CONTEXT_INHERITANCE_CONFLICT';
    end if;
    insert into account_internal.assignment_question_contexts values((made->>'id')::uuid,(context_map->>context_key)::uuid);
   end if;
  end loop;
  perform set_config('assignment.authoring_metadata','',true);
  perform set_config('assignment.exam_context','off',true);
  definition:=account_internal.assignment_command('definition_create',jsonb_build_object('lesson_id',delivery,'title',model->>'title',
   'time_limit_minutes',model->'time_limit_minutes','question_version_ids',to_jsonb(ids)));
  if length(trim(coalesce(model->>'instructions','')))>0 then
   insert into account_internal.assignment_context_versions(lesson_id,title,content,source_identifier,created_by)
    values(delivery,'Hướng dẫn',model->>'instructions',exam_id,actor) returning id into context_id;
   insert into account_internal.assignment_definition_contexts values((definition->>'id')::uuid,context_id);
  end if;
  perform account_internal.assignment_command('definition_preview',jsonb_build_object('version_id',definition->>'id'));
  perform account_internal.assignment_command('definition_publish',jsonb_build_object('version_id',definition->>'id'));
  perform account_internal.assignment_command('enable',jsonb_build_object('lesson_id',delivery,'enabled',true));
  entry.active_version_id:=(definition->>'id')::uuid;
 end if;
 entry.revision:=entry.revision+1;
 model:=model||jsonb_build_object('revision',entry.revision,'active',entry.active_version_id is not null);
 update account_internal.admin_exams set working=model,revision=entry.revision,delivery_id=coalesce(delivery,entry.delivery_id),active_version_id=entry.active_version_id,updated_at=clock_timestamp() where id=exam_id;
 insert into account_internal.admin_exam_versions values(exam_id,entry.revision,model,case when command='publish' then entry.active_version_id else null end,actor,clock_timestamp());
 result:=jsonb_build_object('id',exam_id,'revision',entry.revision,'published',command='publish','version_id',entry.active_version_id,'delivery_id',coalesce(delivery,entry.delivery_id));
 insert into account_internal.admin_exam_requests values(request_id,actor,hash,result);
 perform account_internal.assignment_audit('exam_'||command,entry.active_version_id,jsonb_build_object('exam_id',exam_id,'revision',entry.revision));
 return result;
end $$;
create function public.admin_exam_command(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.admin_exam_command(command,payload)$$;
revoke all on function account_internal.admin_exam_command(text,jsonb),public.admin_exam_command(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.admin_exam_command(text,jsonb),public.admin_exam_command(text,jsonb) to authenticated;
notify pgrst,'reload schema';
