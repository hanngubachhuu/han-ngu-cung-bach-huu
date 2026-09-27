create table public.lesson_content (
  id text primary key,
  level smallint not null check (level >= 1),
  lesson_no smallint not null check (lesson_no >= 1),
  title_zh text not null,
  title_vi text not null,
  visibility text not null default 'student'
    check (visibility in ('public','student')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, lesson_no)
);

create table public.student_lesson_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lesson_content(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.lesson_assets (
  lesson_id text not null references public.lesson_content(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  created_at timestamptz not null default now(),
  primary key (bucket_id, object_path)
);

create index student_lesson_access_lesson_id_idx
  on public.student_lesson_access (lesson_id);

create index lesson_assets_lesson_id_idx
  on public.lesson_assets (lesson_id);

alter table public.lesson_content enable row level security;
alter table public.student_lesson_access enable row level security;
alter table public.lesson_assets enable row level security;

create policy lesson_content_public_read
  on public.lesson_content
  for select
  to anon, authenticated
  using (visibility = 'public');

create policy lesson_content_student_read
  on public.lesson_content
  for select
  to authenticated
  using (
    visibility = 'student'
    and exists (
      select 1
      from public.student_lesson_access a
      where a.lesson_id = lesson_content.id
        and a.user_id = (select auth.uid())
        and a.active = true
    )
  );

create policy student_lesson_access_self_read
  on public.student_lesson_access
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy lesson_assets_authorized_read
  on public.lesson_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_lesson_access a
      where a.lesson_id = lesson_assets.lesson_id
        and a.user_id = (select auth.uid())
        and a.active = true
    )
  );

revoke all on public.lesson_content from anon, authenticated;
grant select on public.lesson_content to anon, authenticated;

revoke all on public.student_lesson_access from anon, authenticated;
grant select on public.student_lesson_access to authenticated;

revoke all on public.lesson_assets from anon, authenticated;
grant select on public.lesson_assets to authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
