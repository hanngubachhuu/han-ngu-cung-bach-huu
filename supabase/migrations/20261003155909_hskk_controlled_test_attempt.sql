-- One explicit Admin-authorized hosted test, using the same published version.
-- No historical preflight/session/answer/recording is updated or deleted.
create table account_internal.hskk_controlled_test_authorizations (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 exam_id text not null check(exam_id='H71002') references account_internal.admin_exams(id),
 owner_id uuid not null references public.profiles(user_id),
 assignment_version_id uuid not null references account_internal.hskk_delivery_versions(assignment_version_id),
 previous_attempt_id uuid not null references account_internal.hskk_sessions(attempt_id),
 preflight_id uuid not null unique references account_internal.hskk_preflights(id) deferrable initially deferred,
 authorized_by uuid not null references public.profiles(user_id),
 authorized_at timestamptz not null default clock_timestamp(),
 label text not null check(label='HOSTED E2E TEST ONLY'),
 unique(owner_id,assignment_version_id)
);
alter table account_internal.hskk_controlled_test_authorizations enable row level security;
revoke all on account_internal.hskk_controlled_test_authorizations from public,anon,authenticated,service_role;
create trigger hskk_controlled_test_immutable before update or delete on account_internal.hskk_controlled_test_authorizations
 for each row execute function account_internal.assignment_metadata_immutable();

-- Replace the one-slot constraint with an equally narrow insertion guard:
-- duplicates require an immutable, real-Admin authorization for exactly this row.
alter table account_internal.hskk_preflights drop constraint hskk_preflights_owner_id_assignment_version_id_key;
create function account_internal.hskk_preflight_insert_guard() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('hskk-preflight:'||new.owner_id::text||new.assignment_version_id::text,0));
 if exists(select 1 from account_internal.hskk_preflights p where p.owner_id=new.owner_id and p.assignment_version_id=new.assignment_version_id)
  and not exists(select 1 from account_internal.hskk_controlled_test_authorizations g
   where g.preflight_id=new.id and g.owner_id=new.owner_id and g.assignment_version_id=new.assignment_version_id
    and g.authorized_by=auth.uid() and account_internal.is_admin())
 then raise exception 'TEST_AUTHORIZATION_REQUIRED' using errcode='42501';end if;
 return new;
end $$;
revoke all on function account_internal.hskk_preflight_insert_guard() from public,anon,authenticated,service_role;
create trigger hskk_preflight_insert_guard before insert on account_internal.hskk_preflights
 for each row execute function account_internal.hskk_preflight_insert_guard();

create function public.hskk_controlled_test(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); student uuid:=(payload->>'student_id')::uuid;
 e account_internal.admin_exams; v public.assignment_versions; prior account_internal.hskk_sessions;
 grant_row account_internal.hskk_controlled_test_authorizations; new_preflight uuid:=gen_random_uuid();
 request uuid:=(payload->>'request_id')::uuid;
begin
 if not account_internal.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4096
  or payload->>'exam_code' is distinct from 'H71002' or command not in ('inspect','authorize')
 then raise exception 'INVALID_REQUEST';end if;
 select * into e from account_internal.admin_exams where id='H71002' and exam_type='HSKK';
 select * into v from public.assignment_versions where id=e.active_version_id and status='published';
 if v.id is null or not exists(select 1 from public.lesson_assignments where lesson_id=e.delivery_id and enabled and current_version_id=v.id)
  or (select count(*) from account_internal.hskk_delivery_questions where assignment_version_id=v.id)<>27
 then raise exception 'EXAM_UNAVAILABLE';end if;
 if not exists(select 1 from public.profiles where user_id=student and role='STUDENT' and status='APPROVED')
  or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=e.id and owner_id=student)
  or not exists(select 1 from public.enrollments en join public.lesson_content l on l.course_id=en.course_id
   where en.user_id=student and en.active and l.id=e.delivery_id
    and (en.access_mode='ALL' or exists(select 1 from public.student_lesson_access a where a.user_id=student and a.lesson_id=l.id and a.active)))
 then raise exception 'EXAM_ACCESS_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-preflight:'||student::text||v.id::text,0));
 select * into grant_row from account_internal.hskk_controlled_test_authorizations where owner_id=student and assignment_version_id=v.id;
 select s.* into prior from account_internal.hskk_sessions s where s.owner_id=student and s.assignment_version_id=v.id order by s.started_at desc limit 1;
 if command='inspect' then
  return jsonb_build_object('exam_code',e.id,'version_id',v.id,'student_id',student,'previous_attempt_id',prior.attempt_id,
   'can_authorize',grant_row.id is null and prior.attempt_id is not null and prior.upload_deadline<=clock_timestamp(),
   'authorized',grant_row.id is not null,'attempt_id',grant_row.preflight_id,'label',grant_row.label);
 end if;
 if request is null or (payload->>'expected_version_id')::uuid is distinct from v.id then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if grant_row.id is not null then
  if grant_row.request_id is distinct from request then raise exception 'TEST_ATTEMPT_ALREADY_AUTHORIZED' using errcode='40001';end if;
  return jsonb_build_object('authorized',true,'attempt_id',grant_row.preflight_id,'version_id',v.id,'student_id',student,'label',grant_row.label,'reused',true);
 end if;
 if prior.attempt_id is null or prior.attempt_id is distinct from (payload->>'expected_previous_attempt_id')::uuid
  or prior.upload_deadline>clock_timestamp()
  or exists(select 1 from account_internal.hskk_preflights p where p.owner_id=student and p.assignment_version_id=v.id
   and not exists(select 1 from account_internal.hskk_sessions s where s.attempt_id=p.id))
 then raise exception 'TEST_ATTEMPT_NOT_AVAILABLE' using errcode='40001';end if;
 insert into account_internal.hskk_controlled_test_authorizations(request_id,exam_id,owner_id,assignment_version_id,previous_attempt_id,preflight_id,authorized_by,label)
 values(request,e.id,student,v.id,prior.attempt_id,new_preflight,actor,'HOSTED E2E TEST ONLY') returning * into grant_row;
 insert into account_internal.hskk_preflights(id,owner_id,assignment_version_id)values(new_preflight,student,v.id);
 perform account_internal.assignment_audit('hskk_controlled_test_authorized',new_preflight,
  jsonb_build_object('exam_id',e.id,'assignment_version_id',v.id,'student_id',student,'previous_attempt_id',prior.attempt_id,'label',grant_row.label));
 return jsonb_build_object('authorized',true,'attempt_id',new_preflight,'version_id',v.id,'student_id',student,'label',grant_row.label,'reused',false);
end $$;
revoke all on function public.hskk_controlled_test(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_controlled_test(text,jsonb) to authenticated;

-- Load serializes normal creation and reuses the newest authorized preflight.
-- Every other command retains the existing timed, recording and submit guards.
alter function public.hskk_session_command(text,jsonb) rename to hskk_session_command_before_controlled_tests;
create function public.hskk_session_command(command text,payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e account_internal.admin_exams; v public.assignment_versions; p account_internal.hskk_preflights;
begin
 if command is distinct from 'load' then return public.hskk_session_command_before_controlled_tests(command,payload);end if;
 if not exists(select 1 from public.profiles where user_id=actor and role='STUDENT' and status='APPROVED')
 then raise exception 'STUDENT_REQUIRED' using errcode='42501';end if;
 select * into e from account_internal.admin_exams where id=payload->>'exam_code' and exam_type='HSKK';
 if e.active_version_id is null or not exists(select 1 from public.lesson_assignments where lesson_id=e.delivery_id and enabled)
  or not exists(select 1 from account_internal.hskk_controlled_access where exam_id=e.id and owner_id=actor)
  or not account_internal.can_access_lesson(e.delivery_id)
 then raise exception 'EXAM_ACCESS_REQUIRED' using errcode='42501';end if;
 select * into v from public.assignment_versions where id=e.active_version_id and status='published';
 if v.id is null then raise exception 'EXAM_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('hskk-preflight:'||actor::text||v.id::text,0));
 select pf.* into p from account_internal.hskk_preflights pf join account_internal.hskk_delivery_versions dv on dv.assignment_version_id=pf.assignment_version_id
  where pf.owner_id=actor and dv.exam_id=e.id and (pf.assignment_version_id=v.id or exists(select 1 from public.submission_details sd where sd.attempt_id=pf.id and sd.state='draft' and sd.deadline_at>clock_timestamp()))
  order by exists(select 1 from public.submission_details sd where sd.attempt_id=pf.id and sd.state='draft' and sd.deadline_at>clock_timestamp()) desc,pf.created_at desc,pf.id desc limit 1;
 if p.id is null then
  insert into account_internal.hskk_preflights(owner_id,assignment_version_id)values(actor,v.id) returning * into p;
 elsif p.expires_at<=clock_timestamp() and not exists(select 1 from account_internal.hskk_sessions where attempt_id=p.id) then
  update account_internal.hskk_preflights set state='CREATED',expires_at=clock_timestamp()+interval '4 hours' where id=p.id returning * into p;
 end if;
 return jsonb_build_object('exam',account_internal.hskk_delivery_config(p.assignment_version_id),'session',account_internal.hskk_session_read(p.id));
end $$;
revoke all on function public.hskk_session_command_before_controlled_tests(text,jsonb),public.hskk_session_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hskk_session_command(text,jsonb) to authenticated;
notify pgrst,'reload schema';
