-- CP1 additive foundation. No existing content, attempt, identity or grant is deleted.
-- Apply only after the compatible loader has shipped; see docs/assignment-migrations.md.
alter table public.courses add column program text not null default 'HSK'
  check (program in ('HSK','HSKK'));
alter table public.courses drop constraint courses_level_key;
alter table public.courses add constraint courses_program_level_key unique(program,level);
alter table public.lesson_content drop constraint lesson_content_level_lesson_no_key;
alter table public.lesson_content add constraint lesson_content_course_lesson_key unique(course_id,lesson_no);

-- Keep this table as the existing progress/history envelope, not a submission document.
alter table public.learning_attempts drop constraint learning_attempts_source_check;
alter table public.learning_attempts add constraint learning_attempts_source_check
  check(source in ('self_reported','official'));
alter table public.learning_attempts alter column score drop not null;
alter table public.learning_attempts alter column max_score drop not null;
alter table public.learning_attempts alter column submitted_at drop not null;
alter table public.learning_attempts add constraint attempts_score_pair_check check(
  (source='self_reported' and score is not null and max_score is not null and submitted_at is not null)
  or (source='official' and ((score is null and max_score is null) or
    (score is not null and max_score=100 and score<=100 and submitted_at is not null)))
);

create table public.assignment_rubric_versions (
 id uuid primary key default gen_random_uuid(), rubric_key text not null,
 version integer not null check(version>0), kind text not null check(kind in ('translation','writing','speaking')),
 criteria jsonb not null check(jsonb_typeof(criteria)='array'),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(rubric_key,version)
);
create table public.assignment_question_versions (
 id uuid primary key default gen_random_uuid(), lesson_id text not null references public.lesson_content(id),
 question_key text not null check(length(question_key) between 1 and 120), version integer not null check(version>0),
 kind text not null check(kind in ('mcq','true_false','reorder','matching','multi_fill','text_fill','translation','writing','speaking')),
 prompt text not null check(length(prompt) between 1 and 12000),
 options jsonb not null default '[]', answer_key jsonb,
 explanation text not null default '', tip text not null default '',
 rubric_version_id uuid references public.assignment_rubric_versions(id),
 max_score numeric not null default 10 check(max_score=10),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 published_at timestamptz, published_by uuid references public.profiles(user_id),
 unique(lesson_id,question_key,version),
 check((kind in ('translation','writing','speaking') and rubric_version_id is not null and answer_key is null)
    or (kind not in ('translation','writing','speaking') and answer_key is not null and rubric_version_id is null))
);
create table public.assignment_versions (
 id uuid primary key default gen_random_uuid(), lesson_id text not null references public.lesson_content(id),
 version integer not null check(version>0), title text not null check(length(title) between 1 and 200),
 time_limit_minutes integer check(time_limit_minutes between 1 and 240),
 status text not null default 'draft' check(status in ('draft','published')),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 previewed_at timestamptz, published_at timestamptz, published_by uuid references public.profiles(user_id),
 unique(lesson_id,version)
);
create table public.assignment_version_questions (
 assignment_version_id uuid not null references public.assignment_versions(id),
 position integer not null check(position between 1 and 200),
 question_version_id uuid not null references public.assignment_question_versions(id),
 primary key(assignment_version_id,position), unique(assignment_version_id,question_version_id)
);
create table public.lesson_assignments (
 lesson_id text primary key references public.lesson_content(id),
 current_version_id uuid references public.assignment_versions(id),
 enabled boolean not null default false,
 protected_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.submission_details (
 attempt_id uuid primary key references public.learning_attempts(id),
 assignment_version_id uuid not null references public.assignment_versions(id),
 state text not null default 'draft' check(state in ('draft','submitted')),
 revision integer not null default 0 check(revision>=0),
 started_at timestamptz not null default now(), deadline_at timestamptz,
 duration_seconds integer check(duration_seconds>=0), timed_out boolean not null default false,
 check(deadline_at is null or deadline_at>started_at)
);
create table public.submission_answers (
 attempt_id uuid not null references public.submission_details(attempt_id),
 question_version_id uuid not null references public.assignment_question_versions(id),
 position integer not null check(position>0), prompt_snapshot jsonb not null,
 answer jsonb not null default 'null',
 primary key(attempt_id,question_version_id), unique(attempt_id,position)
);
create table public.submission_results (
 attempt_id uuid not null references public.submission_details(attempt_id), revision integer not null check(revision>0),
 state text not null default 'draft' check(state in ('draft','published')),
 edit_version integer not null default 0, preview_version integer,
 reason text not null default '', raw_score numeric, raw_max_score numeric, normalized_score numeric,
 created_at timestamptz not null default now(), created_by uuid references public.profiles(user_id),
 published_at timestamptz, published_by uuid references public.profiles(user_id),
 primary key(attempt_id,revision),
 check(state='draft' or (raw_score is not null and raw_max_score>0 and raw_score between 0 and raw_max_score
   and normalized_score between 0 and 100 and published_at is not null and published_by is not null))
);
create table public.submission_grades (
 attempt_id uuid not null, revision integer not null,
 question_version_id uuid not null,
 grading_question_version_id uuid not null references public.assignment_question_versions(id),
 rubric_version_id uuid references public.assignment_rubric_versions(id),
 score numeric check(score between 0 and 10), feedback text not null default '' check(length(feedback)<=4000),
 criteria_scores jsonb, method text not null check(method in ('automatic','manual')),
 graded_by uuid references public.profiles(user_id), graded_at timestamptz,
 primary key(attempt_id,revision,question_version_id),
 foreign key(attempt_id,revision) references public.submission_results(attempt_id,revision),
 foreign key(attempt_id,question_version_id) references public.submission_answers(attempt_id,question_version_id)
);
create index assignment_questions_lesson_idx on public.assignment_question_versions(lesson_id,question_key,version desc);
create index assignment_versions_lesson_idx on public.assignment_versions(lesson_id,version desc);
create index submission_details_state_idx on public.submission_details(state,started_at desc);
create index submission_results_queue_idx on public.submission_results(state,created_at desc);
create index submission_answers_question_idx on public.submission_answers(question_version_id);
create index submission_grades_key_idx on public.submission_grades(grading_question_version_id);

-- Detail tables are private to ADMIN. Learners receive allowlisted RPC projections only.
-- No client DML privilege, including ADMIN: mutations use transactional commands + audit.
do $$declare t text; begin
 foreach t in array array['assignment_rubric_versions','assignment_question_versions','assignment_versions',
 'assignment_version_questions','lesson_assignments','submission_details','submission_answers','submission_results','submission_grades'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy assignment_admin_read on public.%I for select to authenticated using ((select account_internal.is_admin()))',t);
 end loop;
end $$;

create function account_internal.assignment_history_guard() returns trigger
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
do $$declare t text; begin
 foreach t in array array['assignment_rubric_versions','assignment_question_versions','assignment_versions',
 'assignment_version_questions','submission_details','submission_answers','submission_results','submission_grades'] loop
  execute format('create trigger assignment_history_guard before insert or update or delete on public.%I for each row execute function account_internal.assignment_history_guard()',t);
 end loop;
end $$;

-- A security-invoker view is usable by ADMIN for rule evaluation. Joining a published
-- official result is mandatory; even a forged legacy 100/100 can never enter this set.
create view public.official_learning_results with(security_invoker=true) as
 select a.id attempt_id,a.user_id,a.lesson_id,l.course_id,r.revision,r.raw_score,r.raw_max_score,
 r.normalized_score,r.published_at
 from public.learning_attempts a join public.submission_details d on d.attempt_id=a.id
 join public.lesson_content l on l.id=a.lesson_id
 join public.submission_results r on r.attempt_id=a.id and r.state='published'
 where a.source='official' and d.state='submitted'
 and r.revision=(select max(r2.revision) from public.submission_results r2 where r2.attempt_id=a.id and r2.state='published');
revoke all on public.official_learning_results from public,anon,authenticated;
grant select on public.official_learning_results to authenticated;
