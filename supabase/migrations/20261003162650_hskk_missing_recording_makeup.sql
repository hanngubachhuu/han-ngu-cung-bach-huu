-- Explicit human-authorized recovery. Original session/deadlines and accepted
-- answers stay immutable; late additions and actual submission time are audited.
create table account_internal.hskk_makeup_windows (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 attempt_id uuid not null references account_internal.hskk_sessions(attempt_id),
 owner_id uuid not null references public.profiles(user_id),
 assignment_version_id uuid not null references account_internal.hskk_delivery_versions(assignment_version_id),
 missing uuid[] not null check(cardinality(missing) between 1 and 27),
 accepted jsonb not null,opened_by uuid not null references public.profiles(user_id),
 opened_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 check(expires_at>opened_at and expires_at<=opened_at+interval '4 hours')
);
create table account_internal.hskk_makeup_timing (
 window_id uuid not null references account_internal.hskk_makeup_windows(id),
 question_version_id uuid not null references public.assignment_question_versions(id),
 started_at timestamptz not null,record_start timestamptz not null,record_end timestamptz not null,
 primary key(window_id,question_version_id),check(record_end>record_start and record_start>started_at)
);
create table account_internal.hskk_makeup_records (
 window_id uuid not null references account_internal.hskk_makeup_windows(id),
 question_version_id uuid not null references public.assignment_question_versions(id),
 recording_id uuid not null unique references account_internal.speaking_recordings(id),
 original_request_id uuid,retained_original boolean not null,
 primary key(window_id,question_version_id)
);
create table account_internal.hskk_makeup_submissions (
 window_id uuid primary key references account_internal.hskk_makeup_windows(id),
 received_at timestamptz not null default clock_timestamp(),
 received_by uuid not null references public.profiles(user_id)
);
alter table account_internal.hskk_makeup_windows enable row level security;
alter table account_internal.hskk_makeup_timing enable row level security;
alter table account_internal.hskk_makeup_records enable row level security;
alter table account_internal.hskk_makeup_submissions enable row level security;
revoke all on account_internal.hskk_makeup_windows,account_internal.hskk_makeup_timing,
 account_internal.hskk_makeup_records,account_internal.hskk_makeup_submissions from public,anon,authenticated,service_role;
create trigger makeup_window_immutable before update or delete on account_internal.hskk_makeup_windows for each row execute function account_internal.assignment_metadata_immutable();
create trigger makeup_timing_immutable before update or delete on account_internal.hskk_makeup_timing for each row execute function account_internal.assignment_metadata_immutable();
create trigger makeup_record_immutable before update or delete on account_internal.hskk_makeup_records for each row execute function account_internal.assignment_metadata_immutable();
create trigger makeup_submission_immutable before update or delete on account_internal.hskk_makeup_submissions for each row execute function account_internal.assignment_metadata_immutable();

create function public.hskk_makeup(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();s account_internal.hskk_sessions;d public.submission_details;
 w account_internal.hskk_makeup_windows;r account_internal.speaking_recordings;t account_internal.hskk_makeup_timing;
 qid uuid;request uuid;missing_ids uuid[];accepted_answers jsonb;now_at timestamptz;
 answer public.submission_answers;q account_internal.hskk_delivery_questions;o storage.objects;cfg jsonb;retained boolean;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>12000 then raise exception 'INVALID_REQUEST';end if;
 if command in ('inspect','open') then
  if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  if payload->>'exam_code' is distinct from 'H71002' then raise exception 'INVALID_REQUEST';end if;
  select h.* into s from account_internal.hskk_sessions h join account_internal.hskk_delivery_versions v on v.assignment_version_id=h.assignment_version_id
   where v.exam_id='H71002' and h.owner_id=(payload->>'student_id')::uuid
    and (payload->>'attempt_id' is null or h.attempt_id=(payload->>'attempt_id')::uuid)
   order by h.started_at desc limit 1;
 else
  if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED') then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
  select * into s from account_internal.hskk_sessions where attempt_id=coalesce((payload->>'attempt_id')::uuid,
   (select attempt_id from account_internal.hskk_makeup_windows where id=(payload->>'makeup_window_id')::uuid),
   (select attempt_id from account_internal.speaking_recordings where id=(payload->>'recording_id')::uuid));
  if s.owner_id is distinct from actor then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 end if;
 if s.attempt_id is null or not exists(select 1 from account_internal.hskk_delivery_versions where assignment_version_id=s.assignment_version_id and exam_id='H71002')
 then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
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
   or not exists(select 1 from account_internal.hskk_controlled_access where exam_id='H71002' and owner_id=s.owner_id)
   or not exists(select 1 from public.enrollments en join public.learning_attempts a on a.id=s.attempt_id join public.lesson_content l on l.id=a.lesson_id
    where en.user_id=s.owner_id and en.course_id=l.course_id and en.active and (en.access_mode='ALL'
     or exists(select 1 from public.student_lesson_access ac where ac.user_id=s.owner_id and ac.lesson_id=l.id and ac.active))) then raise exception 'EXAM_ACCESS_REQUIRED';end if;
  insert into account_internal.hskk_makeup_windows(request_id,attempt_id,owner_id,assignment_version_id,missing,accepted,opened_by,opened_at,expires_at)
   values(request,s.attempt_id,s.owner_id,s.assignment_version_id,missing_ids,accepted_answers,actor,now_at,now_at+interval '4 hours') returning * into w;
  perform account_internal.assignment_audit('hskk_makeup_opened',s.attempt_id,jsonb_build_object('window_id',w.id,'missing',missing_ids,'expires_at',w.expires_at));
  return jsonb_build_object('window_id',w.id,'attempt_id',s.attempt_id,'expires_at',w.expires_at,'missing',missing_ids,'reused',false);
 end if;
 if w.id is null or w.owner_id<>actor or not account_internal.can_access_lesson((select lesson_id from public.learning_attempts where id=s.attempt_id))
  or not exists(select 1 from account_internal.hskk_controlled_access where exam_id='H71002' and owner_id=actor) then raise exception 'MAKEUP_NOT_AVAILABLE' using errcode='42501';end if;
 if command='load' then
  cfg:=account_internal.hskk_delivery_config(w.assignment_version_id);
  return jsonb_build_object('window_id',w.id,'attempt_id',w.attempt_id,'version_id',w.assignment_version_id,'expires_at',floor(extract(epoch from w.expires_at)*1000),
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
  if cardinality(missing_ids)<>0 or (select count(*) from public.submission_answers where attempt_id=s.attempt_id)<>27 then raise exception 'RECORDING_REQUIRED';end if;
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
alter function account_internal.recording_command(text,jsonb) rename to recording_command_before_makeup;
create function account_internal.recording_command(command text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare window_id uuid;
begin
 if command='reserve' and payload->>'makeup_window_id' is not null then return public.hskk_makeup('reserve',payload);end if;
 if command='confirm' then
  select m.window_id into window_id from account_internal.hskk_makeup_records m where recording_id=(payload->>'recording_id')::uuid;
  if window_id is not null then return public.hskk_makeup('confirm',payload||jsonb_build_object('makeup_window_id',window_id));end if;
 end if;
 return account_internal.recording_command_before_makeup(command,payload);
end $$;
revoke all on function account_internal.recording_command_before_makeup(text,jsonb),account_internal.recording_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function account_internal.recording_command(text,jsonb) to authenticated;
-- Makeup bindings must include the audited recovery window, not the normal route.
alter function public.hskk_session_command(text,jsonb) rename to hskk_session_command_before_makeup;
create function public.hskk_session_command(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if command='bind_recording' and exists(select 1 from account_internal.hskk_makeup_records where recording_id=(payload->>'recording_id')::uuid) then raise exception 'MAKEUP_TRANSPORT_REQUIRED';end if;
 return public.hskk_session_command_before_makeup(command,payload);
end $$;
revoke all on function public.hskk_session_command_before_makeup(text,jsonb),public.hskk_session_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_session_command(text,jsonb) to authenticated;
create function public.hskk_makeup_prompt(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 and exists(select 1 from account_internal.hskk_controlled_access ca where ca.exam_id='H71002' and ca.owner_id=w.owner_id)
 and not exists(select 1 from public.submission_answers sa where sa.attempt_id=w.attempt_id and sa.question_version_id=t.question_version_id and sa.answer<>'null'::jsonb);
 if result is null then raise exception 'PROMPT_DENIED' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.hskk_makeup_prompt(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_makeup_prompt(jsonb) to service_role;
-- Only the bound recordings enter the existing Admin conversion/review queue.
alter function public.hskk_publication(text,jsonb) rename to hskk_publication_before_makeup;
create function public.hskk_publication(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if command='process_list' and exists(select 1 from account_internal.hskk_makeup_submissions ms join account_internal.hskk_makeup_windows w on w.id=ms.window_id where w.attempt_id=(payload->>'attempt_id')::uuid) then
  if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
  if payload->>'exam_code' is distinct from 'H71002' then raise exception 'EXAM_UNAVAILABLE';end if;
  return jsonb_build_object('recording_ids',(select jsonb_agg(r.id order by a.position)
   from public.submission_answers a join public.submission_details d on d.attempt_id=a.attempt_id and d.state='submitted'
   join account_internal.speaking_recordings r on r.id=(a.answer->>'recording_id')::uuid and r.attempt_id=a.attempt_id and r.question_version_id=a.question_version_id
   where a.attempt_id=(payload->>'attempt_id')::uuid and r.raw_uploaded_at is not null and r.conversion_status<>'completed'));
 end if;
 return public.hskk_publication_before_makeup(command,payload);
end $$;
revoke all on function public.hskk_publication_before_makeup(text,jsonb),public.hskk_publication(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_publication(text,jsonb) to authenticated;
alter function account_internal.assignment_read(uuid,boolean) rename to assignment_read_before_makeup;
create function account_internal.assignment_read(attempt uuid,administrator boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;recovery jsonb;
begin
 result:=account_internal.assignment_read_before_makeup(attempt,administrator);
 if administrator and account_internal.is_admin() then
  select jsonb_build_object('received_at',ms.received_at,'window_id',w.id,'opened_by',w.opened_by,'opened_at',w.opened_at,
   'questions',(select jsonb_agg(a.position order by a.position)from public.submission_answers a where a.attempt_id=w.attempt_id and a.question_version_id=any(w.missing)))
  into recovery from account_internal.hskk_makeup_submissions ms join account_internal.hskk_makeup_windows w on w.id=ms.window_id where w.attempt_id=attempt order by ms.received_at desc limit 1;
  if recovery is not null then result:=result||jsonb_build_object('makeup',recovery);end if;
 end if;
 return result;
end $$;
revoke all on function account_internal.assignment_read_before_makeup(uuid,boolean),account_internal.assignment_read(uuid,boolean) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
