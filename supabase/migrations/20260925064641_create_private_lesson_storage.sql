insert into storage.buckets (id, name, public)
values ('lesson-private', 'lesson-private', false)
on conflict (id) do update
set public = false;

create policy lesson_private_read_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-private'
  and exists (
    select 1
    from public.lesson_assets la
    join public.student_lesson_access a
      on a.lesson_id = la.lesson_id
    where la.bucket_id = storage.objects.bucket_id
      and la.object_path = storage.objects.name
      and a.user_id = (select auth.uid())
      and a.active = true
  )
);

revoke all on storage.objects from anon, authenticated;
grant select on storage.objects to authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
