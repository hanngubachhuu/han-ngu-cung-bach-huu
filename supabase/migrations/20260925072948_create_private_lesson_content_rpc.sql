create or replace function public.get_private_lesson_content(p_lesson_id text)
returns table(id text, content jsonb)
language sql
stable
set search_path = public, pg_temp
as $$
  select lc.id, lc.content
  from public.lesson_content as lc
  where lc.id = p_lesson_id
    and lc.visibility = 'student';
$$;

revoke all on function public.get_private_lesson_content(text) from public;
grant execute on function public.get_private_lesson_content(text) to authenticated;

notify pgrst, 'reload schema';
