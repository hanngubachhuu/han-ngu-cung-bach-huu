-- Admin-opened recovery for any official lesson/exam submission. Frozen received
-- answers, source versions, original timing and published results are preserved.
create table account_internal.assignment_makeup_windows (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 attempt_id uuid not null references public.submission_details(attempt_id),
 owner_id uuid not null references public.profiles(user_id),
 assignment_version_id uuid not null references public.assignment_versions(id),
 missing uuid[] not null check(cardinality(missing)>0),accepted jsonb not null,
 opened_by uuid not null references public.profiles(user_id),opened_at timestamptz not null,
 expires_at timestamptz not null,check(expires_at>opened_at and expires_at<=opened_at+interval '4 hours')
);
create table account_internal.assignment_makeup_answers (
 window_id uuid not null references account_internal.assignment_makeup_windows(id),
 question_version_id uuid not null references public.assignment_question_versions(id),
 request_id uuid not null unique,answer jsonb not null check(answer<>'null'::jsonb),
 received_at timestamptz not null,primary key(window_id,question_version_id)
);
create table account_internal.assignment_makeup_recordings (
 window_id uuid not null references account_internal.assignment_makeup_windows(id),
 question_version_id uuid not null references public.assignment_question_versions(id),
 recording_id uuid not null unique references account_internal.speaking_recordings(id),
 primary key(window_id,question_version_id)
);
create table account_internal.assignment_makeup_receipts (
 window_id uuid primary key references account_internal.assignment_makeup_windows(id),
 result_revision integer not null,received_at timestamptz not null,received_by uuid not null references public.profiles(user_id)
);
alter table account_internal.assignment_makeup_windows enable row level security;
alter table account_internal.assignment_makeup_answers enable row level security;
alter table account_internal.assignment_makeup_recordings enable row level security;
alter table account_internal.assignment_makeup_receipts enable row level security;
revoke all on account_internal.assignment_makeup_windows,account_internal.assignment_makeup_answers,
 account_internal.assignment_makeup_recordings,account_internal.assignment_makeup_receipts from public,anon,authenticated,service_role;
create trigger assignment_makeup_window_immutable before update or delete on account_internal.assignment_makeup_windows for each row execute function account_internal.assignment_metadata_immutable();
create trigger assignment_makeup_answer_immutable before update or delete on account_internal.assignment_makeup_answers for each row execute function account_internal.assignment_metadata_immutable();
create trigger assignment_makeup_recording_immutable before update or delete on account_internal.assignment_makeup_recordings for each row execute function account_internal.assignment_metadata_immutable();
create trigger assignment_makeup_receipt_immutable before update or delete on account_internal.assignment_makeup_receipts for each row execute function account_internal.assignment_metadata_immutable();

create function account_internal.assignment_makeup_write_allowed(attempt uuid,question uuid,value jsonb) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from account_internal.assignment_makeup_windows w
  join account_internal.assignment_makeup_answers ma on ma.window_id=w.id and ma.question_version_id=question and ma.answer=value
  join public.submission_details d on d.attempt_id=w.attempt_id and d.assignment_version_id=w.assignment_version_id
  join public.learning_attempts a on a.id=d.attempt_id and a.user_id=w.owner_id
  join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
  where w.attempt_id=attempt and w.owner_id=auth.uid() and question=any(w.missing) and w.expires_at>clock_timestamp()
   and account_internal.can_access_lesson(a.lesson_id)
   and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id)
   and not exists(select 1 from jsonb_each(w.accepted) x left join public.submission_answers sa on sa.attempt_id=w.attempt_id and sa.question_version_id=x.key::uuid where sa.answer is distinct from x.value));
$$;
revoke all on function account_internal.assignment_makeup_write_allowed(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.assignment_makeup(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();a public.learning_attempts;d public.submission_details;
 w account_internal.assignment_makeup_windows;q public.assignment_question_versions;r account_internal.speaking_recordings;
 ma account_internal.assignment_makeup_answers;o storage.objects;missing_ids uuid[];accepted_answers jsonb;
 request uuid;now_at timestamptz;result jsonb;answer_value jsonb;qid uuid;revision_number integer;exam_code text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>20000 then raise exception 'INVALID_REQUEST';end if;
 if command in ('inspect','open') then
  if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 else
  if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
 end if;
 select * into a from public.learning_attempts where id=coalesce((payload->>'attempt_id')::uuid,
  (select attempt_id from account_internal.assignment_makeup_windows where id=(payload->>'window_id')::uuid));
 if a.id is null or a.source<>'official' or (command not in ('inspect','open') and a.user_id<>actor) then raise exception 'ATTEMPT_NOT_FOUND' using errcode='42501';end if;
 select dv.exam_id into exam_code from account_internal.hskk_sessions hs join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=hs.assignment_version_id where hs.attempt_id=a.id;
 if exam_code is not null then
  if command not in ('inspect','open') then raise exception 'HSKK_TRANSPORT_REQUIRED';end if;
  result:=public.hskk_makeup(command,payload||jsonb_build_object('student_id',a.user_id,'exam_code',exam_code));
  return result||jsonb_build_object('hskk',true,'exam_code',exam_code);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('assignment-makeup:'||a.id::text,0));
 select * into d from public.submission_details where attempt_id=a.id for update;
 if d.attempt_id is null then raise exception 'ATTEMPT_NOT_FOUND';end if;
 now_at:=clock_timestamp();
 select coalesce(array_agg(question_version_id order by position),'{}') into missing_ids from public.submission_answers where attempt_id=a.id and answer='null'::jsonb;
 select coalesce(jsonb_object_agg(question_version_id::text,answer),'{}') into accepted_answers from public.submission_answers where attempt_id=a.id and answer<>'null'::jsonb;
 select * into w from account_internal.assignment_makeup_windows where attempt_id=a.id and (payload->>'window_id' is null or id=(payload->>'window_id')::uuid) order by opened_at desc,id desc limit 1;
 if command='inspect' then
  return jsonb_build_object('attempt_id',a.id,'version_id',d.assignment_version_id,'revision',d.revision,'missing',missing_ids,
   'missing_numbers',(select jsonb_agg(position order by position) from public.submission_answers where attempt_id=a.id and question_version_id=any(missing_ids)),
   'can_open',cardinality(missing_ids)>0,'window_id',case when w.expires_at>now_at and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id) then w.id end,'last_window_id',w.id,'expires_at',w.expires_at);
 elsif command='open' then
  request:=(payload->>'request_id')::uuid;
  if request is null then raise exception 'INVALID_REQUEST';end if;
  select * into w from account_internal.assignment_makeup_windows where request_id=request;
  if w.id is not null then
   if w.attempt_id<>a.id then raise exception 'VERSION_CONFLICT';end if;
   return jsonb_build_object('window_id',w.id,'attempt_id',a.id,'expires_at',w.expires_at,'reused',true);
  end if;
  if exists(select 1 from account_internal.assignment_makeup_windows x where x.attempt_id=a.id and x.expires_at>now_at and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=x.id)) then raise exception 'MAKEUP_ALREADY_OPEN';end if;
  if cardinality(missing_ids)=0 then raise exception 'MAKEUP_NOT_AVAILABLE';end if;
  if d.revision is distinct from (payload->>'expected_revision')::integer or d.assignment_version_id is distinct from (payload->>'expected_version_id')::uuid or to_jsonb(missing_ids) is distinct from payload->'expected_missing' then raise exception 'VERSION_CONFLICT';end if;
  if not exists(select 1 from public.profiles where user_id=a.user_id and role='STUDENT' and status='APPROVED')
   or not exists(select 1 from public.enrollments en join public.lesson_content l on l.course_id=en.course_id where l.id=a.lesson_id and en.user_id=a.user_id and en.active and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access ac where ac.user_id=a.user_id and ac.lesson_id=l.id and ac.active))) then raise exception 'LESSON_ACCESS_REQUIRED';end if;
  insert into account_internal.assignment_makeup_windows(request_id,attempt_id,owner_id,assignment_version_id,missing,accepted,opened_by,opened_at,expires_at)
   values(request,a.id,a.user_id,d.assignment_version_id,missing_ids,accepted_answers,actor,now_at,now_at+interval '4 hours') returning * into w;
  perform account_internal.assignment_audit('makeup_opened',a.id,jsonb_build_object('window_id',w.id,'missing',missing_ids,'expires_at',w.expires_at));
  return jsonb_build_object('window_id',w.id,'attempt_id',a.id,'expires_at',w.expires_at,'reused',false);
 end if;
 if w.id is null or w.owner_id<>actor or not account_internal.can_access_lesson(a.lesson_id) then raise exception 'MAKEUP_NOT_AVAILABLE' using errcode='42501';end if;
 if command='load' then
  result:=account_internal.assignment_read(a.id,false);
  return (result-'grading'-'result')||jsonb_build_object('window_id',w.id,'expires_at',w.expires_at,'expired',now_at>=w.expires_at,'server_time',now_at,
   'submitted',exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id),
   'accepted_count',(select count(*) from jsonb_object_keys(w.accepted)),
   'answers',(select jsonb_agg(x order by (x->>'position')::integer) from jsonb_array_elements(result->'answers') x where (x->'question'->>'id')::uuid=any(w.missing)));
 end if;
 if exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id) then
  if command='submit' then return jsonb_build_object('submitted',true,'attempt_id',a.id);end if;
  raise exception 'SUBMISSION_LOCKED';
 end if;
 if now_at>=w.expires_at then raise exception 'UPLOAD_WINDOW_EXPIRED';end if;
 if exists(select 1 from jsonb_each(w.accepted) x left join public.submission_answers sa on sa.attempt_id=a.id and sa.question_version_id=x.key::uuid where sa.answer is distinct from x.value) then raise exception 'VERSION_CONFLICT';end if;
 qid:=(payload->>'question_version_id')::uuid;
 if command in ('save','reserve') then
  if qid is null or not qid=any(w.missing) then raise exception 'RECORDING_LOCKED';end if;
  select * into q from public.assignment_question_versions where id=qid;
 end if;
 if command='reserve' then
  if q.kind<>'speaking' then raise exception 'INVALID_RECORDING_REFERENCE';end if;
  request:=(payload->>'request_id')::uuid;
  select sr.* into r from account_internal.speaking_recordings sr join account_internal.assignment_makeup_recordings mr on mr.recording_id=sr.id where mr.window_id=w.id and mr.question_version_id=qid;
  if r.id is not null then
   if row(r.request_id,r.raw_sha256,r.raw_size,r.raw_mime) is distinct from row(request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime') then raise exception 'RECORDING_LOCKED';end if;
  else
   if exists(select 1 from public.submission_answers where attempt_id=a.id and question_version_id=qid and answer<>'null'::jsonb) then raise exception 'RECORDING_LOCKED';end if;
   insert into account_internal.speaking_recordings(attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline) values(a.id,qid,actor,request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime',w.expires_at) returning * into r;
   insert into account_internal.assignment_makeup_recordings values(w.id,qid,r.id);
   perform account_internal.speaking_event(r.id,'assignment_makeup_reserved');
  end if;
  return jsonb_build_object('id',r.id,'path',r.id::text||'/raw','bucket','speaking-private','raw_uploaded_at',r.raw_uploaded_at,'upload_deadline',r.upload_deadline);
 elsif command='confirm' then
  select sr.* into r from account_internal.speaking_recordings sr join account_internal.assignment_makeup_recordings mr on mr.recording_id=sr.id where mr.window_id=w.id and sr.id=(payload->>'recording_id')::uuid and sr.owner_id=actor for update of sr;
  if r.id is null then raise exception 'INVALID_RECORDING_REFERENCE';end if;
  if r.raw_uploaded_at is null then
   select * into o from storage.objects where bucket_id='speaking-private' and name=r.id::text||'/raw';
   if o.id is null or (o.metadata->>'size')::bigint is distinct from r.raw_size::bigint or split_part(o.metadata->>'mimetype',';',1) is distinct from r.raw_mime then raise exception 'UPLOAD_NOT_CONFIRMED';end if;
   update account_internal.speaking_recordings set raw_uploaded_at=now_at,raw_object_id=o.id where id=r.id;
   perform account_internal.speaking_event(r.id,'assignment_makeup_confirmed');
  end if;
  return jsonb_build_object('id',r.id,'recording_id',r.id);
 elsif command='save' then
  request:=(payload->>'request_id')::uuid;answer_value:=payload->'answer';
  if request is null or answer_value is null or answer_value='null'::jsonb then raise exception 'INVALID_ANSWER';end if;
  select * into ma from account_internal.assignment_makeup_answers where window_id=w.id and question_version_id=qid;
  if ma.window_id is not null then
   if ma.request_id is distinct from request or ma.answer is distinct from answer_value then raise exception 'RECORDING_LOCKED';end if;
   return jsonb_build_object('saved',true,'question_version_id',qid,'reused',true);
  end if;
  if exists(select 1 from public.submission_answers where attempt_id=a.id and question_version_id=qid and answer<>'null'::jsonb) then raise exception 'RECORDING_LOCKED';end if;
  if q.kind in ('mcq','text_fill','translation','writing') and jsonb_typeof(answer_value)<>'string' or q.kind in ('multi_fill','reorder') and jsonb_typeof(answer_value)<>'array' or q.kind='true_false' and jsonb_typeof(answer_value)<>'boolean' or q.kind='matching' and jsonb_typeof(answer_value)<>'object' then raise exception 'INVALID_ANSWER';end if;
  if q.kind='speaking' then perform account_internal.speaking_check_answer(a.id,qid,answer_value);end if;
  insert into account_internal.assignment_makeup_answers values(w.id,qid,request,answer_value,now_at);
  update public.submission_answers set answer=answer_value where attempt_id=a.id and question_version_id=qid;
  if d.state='draft' then update public.submission_details set revision=revision+1 where attempt_id=a.id;end if;
  perform account_internal.assignment_audit('makeup_answer_received',a.id,jsonb_build_object('window_id',w.id,'question_version_id',qid,'received_at',now_at));
  return jsonb_build_object('saved',true,'question_version_id',qid,'reused',false);
 elsif command='submit' then
  if cardinality(missing_ids)<>0 then raise exception 'MAKEUP_INCOMPLETE';end if;
  for q in select qv.* from public.submission_answers sa join public.assignment_question_versions qv on qv.id=sa.question_version_id where sa.attempt_id=a.id and qv.kind='speaking' loop
   perform account_internal.speaking_check_answer(a.id,q.id,(select answer from public.submission_answers where attempt_id=a.id and question_version_id=q.id));
  end loop;
  select coalesce(max(revision),0)+1 into revision_number from public.submission_results where attempt_id=a.id;
  if d.state='draft' then
   update public.submission_details set state='submitted',revision=revision+1,timed_out=d.deadline_at is not null and now_at>=d.deadline_at,duration_seconds=greatest(0,floor(extract(epoch from(least(now_at,coalesce(d.deadline_at,now_at))-d.started_at)))::integer) where attempt_id=a.id;
   update public.learning_attempts set submitted_at=now_at where id=a.id;
  end if;
  insert into public.submission_results(attempt_id,revision,reason,created_by) values(a.id,revision_number,'Admin-authorized missing-answer makeup',actor);
  insert into public.submission_grades(attempt_id,revision,question_version_id,grading_question_version_id,rubric_version_id,score,feedback,criteria_scores,method,graded_by,graded_at)
   select a.id,revision_number,qv.id,coalesce(g.grading_question_version_id,qv.id),qv.rubric_version_id,
    case when sa.question_version_id=any(w.missing) then account_internal.assignment_score(qv.kind,qv.answer_key,sa.answer) else coalesce(g.score,account_internal.assignment_score(qv.kind,qv.answer_key,sa.answer)) end,
    case when sa.question_version_id=any(w.missing) then '' else coalesce(g.feedback,'') end,
    case when sa.question_version_id=any(w.missing) then '{}'::jsonb else coalesce(g.criteria_scores,'{}'::jsonb) end,
    case when qv.rubric_version_id is null then 'automatic' else 'manual' end,
    case when not sa.question_version_id=any(w.missing) then g.graded_by end,
    case when qv.rubric_version_id is null then now_at when not sa.question_version_id=any(w.missing) then g.graded_at end
   from public.submission_answers sa join public.assignment_question_versions qv on qv.id=sa.question_version_id
   left join public.submission_grades g on g.attempt_id=a.id and g.question_version_id=sa.question_version_id and g.revision=revision_number-1 where sa.attempt_id=a.id;
  insert into account_internal.assignment_makeup_receipts values(w.id,revision_number,now_at,actor);
  perform account_internal.assignment_audit('makeup_submitted',a.id,jsonb_build_object('window_id',w.id,'received_at',now_at,'result_revision',revision_number,'missing',w.missing));
  return jsonb_build_object('submitted',true,'attempt_id',a.id,'received_at',now_at,'result_revision',revision_number);
 end if;
 raise exception 'INVALID_REQUEST';
end $$;
revoke all on function public.assignment_makeup(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.assignment_makeup(text,jsonb) to authenticated;

alter function account_internal.recording_command(text,jsonb) rename to recording_command_before_assignment_makeup;
create function account_internal.recording_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare window_id uuid;result jsonb;
begin
 if command='get' and not account_internal.is_admin() and exists(select 1 from account_internal.assignment_makeup_recordings where recording_id=(payload->>'recording_id')::uuid) then
  result:=account_internal.recording_command_before_assignment_makeup(command,payload);return result-'playback_path'-'raw_path';
 end if;
 if command='reserve' and payload->>'assignment_makeup_window_id' is not null then return public.assignment_makeup('reserve',payload||jsonb_build_object('window_id',payload->>'assignment_makeup_window_id'));end if;
 if command='confirm' then
  select mr.window_id into window_id from account_internal.assignment_makeup_recordings mr where recording_id=(payload->>'recording_id')::uuid;
  if window_id is not null then return public.assignment_makeup('confirm',payload||jsonb_build_object('window_id',window_id));end if;
 end if;
 return account_internal.recording_command_before_assignment_makeup(command,payload);
end $$;
revoke all on function account_internal.recording_command_before_assignment_makeup(text,jsonb),account_internal.recording_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function account_internal.recording_command(text,jsonb) to authenticated;

-- Preserve the function OID referenced by existing Storage policies.
do $copy$ begin execute replace(pg_get_functiondef('account_internal.speaking_object_allowed(text,boolean)'::regprocedure),'FUNCTION account_internal.speaking_object_allowed(', 'FUNCTION account_internal.speaking_object_allowed_before_assignment_makeup(');end $copy$;
create or replace function account_internal.speaking_object_allowed(object_name text,write_object boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not write_object and not account_internal.is_admin() and exists(select 1 from account_internal.assignment_makeup_recordings mr where split_part(object_name,'/',1)=mr.recording_id::text) then return false;end if;
 if write_object and object_name ~ '^[0-9a-f-]{36}/raw$' and exists(
  select 1 from account_internal.assignment_makeup_recordings mr join account_internal.assignment_makeup_windows w on w.id=mr.window_id
  join account_internal.speaking_recordings r on r.id=mr.recording_id join public.learning_attempts a on a.id=w.attempt_id
  join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
  where object_name=r.id::text||'/raw' and r.owner_id=auth.uid() and w.owner_id=auth.uid() and w.expires_at>clock_timestamp()
   and r.raw_uploaded_at is null and r.upload_deadline>clock_timestamp() and account_internal.can_access_lesson(a.lesson_id)
   and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id)
 ) then return true;end if;
 return account_internal.speaking_object_allowed_before_assignment_makeup(object_name,write_object);
end $$;
revoke all on function account_internal.speaking_object_allowed_before_assignment_makeup(text,boolean),account_internal.speaking_object_allowed(text,boolean) from public,anon,authenticated,service_role;
grant execute on function account_internal.speaking_object_allowed(text,boolean) to authenticated;

alter function account_internal.assignment_command(text,jsonb) rename to assignment_command_before_assignment_makeup;
create function account_internal.assignment_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if command='get' and exists(select 1 from account_internal.assignment_makeup_windows w where w.attempt_id=(payload->>'attempt_id')::uuid and w.expires_at>clock_timestamp() and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id)) then
  if not account_internal.is_admin() and not exists(select 1 from public.learning_attempts a where a.id=(payload->>'attempt_id')::uuid and a.user_id=auth.uid() and account_internal.can_access_lesson(a.lesson_id)) then raise exception 'ATTEMPT_NOT_FOUND' using errcode='42501';end if;
  return account_internal.assignment_read((payload->>'attempt_id')::uuid,account_internal.is_admin());
 end if;
 if not account_internal.is_admin() and command in ('save','submit','retry_late') and exists(select 1 from account_internal.assignment_makeup_windows w
  where w.attempt_id=(payload->>'attempt_id')::uuid and w.expires_at>clock_timestamp() and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id)) then raise exception 'MAKEUP_TRANSPORT_REQUIRED';end if;
 result:=account_internal.assignment_command_before_assignment_makeup(command,payload);
 if command='mine' then
  select coalesce(jsonb_agg(x||coalesce((select jsonb_build_object('makeup_window_id',w.id) from account_internal.assignment_makeup_windows w where w.attempt_id=(x->>'id')::uuid and w.owner_id=auth.uid() and w.expires_at>clock_timestamp() and not exists(select 1 from account_internal.assignment_makeup_receipts where window_id=w.id) order by w.opened_at desc limit 1),
   (select jsonb_build_object('makeup_window_id',w.id,'makeup_exam_code',dv.exam_id) from account_internal.hskk_makeup_windows w join public.submission_details d on d.attempt_id=w.attempt_id join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=w.assignment_version_id where w.attempt_id=(x->>'id')::uuid and w.owner_id=auth.uid() and w.expires_at>clock_timestamp() and d.state='draft' order by w.opened_at desc limit 1),'{}'::jsonb) order by ord),'[]'::jsonb) into result from jsonb_array_elements(result) with ordinality as items(x,ord);
 end if;
 return result;
end $$;
revoke all on function account_internal.assignment_command_before_assignment_makeup(text,jsonb),account_internal.assignment_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function account_internal.assignment_command(text,jsonb) to authenticated;

alter function account_internal.assignment_read(uuid,boolean) rename to assignment_read_before_assignment_makeup;
create function account_internal.assignment_read(attempt uuid,administrator boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;receipt jsonb;
begin
 result:=account_internal.assignment_read_before_assignment_makeup(attempt,administrator);
 if administrator and account_internal.is_admin() then
  select jsonb_build_object('received_at',rc.received_at,'window_id',w.id,'opened_by',w.opened_by,'opened_at',w.opened_at,
   'questions',(select jsonb_agg(sa.position order by sa.position) from public.submission_answers sa where sa.attempt_id=w.attempt_id and sa.question_version_id=any(w.missing)))
   into receipt from account_internal.assignment_makeup_receipts rc join account_internal.assignment_makeup_windows w on w.id=rc.window_id where w.attempt_id=attempt order by rc.received_at desc limit 1;
  if receipt is not null then result:=result||jsonb_build_object('makeup',receipt);end if;
 end if;
 return result;
end $$;
revoke all on function account_internal.assignment_read_before_assignment_makeup(uuid,boolean),account_internal.assignment_read(uuid,boolean) from public,anon,authenticated,service_role;

-- Forward correction: keep original deadline and accepted history immutable.
create or replace function account_internal.assignment_history_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_OP='INSERT' then
  if TG_TABLE_NAME='assignment_version_questions' then
   if exists(
    select 1 from public.assignment_versions v where v.id=new.assignment_version_id and v.status='published')
    then raise exception 'VERSION_IMMUTABLE'; end if;
  elsif TG_TABLE_NAME='submission_answers' then
   if exists(
    select 1 from public.submission_details d where d.attempt_id=new.attempt_id
      and (d.state<>'draft' or d.deadline_at<=clock_timestamp())) then raise exception 'SUBMISSION_LOCKED'; end if;
  elsif TG_TABLE_NAME='submission_grades' then
   if exists(
    select 1 from public.submission_results r where r.attempt_id=new.attempt_id and r.revision=new.revision and r.state='published')
    then raise exception 'PUBLICATION_IMMUTABLE'; end if;
  end if;
  return new;
 end if;
 if TG_TABLE_NAME='assignment_rubric_versions' then raise exception 'VERSION_IMMUTABLE'; end if;
 if TG_TABLE_NAME='assignment_question_versions' then
  if (to_jsonb(new)-'published_at'-'published_by') is distinct from (to_jsonb(old)-'published_at'-'published_by')
    or old.published_at is not null then raise exception 'VERSION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='assignment_versions' then
  if old.status='published' or (to_jsonb(new)-'previewed_at'-'published_at'-'published_by'-'status')
    is distinct from (to_jsonb(old)-'previewed_at'-'published_at'-'published_by'-'status') then raise exception 'VERSION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='assignment_version_questions' then raise exception 'VERSION_IMMUTABLE';
 elsif TG_TABLE_NAME='submission_answers' then
  if old.answer='null'::jsonb and (to_jsonb(new)-'answer')=(to_jsonb(old)-'answer')
   and account_internal.assignment_makeup_write_allowed(old.attempt_id,old.question_version_id,new.answer) then return new;end if;
  -- Only a verified missing-answer binding in an immutable Admin-opened window
  -- may cross the original deadline. Every other history guard is unchanged.
  if old.answer='null'::jsonb and jsonb_typeof(new.answer)='object'
   and (new.answer-'recording_id')='{}'::jsonb
   and (to_jsonb(new)-'answer')=(to_jsonb(old)-'answer')
   and exists(
    select 1 from account_internal.hskk_makeup_windows w
    join account_internal.hskk_makeup_records m on m.window_id=w.id and m.question_version_id=old.question_version_id
    join account_internal.speaking_recordings r on r.id=m.recording_id and r.id=(new.answer->>'recording_id')::uuid
    join public.submission_details d on d.attempt_id=w.attempt_id and d.assignment_version_id=w.assignment_version_id and d.state='draft'
    join public.learning_attempts a on a.id=d.attempt_id and a.user_id=w.owner_id
    join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
    where w.attempt_id=old.attempt_id and w.owner_id=auth.uid() and old.question_version_id=any(w.missing)
     and w.expires_at>clock_timestamp() and r.attempt_id=w.attempt_id and r.owner_id=w.owner_id and r.question_version_id=old.question_version_id
     and r.raw_uploaded_at is not null and r.raw_uploaded_at<r.upload_deadline and r.cleaned_at is null
     and (r.expires_at is null or r.expires_at>clock_timestamp()) and account_internal.can_access_lesson(a.lesson_id)
     and exists(select 1 from account_internal.hskk_controlled_access ca where ca.exam_id=(select dv.exam_id from account_internal.hskk_delivery_versions dv where dv.assignment_version_id=w.assignment_version_id) and ca.owner_id=w.owner_id)
   ) then return new;end if;
  if (to_jsonb(new)-'answer') is distinct from (to_jsonb(old)-'answer') or exists(
   select 1 from public.submission_details d where d.attempt_id=old.attempt_id
     and (d.state<>'draft' or d.deadline_at<=clock_timestamp())) then raise exception 'SUBMISSION_LOCKED'; end if;
 elsif TG_TABLE_NAME='submission_details' then
  if old.state='submitted' or new.attempt_id<>old.attempt_id or new.assignment_version_id<>old.assignment_version_id
    or new.started_at<>old.started_at or new.deadline_at is distinct from old.deadline_at then raise exception 'SUBMISSION_LOCKED'; end if;
 elsif TG_TABLE_NAME='submission_results' then
  if old.state='published' then raise exception 'PUBLICATION_IMMUTABLE'; end if;
 elsif TG_TABLE_NAME='submission_grades' then
  if exists(select 1 from public.submission_results r where r.attempt_id=old.attempt_id and r.revision=old.revision and r.state='published')
    then raise exception 'PUBLICATION_IMMUTABLE'; end if;
 end if;
 return new;
end $$;
revoke all on function account_internal.assignment_history_guard() from public,anon,authenticated;

notify pgrst,'reload schema';

-- Timed HSKK recovery uses its pinned exam and actual question count.
create or replace function public.hskk_makeup(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();s account_internal.hskk_sessions;d public.submission_details;
 w account_internal.hskk_makeup_windows;r account_internal.speaking_recordings;t account_internal.hskk_makeup_timing;
 qid uuid;request uuid;missing_ids uuid[];accepted_answers jsonb;now_at timestamptz;
 answer public.submission_answers;q account_internal.hskk_delivery_questions;o storage.objects;cfg jsonb;retained boolean;current_exam text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>12000 then raise exception 'INVALID_REQUEST';end if;
 if command in ('inspect','open') then
  if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  if not exists(select 1 from account_internal.hskk_delivery_versions where exam_id=payload->>'exam_code') then raise exception 'INVALID_REQUEST';end if;
  select h.* into s from account_internal.hskk_sessions h join account_internal.hskk_delivery_versions v on v.assignment_version_id=h.assignment_version_id
   where v.exam_id=payload->>'exam_code' and h.owner_id=(payload->>'student_id')::uuid
    and (payload->>'attempt_id' is null or h.attempt_id=(payload->>'attempt_id')::uuid)
   order by h.started_at desc limit 1;
 else
  if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
  select * into s from account_internal.hskk_sessions where attempt_id=coalesce((payload->>'attempt_id')::uuid,
   (select attempt_id from account_internal.hskk_makeup_windows where id=(payload->>'makeup_window_id')::uuid),
   (select attempt_id from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid));
  if s.owner_id is distinct from actor then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 end if;
 if s.attempt_id is null or not exists(select 1 from account_internal.hskk_delivery_versions where assignment_version_id=s.assignment_version_id)
 then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 select exam_id into current_exam from account_internal.hskk_delivery_versions where assignment_version_id=s.assignment_version_id;
 perform pg_advisory_xact_lock(hashtextextended('hskk-makeup:'||s.attempt_id::text,0));
 select * into d from public.submission_details where attempt_id=s.attempt_id for update;
 now_at:=clock_timestamp();
 select coalesce(array_agg(a.question_version_id order by a.position),'{}') into missing_ids from public.submission_answers a
  where a.attempt_id=s.attempt_id and a.answer='null'::jsonb;
 select coalesce(jsonb_object_agg(a.question_version_id::text,a.answer),'{}') into accepted_answers from public.submission_answers a
  where a.attempt_id=s.attempt_id and a.answer<>'null'::jsonb;
 select * into w from account_internal.hskk_makeup_windows where attempt_id=s.attempt_id
  and (payload->>'makeup_window_id' is null or id=(payload->>'makeup_window_id')::uuid)
  order by opened_at desc,id desc limit 1;
 if command='inspect' then
  return jsonb_build_object('attempt_id',s.attempt_id,'revision',d.revision,'version_id',s.assignment_version_id,
   'missing',missing_ids,'missing_numbers',(select jsonb_agg(position order by position) from public.submission_answers where attempt_id=s.attempt_id and question_version_id=any(missing_ids)),
   'can_open',d.state='draft' and now_at>=s.upload_deadline and cardinality(missing_ids)>0,
   'window_id',case when w.expires_at>now_at and d.state='draft' then w.id end,'last_window_id',w.id,'expires_at',w.expires_at);
 end if;
 if command='open' then
  request:=(payload->>'request_id')::uuid;
  if request is null then raise exception 'INVALID_REQUEST';end if;
  select * into w from account_internal.hskk_makeup_windows where request_id=request;
  if w.id is not null then
   if w.attempt_id<>s.attempt_id then raise exception 'VERSION_CONFLICT';end if;
   return jsonb_build_object('window_id',w.id,'attempt_id',w.attempt_id,'expires_at',w.expires_at,'missing',w.missing,'reused',true);
  end if;
  select * into w from account_internal.hskk_makeup_windows where attempt_id=s.attempt_id and expires_at>now_at order by opened_at desc limit 1;
  if w.id is not null then raise exception 'MAKEUP_ALREADY_OPEN';end if;
  if d.state<>'draft' or now_at<s.upload_deadline or cardinality(missing_ids)=0 then raise exception 'MAKEUP_NOT_AVAILABLE';end if;
  if (payload->>'expected_revision')::integer is distinct from d.revision
   or (payload->>'expected_version_id')::uuid is distinct from s.assignment_version_id
   or payload->'expected_missing' is distinct from to_jsonb(missing_ids) then raise exception 'VERSION_CONFLICT';end if;
  if not exists(select 1 from public.profiles where user_id=s.owner_id and role='STUDENT' and status='APPROVED')
   or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=current_exam and owner_id=s.owner_id)
   or not exists(select 1 from public.enrollments en join public.learning_attempts a on a.id=s.attempt_id join public.lesson_content l on l.id=a.lesson_id
    where en.user_id=s.owner_id and en.course_id=l.course_id and en.active and (en.access_mode='ALL'
     or exists(select 1 from public.student_lesson_access ac where ac.user_id=s.owner_id and ac.lesson_id=l.id and ac.active))) then raise exception 'EXAM_ACCESS_REQUIRED';end if;
  insert into account_internal.hskk_makeup_windows(request_id,attempt_id,owner_id,assignment_version_id,missing,accepted,opened_by,opened_at,expires_at)
   values(request,s.attempt_id,s.owner_id,s.assignment_version_id,missing_ids,accepted_answers,actor,now_at,now_at+interval '4 hours') returning * into w;
  perform account_internal.assignment_audit('hskk_makeup_opened',s.attempt_id,jsonb_build_object('window_id',w.id,'missing',missing_ids,'expires_at',w.expires_at));
  return jsonb_build_object('window_id',w.id,'attempt_id',s.attempt_id,'expires_at',w.expires_at,'missing',missing_ids,'reused',false);
 end if;
 if w.id is null or w.owner_id<>actor or not account_internal.can_access_lesson((select lesson_id from public.learning_attempts where id=s.attempt_id))
  or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=current_exam and owner_id=actor) then raise exception 'MAKEUP_NOT_AVAILABLE' using errcode='42501';end if;
 if command='load' then
  cfg:=account_internal.hskk_delivery_config(w.assignment_version_id);
  return jsonb_build_object('exam_code',current_exam,'window_id',w.id,'attempt_id',w.attempt_id,'version_id',w.assignment_version_id,'expires_at',floor(extract(epoch from w.expires_at)*1000),
   'server_time',floor(extract(epoch from now_at)*1000),'submitted',d.state='submitted','expired',now_at>=w.expires_at,
   'questions',(select jsonb_agg(x order by (x->>'number')::integer) from jsonb_array_elements(cfg->'questions') x where (x->>'version_id')::uuid=any(w.missing)),
   'saved',(select coalesce(jsonb_agg(a.question_version_id),'[]') from public.submission_answers a where a.attempt_id=s.attempt_id and a.question_version_id=any(w.missing) and a.answer<>'null'::jsonb),
   'existing_recordings',(select coalesce(jsonb_object_agg(r.question_version_id::text,r.id),'{}') from account_internal.speaking_recordings r
    join public.submission_answers a on a.attempt_id=r.attempt_id and a.question_version_id=r.question_version_id
    where r.attempt_id=s.attempt_id and r.owner_id=actor and r.question_version_id=any(w.missing) and a.answer='null'::jsonb
     and r.raw_uploaded_at is not null and r.raw_uploaded_at<r.upload_deadline and r.cleaned_at is null and (r.expires_at is null or r.expires_at>now_at)),
   'timing',(select coalesce(jsonb_object_agg(question_version_id::text,jsonb_build_object('start',floor(extract(epoch from started_at)*1000),'record_start',floor(extract(epoch from record_start)*1000),'record_end',floor(extract(epoch from record_end)*1000))),'{}') from account_internal.hskk_makeup_timing where window_id=w.id));
 end if;
 if d.state='submitted' then
  if command='submit' and exists(select 1 from account_internal.hskk_makeup_submissions where window_id=w.id) then return jsonb_build_object('submitted',true,'attempt_id',s.attempt_id);end if;
  raise exception 'SUBMISSION_LOCKED';
 end if;
 if now_at>=w.expires_at then raise exception 'UPLOAD_WINDOW_EXPIRED';end if;
 if exists(select 1 from jsonb_each(w.accepted) x left join public.submission_answers a on a.attempt_id=s.attempt_id and a.question_version_id=x.key::uuid where a.answer is distinct from x.value)
 then raise exception 'VERSION_CONFLICT';end if;
 qid:=(payload->>'question_version_id')::uuid;
 if command in ('start','reserve') then
  if qid is null or not qid=any(w.missing) then raise exception 'RECORDING_LOCKED';end if;
  if command='start' and exists(select 1 from public.submission_answers where attempt_id=s.attempt_id and question_version_id=qid and answer<>'null'::jsonb) then raise exception 'RECORDING_LOCKED';end if;
  select * into q from account_internal.hskk_delivery_questions where assignment_version_id=w.assignment_version_id and question_version_id=qid;
  if q.question_version_id is null then raise exception 'INVALID_RECORDING_REFERENCE';end if;
 end if;
 if command='start' then
  select * into t from account_internal.hskk_makeup_timing where window_id=w.id and question_version_id=qid;
  if t.window_id is null then
   if exists(select 1 from account_internal.hskk_makeup_timing where window_id=w.id and record_end>now_at) then raise exception 'RECORDING_WINDOW_REQUIRED';end if;
   insert into account_internal.hskk_makeup_timing values(w.id,qid,now_at,now_at+interval '5 seconds'+make_interval(secs=>case when q.prompt_mode='audio' then (select duration_ms/1000.0 from account_internal.hskk_prompt_assets where sha256=q.clip_sha256) else 0 end),
    now_at+interval '5 seconds'+make_interval(secs=>case when q.prompt_mode='audio' then (select duration_ms/1000.0 from account_internal.hskk_prompt_assets where sha256=q.clip_sha256) else 0 end+q.response_seconds)) returning * into t;
   perform account_internal.assignment_audit('hskk_makeup_record_started',s.attempt_id,jsonb_build_object('window_id',w.id,'question_version_id',qid));
  end if;
  return jsonb_build_object('server_time',floor(extract(epoch from now_at)*1000),'record_start',floor(extract(epoch from t.record_start)*1000),'record_end',floor(extract(epoch from t.record_end)*1000));
 elsif command='reserve' then
  request:=(payload->>'request_id')::uuid;
  select r0.* into r from account_internal.speaking_recordings r0 join account_internal.hskk_makeup_records m on m.recording_id=r0.id where m.window_id=w.id and m.question_version_id=qid;
  if r.id is not null then
   if row(r.request_id,r.raw_sha256,r.raw_size,r.raw_mime) is distinct from row(request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime') then raise exception 'RECORDING_LOCKED';end if;
  else
   if exists(select 1 from public.submission_answers where attempt_id=s.attempt_id and question_version_id=qid and answer<>'null'::jsonb) then raise exception 'RECORDING_LOCKED';end if;
   retained:=exists(select 1 from account_internal.speaking_recordings where attempt_id=s.attempt_id and question_version_id=qid and request_id=(payload->>'original_request_id')::uuid
    and raw_sha256=payload->>'sha256' and raw_size=(payload->>'size')::integer and raw_mime=payload->>'mime' and raw_uploaded_at is null);
   if not retained and not exists(select 1 from account_internal.hskk_makeup_timing where window_id=w.id and question_version_id=qid and record_end<=now_at) then raise exception 'RECORDING_WINDOW_REQUIRED';end if;
   insert into account_internal.speaking_recordings(attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline)
    values(s.attempt_id,qid,actor,request,payload->>'sha256',(payload->>'size')::integer,payload->>'mime',w.expires_at) returning * into r;
   insert into account_internal.hskk_makeup_records values(w.id,qid,r.id,(payload->>'original_request_id')::uuid,retained);
   perform account_internal.speaking_event(r.id,'makeup_reserved');
  end if;
  return jsonb_build_object('id',r.id,'path',r.id::text||'/raw','bucket','speaking-private','raw_uploaded_at',r.raw_uploaded_at,'upload_deadline',r.upload_deadline);
 elsif command in ('confirm','bind') then
  if command='confirm' then
   select r0.* into r from account_internal.speaking_recordings r0 join account_internal.hskk_makeup_records m on m.recording_id=r0.id where m.window_id=w.id and r0.id=(payload->>'recording_id')::uuid and r0.owner_id=actor for update of r0;
  else
   select * into r from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid and attempt_id=s.attempt_id and owner_id=actor and question_version_id=any(w.missing) for update;
  end if;
  if r.id is null then raise exception 'INVALID_RECORDING_REFERENCE';end if;
  if command='confirm' then
   if r.raw_uploaded_at is null then
    select * into o from storage.objects where bucket_id='speaking-private' and name=r.id::text||'/raw';
    if o.id is null or (o.metadata->>'size')::bigint is distinct from r.raw_size::bigint or split_part(o.metadata->>'mimetype',';',1) is distinct from r.raw_mime then raise exception 'UPLOAD_NOT_CONFIRMED';end if;
    update account_internal.speaking_recordings set raw_uploaded_at=now_at,raw_object_id=o.id where id=r.id returning * into r;
    perform account_internal.speaking_event(r.id,'makeup_upload_confirmed');
   end if;
  else
   perform account_internal.speaking_check_answer(s.attempt_id,r.question_version_id,jsonb_build_object('recording_id',r.id));
   if not exists(select 1 from account_internal.hskk_makeup_records where recording_id=r.id) then
    insert into account_internal.hskk_makeup_records values(w.id,r.question_version_id,r.id,r.request_id,true);
   end if;
   select * into answer from public.submission_answers where attempt_id=s.attempt_id and question_version_id=r.question_version_id for update;
   if answer.answer<>'null'::jsonb and answer.answer<>jsonb_build_object('recording_id',r.id) then raise exception 'RECORDING_LOCKED';end if;
   if answer.answer='null'::jsonb then
    update public.submission_answers set answer=jsonb_build_object('recording_id',r.id) where attempt_id=s.attempt_id and question_version_id=r.question_version_id;
    update public.submission_details set revision=revision+1 where attempt_id=s.attempt_id;
    perform account_internal.assignment_audit('hskk_makeup_bound',s.attempt_id,jsonb_build_object('window_id',w.id,'recording_id',r.id,'question_version_id',r.question_version_id));
   end if;
  end if;
  return jsonb_build_object('id',r.id,'recording_id',r.id,'attempt_id',s.attempt_id,'question_version_id',r.question_version_id,'owner_id',actor,'confirmed',command='bind');
 elsif command='submit' then
  if cardinality(missing_ids)<>0 or (select count(*) from public.submission_answers where attempt_id=s.attempt_id)<>(select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=s.assignment_version_id) then raise exception 'RECORDING_REQUIRED';end if;
  for answer in select * from public.submission_answers where attempt_id=s.attempt_id loop perform account_internal.speaking_check_answer(s.attempt_id,answer.question_version_id,answer.answer);end loop;
  -- Accurate late-recovery timestamp; never backdate to the original deadline.
  update public.submission_details set state='submitted',revision=revision+1,timed_out=true,
   duration_seconds=greatest(0,floor(extract(epoch from(s.exam_deadline-s.started_at)))::integer) where attempt_id=s.attempt_id;
  update public.learning_attempts set submitted_at=now_at where id=s.attempt_id;
  insert into public.submission_results(attempt_id,revision,created_by)values(s.attempt_id,1,actor);
  insert into public.submission_grades(attempt_id,revision,question_version_id,grading_question_version_id,rubric_version_id,score,method,graded_at)
   select s.attempt_id,1,aq.id,aq.id,aq.rubric_version_id,account_internal.assignment_score(aq.kind,aq.answer_key,a.answer),
    case when aq.rubric_version_id is null then 'automatic' else 'manual' end,case when aq.rubric_version_id is null then now_at else null end
   from public.submission_answers a join public.assignment_question_versions aq on aq.id=a.question_version_id where a.attempt_id=s.attempt_id;
  insert into account_internal.hskk_makeup_submissions values(w.id,now_at,actor);
  perform account_internal.assignment_audit('hskk_makeup_submitted',s.attempt_id,jsonb_build_object('window_id',w.id,'received_at',now_at,'original_deadline',s.upload_deadline,'added_questions',w.missing));
  return jsonb_build_object('submitted',true,'attempt_id',s.attempt_id,'received_at',now_at,'makeup',true);
 else raise exception 'INVALID_REQUEST';end if;
end $$;
revoke all on function public.hskk_makeup(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_makeup(text,jsonb) to authenticated;

-- Keep the existing private bucket policies and normal recording path.

create or replace function public.hskk_makeup_prompt(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('bucket','hskk-prompt-clips','path',a.object_path,'sha256',a.sha256) into result
 from account_internal.hskk_makeup_windows w
 join account_internal.hskk_makeup_timing t on t.window_id=w.id and t.question_version_id=(payload->>'question_version_id')::uuid
 join account_internal.hskk_delivery_questions q on q.question_version_id=t.question_version_id and q.assignment_version_id=w.assignment_version_id and q.prompt_mode='audio'
 join account_internal.hskk_prompt_assets a on a.sha256=q.clip_sha256
 join account_internal.hskk_prompt_receipts rc on rc.sha256=a.sha256
 join public.profiles p on p.user_id=w.owner_id and p.role='STUDENT' and p.status='APPROVED'
 join public.learning_attempts la on la.id=w.attempt_id
 join public.lesson_content l on l.id=la.lesson_id
 join public.enrollments en on en.user_id=w.owner_id and en.course_id=l.course_id and en.active
 join public.submission_details d on d.attempt_id=w.attempt_id and d.state='draft'
 where w.id=(payload->>'makeup_window_id')::uuid and w.owner_id=(payload->>'owner_id')::uuid
 and clock_timestamp()<w.expires_at and clock_timestamp()>=t.started_at and clock_timestamp()<t.record_start
 and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access ac where ac.user_id=w.owner_id and ac.lesson_id=l.id and ac.active))
 and exists(select 1 from account_internal.hskk_controlled_access ca where ca.exam_id=(select dv.exam_id from account_internal.hskk_delivery_versions dv where dv.assignment_version_id=w.assignment_version_id) and ca.owner_id=w.owner_id)
 and not exists(select 1 from public.submission_answers sa where sa.attempt_id=w.attempt_id and sa.question_version_id=t.question_version_id and sa.answer<>'null'::jsonb);
 if result is null then raise exception 'PROMPT_DENIED' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.hskk_makeup_prompt(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_makeup_prompt(jsonb) to service_role;
-- Only the bound recordings enter the existing Admin conversion/review queue.

notify pgrst,'reload schema';
