-- Optional management document layer. All rows and commands are administrator-only.
create table public.documents(
 id uuid primary key default gen_random_uuid(), student_id uuid not null unique references public.profiles(user_id),
 google_document_id text not null unique check(google_document_id ~ '^[A-Za-z0-9_-]{10,200}$'),
 document_type text not null default 'learner_profile', sync_status text not null default 'READY' check(sync_status in('READY','SYNCING','CONFLICT','ERROR')),
 sync_version integer not null default 1, base_fields jsonb not null, google_revision text,
 last_synced_at timestamptz, last_synced_direction text, operation_id uuid, operation_started_at timestamptz,
 last_error text, created_at timestamptz not null default now()
);
create table public.sync_logs(
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id), student_id uuid not null,
 actor uuid not null, direction text not null, status text not null, fields_changed jsonb not null default '[]',
 before_fields jsonb, after_fields jsonb, error_code text, created_at timestamptz not null default now()
);
create index sync_logs_document_date_idx on public.sync_logs(document_id,created_at desc);
alter table public.documents enable row level security;
alter table public.sync_logs enable row level security;
revoke all on public.documents,public.sync_logs from public,anon,authenticated;
grant select on public.documents,public.sync_logs to authenticated;
create policy documents_admin on public.documents for select to authenticated using((select account_internal.is_admin()));
create policy sync_logs_admin on public.sync_logs for select to authenticated using((select account_internal.is_admin()));

create function account_internal.document_command(command text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.documents; p public.profiles; operation uuid; fields jsonb; old_fields jsonb;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if command='bind' then
  select * into p from public.profiles where user_id=(payload->>'student_id')::uuid for update;
  if not found or p.version is distinct from (payload->>'profile_version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  insert into public.documents(student_id,google_document_id,base_fields,google_revision,last_synced_at,last_synced_direction)
  values(p.user_id,payload->>'google_document_id',jsonb_build_object('full_name',p.full_name,'phone',p.phone,'learning_goal',p.learning_goal),payload->>'google_revision',now(),'website_to_google') returning * into d;
  insert into public.audit_logs(actor,target_id,action,details) values(auth.uid(),p.user_id,'document.bind',jsonb_build_object('document_id',d.id));
  return to_jsonb(d);
 end if;
 select * into d from public.documents where id=(payload->>'document_id')::uuid for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
 select * into p from public.profiles where user_id=d.student_id for update;
 if command='start' then
  if d.sync_version is distinct from (payload->>'sync_version')::integer or p.version is distinct from (payload->>'profile_version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if d.sync_status='SYNCING' and d.operation_started_at>now()-interval '2 minutes' then raise exception 'SYNC_BUSY'; end if;
  operation:=gen_random_uuid();
  update public.documents set sync_status='SYNCING',operation_id=operation,operation_started_at=now(),last_error=null where id=d.id;
  insert into public.sync_logs(document_id,student_id,actor,direction,status) values(d.id,d.student_id,auth.uid(),'bidirectional','STARTED');
  return jsonb_build_object('operation_id',operation);
 elsif command='complete' then
  if d.operation_id is distinct from (payload->>'operation_id')::uuid or d.sync_status<>'SYNCING' then raise exception 'SYNC_OPERATION_MISMATCH'; end if;
  if p.version is distinct from (payload->>'profile_version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  fields:=payload->'fields';
  if jsonb_typeof(fields)<>'object' or not(fields ?& array['full_name','phone','learning_goal']) or fields-array['full_name','phone','learning_goal']<>'{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  if exists(select 1 from jsonb_each(fields) where jsonb_typeof(value)<>'string') then raise exception 'INVALID_FIELDS'; end if;
  old_fields:=jsonb_build_object('full_name',p.full_name,'phone',p.phone,'learning_goal',p.learning_goal);
  update public.profiles set full_name=fields->>'full_name',phone=fields->>'phone',learning_goal=fields->>'learning_goal',version=version+1,updated_at=now() where user_id=p.user_id;
  update public.documents set base_fields=fields,google_revision=payload->>'google_revision',sync_version=sync_version+1,sync_status='READY',operation_id=null,last_synced_at=now(),last_synced_direction='bidirectional',last_error=null where id=d.id;
  insert into public.sync_logs(document_id,student_id,actor,direction,status,fields_changed,before_fields,after_fields)
  values(d.id,p.user_id,auth.uid(),'bidirectional','SUCCESS',(select coalesce(jsonb_agg(key),'[]') from jsonb_each(fields) where old_fields->key is distinct from value),old_fields,fields);
 elsif command='fail' then
  if d.operation_id is distinct from (payload->>'operation_id')::uuid then raise exception 'SYNC_OPERATION_MISMATCH'; end if;
  update public.documents set sync_status='ERROR',last_error=left(payload->>'error_code',80),operation_id=null where id=d.id;
  insert into public.sync_logs(document_id,student_id,actor,direction,status,error_code) values(d.id,p.user_id,auth.uid(),'bidirectional','ERROR',left(payload->>'error_code',80));
 elsif command='conflict' then
  if d.sync_status='SYNCING' then raise exception 'SYNC_BUSY'; end if;
  update public.documents set sync_status='CONFLICT' where id=d.id;
  insert into public.sync_logs(document_id,student_id,actor,direction,status) values(d.id,p.user_id,auth.uid(),'bidirectional','CONFLICT');
 else raise exception 'INVALID_COMMAND'; end if;
 return jsonb_build_object('ok',true);
end; $$;
create function public.account_document_command(command text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select account_internal.document_command(command,payload);$$;
revoke all on function account_internal.document_command(text,jsonb),public.account_document_command(text,jsonb) from public,anon;
grant execute on function account_internal.document_command(text,jsonb),public.account_document_command(text,jsonb) to authenticated;
notify pgrst, 'reload schema';

