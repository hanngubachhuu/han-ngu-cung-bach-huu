-- Existing callers keep their old contract, but can never write official results.
alter policy attempts_insert on public.learning_attempts with check(
 source='self_reported' and client_attempt_id not like 'official:%'
 and user_id=(select auth.uid()) and account_internal.can_access_lesson(lesson_id)
);
create or replace function account_internal.save_attempt(lesson text,attempt text,points numeric,maximum numeric,expected_version integer,owner_id uuid)
returns public.learning_attempts language plpgsql security definer set search_path='' as $$
declare result public.learning_attempts;
begin
 if auth.uid() is null or auth.uid() is distinct from owner_id then raise exception 'ACCOUNT_CHANGED' using errcode='42501'; end if;
 if attempt like 'official:%' then raise exception 'OFFICIAL_ATTEMPT_PROTECTED' using errcode='42501'; end if;
 if not account_internal.can_access_lesson(lesson) then raise exception 'LESSON_ACCESS_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||lesson||':'||attempt,0));
 select * into result from public.learning_attempts where user_id=auth.uid() and lesson_id=lesson and client_attempt_id=attempt for update;
 if found then
  if result.source<>'self_reported' then raise exception 'OFFICIAL_ATTEMPT_PROTECTED' using errcode='42501'; end if;
  if result.score=points and result.max_score=maximum then return result; end if;
  if result.version is distinct from expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  update public.learning_attempts set score=points,max_score=maximum,version=version+1 where id=result.id returning * into result;
 else
  if expected_version is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  insert into public.learning_attempts(user_id,lesson_id,client_attempt_id,score,max_score) values(auth.uid(),lesson,attempt,points,maximum) returning * into result;
 end if;
 return result;
end $$;

create function account_internal.assignment_has_published(attempt uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.learning_attempts a join public.submission_results r on r.attempt_id=a.id
 where a.id=attempt and a.source='official' and a.user_id=auth.uid() and r.state='published');
$$;
revoke all on function account_internal.assignment_has_published(uuid) from public,anon;
grant execute on function account_internal.assignment_has_published(uuid) to authenticated;
alter policy attempts_read on public.learning_attempts using(
 (select account_internal.is_admin()) or (user_id=(select auth.uid())
  and (source='self_reported' or account_internal.assignment_has_published(id)))
);

-- Preserve metadata queries used by course/enrollment/account UI. Raw content includes
-- keys, so both direct REST and the legacy RPC must use the same projection boundary.
revoke select on public.lesson_content from public,anon,authenticated;
revoke select(content) on public.lesson_content from public,anon,authenticated;
grant select(id,level,lesson_no,title_zh,title_vi,visibility,created_at,updated_at,course_id)
 on public.lesson_content to anon,authenticated;
create function account_internal.assignment_lesson_content(lesson text) returns table(id text,content jsonb)
language sql stable security definer set search_path='' as $$
 select l.id,case when s.protected_at is not null then jsonb_build_object('officialAssignment',true,'lessonId',l.id)
  else l.content end
 from public.lesson_content l left join public.lesson_assignments s on s.lesson_id=l.id
 where l.id=lesson and l.visibility='student' and account_internal.can_access_lesson(l.id);
$$;
revoke all on function account_internal.assignment_lesson_content(text) from public,anon;
grant execute on function account_internal.assignment_lesson_content(text) to authenticated;
create or replace function public.get_private_lesson_content(p_lesson_id text) returns table(id text,content jsonb)
language sql stable security invoker set search_path='' as $$
 select * from account_internal.assignment_lesson_content(p_lesson_id);
$$;
revoke all on function public.get_private_lesson_content(text) from public,anon;
grant execute on function public.get_private_lesson_content(text) to authenticated;
notify pgrst, 'reload schema';
