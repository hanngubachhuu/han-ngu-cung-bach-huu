-- Document imports reuse immutable question versions and existing enrollment/grading.
create table account_internal.assignment_context_versions (
 id uuid primary key default gen_random_uuid(),lesson_id text not null references public.lesson_content(id),
 title text not null check(length(title) between 1 and 200),content text not null check(length(content) between 1 and 50000),
 source_identifier text not null,created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default clock_timestamp()
);
create table account_internal.assignment_question_contexts (
 question_version_id uuid primary key references public.assignment_question_versions(id),
 context_version_id uuid not null references account_internal.assignment_context_versions(id)
);
create table account_internal.assignment_definition_contexts (
 assignment_version_id uuid not null references public.assignment_versions(id),context_version_id uuid not null references account_internal.assignment_context_versions(id),
 primary key(assignment_version_id,context_version_id)
);
alter table account_internal.assignment_definition_contexts enable row level security;
revoke all on account_internal.assignment_definition_contexts from public,anon,authenticated;
create trigger definition_context_immutable before update or delete on account_internal.assignment_definition_contexts for each row execute function account_internal.assignment_metadata_immutable();
create table account_internal.document_exam_imports (
 id uuid primary key,actor uuid not null references public.profiles(user_id),lesson_id text not null references public.lesson_content(id),
 payload_hash text not null, source_kind text not null check(source_kind in ('document','manual')),file_sha256 text,filename text not null,
 check((source_kind='document' and file_sha256 ~ '^[a-f0-9]{64}$' and file_sha256 is not null) or (source_kind='manual' and file_sha256 is null)),
 definition_id uuid not null references public.assignment_versions(id),response jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table account_internal.assignment_context_versions enable row level security;
alter table account_internal.assignment_question_contexts enable row level security;
alter table account_internal.document_exam_imports enable row level security;
revoke all on account_internal.assignment_context_versions,account_internal.assignment_question_contexts,account_internal.document_exam_imports from public,anon,authenticated;
create trigger context_versions_immutable before update or delete on account_internal.assignment_context_versions for each row execute function account_internal.assignment_metadata_immutable();
create trigger question_context_immutable before update or delete on account_internal.assignment_question_contexts for each row execute function account_internal.assignment_metadata_immutable();
create trigger document_import_immutable before update or delete on account_internal.document_exam_imports for each row execute function account_internal.assignment_metadata_immutable();
create index question_context_context_idx on account_internal.assignment_question_contexts(context_version_id);

-- A derived question keeps its original passage, including when the parent was used.
create function account_internal.inherit_question_context() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_version_id is not null then
  insert into account_internal.assignment_question_contexts(question_version_id,context_version_id)
   select new.question_version_id,context_version_id from account_internal.assignment_question_contexts where question_version_id=new.parent_version_id;
 end if;
 return new;
end $$;
revoke all on function account_internal.inherit_question_context() from public,anon,authenticated;
create trigger derived_question_context after insert on account_internal.assignment_question_sources for each row execute function account_internal.inherit_question_context();

-- Projection stores the context reference in each submitted snapshot; content is returned once per attempt.
create or replace function account_internal.assignment_question_projection(q public.assignment_question_versions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',q.id,'question_key',q.question_key,'version',q.version,'kind',q.kind,'prompt',q.prompt,'options',q.options,'max_score',q.max_score,
  'context_version_id',(select context_version_id from account_internal.assignment_question_contexts where question_version_id=q.id));
$$;

create function account_internal.document_exam_import(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();request uuid;hash text;existing account_internal.document_exam_imports;
 item jsonb;context jsonb;context_map jsonb:='{}';context_id uuid;instruction_id uuid;rubric uuid;q jsonb;definition jsonb;result jsonb;
 ids uuid[]:='{}';source jsonb;lesson text;file_hash text;source_kind text;ordinal integer:=0;criteria jsonb;
begin
 if actor is null or not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>2097152 then raise exception 'INVALID_REQUEST'; end if;
 request:=(payload->>'request_id')::uuid;lesson:=payload->>'lesson_id';file_hash:=payload->>'file_sha256';
 source_kind:=coalesce(payload->>'source_kind','document');
 if request is null or source_kind not in ('document','manual') or (source_kind='document' and (file_hash is null or file_hash !~ '^[a-f0-9]{64}$')) or (source_kind='manual' and file_hash is not null) or length(coalesce(payload->>'filename','')) not between 1 and 180 or length(trim(coalesce(payload->>'title',''))) not between 1 and 200 then raise exception 'INVALID_REQUEST'; end if;
 if not exists(select 1 from public.lesson_content where id=lesson) then raise exception 'LESSON_NOT_FOUND'; end if;
 hash:=md5((payload-'request_id')::text);
 perform pg_advisory_xact_lock(hashtextextended('document-exam:'||request,0));
 select * into existing from account_internal.document_exam_imports where id=request;
 if found then
  if existing.actor<>actor or existing.payload_hash<>hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return existing.response;
 end if;
 if jsonb_typeof(payload->'questions') is distinct from 'array' or jsonb_array_length(payload->'questions') not between 1 and 200 or jsonb_typeof(payload->'contexts') is distinct from 'array' or jsonb_array_length(payload->'contexts')>200 then raise exception 'INVALID_QUESTIONS'; end if;
 source:=case when source_kind='manual' then jsonb_build_object('source','admin_manual','source_identifier','form:'||request::text,'source_revision','form-1') else jsonb_build_object('source','admin_document','source_identifier','sha256:'||file_hash||'/'||(payload->>'filename'),'source_revision','parser-1') end;
 for context in select * from jsonb_array_elements(payload->'contexts') loop
  if length(coalesce(context->>'key','')) not between 1 and 120 or context_map ? (context->>'key') then raise exception 'INVALID_CONTEXT'; end if;
  insert into account_internal.assignment_context_versions(lesson_id,title,content,source_identifier,created_by)
   values(lesson,coalesce(nullif(context->>'title',''),'Đoạn đọc chung'),context->>'text',source->>'source_identifier',actor) returning id into context_id;
  context_map:=context_map||jsonb_build_object(context->>'key',context_id);
 end loop;
 if coalesce(length(payload->>'instructions'),0)>0 then
  insert into account_internal.assignment_context_versions(lesson_id,title,content,source_identifier,created_by)
   values(lesson,'Hướng dẫn',payload->>'instructions',source->>'source_identifier',actor) returning id into instruction_id;
 end if;
 for item in select * from jsonb_array_elements(payload->'questions') loop
  ordinal:=ordinal+1;
  if (item->>'kind') not in ('mcq','true_false','text_fill','writing') then raise exception 'UNSUPPORTED_QUESTION_TYPE'; end if;
  if length(coalesce(item->>'item_id','')) not between 1 and 120 then raise exception 'INVALID_QUESTION'; end if;
  rubric:=null;
  if item->>'kind'='writing' then
   perform pg_advisory_xact_lock(hashtextextended('rubric:document-writing-default-1',0));
   select id into rubric from public.assignment_rubric_versions where rubric_key='document-writing-default-1' order by version limit 1;
   if rubric is null then
    criteria:='[{"id":"accuracy","label":"Độ chính xác","weight":4},{"id":"coherence","label":"Mạch lạc","weight":2},{"id":"appropriacy","label":"Phù hợp yêu cầu","weight":2},{"id":"naturalness","label":"Tự nhiên","weight":2}]';
    q:=account_internal.assignment_command('rubric_create',jsonb_build_object('rubric_key','document-writing-default-1','kind','writing','criteria',criteria));rubric:=(q->>'id')::uuid;
   end if;
  end if;
  q:=account_internal.assignment_authoring('question_create',jsonb_build_object('request_id',gen_random_uuid(),'question',
   (item-'item_id'-'context_key'-'source_item_id')||jsonb_build_object('lesson_id',lesson,'question_key','doc-'||request::text||'-'||ordinal,'rubric_version_id',rubric),
   'metadata',source||jsonb_build_object('source_item_id',item->>'source_item_id')));
  ids:=array_append(ids,(q->>'id')::uuid);
  if coalesce(item->>'context_key','')<>'' then
   if not context_map ? (item->>'context_key') then raise exception 'INVALID_CONTEXT'; end if;
   insert into account_internal.assignment_question_contexts values((q->>'id')::uuid,(context_map->>(item->>'context_key'))::uuid);

  end if;
 end loop;
 definition:=account_internal.assignment_command('definition_create',jsonb_build_object('lesson_id',lesson,'title',payload->>'title','question_version_ids',to_jsonb(ids)));
 if instruction_id is not null then insert into account_internal.assignment_definition_contexts values((definition->>'id')::uuid,instruction_id); end if;
 result:=jsonb_build_object('count',cardinality(ids),'definition_id',definition->>'id','questions',to_jsonb(ids),'title',payload->>'title');
 insert into account_internal.document_exam_imports(id,actor,lesson_id,payload_hash,source_kind,file_sha256,filename,definition_id,response)
  values(request,actor,lesson,hash,source_kind,file_hash,payload->>'filename',(definition->>'id')::uuid,result);
 perform account_internal.assignment_audit('document_exam_imported',request,jsonb_build_object('count',cardinality(ids),'definition_id',definition->>'id','file_sha256',file_hash));
 return result;
end $$;
create function public.document_exam_import(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select account_internal.document_exam_import(payload)$$;
revoke all on function account_internal.document_exam_import(jsonb),public.document_exam_import(jsonb) from public,anon,authenticated;
grant execute on function account_internal.document_exam_import(jsonb),public.document_exam_import(jsonb) to authenticated;

create or replace function account_internal.assignment_read(attempt uuid, administrator boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; publication jsonb; a public.learning_attempts;
begin
 select * into a from public.learning_attempts where id=attempt and source='official';
 if not found or (not administrator and a.user_id is distinct from auth.uid()) then raise exception 'ATTEMPT_NOT_FOUND' using errcode='42501'; end if;
 select jsonb_build_object('attempt_id',a.id,'lesson_id',a.lesson_id,'user_id',a.user_id,
  'submitted_at',a.submitted_at,'state',d.state,'revision',d.revision,'started_at',d.started_at,
  'deadline_at',d.deadline_at,'timed_out',d.timed_out,'duration_seconds',d.duration_seconds,'server_time',clock_timestamp(),
  'assignment_version_id',d.assignment_version_id,'title',v.title,
  'answers',(select jsonb_agg(jsonb_build_object('question',s.prompt_snapshot,'answer',s.answer,'position',s.position)
    || case when administrator then jsonb_build_object('private_question',to_jsonb(q),'rubric',to_jsonb(r)) else '{}'::jsonb end order by s.position)
    from public.submission_answers s join public.assignment_question_versions q on q.id=s.question_version_id
    left join public.assignment_rubric_versions r on r.id=q.rubric_version_id where s.attempt_id=attempt))
 into result from public.submission_details d join public.assignment_versions v on v.id=d.assignment_version_id where d.attempt_id=attempt;
 select jsonb_build_object('revision',r.revision,'raw_score',r.raw_score,'raw_max_score',r.raw_max_score,
   'normalized_score',r.normalized_score,'normalized_max',100,'published_at',r.published_at,
   'questions',(select jsonb_agg(jsonb_build_object('question_version_id',g.question_version_id,'score',g.score,'max_score',10,'feedback',g.feedback) order by s.position)
     from public.submission_grades g join public.submission_answers s on s.attempt_id=g.attempt_id and s.question_version_id=g.question_version_id
     where g.attempt_id=attempt and g.revision=r.revision))
 into publication from public.submission_results r where r.attempt_id=attempt and r.state='published' order by r.revision desc limit 1;
 result:=result||jsonb_build_object('result',publication);
 if administrator then
  result:=result||jsonb_build_object('grading',(select to_jsonb(r)||jsonb_build_object('grades',(
   select jsonb_agg(to_jsonb(g)||jsonb_build_object('rubric',to_jsonb(rv),'grading_question',to_jsonb(gq)) order by s.position) from public.submission_grades g
    join public.submission_answers s on s.attempt_id=g.attempt_id and s.question_version_id=g.question_version_id
    join public.assignment_question_versions gq on gq.id=g.grading_question_version_id
    left join public.assignment_rubric_versions rv on rv.id=g.rubric_version_id
    where g.attempt_id=attempt and g.revision=r.revision))
   from public.submission_results r where r.attempt_id=attempt order by r.revision desc limit 1));
 end if;
 return result||jsonb_build_object('contexts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'content',c.content)) from account_internal.assignment_context_versions c where c.id in(select (s.prompt_snapshot->>'context_version_id')::uuid from public.submission_answers s where s.attempt_id=attempt union select dc.context_version_id from account_internal.assignment_definition_contexts dc join public.submission_details sd on sd.assignment_version_id=dc.assignment_version_id where sd.attempt_id=attempt)),'[]'::jsonb));
end $$;


notify pgrst,'reload schema';

create function account_internal.context_membership_guard() returns trigger language plpgsql set search_path='' as $$begin
 if TG_TABLE_NAME='assignment_question_contexts' then
  if not exists(select 1 from public.assignment_question_versions q join account_internal.assignment_context_versions c on c.id=new.context_version_id where q.id=new.question_version_id and q.lesson_id=c.lesson_id and q.published_at is null) then raise exception 'CONTEXT_VERSION_IMMUTABLE'; end if;
 else
  if not exists(select 1 from public.assignment_versions v join account_internal.assignment_context_versions c on c.id=new.context_version_id where v.id=new.assignment_version_id and v.lesson_id=c.lesson_id and v.status='draft') then raise exception 'CONTEXT_VERSION_IMMUTABLE'; end if;
 end if;return new;
end $$;
create trigger question_context_insert_guard before insert on account_internal.assignment_question_contexts for each row execute function account_internal.context_membership_guard();
create trigger definition_context_insert_guard before insert on account_internal.assignment_definition_contexts for each row execute function account_internal.context_membership_guard();
create function account_internal.assignment_context_command(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;definition uuid;begin
 result:=account_internal.assignment_command(command,payload);
 if command='definition_preview' then
  definition:=(payload->>'version_id')::uuid;
  return result||jsonb_build_object('contexts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'content',c.content)) from account_internal.assignment_context_versions c where c.id in(
   select qc.context_version_id from account_internal.assignment_question_contexts qc join public.assignment_version_questions aq on aq.question_version_id=qc.question_version_id where aq.assignment_version_id=definition
   union select dc.context_version_id from account_internal.assignment_definition_contexts dc where dc.assignment_version_id=definition)),'[]'::jsonb));
 end if;return result;
end $$;
create or replace function public.assignment_command(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.assignment_context_command(command,payload)$$;
revoke all on function account_internal.context_membership_guard(),account_internal.assignment_context_command(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.assignment_context_command(text,jsonb) to authenticated;
notify pgrst,'reload schema';
