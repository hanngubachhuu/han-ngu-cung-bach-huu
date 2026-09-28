-- Restrict the maintenance importer; this migration does not execute it or modify corpus rows.
revoke all on function public.import_study_lexicon_words() from public, anon, authenticated;
notify pgrst, 'reload schema';
