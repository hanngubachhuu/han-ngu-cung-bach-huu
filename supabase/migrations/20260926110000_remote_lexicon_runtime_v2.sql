create or replace function public.get_study_lexicon_words_v2(word_list text[])
returns table(
  simplified text,
  traditional text,
  pinyin text,
  pinyin_normalized text,
  readings jsonb,
  meanings_vi text[],
  frequency bigint,
  common boolean,
  han_viet text
)
language sql
stable
as $function$
select
  w.simplified,
  w.traditional,
  w.pinyin,
  w.pinyin_normalized,
  w.readings,
  w.meanings_vi,
  w.frequency,
  w.common,
  w.han_viet
from public.study_lexicon_words w
where w.simplified = any(word_list);
$function$;

create or replace function public.search_study_lexicon_v2(
  query_text text default '',
  offset_rows integer default 0,
  result_limit integer default 12,
  contains_text text default null,
  saved_simplified text[] default null,
  exclude_simplified text[] default null
)
returns table(
  simplified text,
  traditional text,
  pinyin text,
  pinyin_normalized text,
  readings jsonb,
  meanings_vi text[],
  frequency bigint,
  common boolean,
  han_viet text,
  match_score integer,
  total_count bigint
)
language sql
stable
as $function$
with params as (
  select
    trim(coalesce(query_text,'')) raw,
    regexp_replace(
      regexp_replace(
        extensions.unaccent(
          replace(
            replace(lower(trim(coalesce(query_text,''))), 'ü', 'v'),
            'u:',
            'v'
          )
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
      when p.normalized <> '' and extensions.unaccent(lower(coalesce(w.han_viet,'')))=p.normalized then 850
      when p.normalized <> '' and exists (
        select 1 from unnest(w.meanings_vi) m
        where extensions.unaccent(lower(m))=p.normalized
      ) then 800
      when p.normalized <> '' and extensions.unaccent(lower(coalesce(w.han_viet,''))) ilike '%'||p.normalized||'%' then 650
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
      or extensions.unaccent(lower(coalesce(w.han_viet,''))) ilike '%'||p.normalized||'%'
      or w.search_text ilike '%'||p.normalized||'%'
    )
)
select
  b.simplified,
  b.traditional,
  b.pinyin,
  b.pinyin_normalized,
  b.readings,
  b.meanings_vi,
  b.frequency,
  b.common,
  b.han_viet,
  b.score,
  count(*) over() as total_count
from base b
order by
  b.score desc,
  b.frequency desc,
  b.common desc,
  length(b.simplified) asc,
  b.simplified asc
offset greatest(0,offset_rows)
limit greatest(1,least(result_limit,100));
$function$;

grant execute on function public.get_study_lexicon_words_v2(text[]) to anon, authenticated;
grant execute on function public.search_study_lexicon_v2(text, integer, integer, text, text[], text[]) to anon, authenticated;
