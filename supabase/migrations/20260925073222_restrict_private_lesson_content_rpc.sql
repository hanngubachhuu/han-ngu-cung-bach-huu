revoke execute on function public.get_private_lesson_content(text) from anon;
revoke execute on function public.get_private_lesson_content(text) from public;
grant execute on function public.get_private_lesson_content(text) to authenticated;

notify pgrst, 'reload schema';
