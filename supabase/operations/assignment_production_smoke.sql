-- Authorized production smoke. Synthetic content only; ALL fixture rows and audits roll back.
-- Uses existing approved identities and real database roles. No Auth user/session/config mutation.
begin;
create temporary table hnh_assignment_smoke_report(section text primary key,passed boolean,details text) on commit drop;
grant insert,select on hnh_assignment_smoke_report to anon,authenticated;
do $smoke$
declare admin_id uuid; student_id uuid; stranger_id uuid:=gen_random_uuid();
 rubric jsonb; question jsonb; writing jsonb; definition jsonb; draft jsonb; saved jsonb; submitted jsonb; inspected jsonb; preview jsonb;
 attempted uuid; qid uuid; wid uuid; denied boolean; lesson text; before_content jsonb; after_content jsonb;
begin
 select user_id into admin_id from public.profiles where role='ADMIN' and status='APPROVED';
 select user_id into student_id from public.profiles where role='STUDENT' and status='APPROVED' order by created_at limit 1;
 if admin_id is null or student_id is null then raise exception 'SMOKE_REQUIRES_EXISTING_ADMIN_AND_APPROVED_STUDENT'; end if;
 select l.id,l.content into lesson,before_content from public.lesson_content l
 where l.visibility='student' and exists(select 1 from public.enrollments e where e.user_id=student_id and e.course_id=l.course_id and e.active
 and (e.access_mode='ALL' or exists(select 1 from public.student_lesson_access a where a.user_id=student_id and a.lesson_id=l.id and a.active))) order by l.id limit 1;
 if lesson is null then raise exception 'SMOKE_REQUIRES_EXISTING_LESSON_ACCESS'; end if;
 -- Scoped, synthetic course/lesson. Existing identities/rows are never edited.
 insert into public.courses(id,title,level,program) values('__hnh_smoke_20260930','Synthetic HSKK smoke',1,'HSKK');
 insert into public.lesson_content(id,course_id,level,lesson_no,title_zh,title_vi,content)
 values('__hnh_smoke_assignment_20260930','__hnh_smoke_20260930',1,1,'测试','Synthetic assignment smoke','{"answer":"SYNTHETIC_LEGACY_KEY"}');
 insert into public.enrollments(user_id,course_id) values(student_id,'__hnh_smoke_20260930');
 insert into public.student_lesson_access(user_id,lesson_id) values(student_id,'__hnh_smoke_assignment_20260930');

 perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 denied:=false; begin perform public.assignment_command('catalog','{}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_ANON_RPC_EXPOSED'; end if;
 denied:=false; begin perform * from public.assignment_question_versions; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_ANON_KEY_TABLE_EXPOSED'; end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',admin_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if not account_internal.is_admin() then raise exception 'SMOKE_ADMIN_CONTEXT_FAILED'; end if;
 rubric:=public.assignment_command('rubric_create','{"rubric_key":"__smoke_writing","kind":"writing","criteria":[{"id":"meaning","label":"Meaning","weight":6},{"id":"grammar","label":"Grammar","weight":4}]}');
 question:=public.assignment_command('question_create','{"lesson_id":"__hnh_smoke_assignment_20260930","question_key":"q1","kind":"mcq","prompt":"Synthetic: choose greeting","options":[{"id":"A","text":"你好"},{"id":"B","text":"再见"}],"answer_key":{"value":"A"},"explanation":"SYNTHETIC_PRIVATE_EXPLANATION"}');
 qid:=(question->>'id')::uuid;
 writing:=public.assignment_command('question_create',jsonb_build_object('lesson_id','__hnh_smoke_assignment_20260930','question_key','q2','kind','writing','prompt','Synthetic: write greeting','rubric_version_id',rubric->>'id'));
 wid:=(writing->>'id')::uuid;
 definition:=public.assignment_command('definition_create',jsonb_build_object('lesson_id','__hnh_smoke_assignment_20260930','title','Synthetic smoke','time_limit_minutes',30,'question_version_ids',jsonb_build_array(qid,wid)));
 perform public.assignment_command('definition_preview',jsonb_build_object('version_id',definition->>'id'));
 perform public.assignment_command('definition_publish',jsonb_build_object('version_id',definition->>'id'));
 perform public.assignment_command('enable','{"lesson_id":"__hnh_smoke_assignment_20260930","enabled":true}');
 denied:=false; begin update public.assignment_question_versions set prompt='forged' where id=qid; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_ADMIN_DIRECT_DML_GRANTED'; end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',student_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select content into after_content from public.get_private_lesson_content(lesson);
 if before_content is distinct from after_content then raise exception 'SMOKE_LEGACY_LESSON_REGRESSION'; end if;
 select content into after_content from public.get_private_lesson_content('__hnh_smoke_assignment_20260930');
 if after_content ? 'answer' or after_content->>'officialAssignment'<>'true' then raise exception 'SMOKE_OFFICIAL_CONTENT_KEY_EXPOSED'; end if;
 draft:=public.assignment_command('start',jsonb_build_object('lesson_id','__hnh_smoke_assignment_20260930','request_id',gen_random_uuid()));
 attempted:=(draft->>'attempt_id')::uuid;
 if draft->>'state'<>'draft' or draft->'result'<>'null'::jsonb or draft::text like '%answer_key%' or draft::text like '%SYNTHETIC_PRIVATE_EXPLANATION%' then raise exception 'SMOKE_DRAFT_PRIVATE_DATA_EXPOSED'; end if;
 if draft->'answers'->0->'question'->>'id'<>qid::text or draft->>'assignment_version_id'<>definition->>'id' then raise exception 'SMOKE_SNAPSHOT_VERSION_MISMATCH'; end if;
 if exists(select 1 from public.assignment_question_versions) or exists(select 1 from public.submission_grades) or exists(select 1 from public.submission_results) then raise exception 'SMOKE_STUDENT_PRIVATE_TABLE_EXPOSED'; end if;
 if exists(select 1 from public.learning_attempts where id=attempted) then raise exception 'SMOKE_UNPUBLISHED_HISTORY_EXPOSED'; end if;
 denied:=false; begin perform public.assignment_command('grade_publish',jsonb_build_object('attempt_id',attempted)); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_STUDENT_CAN_PUBLISH'; end if;
 denied:=false; begin perform public.assignment_command('grade',jsonb_build_object('attempt_id',attempted)); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_STUDENT_CAN_GRADE'; end if;
 denied:=false; begin perform public.assignment_command('question_create','{}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_STUDENT_CAN_CREATE_QUESTION'; end if;
 denied:=false; begin update public.submission_grades set score=10; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_STUDENT_GRADE_DML_GRANTED'; end if;
 denied:=false; begin perform account_internal.assignment_read(attempted,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_PRIVATE_HELPER_EXECUTABLE'; end if;
 denied:=false; begin perform public.account_save_attempt('__hnh_smoke_assignment_20260930','official:forged',100,100,0,student_id); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SMOKE_LEGACY_CAN_FORGE_OFFICIAL'; end if;
 saved:=public.assignment_command('save',jsonb_build_object('attempt_id',attempted,'revision',0,'answers',jsonb_build_object(qid::text,'A',wid::text,'你好！')));
 if saved->>'revision'<>'1' or saved->'answers'->0->>'answer'<>'A' then raise exception 'SMOKE_AUTOSAVE_FAILED'; end if;
 submitted:=public.assignment_command('submit',jsonb_build_object('attempt_id',attempted,'revision',1));
 if submitted->>'state'<>'submitted' or submitted->'result'<>'null'::jsonb then raise exception 'SMOKE_SUBMIT_OR_PUBLICATION_BOUNDARY_FAILED'; end if;
 execute 'reset role';
 if not exists(select 1 from public.learning_attempts a join public.submission_details d on d.attempt_id=a.id where a.id=attempted and a.source='official' and d.state='submitted' and a.score is null and a.max_score is null) then raise exception 'SMOKE_OFFICIAL_PERSISTENCE_FAILED'; end if;
 if not exists(select 1 from public.submission_answers where attempt_id=attempted and question_version_id=qid and prompt_snapshot->>'id'=qid::text and answer='"A"') then raise exception 'SMOKE_ANSWER_FK_FAILED'; end if;

 -- A distinct authenticated identity must not read this student's submission through tables OR RPC.
 perform set_config('request.jwt.claim.sub',stranger_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',stranger_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 denied:=false; begin perform public.assignment_command('get',jsonb_build_object('attempt_id',attempted)); exception when insufficient_privilege then denied:=true; end;
 if not denied or exists(select 1 from public.learning_attempts) then raise exception 'SMOKE_OWNER_ISOLATION_FAILED'; end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',admin_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 inspected:=public.assignment_command('get',jsonb_build_object('attempt_id',attempted));
 if inspected->'grading'->'grades'->0->>'score'<>'10' or inspected->'grading'->'grades'->1->'score'<>'null'::jsonb then raise exception 'SMOKE_AUTOGRADE_FAILED'; end if;
 perform public.assignment_command('grade',jsonb_build_object('attempt_id',attempted,'grade_revision',1,'edit_version',0,'question_version_id',wid,'criteria_scores',jsonb_build_object('meaning',5,'grammar',3),'feedback','Synthetic feedback'));
 preview:=public.assignment_command('grade_preview',jsonb_build_object('attempt_id',attempted,'grade_revision',1,'edit_version',1));
 if preview->'preview'->>'normalized_score'<>'90.000000' and (preview->'preview'->>'normalized_score')::numeric<>90 then raise exception 'SMOKE_NORMALIZATION_FAILED'; end if;
 perform public.assignment_command('grade_publish',jsonb_build_object('attempt_id',attempted,'grade_revision',1,'edit_version',1));
 if not exists(select 1 from public.audit_logs where action='assignment.result_published' and target_id=attempted and actor=admin_id) then raise exception 'SMOKE_AUDIT_FAILED'; end if;
 if not exists(select 1 from public.official_learning_results where attempt_id=attempted and normalized_score=90) then raise exception 'SMOKE_ELIGIBILITY_SOURCE_FAILED'; end if;
 if exists(select 1 from public.official_learning_results v join public.learning_attempts a on a.id=v.attempt_id where a.source='self_reported') then raise exception 'SMOKE_LEGACY_ELIGIBILITY_LEAK'; end if;
 perform public.assignment_command('regrade',jsonb_build_object('attempt_id',attempted,'grade_revision',1,'edit_version',1,'reason','Synthetic regrade smoke'));
 execute 'reset role';
 denied:=false; begin update public.assignment_question_versions set prompt='forged' where id=qid; exception when raise_exception then if SQLERRM='VERSION_IMMUTABLE' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'SMOKE_USED_VERSION_MUTABLE'; end if;
 denied:=false; begin update public.submission_answers set answer='"B"' where attempt_id=attempted and question_version_id=qid; exception when raise_exception then if SQLERRM='SUBMISSION_LOCKED' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'SMOKE_SUBMITTED_ANSWERS_MUTABLE'; end if;

 perform set_config('request.jwt.claim.sub',student_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 inspected:=public.assignment_command('get',jsonb_build_object('attempt_id',attempted));
 if (inspected->'result'->>'normalized_score')::numeric<>90 or inspected ? 'grading' or inspected::text like '%answer_key%' then raise exception 'SMOKE_PUBLISHED_RESULT_PROJECTION_FAILED'; end if;
 execute 'reset role';
 insert into hnh_assignment_smoke_report values
 ('RLS/SECURITY',true,'Real database anon/authenticated roles, approved student/Admin claims; ownership, key/draft denial and command/DML guards pass. Distinct identity tested without creating Auth users.'),
 ('ASSIGNMENT',true,'Synthetic HSKK course reuses enrollment; draft/autosave/submit/version FK/private result/manual rubric/preview/publish/regrade/audit pass.'),
 ('LEGACY BOUNDARY',true,'Old score RPC cannot write official; protected getter contains no key; direct helpers denied.'),
 ('REGRESSION_DB',true,'Existing student lesson getter content and entitlement intact; Admin authorization intact; no Auth change. Browser/Auth gateway checked separately.');
end $smoke$;
select jsonb_agg(to_jsonb(r) order by section) as smoke_report from hnh_assignment_smoke_report r;
rollback;
