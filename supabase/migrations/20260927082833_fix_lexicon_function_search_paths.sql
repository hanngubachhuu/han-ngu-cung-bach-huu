-- Every relation and extension function in these verified definitions is qualified.
alter function public.get_study_lexicon_meta() set search_path='';
alter function public.get_study_lexicon_words(text[]) set search_path='';
alter function public.get_study_lexicon_words_v2(text[]) set search_path='';
alter function public.list_study_lexicon_single_characters() set search_path='';
alter function public.map_study_hanviet(text,text) set search_path='';
alter function public.match_study_lexicon(text) set search_path='';
alter function public.resolve_study_lexicon_words(text[]) set search_path='';
alter function public.search_study_lexicon(text,integer,integer,text,text[],text[]) set search_path='';
alter function public.search_study_lexicon_v2(text,integer,integer,text,text[],text[]) set search_path='';
notify pgrst,'reload schema';
