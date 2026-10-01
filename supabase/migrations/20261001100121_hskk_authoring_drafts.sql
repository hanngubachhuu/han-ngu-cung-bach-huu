-- Additive authoring only. No enrollment, attempts, scores, media or Speaking switch changes.
create table account_internal.hskk_exam_source_assets (
 id uuid primary key default gen_random_uuid(),exam_code text not null check(exam_code ~ '^[A-Za-z0-9_-]{1,64}$'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),object_path text not null unique,
 byte_size bigint not null check(byte_size>0 and byte_size<=33554432),
 created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default now(),
 unique(exam_code,sha256),check(object_path=exam_code||'/'||sha256||'.mp3')
);
alter table account_internal.hskk_exam_source_assets enable row level security;
revoke all on account_internal.hskk_exam_source_assets from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hskk-authoring-sources','hskk-authoring-sources',false,33554432,array['audio/mpeg']);
create function account_internal.hskk_source_object_allowed(object_name text) returns boolean
 language sql stable security definer set search_path=pg_catalog as $$
 select account_internal.is_admin() and exists(select 1 from account_internal.hskk_exam_source_assets where object_path=object_name)
$$;
revoke all on function account_internal.hskk_source_object_allowed(text) from public,anon;
grant execute on function account_internal.hskk_source_object_allowed(text) to authenticated;
create policy hskk_source_admin_read on storage.objects for select to authenticated
 using(bucket_id='hskk-authoring-sources' and account_internal.hskk_source_object_allowed(name));
create policy hskk_source_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='hskk-authoring-sources' and account_internal.hskk_source_object_allowed(name));
create table account_internal.hskk_exam_draft_revisions (
 id uuid primary key default gen_random_uuid(),
 exam_code text not null check(exam_code ~ '^[A-Za-z0-9_-]{1,64}$'),
 revision integer not null check(revision>0),
 configuration jsonb not null check(jsonb_typeof(configuration)='object' and configuration->>'status'='draft'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 previous_revision_id uuid references account_internal.hskk_exam_draft_revisions(id),
 request_id uuid not null unique, input_hash text not null,
 created_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default now(),
 unique(exam_code,revision)
);
create table account_internal.hskk_exam_draft_audit (
 id bigint generated always as identity primary key,
 revision_id uuid not null references account_internal.hskk_exam_draft_revisions(id),
 actor_id uuid not null references public.profiles(user_id),
 event text not null check(event in ('draft_saved','ai_proposal_saved','segment_review_saved')),
 previous_revision_id uuid references account_internal.hskk_exam_draft_revisions(id),
 created_at timestamptz not null default now()
);
alter table account_internal.hskk_exam_draft_revisions enable row level security;
alter table account_internal.hskk_exam_draft_audit enable row level security;
revoke all on account_internal.hskk_exam_draft_revisions,account_internal.hskk_exam_draft_audit from public,anon,authenticated;
revoke all on sequence account_internal.hskk_exam_draft_audit_id_seq from public,anon,authenticated;
create function account_internal.hskk_draft_immutable() returns trigger language plpgsql
 set search_path=pg_catalog as $$begin raise exception 'HSKK_DRAFT_HISTORY_IMMUTABLE';end$$;
revoke all on function account_internal.hskk_draft_immutable() from public,anon,authenticated;
create trigger hskk_draft_revision_immutable before update or delete on account_internal.hskk_exam_draft_revisions
 for each row execute function account_internal.hskk_draft_immutable();
create trigger hskk_draft_audit_immutable before update or delete on account_internal.hskk_exam_draft_audit
 for each row execute function account_internal.hskk_draft_immutable();
create trigger hskk_source_immutable before update or delete on account_internal.hskk_exam_source_assets
 for each row execute function account_internal.hskk_draft_immutable();

create function public.hskk_authoring_draft(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare
 actor uuid:=auth.uid(); code text:=payload->>'exam_code';
 previous account_internal.hskk_exam_draft_revisions;
 saved account_internal.hskk_exam_draft_revisions;
 request uuid; config jsonb; source_hash text; fingerprint text; event_name text;
 asset account_internal.hskk_exam_source_assets;
begin
 if actor is null or not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
 if code is null or code !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'INVALID_EXAM';end if;
 if command in ('reserve_source','get_source') then
  source_hash:=payload->>'source_sha256';if source_hash is null or source_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SOURCE';end if;
  if command='reserve_source' then
   insert into account_internal.hskk_exam_source_assets(exam_code,sha256,object_path,byte_size,created_by)
    values(code,source_hash,code||'/'||source_hash||'.mp3',(payload->>'byte_size')::bigint,actor)on conflict(exam_code,sha256)do nothing;
  end if;
  select * into asset from account_internal.hskk_exam_source_assets where exam_code=code and sha256=source_hash;
  if not found then return null;end if;
  return jsonb_build_object('bucket','hskk-authoring-sources','path',asset.object_path,'sha256',asset.sha256,'byte_size',asset.byte_size);
 end if;
 if command='get' then
  select * into saved from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
  if not found then return null;end if;
  return jsonb_build_object('revision',saved.revision,'configuration',saved.configuration,'created_at',saved.created_at);
 end if;
 if command<>'save' then raise exception 'INVALID_COMMAND';end if;
 config:=payload->'configuration';source_hash:=payload->>'source_sha256';request:=(payload->>'request_id')::uuid;
 event_name:=coalesce(payload->>'event','draft_saved');
 if request is null or config is null or pg_column_size(config)>1048576 or config->>'exam_code' is distinct from code
  or config->>'status' is distinct from 'draft' or source_hash is null or source_hash !~ '^[a-f0-9]{64}$'
  or event_name not in ('draft_saved','ai_proposal_saved','segment_review_saved') then raise exception 'INVALID_DRAFT';end if;
 fingerprint:=md5((payload-'request_id'-'expected_revision')::text);
 perform pg_advisory_xact_lock(hashtextextended('hskk-draft:'||code,0));
 select * into saved from account_internal.hskk_exam_draft_revisions where request_id=request;
 if found then
  if saved.created_by<>actor or saved.exam_code<>code or saved.input_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('revision',saved.revision,'configuration',saved.configuration,'created_at',saved.created_at);
 end if;
 select * into previous from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1;
 if (payload->>'expected_revision')::integer is distinct from coalesce(previous.revision,0) then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 insert into account_internal.hskk_exam_draft_revisions(exam_code,revision,configuration,source_sha256,previous_revision_id,request_id,input_hash,created_by)
 values(code,coalesce(previous.revision,0)+1,config,source_hash,previous.id,request,fingerprint,actor) returning * into saved;
 insert into account_internal.hskk_exam_draft_audit(revision_id,actor_id,event,previous_revision_id)values(saved.id,actor,event_name,previous.id);
 return jsonb_build_object('revision',saved.revision,'configuration',saved.configuration,'created_at',saved.created_at);
end$$;
revoke all on function public.hskk_authoring_draft(text,jsonb) from public,anon;
grant execute on function public.hskk_authoring_draft(text,jsonb) to authenticated;
