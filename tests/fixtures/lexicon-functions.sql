-- Read-only function definitions verified from production catalog on 2026-09-27.
CREATE OR REPLACE FUNCTION public.get_study_lexicon_meta()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
select jsonb_build_object(
  'schema', m.schema_version,
  'version', concat(m.cvdict_version,'|',m.hanviet_version,'|',m.unihan_version,'|',m.jieba_version),
  'counts', jsonb_build_object(
    'sourceRows',m.source_rows,
    'mergedRows',m.merged_rows,
    'words',m.words,
    'readings',m.readings,
    'characters',m.characters,
    'commonCharacters',m.common_characters,
    'hanVietCharacters',m.han_viet_characters,
    'directHanVietCharacters',m.direct_han_viet_characters
  ),
  'sources', jsonb_build_object(
    'cvdict', jsonb_build_object(
      'id','cvdict','name','CVDICT','author','Phong Phan; CC-CEDICT contributors',
      'url','https://github.com/ph0ngp/CVDICT','version',m.cvdict_version,
      'license','CC-BY-SA-4.0','licenseUrl','https://creativecommons.org/licenses/by-sa/4.0/'
    ),
    'hanviet', jsonb_build_object(
      'id','hanviet','name','Hán Việt Pinyin','author','Phong Phan',
      'url','https://github.com/ph0ngp/hanviet-pinyin-wordlist','version',m.hanviet_version,
      'license','MIT','licenseUrl','https://github.com/ph0ngp/hanviet-pinyin-words/blob/a1292b0fdfbfeed41e08ae53e8bc4e01167bed28/LICENSE'
    ),
    'unihan', jsonb_build_object(
      'id','unihan','name','Unicode Unihan 17.0','author','Unicode, Inc.',
      'url','https://www.unicode.org/reports/tr38/','version',m.unihan_version,
      'license','Unicode-3.0','licenseUrl','https://www.unicode.org/license.txt'
    ),
    'jieba', jsonb_build_object(
      'id','jieba','name','Jieba word frequencies','author','Sun Junyi and contributors',
      'url','https://github.com/fxsjy/jieba','version',m.jieba_version,
      'license','MIT','licenseUrl','https://github.com/fxsjy/jieba/blob/67fa2e36e72f69d9134b8a1037b83fbb070b9775/LICENSE'
    )
  ),
  'files', jsonb_build_object(
    'cvdict',jsonb_build_object('gzip','https://dmeqxdznzobbarvkmxyg.supabase.co/storage/v1/object/public/study-lexicon/sources/cvdict.u8.gz'),
    'hanviet',jsonb_build_object('gzip','https://dmeqxdznzobbarvkmxyg.supabase.co/storage/v1/object/public/study-lexicon/sources/hanviet.json.gz'),
    'unihan',jsonb_build_object('gzip','https://dmeqxdznzobbarvkmxyg.supabase.co/storage/v1/object/public/study-lexicon/sources/unihan.json.gz'),
    'jieba',jsonb_build_object('gzip','https://dmeqxdznzobbarvkmxyg.supabase.co/storage/v1/object/public/study-lexicon/sources/jieba.txt.gz')
  )
)
from public.study_lexicon_meta m
where m.id=1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_lexicon_words(word_list text[])
 RETURNS TABLE(simplified text, traditional text, pinyin text, pinyin_normalized text, readings jsonb, meanings_vi text[], frequency bigint, common boolean)
 LANGUAGE sql
 STABLE
AS $function$
select w.simplified,w.traditional,w.pinyin,w.pinyin_normalized,w.readings,w.meanings_vi,w.frequency,w.common
from public.study_lexicon_words w
where w.simplified = any(word_list);
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_lexicon_words_v2(word_list text[])
 RETURNS TABLE(simplified text, traditional text, pinyin text, pinyin_normalized text, readings jsonb, meanings_vi text[], frequency bigint, common boolean, han_viet text)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_study_lexicon_single_characters()
 RETURNS TABLE(simplified text, traditional text, pinyin text, readings jsonb, meanings_vi text[], frequency bigint, common boolean)
 LANGUAGE sql
 STABLE
AS $function$
select w.simplified,w.traditional,w.pinyin,w.readings,
       w.meanings_vi,w.frequency,w.common
from public.study_lexicon_words w
where char_length(w.simplified)=1 or char_length(w.traditional)=1
order by w.simplified;
$function$
;

CREATE OR REPLACE FUNCTION public.map_study_hanviet(traditional_text text, numbered_pinyin text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
with chars as (
  select ch.character,ch.ord
  from unnest(string_to_array(coalesce(traditional_text,''),null))
       with ordinality ch(character,ord)
),
pinyins as (
  select py.pinyin,py.ord
  from unnest(regexp_split_to_array(trim(coalesce(numbered_pinyin,'')),E'\s+'))
       with ordinality py(pinyin,ord)
),
parts as (
  select c.ord,
         coalesce(array_to_string(m.values,'/'),'') as value
  from chars c
  join pinyins p on p.ord=c.ord
  left join public.study_lexicon_hanviet_map m
    on m.character=c.character
   and (
     m.pinyin='*'
     or m.pinyin_normalized=regexp_replace(
       replace(replace(lower(p.pinyin),'ü','v'),'u:','v'),
       '[0-9]','','g'
     )
   )
),
grouped as (
  select ord,max(nullif(value,'')) value
  from parts
  group by ord
)
select case
  when count(*)=0 or bool_and(value is not null) is not true then null
  else string_agg(value,' ' order by ord)
end
from grouped;
$function$
;

CREATE OR REPLACE FUNCTION public.match_study_lexicon(text_input text)
 RETURNS TABLE(simplified text)
 LANGUAGE sql
 STABLE
AS $function$
select w.simplified
from public.study_lexicon_words w
where position(w.simplified in text_input) > 0
   or position(w.traditional in text_input) > 0
order by length(w.simplified) desc, w.frequency desc
limit 500;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_study_lexicon_words(words text[])
 RETURNS TABLE(simplified text)
 LANGUAGE sql
 STABLE
AS $function$
select distinct w.simplified
from public.study_lexicon_words w
where w.simplified = any(words) or w.traditional = any(words);
$function$
;

CREATE OR REPLACE FUNCTION public.search_study_lexicon(query_text text DEFAULT ''::text, offset_rows integer DEFAULT 0, result_limit integer DEFAULT 12, contains_text text DEFAULT NULL::text, saved_simplified text[] DEFAULT NULL::text[], exclude_simplified text[] DEFAULT NULL::text[])
 RETURNS TABLE(simplified text, traditional text, pinyin text, pinyin_normalized text, readings jsonb, meanings_vi text[], frequency bigint, common boolean, match_score integer, total_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
  b.simplified,
  b.traditional,
  b.pinyin,
  b.pinyin_normalized,
  b.readings,
  b.meanings_vi,
  b.frequency,
  b.common,
  b.score,
  count(*) over() as total_count
from base b
order by b.score desc, b.frequency desc, b.common desc, length(b.simplified) asc, b.simplified asc
offset greatest(0,offset_rows)
limit greatest(1,least(result_limit,100));
$function$
;

CREATE OR REPLACE FUNCTION public.search_study_lexicon_v2(query_text text DEFAULT ''::text, offset_rows integer DEFAULT 0, result_limit integer DEFAULT 12, contains_text text DEFAULT NULL::text, saved_simplified text[] DEFAULT NULL::text[], exclude_simplified text[] DEFAULT NULL::text[])
 RETURNS TABLE(simplified text, traditional text, pinyin text, pinyin_normalized text, readings jsonb, meanings_vi text[], frequency bigint, common boolean, han_viet text, match_score integer, total_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
      when p.normalized <> '' and (
        w.pinyin_normalized=p.normalized
        or replace(w.pinyin_normalized,' ','')=replace(p.normalized,' ','')
      ) then 900
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
      or replace(w.pinyin_normalized,' ','')=replace(p.normalized,' ','')
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
$function$
;
