create extension if not exists fuzzystrmatch with schema extensions;
create or replace function public.study_search_dictionary(query_text text, offset_count integer default 0, result_limit integer default 12)
returns table(data jsonb, total_count bigint) language sql stable security invoker set search_path='' as $$
 with raw_query as (select left(trim(query_text),120) raw),
 normalized as (select raw, trim(regexp_replace(regexp_replace(lower(extensions.unaccent(
   replace(translate(lower(raw),'üǖǘǚǜ','vvvvv'),'u:','v'))),'[1-5]','','g'),'[^[:alnum:]]+',' ','g')) norm from raw_query),
 q as (select *,replace(norm,' ','') pin from normalized),
 scored as (select d.*,case
   when q.raw='' then 1
   when d.simplified=q.raw or d.traditional=q.raw then 1000
   when q.pin<>'' and d.pinyin_normalized=q.pin then 900
   when q.norm<>'' and d.search_normalized=q.norm then 800
   when starts_with(d.simplified,q.raw) or starts_with(coalesce(d.traditional,''),q.raw)
     or (q.pin<>'' and starts_with(d.pinyin_normalized,q.pin))
     or (q.norm<>'' and starts_with(d.search_normalized,q.norm)) then 600
   when q.norm<>'' and position(' '||q.norm||' ' in ' '||d.search_normalized||' ')>0 then 500
   when position(q.raw in d.simplified)>0 or position(q.raw in coalesce(d.traditional,''))>0
     or (q.norm<>'' and position(q.norm in d.search_normalized)>0)
     or (q.pin<>'' and position(q.pin in d.pinyin_normalized)>0) then 400
   when q.pin ~ '^[a-z]{4,80}$' and extensions.levenshtein_less_equal(left(d.pinyin_normalized,120),q.pin,1)<=1 then 200
   else 0 end score from public.study_dictionary d cross join q),
 unique_entries as (select distinct on(entry_id) * from scored where score>0 order by entry_id,score desc,visibility,record_id)
 select data,count(*) over() from unique_entries order by score desc,simplified,entry_id
 limit greatest(1,least(result_limit,50)) offset greatest(0,least(offset_count,10000));
$$;
revoke all on function public.study_search_dictionary(text,integer,integer) from public;
grant execute on function public.study_search_dictionary(text,integer,integer) to anon,authenticated;
