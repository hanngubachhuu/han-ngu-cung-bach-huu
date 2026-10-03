-- Forward correction: keep original deadline and accepted history immutable.
create or replace function account_internal.assignment_history_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_OP='INSERT' then
  if TG_TABLE_NAME='assignment_version_questions' then
   if exists(
    select 1 from public.assignment_versions v where v.id=new.assignment_version_id and v.status='published')
    then raise exception 'VERSION_IMMUTABLE'; end if;
  elsif TG_TABLE_NAME='submission_answers' then
   if exists(
    select 1 from public.submission_details d where d.attempt_id=new.attempt_id
      and (d.state<>'draft' or d.deadline_at<=clock_timestamp())) then raise exception 'SUBMISSION_LOCKED'; end if;
  elsif TG_TABLE_NAME='submission_grades' then
   if exists(
    select 1 from public.submission_results r where r.attempt_id=new.attempt_id and r.revision=new.revision and r.state='published')
    then raise exception 'PUBLICATION_IMMUTABLE'; end if;
  end if;
  return new;
 end if;
 if TG_TABLE_NAME='assignment_rubric_versions' then raise exception 'VERSION_IMMUTABLE'; end if;
 if TG_TABLE_NAME='assignment_question_versions' then
  if (to_jsonb(new)-'published_at'-'published_by') is distinct from (to_jsonb(old)-'published_at'-'published_by')
    or old.published_at is not null then raise exception 'VERSION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='assignment_versions' then
  if old.status='published' or (to_jsonb(new)-'previewed_at'-'published_at'-'published_by'-'status')
    is distinct from (to_jsonb(old)-'previewed_at'-'published_at'-'published_by'-'status') then raise exception 'VERSION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='assignment_version_questions' then raise exception 'VERSION_IMMUTABLE';
 elsif TG_TABLE_NAME='submission_answers' then
  -- Only a verified missing-answer binding in an immutable Admin-opened window
  -- may cross the original deadline. Every other history guard is unchanged.
  if old.answer='null'::jsonb and jsonb_typeof(new.answer)='object'
   and (new.answer-'recording_id')='{}'::jsonb
   and (to_jsonb(new)-'answer')=(to_jsonb(old)-'answer')
   and exists(
    select 1 from account_internal.hskk_makeup_windows w
    join account_internal.hskk_makeup_records m on m.window_id=w.id and m.question_version_id=old.question_version_id
    join account_internal.speaking_recordings r on r.id=m.recording_id and r.id=(new.answer->>'recording_id')::uuid
    join public.submission_details d on d.attempt_id=w.attempt_id and d.assignment_version_id=w.assignment_version_id and d.state='draft'
    join public.learning_attempts a on a.id=d.attempt_id and a.user_id=w.owner_id
    join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
    where w.attempt_id=old.attempt_id and w.owner_id=auth.uid() and old.question_version_id=any(w.missing)
     and w.expires_at>clock_timestamp() and r.attempt_id=w.attempt_id and r.owner_id=w.owner_id and r.question_version_id=old.question_version_id
     and r.raw_uploaded_at is not null and r.raw_uploaded_at<r.upload_deadline and r.cleaned_at is null
     and (r.expires_at is null or r.expires_at>clock_timestamp()) and account_internal.can_access_lesson(a.lesson_id)
     and exists(select 1 from account_internal.hskk_controlled_access ca where ca.exam_id='H71002' and ca.owner_id=w.owner_id)
   ) then return new;end if;
  if (to_jsonb(new)-'answer') is distinct from (to_jsonb(old)-'answer') or exists(
   select 1 from public.submission_details d where d.attempt_id=old.attempt_id
     and (d.state<>'draft' or d.deadline_at<=clock_timestamp())) then raise exception 'SUBMISSION_LOCKED'; end if;
 elsif TG_TABLE_NAME='submission_details' then
  if old.state='submitted' or new.attempt_id<>old.attempt_id or new.assignment_version_id<>old.assignment_version_id
    or new.started_at<>old.started_at or new.deadline_at is distinct from old.deadline_at then raise exception 'SUBMISSION_LOCKED'; end if;
 elsif TG_TABLE_NAME='submission_results' then
  if old.state='published' then raise exception 'PUBLICATION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='submission_grades' then
  if exists(select 1 from public.submission_results r where r.attempt_id=old.attempt_id and r.revision=old.revision and r.state='published')
    then raise exception 'PUBLICATION_IMMUTABLE'; end if;
 end if;
 return new;
end $$;
revoke all on function account_internal.assignment_history_guard() from public,anon,authenticated;

notify pgrst,'reload schema';
