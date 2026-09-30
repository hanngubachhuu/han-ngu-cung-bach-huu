-- CP2 additive migration. Disabled until synthetic production smoke is verified.
create table account_internal.speaking_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 verified_at timestamptz, check(not enabled or verified_at is not null)
);
insert into account_internal.speaking_settings default values;
create table account_internal.speaking_recordings (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null, question_version_id uuid not null,
 owner_id uuid not null references public.profiles(user_id), request_id uuid not null,
 raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'),
 raw_size integer not null check(raw_size between 1 and 8388608),
 raw_mime text not null check(raw_mime in ('audio/webm','audio/ogg','audio/mp4','audio/wav','audio/mpeg')),
 created_at timestamptz not null default clock_timestamp(), upload_deadline timestamptz not null,
 raw_uploaded_at timestamptz, raw_object_id uuid,
 conversion_status text not null default 'pending' check(conversion_status in ('pending','completed','failed')),
 mp3_sha256 text check(mp3_sha256 ~ '^[a-f0-9]{64}$'), mp3_size integer check(mp3_size between 1 and 3145728),
 duration_seconds numeric check(duration_seconds > 0 and duration_seconds <= 360.15),
 drive_status text not null default 'pending' check(drive_status in ('pending','completed','failed')),
 drive_file_id text check(length(drive_file_id) between 1 and 200),
 uploaded_at timestamptz, expires_at timestamptz,
 cleanup_status text not null default 'pending' check(cleanup_status in ('pending','processing','retry','completed')),
 cleaned_at timestamptz, retry_count integer not null default 0, error_code text,
 next_attempt_at timestamptz not null default clock_timestamp(), lease_id uuid, lease_until timestamptz,
 unique(owner_id,request_id),
 foreign key(attempt_id,question_version_id) references public.submission_answers(attempt_id,question_version_id),
 check ((conversion_status='completed') = (mp3_sha256 is not null and mp3_size is not null and duration_seconds is not null)),
 check ((drive_status='completed') = (uploaded_at is not null and expires_at is not null)),
 check (expires_at is null or (drive_file_id is not null and conversion_status='completed' and expires_at=uploaded_at+interval '7 days')),
 check ((cleanup_status='completed') = (cleaned_at is not null)),
 check (cleanup_status='pending' or expires_at is not null)
);
create index speaking_attempt_idx on account_internal.speaking_recordings(attempt_id,question_version_id);
create index speaking_work_idx on account_internal.speaking_recordings(next_attempt_at) where raw_uploaded_at is not null and drive_status<>'completed';
create index speaking_expiry_idx on account_internal.speaking_recordings(expires_at) where cleanup_status<>'completed';
create table account_internal.speaking_events (
 id bigint generated always as identity primary key,
 recording_id uuid not null references account_internal.speaking_recordings(id),
 event text not null, actor uuid, created_at timestamptz not null default clock_timestamp(), details jsonb not null default '{}'
);
create index speaking_event_recording_idx on account_internal.speaking_events(recording_id,created_at);
alter table account_internal.speaking_settings enable row level security;
alter table account_internal.speaking_recordings enable row level security;
alter table account_internal.speaking_events enable row level security;
revoke all on account_internal.speaking_settings,account_internal.speaking_recordings,account_internal.speaking_events from public,anon,authenticated;

create function account_internal.speaking_immutable() returns trigger
language plpgsql set search_path='' as $$begin
 if TG_OP='DELETE' or TG_TABLE_NAME='speaking_events' then raise exception 'RECORDING_HISTORY_IMMUTABLE'; end if;
 if row(new.id,new.attempt_id,new.question_version_id,new.owner_id,new.request_id,new.raw_sha256,new.raw_size,new.raw_mime,new.created_at,new.upload_deadline)
 is distinct from row(old.id,old.attempt_id,old.question_version_id,old.owner_id,old.request_id,old.raw_sha256,old.raw_size,old.raw_mime,old.created_at,old.upload_deadline)
 or (old.raw_uploaded_at is not null and row(new.raw_uploaded_at,new.raw_object_id) is distinct from row(old.raw_uploaded_at,old.raw_object_id))
 or (old.conversion_status='completed' and row(new.conversion_status,new.mp3_sha256,new.mp3_size,new.duration_seconds) is distinct from row(old.conversion_status,old.mp3_sha256,old.mp3_size,old.duration_seconds))
 or (old.drive_file_id is not null and new.drive_file_id is distinct from old.drive_file_id)
 or (old.uploaded_at is not null and row(new.drive_status,new.uploaded_at,new.expires_at) is distinct from row(old.drive_status,old.uploaded_at,old.expires_at))
 or (old.cleaned_at is not null and row(new.cleanup_status,new.cleaned_at) is distinct from row(old.cleanup_status,old.cleaned_at)) then raise exception 'RECORDING_HISTORY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger speaking_identity before update or delete on account_internal.speaking_recordings for each row execute function account_internal.speaking_immutable();
create trigger speaking_event_immutable before update or delete on account_internal.speaking_events for each row execute function account_internal.speaking_immutable();
create function account_internal.speaking_event(recording uuid,event_name text,detail jsonb default '{}') returns void
language sql set search_path='' as $$
 insert into account_internal.speaking_events(recording_id,event,actor,details) values(recording,event_name,auth.uid(),detail);
 insert into public.audit_logs(actor,target_id,action,details) values(auth.uid(),recording,'speaking.'||event_name,detail);
$$;
create function account_internal.speaking_enabled() returns boolean language sql stable set search_path='' as $$
 select coalesce((select enabled from account_internal.speaking_settings where id),false);
$$;

-- Storage never accepts a caller-chosen path beyond a live server reservation.
create function account_internal.speaking_object_allowed(object_name text,write_object boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare r account_internal.speaking_recordings; a public.learning_attempts; d public.submission_details;
begin
 if auth.uid() is null or object_name !~ '^[0-9a-f-]{36}/(raw|audio.mp3)$' then return false; end if;
 select * into r from account_internal.speaking_recordings where id=split_part(object_name,'/',1)::uuid;
 if not found then return false; end if;
 select * into a from public.learning_attempts where id=r.attempt_id;
 select * into d from public.submission_details where attempt_id=r.attempt_id;
 if write_object then
  return account_internal.speaking_enabled() and r.owner_id=auth.uid() and account_internal.can_access_lesson(a.lesson_id)
   and d.state='draft' and clock_timestamp()<r.upload_deadline and (d.deadline_at is null or clock_timestamp()<d.deadline_at)
   and r.raw_uploaded_at is null and object_name=r.id::text||'/raw';
 end if;
 if r.cleaned_at is not null or (r.expires_at is not null and clock_timestamp()>=r.expires_at) then return false; end if;
 if not ((r.owner_id=auth.uid() and account_internal.can_access_lesson(a.lesson_id)) or (account_internal.is_admin() and d.state='submitted')) then return false; end if;
 if object_name=r.id::text||'/raw' then return r.owner_id=auth.uid(); end if;
 return object_name=r.id::text||'/audio.mp3' and r.conversion_status='completed' and exists(select 1 from public.submission_answers s where s.attempt_id=r.attempt_id and s.question_version_id=r.question_version_id and s.answer=jsonb_build_object('recording_id',r.id));
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('speaking-private','speaking-private',false,8388608,array['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/mpeg']);
create policy speaking_insert_reserved on storage.objects for insert to authenticated
 with check(bucket_id='speaking-private' and account_internal.speaking_object_allowed(name,true));
create policy speaking_read_authorized on storage.objects for select to authenticated
 using(bucket_id='speaking-private' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and account_internal.speaking_object_allowed(name,false));
-- No client UPDATE/DELETE policy: re-record always creates a new immutable object ID.

create function account_internal.recording_command(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); r account_internal.speaking_recordings; a public.learning_attempts; d public.submission_details;
 object_row storage.objects; attempt uuid; qid uuid; request uuid;
begin
 if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_REQUEST'; end if;
 if command='reserve' then
  if not account_internal.speaking_enabled() then raise exception 'RECORDING_NOT_READY'; end if;
  attempt:=(payload->>'attempt_id')::uuid; qid:=(payload->>'question_version_id')::uuid; request:=(payload->>'request_id')::uuid;
  select * into d from public.submission_details where attempt_id=attempt for update;
  select * into a from public.learning_attempts where id=attempt;
  if a.user_id is distinct from actor or not account_internal.can_access_lesson(a.lesson_id) then raise exception 'RECORDING_NOT_FOUND' using errcode='42501'; end if;
  if d.state is distinct from 'draft' or (d.deadline_at is not null and clock_timestamp()>=d.deadline_at) then raise exception 'SUBMISSION_LOCKED'; end if;
  if not exists(select 1 from public.submission_answers s join public.assignment_question_versions q on q.id=s.question_version_id where s.attempt_id=attempt and q.id=qid and q.kind='speaking') then raise exception 'INVALID_QUESTION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
  select * into r from account_internal.speaking_recordings where owner_id=actor and request_id=request;
  if found then
   if row(r.attempt_id,r.question_version_id,r.raw_sha256,r.raw_size,r.raw_mime) is distinct from row(attempt,qid,payload->>'sha256',(payload->>'size')::integer,payload->>'mime') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
   if (select count(*) from account_internal.speaking_recordings where attempt_id=attempt and question_version_id=qid)>=20 then raise exception 'RECORDING_LIMIT'; end if;
   insert into account_internal.speaking_recordings(attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline)
    values(attempt,qid,actor,request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime',least(clock_timestamp()+interval '10 minutes',coalesce(d.deadline_at,'infinity'))) returning * into r;
   perform account_internal.speaking_event(r.id,'reserved');
  end if;
  return jsonb_build_object('id',r.id,'path',r.id::text||'/raw','bucket','speaking-private','raw_uploaded_at',r.raw_uploaded_at,'upload_deadline',r.upload_deadline);
 end if;
 select * into r from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid;
 if not found then raise exception 'RECORDING_NOT_FOUND' using errcode='42501'; end if;
 select * into d from public.submission_details where attempt_id=r.attempt_id for update;
 select * into a from public.learning_attempts where id=r.attempt_id;
 if not ((r.owner_id=actor and account_internal.can_access_lesson(a.lesson_id)) or (account_internal.is_admin() and d.state='submitted' and command='get')) then raise exception 'RECORDING_NOT_FOUND' using errcode='42501'; end if;
 select * into r from account_internal.speaking_recordings where id=r.id for update;
 if command='confirm' then
  if r.raw_uploaded_at is null then
   if d.state<>'draft' or clock_timestamp()>=r.upload_deadline or (d.deadline_at is not null and clock_timestamp()>=d.deadline_at) then raise exception 'SUBMISSION_LOCKED'; end if;
   select * into object_row from storage.objects where bucket_id='speaking-private' and name=r.id::text||'/raw';
   if not found or (object_row.metadata->>'size')::bigint is distinct from r.raw_size::bigint or split_part(object_row.metadata->>'mimetype',';',1) is distinct from r.raw_mime then raise exception 'UPLOAD_NOT_CONFIRMED'; end if;
   update account_internal.speaking_recordings set raw_uploaded_at=clock_timestamp(),raw_object_id=object_row.id where id=r.id returning * into r;
   perform account_internal.speaking_event(r.id,'upload_confirmed');
  end if;
 elsif command<>'get' then raise exception 'INVALID_COMMAND'; end if;
 return jsonb_build_object('id',r.id,'attempt_id',r.attempt_id,'question_version_id',r.question_version_id,'raw_uploaded_at',r.raw_uploaded_at,
  'conversion_status',r.conversion_status,'drive_status',r.drive_status,'cleanup_status',r.cleanup_status,'expires_at',r.expires_at,'duration_seconds',r.duration_seconds,
  'playback_path',case when r.conversion_status='completed' and r.cleaned_at is null and (r.expires_at is null or clock_timestamp()<r.expires_at) then r.id::text||'/audio.mp3' else null end);
end $$;
create function public.recording_command(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.recording_command(command,payload)$$;

create function account_internal.speaking_check_answer(attempt uuid,question uuid,answer jsonb) returns void
language plpgsql set search_path='' as $$begin
 if jsonb_typeof(answer) is distinct from 'object' or (answer-'recording_id')<>'{}' or not exists(
  select 1 from account_internal.speaking_recordings r where r.id=(answer->>'recording_id')::uuid and r.attempt_id=attempt and r.question_version_id=question
   and r.owner_id=auth.uid() and r.raw_uploaded_at is not null and r.raw_uploaded_at<r.upload_deadline) then raise exception 'INVALID_RECORDING_REFERENCE'; end if;
end $$;

-- Worker-only state machine. The lease token fences every mutation, including retries.
create function account_internal.recording_worker(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r account_internal.speaking_recordings; now_at timestamptz:=clock_timestamp(); cleanup boolean;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'WORKER_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_REQUEST'; end if;
 if command='claim' then
  select * into r from account_internal.speaking_recordings
   where raw_uploaded_at is not null and cleaned_at is null and next_attempt_at<=now_at and (lease_until is null or lease_until<now_at)
   and ((drive_status<>'completed' and account_internal.speaking_enabled()) or (drive_status='completed' and expires_at<=now_at))
   order by expires_at nulls last,next_attempt_at,id for update skip locked limit 1;
  if not found then return null; end if;
  cleanup:=r.drive_status='completed' and r.expires_at<=now_at;
  update account_internal.speaking_recordings set lease_id=gen_random_uuid(),lease_until=now_at+interval '5 minutes',
   cleanup_status=case when cleanup then 'processing' else cleanup_status end where id=r.id returning * into r;
  perform account_internal.speaking_event(r.id,case when cleanup then 'cleanup_claimed' else 'processing_claimed' end);
  return to_jsonb(r)||jsonb_build_object('job',case when cleanup then 'cleanup' else 'process' end,'raw_path',r.id::text||'/raw','mp3_path',r.id::text||'/audio.mp3');
 end if;
 select * into r from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid for update;
 if not found or r.lease_id is distinct from (payload->>'lease_id')::uuid or r.lease_until<=now_at or r.cleaned_at is not null then raise exception 'STALE_RECORDING_LEASE'; end if;
 if command='converted' then
  if r.conversion_status='completed' then
   if r.mp3_sha256 is distinct from payload->>'sha256' then raise exception 'MP3_IDENTITY_CONFLICT'; end if;
  else
   update account_internal.speaking_recordings set conversion_status='completed',mp3_sha256=payload->>'sha256',mp3_size=(payload->>'size')::integer,duration_seconds=(payload->>'duration')::numeric,error_code=null where id=r.id;
   perform account_internal.speaking_event(r.id,'converted');
  end if;
 elsif command='drive_id' then
  if r.drive_file_id is not null and r.drive_file_id is distinct from payload->>'file_id' then raise exception 'DRIVE_IDENTITY_CONFLICT'; end if;
  update account_internal.speaking_recordings set drive_file_id=payload->>'file_id' where id=r.id;
 elsif command='archived' then
  if r.conversion_status<>'completed' or r.drive_file_id is distinct from payload->>'file_id' then raise exception 'ARCHIVE_NOT_VERIFIED'; end if;
  if r.uploaded_at is null then
   update account_internal.speaking_recordings set drive_status='completed',uploaded_at=now_at,expires_at=now_at+interval '7 days',lease_id=null,lease_until=null,error_code=null where id=r.id;
   perform account_internal.speaking_event(r.id,'archived',jsonb_build_object('expires_at',now_at+interval '7 days'));
  end if;
 elsif command='cleanup_check' then
  if r.drive_status<>'completed' or r.expires_at>now_at or r.cleanup_status<>'processing' then raise exception 'CLEANUP_NOT_DUE'; end if;
 elsif command='cleaned' then
  if r.drive_status<>'completed' or r.expires_at>now_at or r.cleanup_status<>'processing' then raise exception 'CLEANUP_NOT_DUE'; end if;
  update account_internal.speaking_recordings set cleanup_status='completed',cleaned_at=now_at,lease_id=null,lease_until=null,error_code=null where id=r.id;
  perform account_internal.speaking_event(r.id,'cleaned');
 elsif command='failed' then
  if coalesce(payload->>'error_code','')!~'^[A-Z_]{1,80}$' then raise exception 'INVALID_ERROR_CODE'; end if;
  update account_internal.speaking_recordings set retry_count=retry_count+1,error_code=payload->>'error_code',next_attempt_at=now_at+make_interval(secs=>least(3600,60*power(2,least(retry_count,6)))::integer),
   conversion_status=case when conversion_status='completed' then conversion_status else 'failed' end,
   drive_status=case when drive_status='completed' then drive_status else 'failed' end,
   cleanup_status=case when cleanup_status='processing' then 'retry' else cleanup_status end,lease_id=null,lease_until=null where id=r.id;
  perform account_internal.speaking_event(r.id,'retry_scheduled',jsonb_build_object('error_code',payload->>'error_code'));
 else raise exception 'INVALID_COMMAND'; end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.recording_worker(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.recording_worker(command,payload)$$;
revoke all on function account_internal.speaking_immutable(),account_internal.speaking_event(uuid,text,jsonb),account_internal.speaking_enabled(),
 account_internal.speaking_object_allowed(text,boolean),account_internal.recording_command(text,jsonb),public.recording_command(text,jsonb),
 account_internal.speaking_check_answer(uuid,uuid,jsonb),account_internal.recording_worker(text,jsonb),public.recording_worker(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.speaking_object_allowed(text,boolean),account_internal.recording_command(text,jsonb),public.recording_command(text,jsonb) to authenticated;
grant usage on schema account_internal to service_role;
grant execute on function account_internal.recording_worker(text,jsonb),public.recording_worker(text,jsonb) to service_role;

-- Preserve CP1 commands; narrowly replace the approved Speaking gates.
create or replace function account_internal.assignment_command(command text, payload jsonb) returns jsonb
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
  if exists(select 1 from public.assignment_version_questions aq join public.assignment_question_versions q on q.id=aq.question_version_id where aq.assignment_version_id=v.id and q.kind='speaking') and not account_internal.speaking_enabled() then raise exception 'RECORDING_NOT_READY'; end if;
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
    if q.kind='speaking' and item<>'null'::jsonb then perform account_internal.speaking_check_answer(attempt,q.id,item); end if;
    if q.kind in ('writing','translation','text_fill','mcq') and jsonb_typeof(item) not in ('string','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind in ('multi_fill','reorder') and jsonb_typeof(item) not in ('array','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind='true_false' and jsonb_typeof(item) not in ('boolean','null') then raise exception 'INVALID_ANSWER'; end if;
    if q.kind='matching' and jsonb_typeof(item) not in ('object','null') then raise exception 'INVALID_ANSWER'; end if;
    update public.submission_answers set answer=item where attempt_id=attempt and question_version_id=q.id;
   end loop;
   update public.submission_details set revision=revision+1 where attempt_id=attempt;
  else
   if exists(select 1 from public.submission_answers sa join public.assignment_question_versions q on q.id=sa.question_version_id
    where sa.attempt_id=attempt and q.kind='speaking' and (sa.answer is null or sa.answer='null'::jsonb)) then raise exception 'RECORDING_REQUIRED'; end if;
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
   where aq.assignment_version_id=v.id and q.kind='speaking') and not account_internal.speaking_enabled() then raise exception 'RECORDING_NOT_READY'; end if;
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
   join public.assignment_question_versions q on q.id=aq.question_version_id where la.lesson_id=lesson and q.kind='speaking') and not account_internal.speaking_enabled() then raise exception 'RECORDING_NOT_READY'; end if;
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
    if exists(select 1 from public.submission_answers sa join public.assignment_question_versions sq on sq.id=sa.question_version_id where sa.attempt_id=attempt and sa.question_version_id=(payload->>'question_version_id')::uuid and sq.kind='speaking') then raise exception 'SPEAKING_VERSION_PINNED'; end if;
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
   if q.kind='speaking' and exists(select 1 from public.submission_answers sa left join account_internal.speaking_recordings sr on sr.id=(sa.answer->>'recording_id')::uuid where sa.attempt_id=attempt and sa.question_version_id=selected and sa.answer<>'null'::jsonb and sr.conversion_status is distinct from 'completed') then raise exception 'AUDIO_PROCESSING'; end if;
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


notify pgrst,'reload schema';
