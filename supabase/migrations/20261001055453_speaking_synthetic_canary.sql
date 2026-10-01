-- Additive, empty-by-default synthetic exception. No old row/backfill/Auth/settings change.
create table account_internal.speaking_test_gate (
 owner_id uuid not null references public.profiles(user_id),
 attempt_id uuid not null,
 question_version_id uuid not null,
 run_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 primary key(owner_id,attempt_id,question_version_id),
 foreign key(attempt_id,question_version_id) references public.submission_answers(attempt_id,question_version_id),
 check(expires_at>created_at and expires_at<=created_at+interval '4 hours')
);
alter table account_internal.speaking_test_gate enable row level security;
revoke all on account_internal.speaking_test_gate from public,anon,authenticated,service_role;

-- Internal predicate, not an authorization RPC. Existing owner/access/immutable checks remain mandatory.
-- Auth marker is server-controlled app metadata, never user_metadata or frontend state.
create function account_internal.speaking_canary_allowed(owner uuid,attempt uuid,question uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(
  select 1 from account_internal.speaking_test_gate g
  join public.learning_attempts a on a.id=g.attempt_id and a.user_id=g.owner_id and a.source='official'
  join public.submission_details d on d.attempt_id=a.id
  join public.assignment_version_questions vq on vq.assignment_version_id=d.assignment_version_id and vq.question_version_id=g.question_version_id
  join public.assignment_question_versions q on q.id=g.question_version_id and q.lesson_id=a.lesson_id and q.kind='speaking'
  join public.lesson_content l on l.id=a.lesson_id
  join public.courses c on c.id=l.course_id and c.program='HSKK'
  join public.profiles p on p.user_id=g.owner_id and p.role='STUDENT' and p.status='APPROVED'
  join auth.users u on u.id=g.owner_id
  where g.owner_id=owner and g.attempt_id=attempt and g.question_version_id=question
   and g.created_at<=clock_timestamp() and clock_timestamp()<g.expires_at
   and c.id='cp2-browser-'||g.run_id::text and l.id=c.id
   and c.title='Synthetic browser Speaking '||g.run_id::text
   and u.raw_app_meta_data->>'speaking_browser_run'=g.run_id::text
   and u.email in ('speaking-browser-a-'||g.run_id::text||'@example.invalid','speaking-browser-b-'||g.run_id::text||'@example.invalid')
 );
$$;
revoke all on function account_internal.speaking_canary_allowed(uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION account_internal.recording_command(command text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare actor uuid:=auth.uid(); r account_internal.speaking_recordings; a public.learning_attempts; d public.submission_details;
 object_row storage.objects; attempt uuid; qid uuid; request uuid;
begin
 if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_REQUEST'; end if;
 if command='reserve' then
  attempt:=(payload->>'attempt_id')::uuid; qid:=(payload->>'question_version_id')::uuid; request:=(payload->>'request_id')::uuid;
  if not (account_internal.speaking_enabled() or account_internal.speaking_canary_allowed(actor,attempt,qid)) then raise exception 'RECORDING_NOT_READY'; end if;
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
    values(attempt,qid,actor,request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime',least(clock_timestamp()+interval '10 minutes',coalesce(d.deadline_at,'infinity'),coalesce((select g.expires_at from account_internal.speaking_test_gate g where g.owner_id=actor and g.attempt_id=attempt and g.question_version_id=qid),'infinity'))) returning * into r;
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
end $function$;

CREATE OR REPLACE FUNCTION account_internal.speaking_object_allowed(object_name text, write_object boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r account_internal.speaking_recordings; a public.learning_attempts; d public.submission_details;
begin
 if auth.uid() is null or object_name !~ '^[0-9a-f-]{36}/(raw|audio.mp3)$' then return false; end if;
 select * into r from account_internal.speaking_recordings where id=split_part(object_name,'/',1)::uuid;
 if not found then return false; end if;
 select * into a from public.learning_attempts where id=r.attempt_id;
 select * into d from public.submission_details where attempt_id=r.attempt_id;
 if write_object then
  return (account_internal.speaking_enabled() or account_internal.speaking_canary_allowed(r.owner_id,r.attempt_id,r.question_version_id)) and r.owner_id=auth.uid() and account_internal.can_access_lesson(a.lesson_id)
   and d.state='draft' and clock_timestamp()<r.upload_deadline and (d.deadline_at is null or clock_timestamp()<d.deadline_at)
   and r.raw_uploaded_at is null and object_name=r.id::text||'/raw';
 end if;
 if r.cleaned_at is not null or (r.expires_at is not null and clock_timestamp()>=r.expires_at) then return false; end if;
 if not ((r.owner_id=auth.uid() and account_internal.can_access_lesson(a.lesson_id)) or (account_internal.is_admin() and d.state='submitted')) then return false; end if;
 if object_name=r.id::text||'/raw' then return r.owner_id=auth.uid(); end if;
 return object_name=r.id::text||'/audio.mp3' and r.conversion_status='completed' and exists(select 1 from public.submission_answers s where s.attempt_id=r.attempt_id and s.question_version_id=r.question_version_id and s.answer=jsonb_build_object('recording_id',r.id));
end $function$;

CREATE OR REPLACE FUNCTION account_internal.recording_worker(command text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare r account_internal.speaking_recordings; now_at timestamptz:=clock_timestamp(); cleanup boolean;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'WORKER_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_REQUEST'; end if;
 if command='claim' then
  select * into r from account_internal.speaking_recordings
   where (payload->>'recording_id' is null or id=(payload->>'recording_id')::uuid) and raw_uploaded_at is not null and cleaned_at is null and next_attempt_at<=now_at and (lease_until is null or lease_until<now_at)
   and ((drive_status<>'completed' and (account_internal.speaking_enabled() or account_internal.speaking_canary_allowed(owner_id,attempt_id,question_version_id)) and exists(
    select 1 from public.submission_details d join public.submission_answers s on s.attempt_id=d.attempt_id
    where d.attempt_id=speaking_recordings.attempt_id and d.state='submitted' and s.question_version_id=speaking_recordings.question_version_id
     and s.answer=jsonb_build_object('recording_id',speaking_recordings.id)))
    or (drive_status='completed' and expires_at<=now_at))
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
end $function$;
