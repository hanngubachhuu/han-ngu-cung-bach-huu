insert into storage.buckets (id,name,public)
values ('study-lexicon','study-lexicon',true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.study_lexicon_words (
  simplified text primary key,
  traditional text not null,
  pinyin text not null,
  pinyin_normalized text not null,
  readings jsonb not null default '[]'::jsonb,
  meanings_vi text[] not null default '{}',
  search_text text not null default '',
  frequency bigint not null default 0,
  common boolean not null default false,
  source_version text not null default ''
);

alter table public.study_lexicon_words enable row level security;
drop policy if exists "public read remote lexicon words" on public.study_lexicon_words;
create policy "public read remote lexicon words"
on public.study_lexicon_words for select to anon, authenticated using (true);

create index if not exists study_lexicon_words_pinyin_idx
  on public.study_lexicon_words (pinyin_normalized);
create index if not exists study_lexicon_words_frequency_idx
  on public.study_lexicon_words (frequency desc);
create index if not exists study_lexicon_words_search_trgm_idx
  on public.study_lexicon_words using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.study_lexicon_meta (
  id smallint primary key check (id=1),
  schema_version smallint not null default 1,
  words integer not null,
  readings integer not null,
  characters integer not null,
  common_characters integer not null,
  han_viet_characters integer not null,
  cvdict_version text not null,
  hanviet_version text not null,
  unihan_version text not null,
  jieba_version text not null,
  updated_at timestamptz not null default now()
);

alter table public.study_lexicon_meta enable row level security;
drop policy if exists "public read lexicon meta" on public.study_lexicon_meta;
create policy "public read lexicon meta"
on public.study_lexicon_meta for select to anon, authenticated using (true);

insert into public.study_lexicon_meta
  (id,words,readings,characters,common_characters,han_viet_characters,
   cvdict_version,hanviet_version,unihan_version,jieba_version)
values
  (1,119044,122596,103013,8105,13610,
   'c379d909e308343a247e51619f7839a2060a271c',
   'a1292b0fdfbfeed41e08ae53e8bc4e01167bed28',
   '17.0.0',
   '67fa2e36e72f69d9134b8a1037b83fbb070b9775')
on conflict (id) do update set
  words=excluded.words,
  readings=excluded.readings,
  characters=excluded.characters,
  common_characters=excluded.common_characters,
  han_viet_characters=excluded.han_viet_characters,
  cvdict_version=excluded.cvdict_version,
  hanviet_version=excluded.hanviet_version,
  unihan_version=excluded.unihan_version,
  jieba_version=excluded.jieba_version,
  updated_at=now();

create or replace function public.search_study_lexicon(
  query_text text default '',
  offset_rows integer default 0,
  result_limit integer default 12,
  contains_text text default null,
  saved_simplified text[] default null,
  exclude_simplified text[] default null
)
returns table (
  simplified text,
  traditional text,
  pinyin text,
  pinyin_normalized text,
  readings jsonb,
  meanings_vi text[],
  frequency bigint,
  common boolean,
  match_score integer,
  total_count bigint
)
language sql
stable
as $fn$
with params as (
  select
    trim(coalesce(query_text,'')) raw,
    regexp_replace(
      regexp_replace(
        extensions.unaccent(
          replace(replace(lower(trim(coalesce(query_text,''))),'ü','v'),'Ü','V')
        ),
        '[1-5]','','g'
      ),
      '\s+',' ','g'
    ) normalized
),
base as (
  select
    w.*,
    case
      when p.raw <> '' and (w.simplified=p.raw or w.traditional=p.raw) then 1000
      when p.normalized <> '' and w.pinyin_normalized=p.normalized then 900
      when p.normalized <> '' and exists (
        select 1 from unnest(w.meanings_vi) m
        where extensions.unaccent(lower(m))=p.normalized
      ) then 800
      when p.normalized <> '' and w.search_text ilike '%'||p.normalized||'%' then 600
      else 400
    end as score
  from public.study_lexicon_words w
  cross join params p
  where
    (saved_simplified is null or w.simplified = any(saved_simplified))
    and (exclude_simplified is null or not (w.simplified = any(exclude_simplified)))
    and (
      contains_text is null
      or w.simplified ilike '%'||contains_text||'%'
      or w.traditional ilike '%'||contains_text||'%'
    )
    and (
      p.raw=''
      or w.simplified=p.raw
      or w.traditional=p.raw
      or w.pinyin_normalized=p.normalized
      or w.search_text ilike '%'||p.normalized||'%'
    )
)
select
  b.simplified,b.traditional,b.pinyin,b.pinyin_normalized,b.readings,
  b.meanings_vi,b.frequency,b.common,b.score,count(*) over() as total_count
from base b
order by b.score desc,b.frequency desc,b.common desc,
         length(b.simplified) asc,b.simplified asc
offset greatest(0,offset_rows)
limit greatest(1,least(result_limit,100));
$fn$;

grant execute on function public.search_study_lexicon(text,integer,integer,text,text[],text[])
to anon, authenticated;

create or replace function public.get_study_lexicon_words(word_list text[])
returns table (
  simplified text,
  traditional text,
  pinyin text,
  pinyin_normalized text,
  readings jsonb,
  meanings_vi text[],
  frequency bigint,
  common boolean
)
language sql
stable
as $fn$
select w.simplified,w.traditional,w.pinyin,w.pinyin_normalized,
       w.readings,w.meanings_vi,w.frequency,w.common
from public.study_lexicon_words w
where w.simplified=any(word_list);
$fn$;

grant execute on function public.get_study_lexicon_words(text[]) to anon, authenticated;

create or replace function public.resolve_study_lexicon_words(words text[])
returns table (simplified text)
language sql
stable
as $fn$
select distinct w.simplified
from public.study_lexicon_words w
where w.simplified=any(words) or w.traditional=any(words);
$fn$;

grant execute on function public.resolve_study_lexicon_words(text[]) to anon, authenticated;

create or replace function public.match_study_lexicon(text_input text)
returns table (simplified text)
language sql
stable
as $fn$
select w.simplified
from public.study_lexicon_words w
where position(w.simplified in text_input)>0
   or position(w.traditional in text_input)>0
order by length(w.simplified) desc,w.frequency desc
limit 500;
$fn$;

grant execute on function public.match_study_lexicon(text) to anon, authenticated;

create or replace function public.list_study_lexicon_single_characters()
returns table (
  simplified text,
  traditional text,
  pinyin text,
  readings jsonb,
  meanings_vi text[],
  frequency bigint,
  common boolean
)
language sql
stable
as $fn$
select w.simplified,w.traditional,w.pinyin,w.readings,
       w.meanings_vi,w.frequency,w.common
from public.study_lexicon_words w
where char_length(w.simplified)=1 or char_length(w.traditional)=1
order by w.simplified;
$fn$;

grant execute on function public.list_study_lexicon_single_characters() to anon, authenticated;
