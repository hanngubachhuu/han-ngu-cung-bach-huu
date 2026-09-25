-- Run as the database administrator. Every test write rolls back.
begin;
do $$
declare
 test_owner_id uuid := (select id from auth.users where email_confirmed_at is not null and not coalesce(is_anonymous,false) limit 1);
 other_id uuid := gen_random_uuid();
 reading_id uuid := gen_random_uuid();
 affected integer;
 denied boolean := false;
 accepted integer := 0;
 used_after integer;
begin
 if test_owner_id is null then raise exception 'Need one existing account for ownership audit'; end if;
 insert into study_internal.usage_daily values(test_owner_id,'recognize',current_date,0),
 ('00000000-0000-0000-0000-000000000000','all',current_date,0)
 on conflict(owner_id,action,day) do update set used=0;
 perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
 set local role authenticated;
 insert into public.study_readings(id,user_id,title,source_text) values(reading_id,test_owner_id,'Temporary RLS audit','你好。');
 insert into public.study_saved_characters(user_id,character) values(test_owner_id,'漢') on conflict do nothing;
 if not exists(select 1 from public.study_saved_characters where character='漢') then raise exception 'Owner cannot save character'; end if;
 if not exists(select 1 from public.study_readings where id=reading_id) then raise exception 'Owner cannot read own row'; end if;
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 if exists(select 1 from public.study_readings where id=reading_id) then raise exception 'Cross-account read'; end if;
 if exists(select 1 from public.study_saved_characters where user_id=test_owner_id) then raise exception 'Cross-account characters'; end if;
 update public.study_readings set title='Should not change' where id=reading_id;
 get diagnostics affected = row_count;
 if affected<>0 then raise exception 'Cross-account update'; end if;
 begin
   insert into public.study_saved_words(user_id,entry_id) values(test_owner_id,'rls-test-'||reading_id::text);
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Spoofed owner insert was allowed'; end if;
 if public.study_consume_quota('recognize') then raise exception 'Nonexistent account consumed quota'; end if;
 perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
 for i in 1..65 loop
   if public.study_consume_quota('recognize') then accepted:=accepted+1; end if;
 end loop;
 if accepted<>60 or public.study_consume_quota('recognize') then raise exception 'Quota boundary failed'; end if;
 if public.study_consume_quota('unsupported') then raise exception 'Unknown quota action allowed'; end if;
 reset role;
 select used into used_after from study_internal.usage_daily where owner_id='00000000-0000-0000-0000-000000000000' and action='all' and day=current_date;
 if used_after<>60 then raise exception 'Denied requests drained shared quota'; end if;
 update study_internal.usage_daily set used=200 where owner_id='00000000-0000-0000-0000-000000000000' and action='all' and day=current_date;
 update study_internal.usage_daily set used=59 where owner_id=auth.uid() and action='recognize' and day=current_date;
 set local role authenticated;
 if public.study_consume_quota('recognize') then raise exception 'Shared cap exceeded'; end if;
 reset role;
 select used into used_after from study_internal.usage_daily where owner_id=auth.uid() and action='recognize' and day=current_date;
 if used_after<>59 then raise exception 'Shared denial spent personal quota'; end if;
end $$;
select 'PASS: owner CRUD and saved characters, cross-account read/update/insert denial, nonexistent account denial, personal and shared atomic quota; all writes rolled back.' as result;
rollback;
