-- Additive account lifecycle. Preserve existing lesson grants; never infer ADMIN from email.
create schema if not exists account_internal;
revoke all on schema account_internal from public, anon;
grant usage on schema account_internal to authenticated;

create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '', full_name text not null default '' check(length(full_name)<=120),
 phone text not null default '' check(length(phone)<=30),
 learning_goal text not null default '' check(length(learning_goal)<=1000),
 role text not null default 'STUDENT' check(role in ('ADMIN','STUDENT')),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','SUSPENDED','REJECTED')),
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_administrator on public.profiles(role) where role='ADMIN';
create index profiles_status_idx on public.profiles(status,created_at desc);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;

create function account_internal.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN' and status='APPROVED');
$$;
revoke all on function account_internal.is_admin() from public,anon;
grant execute on function account_internal.is_admin() to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(user_id=(select auth.uid()) or (select account_internal.is_admin()));

create function account_internal.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id,email,full_name) values(new.id,coalesce(new.email,''),left(trim(coalesce(new.raw_user_meta_data->>'full_name','')),120));
 return new;
end; $$;
revoke all on function account_internal.create_profile() from public,anon,authenticated;
create trigger account_profile_created after insert on auth.users for each row execute function account_internal.create_profile();
insert into public.profiles(user_id,email,full_name,status)
select u.id,coalesce(u.email,''),left(trim(coalesce(u.raw_user_meta_data->>'full_name','')),120),
 case when exists(select 1 from public.student_lesson_access a where a.user_id=u.id and a.active) then 'APPROVED' else 'PENDING' end
from auth.users u;

create table public.courses(id text primary key, title text not null, level smallint unique not null);
insert into public.courses select 'hsk'||level,'HSK '||level,level from public.lesson_content group by level;
alter table public.lesson_content add column course_id text references public.courses(id);
update public.lesson_content set course_id='hsk'||level;
alter table public.lesson_content alter column course_id set not null;
create index lesson_content_course_idx on public.lesson_content(course_id);
create table public.enrollments (
 user_id uuid references public.profiles(user_id) on delete cascade,
 course_id text references public.courses(id), active boolean not null default true,
 access_mode text not null default 'SELECTED' check(access_mode in ('SELECTED','ALL')),
 updated_at timestamptz not null default now(), primary key(user_id,course_id)
);
insert into public.enrollments(user_id,course_id)
select distinct a.user_id,l.course_id from public.student_lesson_access a join public.lesson_content l on l.id=a.lesson_id where a.active;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
revoke all on public.courses,public.enrollments from public,anon,authenticated;
grant select on public.courses,public.enrollments to authenticated;
create policy courses_read on public.courses for select to authenticated using(true);
create policy enrollments_read on public.enrollments for select to authenticated using(user_id=(select auth.uid()) or (select account_internal.is_admin()));

create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor uuid, target_id uuid,
 action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_logs_date_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_admin_read on public.audit_logs for select to authenticated using((select account_internal.is_admin()));

create function account_internal.can_access_lesson(lesson text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (account_internal.is_admin() or exists(
 select 1 from public.profiles p join public.enrollments e on e.user_id=p.user_id
 join public.lesson_content l on l.course_id=e.course_id
 where p.user_id=auth.uid() and p.status='APPROVED' and e.active and l.id=lesson
 and (e.access_mode='ALL' or exists(select 1 from public.student_lesson_access a where a.user_id=p.user_id and a.lesson_id=l.id and a.active))));
$$;
revoke all on function account_internal.can_access_lesson(text) from public,anon;
grant execute on function account_internal.can_access_lesson(text) to authenticated;
alter policy lesson_content_student_read on public.lesson_content using(visibility='student' and account_internal.can_access_lesson(id));
alter policy lesson_assets_authorized_read on public.lesson_assets using(account_internal.can_access_lesson(lesson_id));
alter policy student_lesson_access_self_read on public.student_lesson_access using(user_id=(select auth.uid()) or (select account_internal.is_admin()));
alter policy lesson_private_read_authorized on storage.objects using(bucket_id='lesson-private' and exists(
 select 1 from public.lesson_assets a where a.bucket_id=objects.bucket_id and a.object_path=objects.name and account_internal.can_access_lesson(a.lesson_id)));
alter policy dictionary_student on public.study_dictionary using(visibility='public' or account_internal.can_access_lesson(lesson_id));
alter policy characters_student on public.study_characters using(visibility='public' or account_internal.can_access_lesson(lesson_id));
alter policy library_student on public.study_library using(visibility='public' or account_internal.can_access_lesson(lesson_id));

create function account_internal.save_profile(expected_version integer, display_name text, contact_phone text, goal text, owner_id uuid)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare result public.profiles;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if auth.uid() is distinct from owner_id then raise exception 'ACCOUNT_CHANGED' using errcode='42501'; end if;
 update public.profiles set full_name=trim(display_name),phone=trim(contact_phone),learning_goal=trim(goal),version=version+1,updated_at=now()
 where user_id=auth.uid() and version=expected_version returning * into result;
 if not found then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 insert into public.audit_logs(actor,target_id,action,details) values(auth.uid(),auth.uid(),'profile.update',jsonb_build_object('version',result.version,'fields',array['full_name','phone','learning_goal']));
 return result;
end; $$;
create function public.account_save_profile(expected_version integer,display_name text,contact_phone text,goal text,owner_id uuid)
returns public.profiles language sql security invoker set search_path='' as $$select account_internal.save_profile(expected_version,display_name,contact_phone,goal,owner_id);$$;

create function account_internal.admin_action(target uuid, action text, resource text default null, enabled boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare target_role text;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select role into target_role from public.profiles where user_id=target for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if target_role='ADMIN' then raise exception 'ADMIN_ACCOUNT_PROTECTED' using errcode='42501'; end if;
 if action in ('APPROVED','REJECTED','SUSPENDED','PENDING') then
  update public.profiles set status=action,version=version+1,updated_at=now() where user_id=target;
 elsif action='course' then
  insert into public.enrollments(user_id,course_id,active) values(target,resource,enabled)
  on conflict(user_id,course_id) do update set active=enabled,updated_at=now();
 elsif action='course_mode' then
  update public.enrollments set access_mode=case when enabled then 'ALL' else 'SELECTED' end,updated_at=now() where user_id=target and course_id=resource;
  if not found then raise exception 'ENROLLMENT_REQUIRED'; end if;
 elsif action='lesson' then
  if not exists(select 1 from public.enrollments e join public.lesson_content l on l.course_id=e.course_id where e.user_id=target and e.active and l.id=resource) then raise exception 'ENROLLMENT_REQUIRED'; end if;
  insert into public.student_lesson_access(user_id,lesson_id,active) values(target,resource,enabled)
  on conflict(user_id,lesson_id) do update set active=enabled,updated_at=now();
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.audit_logs(actor,target_id,action,details) values(auth.uid(),target,'admin.'||action,jsonb_build_object('resource',resource,'enabled',enabled));
end; $$;
create function public.account_admin_action(target uuid,action text,resource text default null,enabled boolean default true)
returns void language sql security invoker set search_path='' as $$select account_internal.admin_action(target,action,resource,enabled);$$;

-- Versioned updates prevent silent reading overwrites across devices.
alter table public.study_readings add column version integer not null default 1;
create function account_internal.reading_version() returns trigger language plpgsql set search_path='' as $$
begin new.version=old.version+1; new.updated_at=now(); return new; end; $$;
revoke all on function account_internal.reading_version() from public,anon,authenticated;
create trigger study_reading_version before update on public.study_readings for each row execute function account_internal.reading_version();

create table public.learning_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 lesson_id text not null references public.lesson_content(id), client_attempt_id text not null check(length(client_attempt_id)<=120),
 score numeric not null check(score>=0), max_score numeric not null check(max_score>0 and score<=max_score),
 source text not null default 'self_reported' check(source='self_reported'),
 version integer not null default 1,
 submitted_at timestamptz not null default now(), unique(user_id,lesson_id,client_attempt_id)
);
create index learning_attempts_owner_idx on public.learning_attempts(user_id,submitted_at desc);
alter table public.learning_attempts enable row level security;
revoke all on public.learning_attempts from public,anon,authenticated;
grant select,insert on public.learning_attempts to authenticated;
create policy attempts_read on public.learning_attempts for select to authenticated using(user_id=(select auth.uid()) or (select account_internal.is_admin()));
create policy attempts_insert on public.learning_attempts for insert to authenticated with check(user_id=(select auth.uid()) and account_internal.can_access_lesson(lesson_id));

create function account_internal.save_attempt(lesson text,attempt text,points numeric,maximum numeric,expected_version integer,owner_id uuid)
returns public.learning_attempts language plpgsql security definer set search_path='' as $$
declare result public.learning_attempts;
begin
 if auth.uid() is distinct from owner_id then raise exception 'ACCOUNT_CHANGED' using errcode='42501'; end if;
 if not account_internal.can_access_lesson(lesson) then raise exception 'LESSON_ACCESS_REQUIRED' using errcode='42501'; end if;
 -- Serialize concurrent submissions of the same attempt, including first inserts.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||lesson||':'||attempt,0));
 select * into result from public.learning_attempts where user_id=auth.uid() and lesson_id=lesson and client_attempt_id=attempt for update;
 if found then
  if result.score=points and result.max_score=maximum then return result; end if;
  if result.version is distinct from expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  update public.learning_attempts set score=points,max_score=maximum,version=version+1 where id=result.id returning * into result;
 else
  if expected_version is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  insert into public.learning_attempts(user_id,lesson_id,client_attempt_id,score,max_score) values(auth.uid(),lesson,attempt,points,maximum) returning * into result;
 end if;
 return result;
end; $$;
create function public.account_save_attempt(lesson text,attempt text,points numeric,maximum numeric,expected_version integer,owner_id uuid)
returns public.learning_attempts language sql security invoker set search_path='' as $$select account_internal.save_attempt(lesson,attempt,points,maximum,expected_version,owner_id);$$;
revoke all on function account_internal.save_attempt(text,text,numeric,numeric,integer,uuid),public.account_save_attempt(text,text,numeric,numeric,integer,uuid) from public,anon;
grant execute on function account_internal.save_attempt(text,text,numeric,numeric,integer,uuid),public.account_save_attempt(text,text,numeric,numeric,integer,uuid) to authenticated;

revoke all on function account_internal.save_profile(integer,text,text,text,uuid),account_internal.admin_action(uuid,text,text,boolean),public.account_save_profile(integer,text,text,text,uuid),public.account_admin_action(uuid,text,text,boolean) from public,anon;
grant execute on function account_internal.save_profile(integer,text,text,text,uuid),account_internal.admin_action(uuid,text,text,boolean),public.account_save_profile(integer,text,text,text,uuid),public.account_admin_action(uuid,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
