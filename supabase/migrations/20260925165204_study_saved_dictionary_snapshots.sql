alter table public.study_saved_words add column entry jsonb check(entry is null or (jsonb_typeof(entry)='object' and pg_column_size(entry)<80000));
