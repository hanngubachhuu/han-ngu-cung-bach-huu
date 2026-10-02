-- An abandoned, expired device/microphone check must not permanently consume
-- the learner's only preflight slot. A live attempt is never restarted/extended.
alter function public.hskk_session_command(text,jsonb) rename to hskk_session_command_before_preflight_recovery;
create function public.hskk_session_command(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; preflight uuid;
begin
 result:=public.hskk_session_command_before_preflight_recovery(command,payload);
 if command='load' then
  preflight:=(result->'session'->>'attempt_id')::uuid;
  update account_internal.hskk_preflights p set state='CREATED',expires_at=clock_timestamp()+interval '4 hours'
   where p.id=preflight and p.owner_id=auth.uid() and p.expires_at<=clock_timestamp()
    and not exists(select 1 from account_internal.hskk_sessions s where s.attempt_id=p.id);
  if found then result:=jsonb_set(result,'{session}',account_internal.hskk_session_read(preflight));end if;
 end if;
 return result;
end $$;
revoke all on function public.hskk_session_command_before_preflight_recovery(text,jsonb),public.hskk_session_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.hskk_session_command(text,jsonb) to authenticated;
