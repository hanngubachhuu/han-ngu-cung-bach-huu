create function account_internal.hskk_readiness(code text,version_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('ready',
  h.assignment_version_id is not null and v.status='draft' and
  h.authoring_revision_id=(select id from account_internal.hskk_exam_draft_revisions where exam_code=code order by revision desc limit 1) and
  (select count(*) from account_internal.hskk_delivery_questions q join account_internal.hskk_prompt_receipts r on r.sha256=q.clip_sha256
   join account_internal.hskk_prompt_assets a on a.sha256=q.clip_sha256 join storage.objects o on o.name=a.object_path and o.bucket_id='hskk-prompt-clips'
   where q.assignment_version_id=v.id and (o.metadata->>'size')::integer=r.byte_size)=27 and
  exists(select 1 from account_internal.hskk_controlled_access g join public.profiles p on p.user_id=g.owner_id and p.role='STUDENT' and p.status='APPROVED'
   join public.enrollments en on en.user_id=p.user_id and en.course_id=l.course_id and en.active
   join public.student_lesson_access la on la.user_id=p.user_id and la.lesson_id=e.delivery_id and la.active where g.exam_id=code) and
  exists(select 1 from account_internal.hskk_runtime_receipts where exam_id=code and runtime_version='hskk-official-v1'),
  'version_id',h.assignment_version_id,'question_count',(select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=v.id),
  'runtime_verified',exists(select 1 from account_internal.hskk_runtime_receipts where exam_id=code))
 from account_internal.admin_exams e left join account_internal.hskk_delivery_versions h on h.exam_id=e.id and h.assignment_version_id=version_id
 left join public.assignment_versions v on v.id=h.assignment_version_id left join public.lesson_content l on l.id=e.delivery_id where e.id=code
$$;
create function public.hskk_publication(command text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare code text:=payload->>'exam_code'; version_id uuid:=(payload->>'version_id')::uuid; ready jsonb; v public.assignment_versions; e account_internal.admin_exams; now_at timestamptz;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if code is distinct from 'H71002' then raise exception 'EXAM_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-delivery:'||code,0));
 select * into e from account_internal.admin_exams where id=code for update;
 ready:=account_internal.hskk_readiness(code,version_id);
 if command='readiness' then return coalesce(ready,jsonb_build_object('ready',false));end if;
 if command='process_list' then
  if not exists(select 1 from account_internal.hskk_sessions s join account_internal.hskk_delivery_versions v on v.assignment_version_id=s.assignment_version_id
   join public.submission_details d on d.attempt_id=s.attempt_id and d.state='submitted' where s.attempt_id=(payload->>'attempt_id')::uuid and v.exam_id=code) then raise exception 'SUBMISSION_NOT_FOUND';end if;
  return jsonb_build_object('recording_ids',(select jsonb_agg(r.id order by q.position) from account_internal.speaking_recordings r join account_internal.hskk_delivery_questions q on q.question_version_id=r.question_version_id where r.attempt_id=(payload->>'attempt_id')::uuid and r.conversion_status<>'completed'));
 end if;
 if command<>'publish' then raise exception 'INVALID_COMMAND';end if;
 if e.active_version_id=version_id then return jsonb_build_object('published',true,'version_id',version_id);end if;
 if coalesce((ready->>'ready')::boolean,false) is distinct from true then raise exception 'HSKK_NOT_READY';end if;
 select * into v from public.assignment_versions where id=version_id for update;
 now_at:=clock_timestamp();
 -- Existing immutable version guards permit only this one-way draft publication.
 update public.assignment_question_versions set published_at=now_at,published_by=auth.uid() where id in(select question_version_id from public.assignment_version_questions where assignment_version_id=v.id) and published_at is null;
 update public.assignment_versions set previewed_at=now_at,published_at=now_at,published_by=auth.uid(),status='published' where id=v.id;
 update public.lesson_assignments set current_version_id=v.id,enabled=true,protected_at=coalesce(protected_at,now_at),updated_at=now_at where lesson_id=e.delivery_id;
 update account_internal.admin_exams set active_version_id=v.id,revision=revision+1,updated_at=now_at where id=code returning * into e;
 insert into account_internal.admin_exam_versions values(code,e.revision,e.working,v.id,auth.uid(),now_at);
 perform account_internal.assignment_audit('hskk_published',v.id,jsonb_build_object('exam_id',code,'revision',e.revision));
 return jsonb_build_object('published',true,'version_id',v.id,'revision',e.revision);
end $$;
revoke all on function account_internal.hskk_readiness(text,uuid),public.hskk_publication(text,jsonb) from public,anon,authenticated;
grant execute on function public.hskk_publication(text,jsonb) to authenticated;
create function public.hskk_runtime_verified(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_REQUIRED';end if;
 if payload->>'exam_code' is distinct from 'H71002' or payload->>'runtime_version' is distinct from 'hskk-official-v1'
  or not exists(select 1 from public.profiles where user_id=(payload->>'actor')::uuid and role='ADMIN' and status='APPROVED') then raise exception 'ADMIN_REQUIRED';end if;
 insert into account_internal.hskk_runtime_receipts(exam_id,runtime_version)values(payload->>'exam_code',payload->>'runtime_version')on conflict do nothing;
 return jsonb_build_object('verified',true);
end $$;
revoke all on function public.hskk_runtime_verified(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_runtime_verified(jsonb) to service_role;

-- Explicit Admin processing of a submitted controlled exam; no scheduler/global rollout.
create function public.hskk_recording_claim(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r account_internal.speaking_recordings; now_at timestamptz:=clock_timestamp();
begin
 if current_setting('role',true)<>'service_role' then raise exception 'WORKER_REQUIRED';end if;
 select r0.* into r from account_internal.speaking_recordings r0
 join account_internal.hskk_sessions s on s.attempt_id=r0.attempt_id and s.owner_id=r0.owner_id
 join account_internal.hskk_delivery_versions v on v.assignment_version_id=s.assignment_version_id and v.exam_id='H71002'
 join public.submission_details d on d.attempt_id=s.attempt_id and d.state='submitted'
 join public.submission_answers a on a.attempt_id=r0.attempt_id and a.question_version_id=r0.question_version_id and a.answer=jsonb_build_object('recording_id',r0.id)
 where r0.id=(payload->>'recording_id')::uuid and r0.raw_uploaded_at is not null and r0.cleaned_at is null and r0.drive_status<>'completed'
  and r0.next_attempt_at<=now_at and (r0.lease_until is null or r0.lease_until<now_at) for update of r0 skip locked;
 if r.id is null then return null;end if;
 update account_internal.speaking_recordings set lease_id=gen_random_uuid(),lease_until=now_at+interval '5 minutes' where id=r.id returning * into r;
 perform account_internal.speaking_event(r.id,'processing_claimed',jsonb_build_object('scope','H71002'));
 return to_jsonb(r)||jsonb_build_object('job','process','raw_path',r.id::text||'/raw','mp3_path',r.id::text||'/audio.mp3');
end $$;
revoke all on function public.hskk_recording_claim(jsonb) from public,anon,authenticated;
grant execute on function public.hskk_recording_claim(jsonb) to service_role;
notify pgrst,'reload schema';
