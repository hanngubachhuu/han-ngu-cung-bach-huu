-- Forward fix: archive only the immutable submitted reference; reject unavailable audio at save/submit.
-- No table/policy/Auth/data changes. Existing recording/submission history is preserved.
create or replace function account_internal.speaking_check_answer(attempt uuid,question uuid,answer jsonb) returns void
language plpgsql set search_path='' as $$
declare r account_internal.speaking_recordings;
begin
 if jsonb_typeof(answer) is distinct from 'object' or (answer-'recording_id')<>'{}' then raise exception 'INVALID_RECORDING_REFERENCE'; end if;
 select * into r from account_internal.speaking_recordings where id=(answer->>'recording_id')::uuid and attempt_id=attempt and question_version_id=question and owner_id=auth.uid();
 if not found or r.raw_uploaded_at is null or r.raw_uploaded_at>=r.upload_deadline then raise exception 'INVALID_RECORDING_REFERENCE'; end if;
 if r.cleaned_at is not null or (r.expires_at is not null and r.expires_at<=clock_timestamp()) then raise exception 'RECORDING_EXPIRED'; end if;
end $$;
revoke all on function account_internal.speaking_check_answer(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Revalidate persisted answers at finalization; a save check alone does not cover later cleanup.
-- Deadline finalization retains unanswered/timed-out history under the existing business rule.
create function account_internal.speaking_submission_ready() returns trigger
language plpgsql set search_path='' as $$
declare s record;
begin
 if old.state='draft' and new.state='submitted' and not new.timed_out then
  for s in select a.question_version_id,a.answer from public.submission_answers a join public.assignment_question_versions q on q.id=a.question_version_id
   where a.attempt_id=new.attempt_id and q.kind='speaking' loop
   if s.answer is null or s.answer='null'::jsonb then raise exception 'RECORDING_REQUIRED'; end if;
   perform account_internal.speaking_check_answer(new.attempt_id,s.question_version_id,s.answer);
  end loop;
 end if;
 return new;
end $$;
revoke all on function account_internal.speaking_submission_ready() from public,anon,authenticated,service_role;
create trigger speaking_submission_ready before update on public.submission_details for each row execute function account_internal.speaking_submission_ready();

create or replace function account_internal.recording_worker(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r account_internal.speaking_recordings; now_at timestamptz:=clock_timestamp(); cleanup boolean;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'WORKER_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_REQUEST'; end if;
 if command='claim' then
  select * into r from account_internal.speaking_recordings
   where raw_uploaded_at is not null and cleaned_at is null and next_attempt_at<=now_at and (lease_until is null or lease_until<now_at)
   and ((drive_status<>'completed' and account_internal.speaking_enabled() and exists(
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
end $$;
revoke all on function account_internal.recording_worker(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.recording_worker(text,jsonb) to service_role;
