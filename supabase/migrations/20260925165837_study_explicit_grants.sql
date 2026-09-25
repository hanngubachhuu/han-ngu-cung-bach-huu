revoke all on public.study_dictionary,public.study_characters,public.study_library from anon,authenticated;
grant select on public.study_dictionary,public.study_characters,public.study_library to anon,authenticated;
revoke all on public.study_saved_words,public.study_readings,public.study_analysis_cache from anon,authenticated;
grant select,insert,update,delete on public.study_saved_words,public.study_readings,public.study_analysis_cache to authenticated;
