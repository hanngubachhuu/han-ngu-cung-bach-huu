-- Forward correction: the existing assignment catalog identifies lessons by id.
-- Keep official timed HSKK out of the generic start/recorder UI, while preserving
-- existing submission history and loading its original immutable exam version.
create or replace function account_internal.assignment_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not account_internal.is_admin() and (
   exists(select 1 from account_internal.admin_exams where delivery_id=payload->>'lesson_id' and exam_type='HSKK')
   or exists(select 1 from account_internal.hskk_sessions where attempt_id=(payload->>'attempt_id')::uuid)) then raise exception 'HSKK_TRANSPORT_REQUIRED' using errcode='42501';end if;
 if command in ('definition_publish','enable') and exists(select 1 from account_internal.hskk_delivery_versions h join public.assignment_versions v on v.id=h.assignment_version_id where h.assignment_version_id=(payload->>'version_id')::uuid or v.lesson_id=payload->>'lesson_id') then raise exception 'HSKK_PUBLICATION_REQUIRED';end if;
 result:=account_internal.assignment_command_before_hskk(command,payload);
 if command='catalog' then return coalesce((select jsonb_agg(x) from jsonb_array_elements(result) x where not exists(select 1 from account_internal.admin_exams e where e.delivery_id=x->>'id' and e.exam_type='HSKK')),'[]'::jsonb);end if;
 return result;
end $$;
revoke all on function account_internal.assignment_command(text,jsonb) from public,anon;
grant execute on function account_internal.assignment_command(text,jsonb) to authenticated;

create function public.hskk_resume(attempt_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; version_id uuid;
begin
 snapshot:=public.hskk_session_command('get',jsonb_build_object('attempt_id',attempt_id));
 select p.assignment_version_id into version_id from account_internal.hskk_preflights p where p.id=attempt_id and p.owner_id=auth.uid();
 if version_id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 return jsonb_build_object('session',snapshot,'exam',account_internal.hskk_delivery_config(version_id));
end $$;
revoke all on function public.hskk_resume(uuid) from public,anon;
grant execute on function public.hskk_resume(uuid) to authenticated;
