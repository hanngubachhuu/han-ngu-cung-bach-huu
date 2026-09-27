-- Operator-only, AFTER the account migration and explicit production approval.
-- The owner designated this email in the task; Auth must confirm it belongs to one account.
begin;
do $$
declare owner_id uuid; matches integer;
begin
 select count(*),min(id::text)::uuid into matches,owner_id from auth.users
 where lower(email)='bachhuu1809@gmail.com' and email_confirmed_at is not null;
 if matches<>1 then raise exception 'EXACTLY_ONE_CONFIRMED_OWNER_REQUIRED'; end if;
 lock table public.profiles in share row exclusive mode;
 if exists(select 1 from public.profiles where role='ADMIN' and user_id<>owner_id) then raise exception 'DIFFERENT_ADMIN_EXISTS'; end if;
 update public.profiles set role='ADMIN',status='APPROVED',version=version+1,updated_at=now() where user_id=owner_id;
 if not found then raise exception 'OWNER_PROFILE_NOT_FOUND'; end if;
 insert into public.audit_logs(actor,target_id,action,details) values(owner_id,owner_id,'owner.bootstrap','{"channel":"operator_verified"}');
end; $$;
commit;
