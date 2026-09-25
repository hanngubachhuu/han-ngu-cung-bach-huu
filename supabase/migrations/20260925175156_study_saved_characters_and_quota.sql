create table public.study_saved_characters (
  user_id uuid not null references auth.users(id) on delete cascade,
  character text not null check (char_length(character)=1),
  created_at timestamptz not null default now(),
  primary key (user_id, character)
);
alter table public.study_saved_characters enable row level security;
revoke all on public.study_saved_characters from public, anon, authenticated;
grant select, insert, update, delete on public.study_saved_characters to authenticated;
create policy own_characters on public.study_saved_characters for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Keep the same access boundary, with one SELECT policy per role.
alter policy dictionary_public on public.study_dictionary to anon;
alter policy dictionary_student on public.study_dictionary using (
  visibility='public' or exists(select 1 from public.student_lesson_access a
  where a.user_id=(select auth.uid()) and a.lesson_id=study_dictionary.lesson_id and a.active));
alter policy characters_public on public.study_characters to anon;
alter policy characters_student on public.study_characters using (
  visibility='public' or exists(select 1 from public.student_lesson_access a
  where a.user_id=(select auth.uid()) and a.lesson_id=study_characters.lesson_id and a.active));
alter policy library_public on public.study_library to anon;
alter policy library_student on public.study_library using (
  visibility='public' or exists(select 1 from public.student_lesson_access a
  where a.user_id=(select auth.uid()) and a.lesson_id=study_library.lesson_id and a.active));

-- Quota rows are deliberately accessible only through the internal function.
create policy quota_client_denied on study_internal.usage_daily
  for all to anon, authenticated using (false) with check (false);
create or replace function study_internal.consume_quota(request_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); cap integer; used_count integer;
begin
  if who is null or not exists(select 1 from auth.users
      where id=who and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return false; end if;
  cap:=case request_action when 'analyze' then 8 when 'recognize' then 60 when 'dictionary' then 30 when 'speech' then 30 else 0 end;
  if cap=0 then return false; end if;
  -- Exhausted accounts must not spend other users' shared daily allowance.
  insert into study_internal.usage_daily values(who,request_action,current_date,1)
  on conflict(owner_id,action,day) do update set used=study_internal.usage_daily.used+1
    where study_internal.usage_daily.used<cap returning used into used_count;
  if used_count is null then return false; end if;
  used_count:=null;
  insert into study_internal.usage_daily values('00000000-0000-0000-0000-000000000000','all',current_date,1)
  on conflict(owner_id,action,day) do update set used=study_internal.usage_daily.used+1
    where study_internal.usage_daily.used<200 returning used into used_count;
  -- The exception subtransaction rolls back the personal increment as well.
  if used_count is null then raise exception using errcode='P4290',message='Shared quota exhausted'; end if;
  return true;
exception when sqlstate 'P4290' then return false;
end; $$;
revoke all on function study_internal.consume_quota(text) from public, anon;
grant execute on function study_internal.consume_quota(text) to authenticated;
