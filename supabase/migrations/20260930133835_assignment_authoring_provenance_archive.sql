-- Additive private authoring metadata; never mutate used question/answer/grade rows.
create table account_internal.assignment_question_sources (
 question_version_id uuid primary key references public.assignment_question_versions(id),
 source text not null check(length(source) between 1 and 120),
 source_identifier text not null check(length(source_identifier) between 1 and 1000),
 source_revision text not null check(length(source_revision) between 1 and 120),
 source_item_id text not null check(length(source_item_id) between 1 and 120),
 origin text not null check(origin in ('manual','generated','import','derived','legacy_unknown')),
 parent_version_id uuid references public.assignment_question_versions(id),
 generator jsonb,
 recorded_by uuid not null references public.profiles(user_id), recorded_at timestamptz not null default now(),
 imported_by uuid references public.profiles(user_id), imported_at timestamptz,
 check((imported_by is null)=(imported_at is null)),
 check(origin<>'import' or imported_by is not null)
);
create index assignment_source_lookup on account_internal.assignment_question_sources(source,source_identifier);
create index assignment_source_parent on account_internal.assignment_question_sources(parent_version_id) where parent_version_id is not null;
create table account_internal.assignment_question_archive_events (
 question_version_id uuid not null references public.assignment_question_versions(id), revision integer not null check(revision>0),
 archived boolean not null, reason text not null check(length(trim(reason)) between 1 and 1000),
 actor uuid not null references public.profiles(user_id), occurred_at timestamptz not null default now(),
 primary key(question_version_id,revision)
);
create table account_internal.assignment_authoring_requests (
 id uuid primary key, actor uuid not null references public.profiles(user_id),
 lesson_id text not null references public.lesson_content(id),
 kind text not null check(kind in ('import','question_create','archive')),
 payload_hash text not null, state text not null check(state in ('preview','committed')),
 expected_versions jsonb, preview jsonb, response jsonb,
 created_at timestamptz not null default now(), committed_at timestamptz,
 check((state='committed')=(committed_at is not null))
);
create unique index assignment_import_content_once on account_internal.assignment_authoring_requests(payload_hash) where kind='import' and state='committed';
create index assignment_import_history on account_internal.assignment_authoring_requests(lesson_id,created_at desc) where kind='import';
alter table account_internal.assignment_question_sources add column import_request_id uuid references account_internal.assignment_authoring_requests(id) deferrable initially deferred;
alter table account_internal.assignment_question_sources add constraint assignment_import_request_required check(origin<>'import' or import_request_id is not null);
create index assignment_source_import on account_internal.assignment_question_sources(import_request_id) where import_request_id is not null;
alter table account_internal.assignment_question_sources enable row level security;
alter table account_internal.assignment_question_archive_events enable row level security;
alter table account_internal.assignment_authoring_requests enable row level security;
revoke all on account_internal.assignment_question_sources,account_internal.assignment_question_archive_events,account_internal.assignment_authoring_requests from public,anon,authenticated;

create function account_internal.assignment_metadata_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'AUTHORING_HISTORY_IMMUTABLE'; end$$;
create trigger assignment_source_immutable before update or delete on account_internal.assignment_question_sources for each row execute function account_internal.assignment_metadata_immutable();
create trigger assignment_archive_immutable before update or delete on account_internal.assignment_question_archive_events for each row execute function account_internal.assignment_metadata_immutable();

create function account_internal.assignment_rule_text(value text) returns text
language sql immutable set search_path='' as $$select regexp_replace(normalize(coalesce(value,''),NFKC),'\s+','','g')$$;
create function account_internal.assignment_rule_number(value integer) returns text
language sql immutable set search_path='' as $$
 select case when value between 0 and 9 then substr('零一二三四五六七八九',value+1,1)
 when value between 10 and 99 then case when value<20 then '' else substr('零一二三四五六七八九',value/10+1,1) end||'十'||case when value%10=0 then '' else substr('零一二三四五六七八九',value%10+1,1) end end
$$;
create function account_internal.assignment_check_generator(question jsonb, spec jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare rule text:=spec->>'rule'; target text:=spec->>'target'; expected text; prompt text; value text; plain text;
 item jsonb; seen text[]:='{}'; correct_count integer:=0; i integer; captures text[]; subject text; noun text;
begin
 if spec is null or spec='null'::jsonb then return null; end if;
 if jsonb_typeof(spec)<>'object' or (spec-'rule'-'target'-'rule_version')<>'{}'::jsonb
 or spec->>'rule_version' is distinct from 'zh-closed-1' or question->>'kind'<>'mcq' then raise exception 'GENERATOR_UNSUPPORTED'; end if;
 if rule='number' then
  if coalesce(target,'')!~'^[0-9]{1,2}$' then raise exception 'GENERATOR_CONTEXT_REQUIRED'; end if;
  expected:=(target::integer)::text; prompt:='Chọn cách viết bằng chữ Hán của số '||expected||'.';
 elsif rule='weekday' then
  if coalesce(target,'')!~'^[0-6]$' then raise exception 'GENERATOR_CONTEXT_REQUIRED'; end if;
  expected:=target; prompt:='Chọn cách nói “'||(array['Chủ nhật','thứ Hai','thứ Ba','thứ Tư','thứ Năm','thứ Sáu','thứ Bảy'])[target::integer+1]||'” bằng tiếng Trung.';
 elsif rule='pronoun' then
  expected:=case target when 'female' then '她' when 'male' then '他' when 'object' then '它' when 'first' then '我' end;
  if expected is null then raise exception 'GENERATOR_CONTEXT_REQUIRED'; end if;
  prompt:='Chọn đại từ '||case target when 'female' then 'ngôi thứ ba, số ít, chỉ một người nữ' when 'male' then 'ngôi thứ ba, số ít, chỉ một người nam' when 'object' then 'ngôi thứ ba, số ít, chỉ một đồ vật' when 'first' then 'ngôi thứ nhất, số ít' end||' bằng chữ Hán.';
 elsif rule='negate_shi' then
  captures:=regexp_match(account_internal.assignment_rule_text(target),'^(我|你|他|她|我们|你们|他们|她们)是(老师|学生|医生)[。.]?$');
  if captures is null then raise exception 'GENERATOR_CONTEXT_REQUIRED'; end if;
  subject:=captures[1]; noun:=captures[2]; expected:=subject||'不是'||noun;
  prompt:='Chọn câu phủ định giữ nguyên chủ ngữ và nghề/người học của câu “'||subject||'是'||noun||'。”.';
 else raise exception 'GENERATOR_UNSUPPORTED'; end if;
 if account_internal.assignment_rule_text(question->>'prompt')<>account_internal.assignment_rule_text(prompt) then raise exception 'GENERATOR_PROMPT_CHANGED'; end if;
 if jsonb_typeof(question->'options') is distinct from 'array' or jsonb_array_length(question->'options')<>4 then raise exception 'INVALID_OPTIONS'; end if;
 for item in select * from jsonb_array_elements(question->'options') loop
  plain:=account_internal.assignment_rule_text(item->>'text'); value:=null;
  if rule='number' then
   for i in 0..99 loop if replace(plain,'〇','零')=account_internal.assignment_rule_number(i) then value:=i::text; exit; end if; end loop;
  elsif rule='weekday' then
   captures:=regexp_match(plain,'^(星期|周|礼拜)([一二三四五六日天])$');
   if captures is not null then value:=case when captures[2] in ('日','天') then '0' else strpos('零一二三四五六',captures[2])::text end;
    if captures[2] not in ('日','天') then value:=(strpos('零一二三四五六',captures[2])-1)::text; end if;
   end if;
  elsif rule='pronoun' then
   if plain=any(array['我','我们','你','你们','他','他们','她','她们','它','它们']) then value:=plain; end if;
  else
   plain:=regexp_replace(plain,'[。.]$','');
   if plain~'^(我|你|他|她|我们|你们|他们|她们)(是|不是)(老师|学生|医生)$' then value:=plain; end if;
  end if;
  if value is null or value=any(seen) then raise exception 'GENERATOR_INVALID_DISTRACTOR'; end if;
  seen:=array_append(seen,value);
  if value=expected then correct_count:=correct_count+1; end if;
  if (value=expected) is distinct from (item->>'id'=question->'answer_key'->>'value') then raise exception 'GENERATOR_KEY_CHANGED'; end if;
 end loop;
 if correct_count<>1 then raise exception 'GENERATOR_KEY_CHANGED'; end if;
 return spec;
end$$;

create function account_internal.assignment_infer_generator(prompt text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare plain text:=account_internal.assignment_rule_text(prompt); captures text[]; target text; i integer; candidate text;
begin
 captures:=regexp_match(plain,'^ChọncáchviếtbằngchữHáncủasố([0-9]{1,2})\.$');
 if captures is not null then return jsonb_build_object('rule','number','target',captures[1],'rule_version','zh-closed-1'); end if;
 for i in 0..6 loop
  candidate:='Chọn cách nói “'||(array['Chủ nhật','thứ Hai','thứ Ba','thứ Tư','thứ Năm','thứ Sáu','thứ Bảy'])[i+1]||'” bằng tiếng Trung.';
  if plain=account_internal.assignment_rule_text(candidate) then return jsonb_build_object('rule','weekday','target',i::text,'rule_version','zh-closed-1'); end if;
 end loop;
 foreach target in array array['female','male','object','first'] loop
  candidate:='Chọn đại từ '||case target when 'female' then 'ngôi thứ ba, số ít, chỉ một người nữ' when 'male' then 'ngôi thứ ba, số ít, chỉ một người nam' when 'object' then 'ngôi thứ ba, số ít, chỉ một đồ vật' else 'ngôi thứ nhất, số ít' end||' bằng chữ Hán.';
  if plain=account_internal.assignment_rule_text(candidate) then return jsonb_build_object('rule','pronoun','target',target,'rule_version','zh-closed-1'); end if;
 end loop;
 captures:=regexp_match(plain,'^Chọncâuphủđịnhgiữnguyênchủngữvànghề/ngườihọccủacâu“((我|你|他|她|我们|你们|他们|她们)是(老师|学生|医生)。)”\.$');
 if captures is not null then return jsonb_build_object('rule','negate_shi','target',captures[1],'rule_version','zh-closed-1'); end if;
 return null;
end$$;

create function account_internal.assignment_capture_source() returns trigger
language plpgsql set search_path='' as $$
declare meta jsonb; parent public.assignment_question_versions; prior account_internal.assignment_question_sources; generator jsonb;
begin
 meta:=nullif(current_setting('assignment.authoring_metadata',true),'')::jsonb;
 if meta->>'parent_version_id' is not null then
  select * into parent from public.assignment_question_versions where id=(meta->>'parent_version_id')::uuid and lesson_id=new.lesson_id;
  if not found then raise exception 'INVALID_SOURCE_PARENT'; end if;
  select * into prior from account_internal.assignment_question_sources where question_version_id=parent.id;
 elsif new.version>1 then
  select * into parent from public.assignment_question_versions where lesson_id=new.lesson_id and question_key=new.question_key and version=new.version-1;
  select * into prior from account_internal.assignment_question_sources where question_version_id=parent.id;
 end if;
 generator:=coalesce(nullif(meta->'generator','null'::jsonb),account_internal.assignment_infer_generator(new.prompt));
 perform account_internal.assignment_check_generator(to_jsonb(new),generator);
 insert into account_internal.assignment_question_sources(question_version_id,source,source_identifier,source_revision,source_item_id,origin,parent_version_id,generator,recorded_by,recorded_at,imported_by,imported_at,import_request_id)
 values(new.id,coalesce(nullif(meta->>'source',''),prior.source,'admin_manual'),
 coalesce(nullif(meta->>'source_identifier',''),prior.source_identifier,'admin-version:'||new.id),
 coalesce(nullif(meta->>'source_revision',''),prior.source_revision,'1'),
 coalesce(nullif(meta->>'source_item_id',''),prior.source_item_id,new.question_key),
 case when meta->>'origin'='import' then 'import' when prior.question_version_id is not null then 'derived' when generator is not null then 'generated' else 'manual' end,
 parent.id,generator,new.created_by,new.created_at,
 case when meta->>'origin'='import' then new.created_by end,case when meta->>'origin'='import' then new.created_at end,(meta->>'import_request_id')::uuid);
 return new;
end$$;
-- Historic origin cannot be invented. Preserve existing actors/times as recorded facts only.
insert into account_internal.assignment_question_sources(question_version_id,source,source_identifier,source_revision,source_item_id,origin,recorded_by,recorded_at)
 select id,'legacy_unknown','legacy-version:'||id,version::text,question_key,'legacy_unknown',created_by,created_at from public.assignment_question_versions;
create trigger assignment_source_capture after insert on public.assignment_question_versions for each row execute function account_internal.assignment_capture_source();

create function account_internal.assignment_archive_membership_guard() returns trigger
language plpgsql set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('archive:'||new.question_version_id,0));
 if coalesce((select archived from account_internal.assignment_question_archive_events where question_version_id=new.question_version_id order by revision desc limit 1),false)
 then raise exception 'QUESTION_ARCHIVED'; end if;
 return new;
end$$;
create trigger assignment_archive_membership before insert on public.assignment_version_questions for each row execute function account_internal.assignment_archive_membership_guard();

create function account_internal.assignment_authoring(command text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request_id uuid; job account_internal.assignment_authoring_requests; hash text;
 item jsonb; result jsonb; results jsonb:='[]'; expected jsonb:='{}'; preview jsonb;
 source jsonb; lesson text; metadata jsonb; q public.assignment_question_versions; current_version integer; current_archive integer;
 kind text; archive_flag boolean;
begin
 if actor is null or not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
 if command='imports' then
  return coalesce((select jsonb_agg(x) from(select j.id,j.actor,j.state,j.created_at,j.committed_at,j.preview->'source' as source,coalesce(j.response->'count',j.preview->'count') as count from account_internal.assignment_authoring_requests j where j.kind='import' and j.lesson_id=payload->>'lesson_id' order by j.created_at desc limit 20)x),'[]');
 end if;
 if command='bank' then
  result:=account_internal.assignment_command('bank',payload);
  return result||jsonb_build_object('questions',coalesce((select jsonb_agg(x) from (
   select to_jsonb(v)||jsonb_build_object('provenance',to_jsonb(s),'archive',jsonb_build_object('revision',coalesce(a.revision,0),'archived',coalesce(a.archived,false),'reason',a.reason)) x
   from public.assignment_question_versions v left join account_internal.assignment_question_sources s on s.question_version_id=v.id
   left join lateral(select * from account_internal.assignment_question_archive_events where question_version_id=v.id order by revision desc limit 1)a on true
   where v.lesson_id=payload->>'lesson_id' and (coalesce((payload->>'include_archived')::boolean,false) or not coalesce(a.archived,false))
   order by v.created_at desc,v.id limit 20 offset greatest(0,coalesce((payload->>'page')::integer,0))*20
  )t),'[]'));
 end if;
 if command not in ('question_create','import_preview','import_commit','archive') then raise exception 'INVALID_REQUEST'; end if;
 kind:=case when command like 'import_%' then 'import' else command end;
 request_id:=(payload->>'request_id')::uuid;
 if request_id is null then raise exception 'INVALID_REQUEST'; end if;
 hash:=encode(sha256(convert_to((payload-'request_id')::text,'UTF8')),'hex');
 if kind='import' then
  perform pg_advisory_xact_lock(hashtextextended('import-content:'||hash,0));
  select j.response into result from account_internal.assignment_authoring_requests j where j.kind='import' and j.payload_hash=hash and j.state='committed';
  if found then return result||jsonb_build_object('already_imported',true); end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('author-request:'||request_id,0));
 select * into job from account_internal.assignment_authoring_requests where id=request_id for update;
 if found then
  if job.actor<>actor or job.kind<>kind or job.payload_hash<>hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if job.state='committed' then return job.response; end if;
  if command='import_preview' then return job.preview; end if;
 elsif command='import_commit' then raise exception 'PREVIEW_REQUIRED'; end if;
 if command='archive' then
  select * into q from public.assignment_question_versions where id=(payload->>'question_version_id')::uuid;
  if not found or jsonb_typeof(payload->'archived') is distinct from 'boolean' or length(trim(coalesce(payload->>'reason',''))) not between 1 and 1000 then raise exception 'INVALID_REQUEST'; end if;
  lesson:=q.lesson_id;
  perform pg_advisory_xact_lock(hashtextextended('archive:'||q.id,0));
  select coalesce(max(revision),0) into current_archive from account_internal.assignment_question_archive_events where question_version_id=q.id;
  if (payload->>'revision')::integer is distinct from current_archive then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  archive_flag:=(payload->>'archived')::boolean;
  insert into account_internal.assignment_question_archive_events values(q.id,current_archive+1,archive_flag,trim(payload->>'reason'),actor,clock_timestamp());
  perform account_internal.assignment_audit(case when archive_flag then 'question_archived' else 'question_unarchived' end,q.id,jsonb_build_object('revision',current_archive+1,'reason',payload->>'reason'));
  result:=jsonb_build_object('question_version_id',q.id,'revision',current_archive+1,'archived',archive_flag);
 elsif command='question_create' then
  lesson:=payload->'question'->>'lesson_id';
  metadata:=coalesce(payload->'metadata','{}');
  if jsonb_typeof(metadata)<>'object' or (metadata-'source'-'source_identifier'-'source_revision'-'source_item_id'-'parent_version_id'-'generator')<>'{}' then raise exception 'INVALID_SOURCE'; end if;
  perform set_config('assignment.authoring_metadata',metadata::text,true);
  result:=account_internal.assignment_command('question_create',payload->'question');
  perform set_config('assignment.authoring_metadata','',true);
 else
  source:=payload->'source'; lesson:=payload->>'lesson_id';
  if jsonb_typeof(source) is distinct from 'object' or (source-'source'-'source_identifier'-'source_revision')<>'{}'
   or length(trim(coalesce(source->>'source',''))) not between 1 and 120
   or length(trim(coalesce(source->>'source_identifier',''))) not between 1 and 1000
   or length(trim(coalesce(source->>'source_revision',''))) not between 1 and 120 then raise exception 'INVALID_SOURCE'; end if;
  if jsonb_typeof(payload->'questions') is distinct from 'array' then raise exception 'INVALID_QUESTIONS'; end if;
  if jsonb_array_length(payload->'questions') not between 1 and 200
   or (select count(distinct x->>'question_key') from jsonb_array_elements(payload->'questions')x)<>jsonb_array_length(payload->'questions')
   or (select count(distinct x->>'source_item_id') from jsonb_array_elements(payload->'questions')x)<>jsonb_array_length(payload->'questions') then raise exception 'INVALID_QUESTIONS'; end if;
  -- Same sorted locks as question_create, avoiding cross-key import deadlocks.
  for item in select x from jsonb_array_elements(payload->'questions')x order by x->>'question_key' loop
   perform pg_advisory_xact_lock(hashtextextended('question:'||lesson||':'||(item->>'question_key'),0));
  end loop;
  if command='import_preview' then
   begin
    for item in select * from jsonb_array_elements(payload->'questions') loop
     if length(trim(coalesce(item->>'source_item_id',''))) not between 1 and 120 or (item-'question_key'-'kind'-'prompt'-'options'-'answer_key'-'explanation'-'tip'-'rubric_version_id'-'source_item_id'-'generator')<>'{}' then raise exception 'INVALID_SOURCE'; end if;
     metadata:=source||jsonb_build_object('source_item_id',item->>'source_item_id','origin','import','generator',item->'generator','import_request_id',request_id);
     perform set_config('assignment.authoring_metadata',metadata::text,true);
     result:=account_internal.assignment_command('question_create',(item-'source_item_id'-'generator')||jsonb_build_object('lesson_id',lesson));
     expected:=expected||jsonb_build_object(item->>'question_key',(result->>'version')::integer-1);
     results:=results||jsonb_build_array(result-'id'-'created_at'-'created_by');
    end loop;
    raise exception 'AUTHOR_PREVIEW_ROLLBACK';
   exception when raise_exception then if SQLERRM<>'AUTHOR_PREVIEW_ROLLBACK' then raise; end if; end;
   preview:=jsonb_build_object('request_id',request_id,'count',jsonb_array_length(results),'source',source,'questions',results,'expected_versions',expected);
   insert into account_internal.assignment_authoring_requests(id,actor,lesson_id,kind,payload_hash,state,expected_versions,preview) values(request_id,actor,lesson,kind,hash,'preview',expected,preview);
   return preview;
  end if;
  for item in select * from jsonb_array_elements(payload->'questions') loop
   select coalesce(max(version),0) into current_version from public.assignment_question_versions where lesson_id=lesson and question_key=item->>'question_key';
   if (job.expected_versions->> (item->>'question_key'))::integer is distinct from current_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
   metadata:=source||jsonb_build_object('source_item_id',item->>'source_item_id','origin','import','generator',item->'generator','import_request_id',request_id);
   perform set_config('assignment.authoring_metadata',metadata::text,true);
   result:=account_internal.assignment_command('question_create',(item-'source_item_id'-'generator')||jsonb_build_object('lesson_id',lesson));
   results:=results||jsonb_build_array(result);
  end loop;
  perform set_config('assignment.authoring_metadata','',true);
  result:=jsonb_build_object('request_id',request_id,'count',jsonb_array_length(results),'questions',results);
  perform account_internal.assignment_audit('questions_imported',request_id,jsonb_build_object('source',source,'count',jsonb_array_length(results)));
 end if;
 if job.id is not null then update account_internal.assignment_authoring_requests set state='committed',response=result,committed_at=clock_timestamp() where id=request_id;
 else insert into account_internal.assignment_authoring_requests(id,actor,lesson_id,kind,payload_hash,state,response,committed_at) values(request_id,actor,lesson,kind,hash,'committed',result,clock_timestamp()); end if;
 return result;
end$$;
create function public.assignment_authoring(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select account_internal.assignment_authoring(command,payload)$$;
revoke all on function account_internal.assignment_metadata_immutable(),account_internal.assignment_rule_text(text),account_internal.assignment_rule_number(integer),account_internal.assignment_check_generator(jsonb,jsonb),account_internal.assignment_infer_generator(text),account_internal.assignment_capture_source(),account_internal.assignment_archive_membership_guard(),account_internal.assignment_authoring(text,jsonb),public.assignment_authoring(text,jsonb) from public,anon,authenticated;
grant execute on function account_internal.assignment_authoring(text,jsonb),public.assignment_authoring(text,jsonb) to authenticated;
notify pgrst,'reload schema';
