-- Bounded loading for the current question only; never bulk/future prompt access.
-- Existing immutable sessions, timelines, deadlines, source and clips are not updated.
create or replace function account_internal.hskk_delivery_config(version_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('exam_code',h.exam_id,'exam_version',v.version,'assignment_version_id',v.id,'title',v.title,
  'level',d.configuration->>'level','source_type','official','delivery_mode','private_clips',
  'timing',jsonb_build_object('countdown_seconds',(d.configuration->'timing'->>'countdown_seconds')::integer,'prompt_load_seconds',5,'prompt_start_grace_ms',250),
  'sections',(select jsonb_agg(jsonb_build_object('id',s->>'id','title_vi',s->>'title_vi','preparation_seconds',(s->>'preparation_seconds')::integer) order by n)
    from jsonb_array_elements(d.configuration->'sections') with ordinality x(s,n)),
  'questions',(select jsonb_agg(jsonb_build_object('id',q.question_key,'version',q.version,'version_id',q.id,'number',b.position,
   'section_id',b.section_id,'type',b.question_type,'prompt_mode',b.prompt_mode,'prompt',case when b.prompt_mode='audio' then '' else q.prompt end,
   'response_seconds',b.response_seconds,'auto_start',true,'auto_stop',true,'allow_replay',false,'allow_rerecord',false,'allow_navigation',false,
   'prompt_audio',jsonb_build_object('duration_ms',a.duration_ms))order by b.position)
    from account_internal.hskk_delivery_questions b join public.assignment_question_versions q on q.id=b.question_version_id
    join account_internal.hskk_prompt_assets a on a.sha256=b.clip_sha256 where b.assignment_version_id=v.id))
 from account_internal.hskk_delivery_versions h join public.assignment_versions v on v.id=h.assignment_version_id
 join account_internal.hskk_exam_draft_revisions d on d.id=h.authoring_revision_id where v.id=version_id
$$;
create or replace function account_internal.hskk_timeline(version_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare config jsonb:=account_internal.hskk_delivery_config(version_id); s jsonb; q jsonb; frames jsonb:='[]'; at_ms integer:=0; span integer;
begin
 span:=(config->'timing'->>'countdown_seconds')::integer*1000;
 frames:=frames||jsonb_build_array(jsonb_build_object('state','COUNTDOWN','start',0,'end',span));at_ms:=span;
 for s in select * from jsonb_array_elements(config->'sections') loop
  span:=(s->>'preparation_seconds')::integer*1000;
  if span>0 then frames:=frames||jsonb_build_array(jsonb_build_object('state','PREPARATION','section_id',s->>'id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;end if;
  for q in select * from jsonb_array_elements(config->'questions') x where x->>'section_id'=s->>'id' loop
   if q->>'prompt_mode'='audio' then
    span:=5000;
    frames:=frames||jsonb_build_array(jsonb_build_object('state','PROMPT_LOADING','question_id',q->>'id','question_version_id',q->>'version_id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;
    span:=(q->'prompt_audio'->>'duration_ms')::integer+250;
    frames:=frames||jsonb_build_array(jsonb_build_object('state','LISTENING','question_id',q->>'id','question_version_id',q->>'version_id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;
   end if;
   span:=(q->>'response_seconds')::integer*1000;
   frames:=frames||jsonb_build_array(jsonb_build_object('state','RECORDING','question_id',q->>'id','question_version_id',q->>'version_id','start',at_ms,'end',at_ms+span));at_ms:=at_ms+span;
  end loop;
 end loop;
 return frames;
end $$;
create or replace function account_internal.hskk_session_read(session_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare p account_internal.hskk_preflights; s account_internal.hskk_sessions; v public.assignment_versions; h account_internal.hskk_delivery_versions; now_at timestamptz:=clock_timestamp();
begin
 select * into p from account_internal.hskk_preflights where id=session_id and owner_id=auth.uid();
 if p.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=p.id;
 select * into v from public.assignment_versions where id=p.assignment_version_id;
 select * into h from account_internal.hskk_delivery_versions where assignment_version_id=v.id;
 return jsonb_build_object('attempt_id',p.id,'candidate_id',p.owner_id,'exam_code',h.exam_id,'exam_version',v.version,
  'state',case when exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='submitted') then 'SUBMITTED'
    when s.attempt_id is not null then coalesce((select x->>'state' from jsonb_array_elements(s.timeline) x where (x->>'start')::integer<=extract(epoch from(now_at-s.started_at))*1000 and (x->>'end')::integer>extract(epoch from(now_at-s.started_at))*1000),'COMPLETED') else p.state end,
  'upload_deadline',floor(extract(epoch from s.upload_deadline)*1000),
  'delivery_timing',case when s.attempt_id is null then jsonb_build_object('prompt_load_seconds',5,'prompt_start_grace_ms',250)
   when exists(select 1 from jsonb_array_elements(s.timeline) f where f->>'state'='PROMPT_LOADING') then jsonb_build_object('prompt_load_seconds',5,'prompt_start_grace_ms',250)
   else jsonb_build_object('prompt_load_seconds',0,'prompt_start_grace_ms',0) end,
  'server_time',floor(extract(epoch from now_at)*1000),'server_started_at',floor(extract(epoch from s.started_at)*1000),'server_deadline',floor(extract(epoch from s.exam_deadline)*1000),
  'question_versions',(select jsonb_object_agg(q.question_key,q.version) from public.assignment_question_versions q join account_internal.hskk_delivery_questions b on b.question_version_id=q.id where b.assignment_version_id=v.id),
  'question_version_ids',(select jsonb_object_agg(q.question_key,q.id) from public.assignment_question_versions q join account_internal.hskk_delivery_questions b on b.question_version_id=q.id where b.assignment_version_id=v.id),
  'recordings',coalesce((select jsonb_object_agg(q.question_key,jsonb_build_object('recording_id',r.id,'owner_id',r.owner_id,'attempt_id',r.attempt_id,'question_version_id',r.question_version_id,'confirmed',true))
   from account_internal.speaking_recordings r join public.assignment_question_versions q on q.id=r.question_version_id
   where r.attempt_id=s.attempt_id and r.owner_id=p.owner_id and r.raw_uploaded_at is not null),'{}'::jsonb));
end $$;
create or replace function public.hskk_current_prompt(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s account_internal.hskk_sessions; q account_internal.hskk_delivery_questions; a account_internal.hskk_prompt_assets; frame jsonb; elapsed numeric;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED' using errcode='42501';end if;
 select * into s from account_internal.hskk_sessions where attempt_id=(payload->>'attempt_id')::uuid and owner_id=(payload->>'owner_id')::uuid;
 if s.attempt_id is null or not exists(select 1 from public.profiles where user_id=s.owner_id and role='STUDENT' and status='APPROVED')
  or not exists(select 1 from public.learning_attempts l join public.enrollments e on e.user_id=l.user_id join public.lesson_content c on c.id=l.lesson_id and c.course_id=e.course_id
   join public.student_lesson_access g on g.user_id=l.user_id and g.lesson_id=l.lesson_id and g.active
   join public.lesson_assignments la on la.lesson_id=l.lesson_id and la.enabled
   join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=s.assignment_version_id
   join account_internal.hskk_controlled_access ca on ca.exam_id=dv.exam_id and ca.owner_id=s.owner_id
   where l.id=s.attempt_id and e.active)
  or exists(select 1 from public.submission_details where attempt_id=s.attempt_id and state='submitted') then raise exception 'EXAM_ACCESS_REQUIRED';end if;
 elapsed:=extract(epoch from(clock_timestamp()-s.started_at))*1000;
 select x into frame from jsonb_array_elements(s.timeline) x where x->>'state' in ('PROMPT_LOADING','LISTENING') and x->>'question_version_id'=payload->>'question_version_id' and elapsed>=(x->>'start')::integer and elapsed<(x->>'end')::integer;
 if frame is null then raise exception 'PROMPT_WINDOW_REQUIRED';end if;
 select * into q from account_internal.hskk_delivery_questions where assignment_version_id=s.assignment_version_id and question_version_id=(payload->>'question_version_id')::uuid;
 select * into a from account_internal.hskk_prompt_assets where sha256=q.clip_sha256;
 if not exists(select 1 from account_internal.hskk_prompt_receipts where sha256=a.sha256) then raise exception 'CLIP_NOT_VERIFIED';end if;
 return jsonb_build_object('bucket','hskk-prompt-clips','path',a.object_path,'sha256',a.sha256);
end $$;
alter function public.hskk_session_command(text,jsonb) rename to hskk_session_command_before_buffered_prompts;
create function public.hskk_session_command(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if command='transition' and payload->>'state'='COUNTDOWN'
  and exists(select 1 from account_internal.hskk_preflights p where p.id=(payload->>'attempt_id')::uuid and p.owner_id=auth.uid() and p.state='STRUCTURE')
  and not exists(select 1 from account_internal.hskk_sessions s where s.attempt_id=(payload->>'attempt_id')::uuid)
  and coalesce(payload->>'runtime_version','')<>'hskk-buffered-v2' then raise exception 'RUNTIME_UPDATE_REQUIRED';end if;
 return public.hskk_session_command_before_buffered_prompts(command,payload);
end $$;
revoke all on function public.hskk_session_command_before_buffered_prompts(text,jsonb),public.hskk_session_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_session_command(text,jsonb) to authenticated;
revoke all on function account_internal.hskk_delivery_config(uuid),account_internal.hskk_timeline(uuid),account_internal.hskk_session_read(uuid) from public,anon,authenticated,service_role;
revoke all on function public.hskk_current_prompt(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_current_prompt(jsonb) to service_role;
notify pgrst,'reload schema';
