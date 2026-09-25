-- Shared learning tools. No service-role credential is used by runtime APIs.
create extension if not exists unaccent with schema extensions;
create table public.study_dictionary (
 record_id text primary key, entry_id text not null, simplified text not null,
 traditional text, pinyin_normalized text not null, search_normalized text not null,
 visibility text not null check (visibility in ('public','student')), lesson_id text not null,
 data jsonb not null check (jsonb_typeof(data)='object')
);
create index study_dictionary_entry_idx on public.study_dictionary(entry_id);
create index study_dictionary_pinyin_idx on public.study_dictionary(pinyin_normalized);
create table public.study_characters (
 record_id text primary key, character text not null, visibility text not null check(visibility in ('public','student')),
 lesson_id text not null, data jsonb not null check(jsonb_typeof(data)='object')
);
create index study_characters_character_idx on public.study_characters(character);
create table public.study_library (
 id text primary key, visibility text not null check(visibility in ('public','student')), lesson_id text not null,
 data jsonb not null check(jsonb_typeof(data)='object')
);
alter table public.study_dictionary enable row level security;
alter table public.study_characters enable row level security;
alter table public.study_library enable row level security;
grant select on public.study_dictionary, public.study_characters, public.study_library to anon, authenticated;
create policy dictionary_public on public.study_dictionary for select to anon, authenticated using (visibility='public');
create policy dictionary_student on public.study_dictionary for select to authenticated using (
 exists(select 1 from public.student_lesson_access a where a.user_id=(select auth.uid()) and a.lesson_id=study_dictionary.lesson_id and a.active));
create policy characters_public on public.study_characters for select to anon, authenticated using (visibility='public');
create policy characters_student on public.study_characters for select to authenticated using (
 exists(select 1 from public.student_lesson_access a where a.user_id=(select auth.uid()) and a.lesson_id=study_characters.lesson_id and a.active));
create policy library_public on public.study_library for select to anon, authenticated using (visibility='public');
create policy library_student on public.study_library for select to authenticated using (
 exists(select 1 from public.student_lesson_access a where a.user_id=(select auth.uid()) and a.lesson_id=study_library.lesson_id and a.active));

create function public.study_search_dictionary(query_text text, offset_count integer default 0, result_limit integer default 12)
returns table(data jsonb, total_count bigint) language sql stable security invoker set search_path='' as $$
 with q as (select left(trim(query_text),120) raw,
   regexp_replace(lower(extensions.unaccent(replace(translate(lower(query_text),'üǖǘǚǜ','vvvvv'),'u:','v'))),'[1-5]|[^[:alnum:] ]','','g') norm),
 ranked as (select d.*,case when d.simplified=q.raw or d.traditional=q.raw then 1000
   when d.pinyin_normalized=replace(q.norm,' ','') then 900
   when d.search_normalized=q.norm then 800
   when starts_with(d.simplified,q.raw) or starts_with(d.pinyin_normalized,replace(q.norm,' ','')) then 600 else 400 end score
 from public.study_dictionary d cross join q where q.raw='' or position(q.raw in d.simplified)>0 or position(q.raw in coalesce(d.traditional,''))>0
   or (q.norm<>'' and (position(q.norm in d.search_normalized)>0 or position(replace(q.norm,' ','') in d.pinyin_normalized)>0))),
 unique_entries as (select distinct on(entry_id) * from ranked order by entry_id,score desc,visibility,record_id)
 select data,count(*) over() from unique_entries order by score desc,simplified,entry_id
 limit greatest(1,least(result_limit,50)) offset greatest(0,least(offset_count,10000));
$$;
revoke all on function public.study_search_dictionary(text,integer,integer) from public;
grant execute on function public.study_search_dictionary(text,integer,integer) to anon,authenticated;

create table public.study_saved_words (
 user_id uuid not null references auth.users(id) on delete cascade, entry_id text not null check(length(entry_id)<=250),
 created_at timestamptz not null default now(), primary key(user_id,entry_id)
);
create table public.study_readings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 150), source_text text not null check(length(source_text) between 1 and 3000),
 result jsonb check(result is null or (jsonb_typeof(result)='object' and pg_column_size(result)<160000)),
 updated_at timestamptz not null default now()
);
create index study_readings_owner_idx on public.study_readings(user_id,updated_at desc);
create table public.study_analysis_cache (
 user_id uuid not null references auth.users(id) on delete cascade, cache_key text not null check(length(cache_key)=64),
 result jsonb not null check(pg_column_size(result)<160000), created_at timestamptz not null default now(), primary key(user_id,cache_key)
);
alter table public.study_saved_words enable row level security;
alter table public.study_readings enable row level security;
alter table public.study_analysis_cache enable row level security;
grant select,insert,update,delete on public.study_saved_words,public.study_readings,public.study_analysis_cache to authenticated;
create policy own_words on public.study_saved_words for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_readings on public.study_readings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_analysis on public.study_analysis_cache for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Atomic daily quotas persist across Vercel instances. Direct calls can only consume quota.
create schema if not exists study_internal;
revoke all on schema study_internal from public,anon;
grant usage on schema study_internal to authenticated;
create table study_internal.usage_daily(owner_id uuid not null,action text not null,day date not null,used integer not null,primary key(owner_id,action,day));
alter table study_internal.usage_daily enable row level security;
revoke all on study_internal.usage_daily from public,anon,authenticated;
create function study_internal.consume_quota(request_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); cap integer; used_count integer;
begin
 if who is null then return false; end if;
 cap:=case request_action when 'analyze' then 8 when 'recognize' then 60 when 'dictionary' then 30 when 'speech' then 30 else 0 end;
 if cap=0 then return false; end if;
 -- A second shared cap limits account-creation abuse and accidental loops.
 insert into study_internal.usage_daily values('00000000-0000-0000-0000-000000000000','all',current_date,1)
 on conflict(owner_id,action,day) do update set used=study_internal.usage_daily.used+1 where study_internal.usage_daily.used<200 returning used into used_count;
 if used_count is null then return false; end if;
 used_count:=null;
 insert into study_internal.usage_daily values(who,request_action,current_date,1)
 on conflict(owner_id,action,day) do update set used=study_internal.usage_daily.used+1 where study_internal.usage_daily.used<cap returning used into used_count;
 return used_count is not null;
end; $$;
revoke all on function study_internal.consume_quota(text) from public,anon;
grant execute on function study_internal.consume_quota(text) to authenticated;
create function public.study_consume_quota(request_action text) returns boolean language sql security invoker set search_path='' as $$select study_internal.consume_quota(request_action)$$;
revoke all on function public.study_consume_quota(text) from public,anon;
grant execute on function public.study_consume_quota(text) to authenticated;
