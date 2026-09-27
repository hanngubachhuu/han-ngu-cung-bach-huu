revoke execute on function public.get_private_lesson_content(text) from public;
revoke execute on function public.get_private_lesson_content(text) from anon;
grant execute on function public.get_private_lesson_content(text) to authenticated;
