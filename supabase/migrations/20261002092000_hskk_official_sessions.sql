-- Timed transport extends existing attempts/submissions, never a parallel grade store.
create table account_internal.hskk_runtime_receipts (
 exam_id text primary key references account_internal.admin_exams(id),
 runtime_version text not null check(runtime_version='hskk-official-v1'), verified_at timestamptz not null default clock_timestamp()
);
create table account_internal.hskk_preflights (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(user_id),
 assignment_version_id uuid not null references account_internal.hskk_delivery_versions(assignment_version_id),
 state text not null default 'CREATED' check(state in ('CREATED','CANDIDATE_VERIFIED','DEVICE_CHECK','MIC_CHECK','READY','STRUCTURE','COUNTDOWN')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '4 hours',
 unique(owner_id,assignment_version_id)
);
create table account_internal.hskk_sessions (
 attempt_id uuid primary key references public.submission_details(attempt_id),
 owner_id uuid not null references public.profiles(user_id),
 assignment_version_id uuid not null references account_internal.hskk_delivery_versions(assignment_version_id),
 started_at timestamptz not null, exam_deadline timestamptz not null,
 upload_deadline timestamptz not null, timeline jsonb not null,
 check(exam_deadline>started_at and upload_deadline=exam_deadline+interval '30 minutes')
);
do $$declare t text;begin
 foreach t in array array['hskk_runtime_receipts','hskk_preflights','hskk_sessions'] loop
  execute format('alter table account_internal.%I enable row level security',t);
  execute format('revoke all on account_internal.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create trigger hskk_sessions_immutable before update or delete on account_internal.hskk_sessions for each row execute function account_internal.assignment_metadata_immutable();
create trigger hskk_runtime_immutable before update or delete on account_internal.hskk_runtime_receipts for each row execute function account_internal.assignment_metadata_immutable();

create function account_internal.hskk_delivery_config(version_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('exam_code',h.exam_id,'exam_version',v.version,'assignment_version_id',v.id,'title',v.title,
  'level','elementary','source_type','official','delivery_mode','private_clips',
  'timing',jsonb_build_object('countdown_seconds',(d.configuration->'timing'->>'countdown_seconds')::integer),
  'sections',(select jsonb_agg(jsonb_build_object('id',s->>'id','title_vi',s->>'title_vi','preparation_seconds',(s->>'preparation_seconds')::integer) order by n)
    from jsonb_array_elements(d.configuration->'sections') with ordinality x(s,n)),
  'questions',(select jsonb_agg(jsonb_build_object('id',q.question_key,'version',q.version,'version_id',q.id,'number',b.position,
   'section_id',b.section_id,'type',b.question_type,'prompt_mode',b.prompt_mode,'prompt',case when b.prompt_mode='audio' then '' else q.prompt end,
   'response_seconds',b.response_seconds,'auto_start',true,'auto_stop',true,'allow_replay',false,'allow_rerecord',false,'allow_navigation',false,
   'prompt_audio',jsonb_build_object('duration_ms',a.duration_ms))order by b.position)
    from account_internal.hskk_delivery_questions b join public.assignment_question_versions q on q.id=b.question_version_id
    join account_internal.hskk_prompt_assets a on a.sha256=b.clip_sha256 where b.assignment_version_id=v.id))
 from account_internal.hskk_delivery_versions h join public.assignment_versions v on v.id=h.assignment_version_id
 join account_internal.hskk_exam_draft_revisions d on d.id=h.authoring_revision_id where v.id=version_id
$$;
create function account_internal.hskk_timeline(version_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare config jsonb:=account_internal.hskk_delivery_config(version_id); s jsonb; q jsonb; frames jsonb:='[]'; at_ms integer:=0; span integer;
begin
 span:=(config->'timing'->>'countdown_seconds')::integer*1000;
 frames:=frames||jsonb_build_array(jsonb_build_object('state','COUNTDOWN','start',0,'end',span));at_ms:=span;
 for s in select * from jsonb_array_elements(config->'sections') loop
  span:=(s->>'preparation_seconds')::integer*1000;
  if span>0 then frames:=frames||jsonb_build_array(jsonb_build_object('state','PREPARATION','section_id',s->>'id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;end if;
  for q in select * from jsonb_array_elements(config->'questions') x where x->>'section_id'=s->>'id' loop
   if q->>'prompt_mode'='audio' then
    span:=(q->'prompt_audio'->>'duration_ms')::integer;
    frames:=frames||jsonb_build_array(jsonb_build_object('state','LISTENING','question_id',q->>'id','question_version_id',q->>'version_id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;
   end if;
   span:=(q->>'response_seconds')::integer*1000;
   frames:=frames||jsonb_build_array(jsonb_build_object('state','RECORDING','question_id',q->>'id','question_version_id',q->>'version_id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;
  end loop;
 end loop;
 return frames;
end $$;
create function account_internal.hskk_session_read(session_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare p account_internal.hskk_preflights; s account_internal.hskk_sessions; v public.assignment_versions; h account_internal.hskk_delivery_versions; now_at timestamptz:=clock_timestamp();
begin
 select * into p from account_internal.hskk_preflights where id=session_id and owner_id=auth.uid();
 if p.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=p.id;
 select * into v from public.assignment_versions where id=p.assignment_version_id;
 select * into h from account_internal.hskk_delivery_versions where assignment_version_id=v.id;
 return jsonb_build_object('attempt_id',p.id,'candidate_id',p.owner_id,'exam_code',h.exam_id,'exam_version',v.version,
  'state',case when exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='submitted') then 'SUBMITTED'
    when s.attempt_id is not null then coalesce((select x->>'state' from jsonb_array_elements(s.timeline) x where (x->>'start')::integer<=extract(epoch from(now_at-s.started_at))*1000 and (x->>'end')::integer>extract(epoch from(now_at-s.started_at))*1000),'COMPLETED') else p.state end,
  'server_time',floor(extract(epoch from now_at)*1000),'server_started_at',floor(extract(epoch from s.started_at)*1000),'server_deadline',floor(extract(epoch from s.exam_deadline)*1000),
  'question_versions',(select jsonb_object_agg(q.question_key,q.version) from public.assignment_question_versions q join account_internal.hskk_delivery_questions b on b.question_version_id=q.id where b.assignment_version_id=v.id),
  'question_version_ids',(select jsonb_object_agg(q.question_key,q.id) from public.assignment_question_versions q join account_internal.hskk_delivery_questions b on b.question_version_id=q.id where b.assignment_version_id=v.id),
  'recordings',coalesce((select jsonb_object_agg(q.question_key,jsonb_build_object('recording_id',r.id,'owner_id',r.owner_id,'attempt_id',r.attempt_id,'question_version_id',r.question_version_id,'confirmed',true))
   from account_internal.speaking_recordings r join public.assignment_question_versions q on q.id=r.question_version_id
   where r.attempt_id=s.attempt_id and r.owner_id=p.owner_id and r.raw_uploaded_at is not null),'{}'::jsonb));
end $$;

create function public.hskk_session_command(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); code text:=payload->>'exam_code'; e account_internal.admin_exams; p account_internal.hskk_preflights; s account_internal.hskk_sessions;
 v public.assignment_versions; frames jsonb; finished integer; now_at timestamptz; states text[]:=array['CREATED','CANDIDATE_VERIFIED','DEVICE_CHECK','MIC_CHECK','READY','STRUCTURE','COUNTDOWN']; target text; answer public.submission_answers; r account_internal.speaking_recordings; result jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
 if command='catalog' then
  return coalesce((select jsonb_agg(jsonb_build_object('exam_code',e.id,'title',v.title,'exam_version',v.version,'level',e.level))
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
  if (select count(*) from public.submission_answers where attempt_id=p.id and answer<>'null'::jsonb)<>27 then raise exception 'RECORDING_REQUIRED';end if;
  for answer in select * from public.submission_answers where attempt_id=p.id loop perform account_internal.speaking_check_answer(p.id,answer.question_version_id,answer.answer);end loop;
  perform account_internal.assignment_finish(p.id);
 elsif command='result' then
  result:=account_internal.assignment_read(p.id,false)->'result';
  if result is null or result='null'::jsonb then return jsonb_build_object('source','official');end if;
  return jsonb_build_object('source','official','published_at',result->'published_at','score',result->'normalized_score','feedback',result->'questions');
 elsif command<>'get' then raise exception 'INVALID_COMMAND';
 end if;
 return account_internal.hskk_session_read(p.id);
end $$;
revoke all on function public.hskk_session_command(text,jsonb) from public,anon;
grant execute on function public.hskk_session_command(text,jsonb) to authenticated;

-- Deny general-purpose start/save/submit/get for HSKK. Only the timed transport
-- may produce HSKK learner payloads; teacher grading keeps the existing RPC/UI.
alter function account_internal.assignment_command(text,jsonb) rename to assignment_command_before_hskk;
create function account_internal.assignment_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not account_internal.is_admin() and (
   exists(select 1 from account_internal.admin_exams where delivery_id=payload->>'lesson_id' and exam_type='HSKK')
   or exists(select 1 from account_internal.hskk_sessions where attempt_id=(payload->>'attempt_id')::uuid)) then raise exception 'HSKK_TRANSPORT_REQUIRED' using errcode='42501';end if;
 if command in ('definition_publish','enable') and exists(select 1 from account_internal.hskk_delivery_versions h join public.assignment_versions v on v.id=h.assignment_version_id where h.assignment_version_id=(payload->>'version_id')::uuid or v.lesson_id=payload->>'lesson_id') then raise exception 'HSKK_PUBLICATION_REQUIRED';end if;
 result:=account_internal.assignment_command_before_hskk(command,payload);
 if command='catalog' then return coalesce((select jsonb_agg(x) from jsonb_array_elements(result) x where not exists(select 1 from account_internal.admin_exams e where e.delivery_id=x->>'lesson_id' and e.exam_type='HSKK')),'[]'::jsonb);end if;
 return result;
end $$;
revoke all on function account_internal.assignment_command_before_hskk(text,jsonb),account_internal.assignment_command(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.assignment_command(text,jsonb) to authenticated;

-- Narrow real-exam recording exception. The synthetic canary is unchanged.
alter function account_internal.recording_command(text,jsonb) rename to recording_command_before_hskk;
create function account_internal.recording_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s account_internal.hskk_sessions; r account_internal.speaking_recordings; qid uuid; request uuid; frame jsonb; result jsonb;
begin
 select * into s from account_internal.hskk_sessions where attempt_id=coalesce((payload->>'attempt_id')::uuid,(select attempt_id from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid));
 if s.attempt_id is null then return account_internal.recording_command_before_hskk(command,payload);end if;
 if command='reserve' then
  if s.owner_id is distinct from auth.uid() or not account_internal.can_access_lesson((select lesson_id from public.learning_attempts where id=s.attempt_id)) then raise exception 'RECORDING_NOT_FOUND' using errcode='42501';end if;
  qid:=(payload->>'question_version_id')::uuid;request:=(payload->>'request_id')::uuid;
  select x into frame from jsonb_array_elements(s.timeline) x where x->>'state'='RECORDING' and x->>'question_version_id'=qid::text;
  if frame is null or clock_timestamp()<s.started_at+make_interval(secs=>(frame->>'end')::integer/1000.0) then raise exception 'RECORDING_WINDOW_REQUIRED';end if;
  if clock_timestamp()>=s.upload_deadline or not exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='draft') then raise exception 'SUBMISSION_LOCKED';end if;
  perform pg_advisory_xact_lock(hashtextextended('hskk-recording:'||s.attempt_id::text||qid::text,0));
  select * into r from account_internal.speaking_recordings where attempt_id=s.attempt_id and question_version_id=qid;
  if r.id is not null then
   if row(r.request_id,r.raw_sha256,r.raw_size,r.raw_mime) is distinct from row(request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime') then raise exception 'RECORDING_LOCKED';end if;
  else
   insert into account_internal.speaking_recordings(attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline)
    values(s.attempt_id,qid,s.owner_id,request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime',s.upload_deadline)returning * into r;
   perform account_internal.speaking_event(r.id,'reserved');
  end if;
  return jsonb_build_object('id',r.id,'path',r.id::text||'/raw','bucket','speaking-private','raw_uploaded_at',r.raw_uploaded_at,'upload_deadline',r.upload_deadline);
 end if;
 result:=account_internal.recording_command_before_hskk(command,payload);
 if not account_internal.is_admin() then result:=result-'playback_path';end if;
 return result;
end $$;
revoke all on function account_internal.recording_command_before_hskk(text,jsonb),account_internal.recording_command(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.recording_command(text,jsonb) to authenticated;
alter function account_internal.speaking_object_allowed(text,boolean) rename to speaking_object_allowed_before_hskk;
create function account_internal.speaking_object_allowed(object_name text,write_object boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare r account_internal.speaking_recordings; s account_internal.hskk_sessions;
begin
 if object_name !~ '^[0-9a-f-]{36}/(raw|audio.mp3)$' then return false;end if;
 select * into r from account_internal.speaking_recordings where id=split_part(object_name,'/',1)::uuid;
 select * into s from account_internal.hskk_sessions where attempt_id=r.attempt_id;
 if s.attempt_id is null then return account_internal.speaking_object_allowed_before_hskk(object_name,write_object);end if;
 if write_object then return r.owner_id=auth.uid() and r.raw_uploaded_at is null and object_name=r.id::text||'/raw'
   and clock_timestamp()<r.upload_deadline and account_internal.can_access_lesson((select lesson_id from public.learning_attempts where id=s.attempt_id))
   and exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='draft');end if;
 if not account_internal.is_admin() then return false;end if;
 return account_internal.speaking_object_allowed_before_hskk(object_name,false);
end $$;
revoke all on function account_internal.speaking_object_allowed_before_hskk(text,boolean),account_internal.speaking_object_allowed(text,boolean) from public,anon,authenticated;
grant execute on function account_internal.speaking_object_allowed(text,boolean) to authenticated;
-- Policy expressions retain function OIDs across rename; explicitly point them
-- to the scoped wrapper rather than granting access to the old predicate.
alter policy speaking_insert_reserved on storage.objects with check(bucket_id='speaking-private' and account_internal.speaking_object_allowed(name,true));
alter policy speaking_read_authorized on storage.objects using(bucket_id='speaking-private' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and account_internal.speaking_object_allowed(name,false));

-- Service-only descriptor: the client never receives Storage paths or source metadata.
create function public.hskk_current_prompt(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s account_internal.hskk_sessions; q account_internal.hskk_delivery_questions; a account_internal.hskk_prompt_assets; frame jsonb; elapsed numeric;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=(payload->>'attempt_id')::uuid and owner_id=(payload->>'owner_id')::uuid;
 if s.attempt_id is null or not exists(select 1 from public.profiles where user_id=s.owner_id and role='STUDENT' and status='APPROVED')
  or not exists(select 1 from public.learning_attempts l join public.enrollments e on e.user_id=l.user_id join public.lesson_content c on c.id=l.lesson_id and c.course_id=e.course_id
   join public.student_lesson_access g on g.user_id=l.user_id and g.lesson_id=l.lesson_id and g.active
   join public.lesson_assignments la on la.lesson_id=l.lesson_id and la.enabled
   join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=s.assignment_version_id
   join account_internal.hskk_controlled_access ca on ca.exam_id=dv.exam_id and ca.owner_id=s.owner_id
   where l.id=s.attempt_id and e.active)
  or exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='submitted') then raise exception 'EXAM_ACCESS_REQUIRED';end if;
 elapsed:=extract(epoch from(clock_timestamp()-s.started_at))*1000;
 select x into frame from jsonb_array_elements(s.timeline) x where x->>'state'='LISTENING' and x->>'question_version_id'=payload->>'question_version_id' and elapsed>=(x->>'start')::integer and elapsed<(x->>'end')::integer;
 if frame is null then raise exception 'PROMPT_WINDOW_REQUIRED';end if;
 select * into q from account_internal.hskk_delivery_questions where assignment_version_id=s.assignment_version_id and question_version_id=(payload->>'question_version_id')::uuid;
 select * into a from account_internal.hskk_prompt_assets where sha256=q.clip_sha256;
 if not exists(select 1 from account_internal.hskk_prompt_receipts where sha256=a.sha256) then raise exception 'CLIP_NOT_VERIFIED';end if;
 return jsonb_build_object('bucket','hskk-prompt-clips','path',a.object_path,'sha256',a.sha256);
end $$;
revoke all on function public.hskk_current_prompt(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_current_prompt(jsonb) to service_role;
revoke all on function account_internal.hskk_delivery_config(uuid),account_internal.hskk_timeline(uuid),account_internal.hskk_session_read(uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
