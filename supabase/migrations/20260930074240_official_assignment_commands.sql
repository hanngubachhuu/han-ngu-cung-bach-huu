-- All assignment writes are transactional DB commands. No service-role key in the app.
create function account_internal.assignment_normalize(value text) returns text
language sql immutable set search_path='' as $$
 select lower(regexp_replace(trim(coalesce(value,'')), '\s+', ' ', 'g'));
$$;

create function account_internal.assignment_score(kind text, answer_key jsonb, answer jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare expected jsonb; actual text; i integer; correct integer:=0; total integer;
begin
 if kind in ('translation','writing','speaking') then return null; end if;
 if answer is null or answer='null'::jsonb then return 0; end if;
 if kind in ('mcq','true_false') then return case when answer=answer_key->'value' then 10 else 0 end;
 elsif kind='matching' then return case when answer=answer_key->'pairs' then 10 else 0 end;
 elsif kind in ('text_fill','reorder') then
  if kind='reorder' then
   if jsonb_typeof(answer)<>'array' then return 0; end if;
   select string_agg(v,'') into actual from jsonb_array_elements_text(answer) v;
  else
   if jsonb_typeof(answer)<>'string' then return 0; end if;
   actual:=answer#>>'{}';
  end if;
  return case when exists(select 1 from jsonb_array_elements_text(answer_key->'accepted') v
    where account_internal.assignment_normalize(v)=account_internal.assignment_normalize(actual)) then 10 else 0 end;
 elsif kind='multi_fill' then
  if jsonb_typeof(answer)<>'array' then return 0; end if;
  total:=jsonb_array_length(answer_key->'values');
  if jsonb_array_length(answer)<>total then return 0; end if;
  for i in 0..total-1 loop
   expected:=answer_key->'values'->i;
   if jsonb_typeof(answer->i)='string' and exists(select 1 from jsonb_array_elements_text(expected) v
     where account_internal.assignment_normalize(v)=account_internal.assignment_normalize(answer->>i)) then correct:=correct+1; end if;
  end loop;
  return round(10.0*correct/total,6);
 end if;
 raise exception 'UNSUPPORTED_QUESTION_TYPE';
end $$;

create function account_internal.assignment_question_projection(q public.assignment_question_versions) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',q.id,'question_key',q.question_key,'version',q.version,
  'kind',q.kind,'prompt',q.prompt,'options',q.options,'max_score',q.max_score);
$$;

create function account_internal.assignment_audit(action_name text, entity uuid, details jsonb default '{}') returns void
language sql set search_path='' as $$
 insert into public.audit_logs(actor,target_id,action,details)
 values(auth.uid(),entity,'assignment.'||action_name,details);
$$;

create function account_internal.assignment_finish(attempt uuid) returns void
language plpgsql set search_path='' as $$
declare d public.submission_details; a public.learning_attempts; finished timestamptz:=clock_timestamp();
begin
 select * into d from public.submission_details where attempt_id=attempt for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if d.state='submitted' then return; end if;
 select * into a from public.learning_attempts where id=attempt;
 update public.submission_details set state='submitted',revision=revision+1,
  timed_out=deadline_at is not null and finished>=deadline_at,
  duration_seconds=greatest(0,floor(extract(epoch from (least(finished,coalesce(deadline_at,finished))-started_at)))::integer)
 where attempt_id=attempt;
 update public.learning_attempts set submitted_at=least(finished,coalesce(d.deadline_at,finished)) where id=attempt;
 insert into public.submission_results(attempt_id,revision,created_by) values(attempt,1,auth.uid());
 insert into public.submission_grades(attempt_id,revision,question_version_id,grading_question_version_id,rubric_version_id,score,method,graded_at)
 select attempt,1,q.id,q.id,q.rubric_version_id,account_internal.assignment_score(q.kind,q.answer_key,s.answer),
  case when q.rubric_version_id is null then 'automatic' else 'manual' end,
  case when q.rubric_version_id is null then finished else null end
 from public.submission_answers s join public.assignment_question_versions q on q.id=s.question_version_id where s.attempt_id=attempt;
 perform account_internal.assignment_audit('submitted',attempt,jsonb_build_object('timed_out',d.deadline_at is not null and finished>=d.deadline_at));
end $$;

create function account_internal.assignment_read(attempt uuid, administrator boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; publication jsonb; a public.learning_attempts;
begin
 select * into a from public.learning_attempts where id=attempt and source='official';
 if not found or (not administrator and a.user_id is distinct from auth.uid()) then raise exception 'ATTEMPT_NOT_FOUND' using errcode='42501'; end if;
 select jsonb_build_object('attempt_id',a.id,'lesson_id',a.lesson_id,'user_id',a.user_id,
  'submitted_at',a.submitted_at,'state',d.state,'revision',d.revision,'started_at',d.started_at,
  'deadline_at',d.deadline_at,'timed_out',d.timed_out,'duration_seconds',d.duration_seconds,'server_time',clock_timestamp(),
  'assignment_version_id',d.assignment_version_id,'title',v.title,
  'answers',(select jsonb_agg(jsonb_build_object('question',s.prompt_snapshot,'answer',s.answer,'position',s.position)
    || case when administrator then jsonb_build_object('private_question',to_jsonb(q),'rubric',to_jsonb(r)) else '{}'::jsonb end order by s.position)
    from public.submission_answers s join public.assignment_question_versions q on q.id=s.question_version_id
    left join public.assignment_rubric_versions r on r.id=q.rubric_version_id where s.attempt_id=attempt))
 into result from public.submission_details d join public.assignment_versions v on v.id=d.assignment_version_id where d.attempt_id=attempt;
 select jsonb_build_object('revision',r.revision,'raw_score',r.raw_score,'raw_max_score',r.raw_max_score,
   'normalized_score',r.normalized_score,'normalized_max',100,'published_at',r.published_at,
   'questions',(select jsonb_agg(jsonb_build_object('question_version_id',g.question_version_id,'score',g.score,'max_score',10,'feedback',g.feedback) order by s.position)
     from public.submission_grades g join public.submission_answers s on s.attempt_id=g.attempt_id and s.question_version_id=g.question_version_id
     where g.attempt_id=attempt and g.revision=r.revision))
 into publication from public.submission_results r where r.attempt_id=attempt and r.state='published' order by r.revision desc limit 1;
 result:=result||jsonb_build_object('result',publication);
 if administrator then
  result:=result||jsonb_build_object('grading',(select to_jsonb(r)||jsonb_build_object('grades',(
   select jsonb_agg(to_jsonb(g)||jsonb_build_object('rubric',to_jsonb(rv),'grading_question',to_jsonb(gq)) order by s.position) from public.submission_grades g
    join public.submission_answers s on s.attempt_id=g.attempt_id and s.question_version_id=g.question_version_id
    join public.assignment_question_versions gq on gq.id=g.grading_question_version_id
    left join public.assignment_rubric_versions rv on rv.id=g.rubric_version_id
    where g.attempt_id=attempt and g.revision=r.revision))
   from public.submission_results r where r.attempt_id=attempt order by r.revision desc limit 1));
 end if;
 return result;
end $$;

create function account_internal.assignment_command(command text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); administrator boolean; lesson text; attempt uuid; selected uuid;
 q public.assignment_question_versions; d public.submission_details; a public.learning_attempts;
 v public.assignment_versions; r public.submission_results; rubric public.assignment_rubric_versions;
 n integer; page_number integer; revision_number integer; choice jsonb; item jsonb; id_text text;
 total numeric; maximum numeric; value numeric; result jsonb; request_key text; key_value jsonb;
 question_ids uuid[]; student boolean; now_at timestamptz:=clock_timestamp();
begin
 if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>262144 then raise exception 'INVALID_REQUEST'; end if;
 administrator:=account_internal.is_admin();
 select exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') into student;
 page_number:=greatest(0,least(100000,coalesce((payload->>'page')::integer,0)));

 if command='catalog' then
  if not student then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (select l.id,l.title_vi,c.title course_title,c.program,v.title,
   v.id assignment_version_id,v.time_limit_minutes from public.lesson_assignments s
   join public.lesson_content l on l.id=s.lesson_id join public.courses c on c.id=l.course_id
   join public.assignment_versions v on v.id=s.current_version_id
   where s.enabled and v.status='published' and c.program in ('HSK','HSKK') and account_internal.can_access_lesson(l.id)
   order by c.program,c.level,l.lesson_no limit 20 offset page_number*20)x),'[]');
 elsif command in ('mine','queue') then
  if command='queue' and not administrator then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(x) from (
   select a.id,a.lesson_id,a.user_id,l.title_vi,c.program,c.title course_title,a.submitted_at,d.started_at,d.state,
    p.full_name,(select max(revision) from public.submission_results where attempt_id=a.id and state='published') published_revision
   from public.learning_attempts a join public.submission_details d on d.attempt_id=a.id
   join public.lesson_content l on l.id=a.lesson_id join public.courses c on c.id=l.course_id join public.profiles p on p.user_id=a.user_id
   where a.source='official' and (command='queue' or a.user_id=actor)
    and (not (payload ? 'lesson_id') or a.lesson_id=payload->>'lesson_id')
    and (not (payload ? 'student_id') or a.user_id=(payload->>'student_id')::uuid)
    and (not (payload ? 'state') or d.state=payload->>'state')
   order by d.started_at desc,a.id limit 20 offset page_number*20)x),'[]');
 elsif command='start' then
  lesson:=payload->>'lesson_id'; request_key:='official:'||(payload->>'request_id');
  if not student or not account_internal.can_access_lesson(lesson) then raise exception 'LESSON_ACCESS_REQUIRED' using errcode='42501'; end if;
  if payload->>'request_id' is null or (payload->>'request_id')!~'^[0-9a-fA-F-]{36}$' then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||lesson||':'||request_key,0));
  select * into a from public.learning_attempts where user_id=actor and lesson_id=lesson and client_attempt_id=request_key;
  if found then
   if a.source<>'official' then raise exception 'ATTEMPT_ID_CONFLICT'; end if;
   return account_internal.assignment_read(a.id,false);
  end if;
  select av.* into v from public.lesson_assignments la join public.assignment_versions av on av.id=la.current_version_id
    join public.lesson_content l on l.id=la.lesson_id join public.courses c on c.id=l.course_id
    where la.lesson_id=lesson and la.enabled and av.status='published' and c.program in ('HSK','HSKK') for share of la;
  if not found then raise exception 'ASSIGNMENT_UNAVAILABLE'; end if;
  insert into public.learning_attempts(user_id,lesson_id,client_attempt_id,score,max_score,source,submitted_at)
   values(actor,lesson,request_key,null,null,'official',null) returning id into attempt;
  insert into public.submission_details(attempt_id,assignment_version_id,started_at,deadline_at)
   values(attempt,v.id,now_at,case when v.time_limit_minutes is not null then now_at+make_interval(mins=>v.time_limit_minutes) else null end);
  insert into public.submission_answers(attempt_id,question_version_id,position,prompt_snapshot)
   select attempt,q.id,aq.position,account_internal.assignment_question_projection(q)
    from public.assignment_version_questions aq join public.assignment_question_versions q on q.id=aq.question_version_id
    where aq.assignment_version_id=v.id and q.published_at is not null;
  if not found then raise exception 'EMPTY_ASSIGNMENT'; end if;
  perform account_internal.assignment_audit('started',attempt,jsonb_build_object('assignment_version_id',v.id));
  return account_internal.assignment_read(attempt,false);
 elsif command in ('get','save','submit') then
  attempt:=(payload->>'attempt_id')::uuid;
  select * into a from public.learning_attempts where id=attempt and source='official';
  if not found or (a.user_id<>actor and not administrator) then raise exception 'ATTEMPT_NOT_FOUND' using errcode='42501'; end if;
  select * into d from public.submission_details where attempt_id=attempt for update;
  -- Time is sampled after acquiring the row lock; a waiting writer cannot reuse an earlier deadline check.
  now_at:=clock_timestamp();
  if command<>'get' and (not student or a.user_id<>actor or not account_internal.can_access_lesson(a.lesson_id))
   then raise exception 'LESSON_ACCESS_REQUIRED' using errcode='42501'; end if;
  if d.state='draft' and not administrator and not account_internal.can_access_lesson(a.lesson_id)
    then raise exception 'LESSON_ACCESS_REQUIRED' using errcode='42501'; end if;
  if d.state='draft' and d.deadline_at<=now_at then
   perform account_internal.assignment_finish(attempt);
   return account_internal.assignment_read(attempt,administrator)||jsonb_build_object('expired',true);
  end if;
  if command='get' or (command='submit' and d.state='submitted') then return account_internal.assignment_read(attempt,administrator); end if;
  if d.state<>'draft' then raise exception 'SUBMISSION_LOCKED'; end if;
  if d.revision is distinct from (payload->>'revision')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if command='save' then
   if jsonb_typeof(payload->'answers') is distinct from 'object' then raise exception 'INVALID_ANSWERS'; end if;
   for id_text,item in select * from jsonb_each(payload->'answers') loop
    if octet_length(item::text)>20000 then raise exception 'ANSWER_TOO_LARGE'; end if;
    select qv.* into q from public.submission_answers sa join public.assignment_question_versions qv on qv.id=sa.question_version_id
     where sa.attempt_id=attempt and sa.question_version_id::text=id_text;
    if not found then raise exception 'INVALID_QUESTION'; end if;
    -- Speaking file support is deliberately gated by CP2, never accept an arbitrary URL as an uploaded recording.
    if q.kind='speaking' and item<>'null'::jsonb then raise exception 'RECORDING_NOT_READY'; end if;
    if q.kind in ('writing','translation','text_fill','mcq') and jsonb_typeof(item) not in ('string','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind in ('multi_fill','reorder') and jsonb_typeof(item) not in ('array','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind='true_false' and jsonb_typeof(item) not in ('boolean','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind='matching' and jsonb_typeof(item) not in ('object','null') then raise exception 'INVALID_ANSWER'; end if;
    update public.submission_answers set answer=item where attempt_id=attempt and question_version_id=q.id;
   end loop;
   update public.submission_details set revision=revision+1 where attempt_id=attempt;
  else
   if exists(select 1 from public.submission_answers sa join public.assignment_question_versions q on q.id=sa.question_version_id
    where sa.attempt_id=attempt and q.kind='speaking') then raise exception 'RECORDING_NOT_READY'; end if;
   perform account_internal.assignment_finish(attempt);
  end if;
  return account_internal.assignment_read(attempt,administrator);
 end if;

 if not administrator then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if command='bank' then
  return jsonb_build_object('questions',coalesce((select jsonb_agg(x) from (
   select * from public.assignment_question_versions where lesson_id=payload->>'lesson_id' order by created_at desc,id limit 20 offset page_number*20)x),'[]'),
   'definitions',coalesce((select jsonb_agg(x) from (select * from public.assignment_versions where lesson_id=payload->>'lesson_id' order by version desc limit 20)x),'[]'),
   'rubrics',coalesce((select jsonb_agg(x) from (select * from public.assignment_rubric_versions order by created_at desc,id limit 20)x),'[]'),
   'settings',(select to_jsonb(s) from public.lesson_assignments s where s.lesson_id=payload->>'lesson_id'));
 elsif command='rubric_create' then
  if payload->>'kind' not in ('translation','writing','speaking') or length(coalesce(payload->>'rubric_key','')) not between 1 and 120
    or jsonb_typeof(payload->'criteria') is distinct from 'array' then raise exception 'INVALID_RUBRIC'; end if;
  if jsonb_array_length(payload->'criteria') not between 1 and 20 then raise exception 'INVALID_RUBRIC'; end if;
  total:=0;
  for item in select * from jsonb_array_elements(payload->'criteria') loop
   if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')!~'^[a-z0-9_]{1,40}$'
    or length(coalesce(item->>'label','')) not between 1 and 200 or jsonb_typeof(item->'weight') is distinct from 'number'
    or (item->>'weight')::numeric not between 0.01 and 10 then raise exception 'INVALID_RUBRIC'; end if;
   total:=total+(item->>'weight')::numeric;
  end loop;
  if total<>10 or (select count(distinct x->>'id') from jsonb_array_elements(payload->'criteria') x)<>jsonb_array_length(payload->'criteria') then raise exception 'INVALID_RUBRIC'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rubric:'||(payload->>'rubric_key'),0));
  insert into public.assignment_rubric_versions(rubric_key,version,kind,criteria,created_by)
   select payload->>'rubric_key',coalesce(max(version),0)+1,payload->>'kind',payload->'criteria',actor
   from public.assignment_rubric_versions where rubric_key=payload->>'rubric_key' returning * into rubric;
  perform account_internal.assignment_audit('rubric_created',rubric.id,jsonb_build_object('version',rubric.version));
  return to_jsonb(rubric);
 elsif command='question_create' then
  lesson:=payload->>'lesson_id';
  if not exists(select 1 from public.lesson_content where id=lesson) then raise exception 'LESSON_NOT_FOUND'; end if;
  if length(coalesce(payload->>'question_key','')) not between 1 and 120 or length(coalesce(payload->>'prompt','')) not between 1 and 12000 then raise exception 'INVALID_QUESTION'; end if;
  key_value:=payload->'answer_key';
  if payload->>'kind' in ('translation','writing','speaking') then
   select * into rubric from public.assignment_rubric_versions where id=(payload->>'rubric_version_id')::uuid and kind=payload->>'kind';
   if not found or (key_value is not null and key_value<>'null'::jsonb) then raise exception 'INVALID_RUBRIC'; end if;
   key_value:=null;
  elsif payload->>'kind'='mcq' then
   if jsonb_typeof(payload->'options') is distinct from 'array' or jsonb_typeof(key_value->'value') is distinct from 'string' then raise exception 'INVALID_ANSWER_KEY'; end if;
   n:=jsonb_array_length(payload->'options');
   if n not between 2 and 8 then raise exception 'INVALID_OPTIONS'; end if;
   for item in select * from jsonb_array_elements(payload->'options') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')!~'^[A-Za-z0-9_-]{1,30}$'
     or length(coalesce(item->>'text','')) not between 1 and 2000
     or (item-'id'-'text')<>'{}'::jsonb then raise exception 'INVALID_OPTIONS'; end if;
   end loop;
   if (select count(distinct x->>'id') from jsonb_array_elements(payload->'options') x)<>n
    or (select count(distinct account_internal.assignment_normalize(x->>'text')) from jsonb_array_elements(payload->'options') x)<>n
    or not exists(select 1 from jsonb_array_elements(payload->'options') x where x->>'id'=key_value->>'value') then raise exception 'INVALID_OPTIONS'; end if;
  elsif payload->>'kind'='true_false' then
   if jsonb_typeof(key_value->'value') is distinct from 'boolean' then raise exception 'INVALID_ANSWER_KEY'; end if;
  elsif payload->>'kind' in ('text_fill','reorder') then
   if jsonb_typeof(key_value->'accepted') is distinct from 'array' then raise exception 'INVALID_ANSWER_KEY'; end if;
   if jsonb_array_length(key_value->'accepted') not between 1 and 30 or exists(select 1 from jsonb_array_elements(key_value->'accepted') x
    where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}'))=0) then raise exception 'INVALID_ANSWER_KEY'; end if;
   if payload->>'kind'='reorder' and (jsonb_typeof(payload->'options') is distinct from 'array') then raise exception 'INVALID_OPTIONS'; end if;
  elsif payload->>'kind'='multi_fill' then
   if jsonb_typeof(key_value->'values') is distinct from 'array' then raise exception 'INVALID_ANSWER_KEY'; end if;
   if jsonb_array_length(key_value->'values') not between 1 and 30 then raise exception 'INVALID_ANSWER_KEY'; end if;
   for item in select * from jsonb_array_elements(key_value->'values') loop
    if jsonb_typeof(item)<>'array' then raise exception 'INVALID_ANSWER_KEY'; end if;
    if jsonb_array_length(item)=0 or exists(select 1 from jsonb_array_elements(item) x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}'))=0) then raise exception 'INVALID_ANSWER_KEY'; end if;
   end loop;
  elsif payload->>'kind'='matching' then
   if jsonb_typeof(key_value->'pairs') is distinct from 'object' or key_value->'pairs'='{}'::jsonb then raise exception 'INVALID_ANSWER_KEY'; end if;
  else raise exception 'UNSUPPORTED_QUESTION_TYPE'; end if;
  -- Options are learner-visible. Non-MCQ options are plain strings, never arbitrary objects with private keys.
  if payload->>'kind'<>'mcq' and (jsonb_typeof(coalesce(payload->'options','[]')) is distinct from 'array'
   or exists(select 1 from jsonb_array_elements(coalesce(payload->'options','[]')) x where jsonb_typeof(x)<>'string')) then raise exception 'INVALID_OPTIONS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('question:'||lesson||':'||(payload->>'question_key'),0));
  insert into public.assignment_question_versions(lesson_id,question_key,version,kind,prompt,options,answer_key,explanation,tip,rubric_version_id,created_by)
   select lesson,payload->>'question_key',coalesce(max(version),0)+1,payload->>'kind',payload->>'prompt',coalesce(payload->'options','[]'),
    key_value,coalesce(payload->>'explanation',''),coalesce(payload->>'tip',''),case when payload->>'kind' in ('translation','writing','speaking') then rubric.id else null end,actor
   from public.assignment_question_versions where lesson_id=lesson and question_key=payload->>'question_key' returning * into q;
  perform account_internal.assignment_audit('question_version_created',q.id,jsonb_build_object('question_key',q.question_key,'version',q.version));
  return to_jsonb(q);
 elsif command='definition_create' then
  lesson:=payload->>'lesson_id';
  if jsonb_typeof(payload->'question_version_ids') is distinct from 'array' then raise exception 'INVALID_QUESTIONS'; end if;
  select array_agg(x::uuid) into question_ids from jsonb_array_elements_text(payload->'question_version_ids') x;
  if coalesce(cardinality(question_ids),0) not between 1 and 200 then raise exception 'INVALID_QUESTIONS'; end if;
  if (select count(distinct question_key) from public.assignment_question_versions where id=any(question_ids) and lesson_id=lesson)<>cardinality(question_ids) then raise exception 'INVALID_QUESTIONS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('assignment:'||lesson,0));
  insert into public.assignment_versions(lesson_id,version,title,time_limit_minutes,created_by)
   select lesson,coalesce(max(version),0)+1,payload->>'title',(payload->>'time_limit_minutes')::integer,actor
   from public.assignment_versions where lesson_id=lesson returning * into v;
  insert into public.assignment_version_questions select v.id,position,id from unnest(question_ids) with ordinality as x(id,position);
  insert into public.lesson_assignments(lesson_id) values(lesson) on conflict do nothing;
  perform account_internal.assignment_audit('definition_created',v.id,jsonb_build_object('lesson_id',lesson,'version',v.version));
  return to_jsonb(v);
 elsif command in ('definition_preview','definition_publish') then
  select * into v from public.assignment_versions where id=(payload->>'version_id')::uuid for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if command='definition_preview' then
   if v.status='draft' then update public.assignment_versions set previewed_at=now_at where id=v.id; end if;
   return to_jsonb(v)||jsonb_build_object('questions',(select jsonb_agg(to_jsonb(q) order by aq.position)
    from public.assignment_version_questions aq join public.assignment_question_versions q on q.id=aq.question_version_id where aq.assignment_version_id=v.id));
  end if;
  if v.status<>'draft' then raise exception 'VERSION_IMMUTABLE'; end if;
  if v.previewed_at is null then raise exception 'PREVIEW_REQUIRED'; end if;
  if exists(select 1 from public.lesson_assignments where lesson_id=v.lesson_id and enabled) and exists(
   select 1 from public.assignment_version_questions aq join public.assignment_question_versions q on q.id=aq.question_version_id
   where aq.assignment_version_id=v.id and q.kind='speaking') then raise exception 'RECORDING_NOT_READY'; end if;
  update public.assignment_question_versions set published_at=now_at,published_by=actor
   where id in(select question_version_id from public.assignment_version_questions where assignment_version_id=v.id) and published_at is null;
  update public.assignment_versions set status='published',published_at=now_at,published_by=actor where id=v.id;
  update public.lesson_assignments set current_version_id=v.id,updated_at=now_at where lesson_id=v.lesson_id;
  perform account_internal.assignment_audit('definition_published',v.id,jsonb_build_object('lesson_id',v.lesson_id));
  return jsonb_build_object('published',true,'version_id',v.id);
 elsif command='enable' then
  lesson:=payload->>'lesson_id';
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'INVALID_REQUEST'; end if;
  if (payload->>'enabled')::boolean and exists(select 1 from public.lesson_assignments la join public.assignment_version_questions aq on aq.assignment_version_id=la.current_version_id
   join public.assignment_question_versions q on q.id=aq.question_version_id where la.lesson_id=lesson and q.kind='speaking') then raise exception 'RECORDING_NOT_READY'; end if;
  update public.lesson_assignments set enabled=(payload->>'enabled')::boolean,updated_at=now_at,
    protected_at=case when (payload->>'enabled')::boolean then coalesce(protected_at,now_at) else protected_at end
    where lesson_id=lesson and current_version_id is not null;
  if not found then raise exception 'PUBLISHED_ASSIGNMENT_REQUIRED'; end if;
  perform account_internal.assignment_audit('availability_changed',null,jsonb_build_object('lesson_id',lesson,'enabled',payload->'enabled'));
  return jsonb_build_object('enabled',payload->'enabled');
 elsif command in ('grade','grade_preview','grade_publish','regrade') then
  attempt:=(payload->>'attempt_id')::uuid;
  select * into d from public.submission_details where attempt_id=attempt for update;
  if not found or d.state<>'submitted' then raise exception 'SUBMITTED_ATTEMPT_REQUIRED'; end if;
  select * into r from public.submission_results where attempt_id=attempt order by revision desc limit 1 for update;
  if r.revision is distinct from (payload->>'grade_revision')::integer or r.edit_version is distinct from (payload->>'edit_version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if command='regrade' then
   if r.state<>'published' then raise exception 'FINISH_CURRENT_GRADE_FIRST'; end if;
   if length(trim(coalesce(payload->>'reason',''))) not between 1 and 1000 then raise exception 'REASON_REQUIRED'; end if;
   revision_number:=r.revision+1;
   insert into public.submission_results(attempt_id,revision,reason,created_by) values(attempt,revision_number,payload->>'reason',actor);
   insert into public.submission_grades(attempt_id,revision,question_version_id,grading_question_version_id,rubric_version_id,score,feedback,criteria_scores,method,graded_by,graded_at)
    select attempt,revision_number,question_version_id,grading_question_version_id,rubric_version_id,score,feedback,criteria_scores,method,graded_by,graded_at
    from public.submission_grades where attempt_id=attempt and revision=r.revision;
   if payload ? 'new_question_version_id' then
    select * into q from public.assignment_question_versions where id=(payload->>'new_question_version_id')::uuid and published_at is not null;
    if not found or not exists(select 1 from public.submission_answers sa join public.assignment_question_versions oldq on oldq.id=sa.question_version_id
     where sa.attempt_id=attempt and sa.question_version_id=(payload->>'question_version_id')::uuid and oldq.lesson_id=q.lesson_id and oldq.question_key=q.question_key and oldq.kind=q.kind) then raise exception 'INVALID_REGRADE_VERSION'; end if;
    update public.submission_grades g set grading_question_version_id=q.id,rubric_version_id=q.rubric_version_id,
     score=account_internal.assignment_score(q.kind,q.answer_key,sa.answer),criteria_scores=null,feedback='',
     method=case when q.rubric_version_id is null then 'automatic' else 'manual' end,graded_by=actor,graded_at=now_at
    from public.submission_answers sa where g.attempt_id=attempt and g.revision=revision_number and g.question_version_id=(payload->>'question_version_id')::uuid
     and sa.attempt_id=g.attempt_id and sa.question_version_id=g.question_version_id;
   end if;
   perform account_internal.assignment_audit('regrade_started',attempt,jsonb_build_object('before_revision',r.revision,'after_revision',revision_number,'reason',payload->>'reason',
     'question_version_id',payload->>'question_version_id','new_question_version_id',payload->>'new_question_version_id',
     'before',(select jsonb_agg(to_jsonb(g)) from public.submission_grades g where g.attempt_id=attempt and g.revision=r.revision),
     'after',(select jsonb_agg(to_jsonb(g)) from public.submission_grades g where g.attempt_id=attempt and g.revision=revision_number)));
   return account_internal.assignment_read(attempt,true);
  end if;
  if r.state<>'draft' then raise exception 'PUBLICATION_IMMUTABLE'; end if;
  if command='grade' then
   selected:=(payload->>'question_version_id')::uuid;
   select qv.* into q from public.submission_grades g join public.assignment_question_versions qv on qv.id=g.grading_question_version_id
    where g.attempt_id=attempt and g.revision=r.revision and g.question_version_id=selected;
   if not found then raise exception 'INVALID_QUESTION'; end if;
   if q.rubric_version_id is not null then
    select * into rubric from public.assignment_rubric_versions where id=q.rubric_version_id;
    if jsonb_typeof(payload->'criteria_scores') is distinct from 'object' then raise exception 'RUBRIC_SCORES_REQUIRED'; end if;
    total:=0; n:=0;
    for item in select * from jsonb_array_elements(rubric.criteria) loop
     key_value:=payload->'criteria_scores'->(item->>'id');
     if jsonb_typeof(key_value) is distinct from 'number' then raise exception 'INVALID_RUBRIC_SCORE'; end if;
     value:=(key_value#>>'{}')::numeric;
     if value<0 or value>(item->>'weight')::numeric then raise exception 'INVALID_RUBRIC_SCORE'; end if;
     total:=total+value; n:=n+1;
    end loop;
    if (select count(*) from jsonb_object_keys(payload->'criteria_scores'))<>n then raise exception 'INVALID_RUBRIC_SCORE'; end if;
   else
    if jsonb_typeof(payload->'score') is distinct from 'number' then raise exception 'INVALID_SCORE'; end if;
    total:=(payload->>'score')::numeric;
   end if;
   if total not between 0 and 10 then raise exception 'INVALID_SCORE'; end if;
   select to_jsonb(g) into result from public.submission_grades g where attempt_id=attempt and revision=r.revision and question_version_id=selected;
   update public.submission_grades set score=total,feedback=coalesce(payload->>'feedback',''),criteria_scores=payload->'criteria_scores',
     method='manual',graded_by=actor,graded_at=now_at where attempt_id=attempt and revision=r.revision and question_version_id=selected;
   update public.submission_results set edit_version=edit_version+1,preview_version=null where attempt_id=attempt and revision=r.revision;
   perform account_internal.assignment_audit('grade_saved',attempt,jsonb_build_object('revision',r.revision,'question_version_id',selected,'before',result,
    'after',(select to_jsonb(g) from public.submission_grades g where attempt_id=attempt and revision=r.revision and question_version_id=selected)));
  else
   if exists(select 1 from public.submission_grades where attempt_id=attempt and revision=r.revision and score is null) then raise exception 'UNGRADED_QUESTIONS'; end if;
   select sum(score),count(*)*10 into total,maximum from public.submission_grades where attempt_id=attempt and revision=r.revision;
   if maximum is null or maximum<=0 then raise exception 'EMPTY_GRADE'; end if;
   if command='grade_preview' then
    update public.submission_results set preview_version=edit_version where attempt_id=attempt and revision=r.revision;
    return account_internal.assignment_read(attempt,true)||jsonb_build_object('preview',jsonb_build_object('raw_score',total,'raw_max_score',maximum,'normalized_score',round(total/maximum*100,6),'normalized_max',100));
   end if;
   if r.preview_version is distinct from r.edit_version then raise exception 'PREVIEW_REQUIRED'; end if;
   update public.submission_results set state='published',raw_score=total,raw_max_score=maximum,normalized_score=round(total/maximum*100,6),published_at=now_at,published_by=actor
    where attempt_id=attempt and revision=r.revision;
   update public.learning_attempts set score=round(total/maximum*100,6),max_score=100,version=version+1 where id=attempt and source='official';
   perform account_internal.assignment_audit('result_published',attempt,jsonb_build_object('revision',r.revision,'raw_score',total,'raw_max_score',maximum,'normalized_score',round(total/maximum*100,6)));
  end if;
  return account_internal.assignment_read(attempt,true);
 end if;
 raise exception 'INVALID_COMMAND';
end $$;

-- Revoke PostgreSQL's default PUBLIC function execution, including pure private helpers.
revoke all on function account_internal.assignment_normalize(text),account_internal.assignment_score(text,jsonb,jsonb),
 account_internal.assignment_question_projection(public.assignment_question_versions),account_internal.assignment_audit(text,uuid,jsonb),
 account_internal.assignment_finish(uuid),account_internal.assignment_read(uuid,boolean),account_internal.assignment_command(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.assignment_command(text,jsonb) to authenticated;
create function public.assignment_command(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.assignment_command(command,payload);$$;
revoke all on function public.assignment_command(text,jsonb) from public,anon;
grant execute on function public.assignment_command(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
