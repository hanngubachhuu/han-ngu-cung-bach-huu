import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";

const admin = "00000000-0000-4000-8000-000000000001";
const student = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const pending = "00000000-0000-4000-8000-000000000004";
const requestId = (n) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("official assignment migration preserves legacy history and enforces the complete grading boundary", async (t) => {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  const rows = async (sql, values = []) => (await db.query(sql, values)).rows;
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec("set role " + role);
  };
  const command = async (action, payload = {}) =>
    (
      await rows("select public.assignment_command($1,$2) value", [
        action,
        payload,
      ])
    )[0].value;
  const fail = (action, payload, pattern) =>
    assert.rejects(command(action, payload), pattern);
  let legacy, rubric, question, writing, definition, attempt, submitted;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create schema extensions;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${student}','a@example.invalid'),('${other}','b@example.invalid'),('${pending}','pending@example.invalid');`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = (await fs.readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files.filter(
      (f) => !f.includes("official_assignment"),
    )) {
      if (file.includes("learner_accounts_and_access")) {
        await db.exec(`insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,content) values
          ('hsk1_bai4',1,4,'测试','Bài thử','{"answer":"PRIVATE_LEGACY_KEY"}'),
          ('hsk2_bai5',2,5,'测试二','Bài thử hai','{}');
          insert into public.student_lesson_access(user_id,lesson_id) values('${admin}','hsk1_bai4'),('${student}','hsk1_bai4'),('${other}','hsk1_bai4');`);
      }
      if (
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access/.test(
          file,
        )
      )
        continue;
      await db.exec(await fs.readFile(new URL(file, directory), "utf8"));
    }
    await db.exec(`update public.profiles set role='ADMIN',status='APPROVED' where user_id='${admin}';
      insert into public.learning_attempts(user_id,lesson_id,client_attempt_id,score,max_score) values('${student}','hsk1_bai4','legacy-original',99,100);`);
    legacy = (
      await rows("select to_jsonb(a) value from public.learning_attempts a")
    )[0].value;
    for (const file of files.filter((f) => f.includes("official_assignment"))) {
      await db.exec(await fs.readFile(new URL(file, directory), "utf8"));
    }
    await t.test(
      "legacy bytes/IDs remain and no existing lesson is activated",
      async () => {
        assert.deepEqual(
          (
            await rows(
              "select to_jsonb(a) value from public.learning_attempts a",
            )
          )[0].value,
          legacy,
        );
        assert.equal(
          (
            await rows("select count(*)::int n from public.lesson_assignments")
          )[0].n,
          0,
        );
        assert.deepEqual(
          await rows("select id,program from public.courses order by id"),
          [
            { id: "hsk1", program: "HSK" },
            { id: "hsk2", program: "HSK" },
          ],
        );
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.official_learning_results",
            )
          )[0].n,
          0,
        );
      },
    );
    await t.test(
      "anonymous/pending/student cannot create official definitions or call private helpers",
      async () => {
        await as(null, "anon");
        await fail("catalog", {}, /permission denied/);
        await as(pending);
        await fail(
          "start",
          { lesson_id: "hsk1_bai4", request_id: requestId(1) },
          /LESSON_ACCESS_REQUIRED/,
        );
        await as(student);
        await fail("question_create", {}, /ADMIN_REQUIRED/);
        await assert.rejects(
          db.query("select account_internal.assignment_finish($1)", [
            requestId(1),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select account_internal.assignment_read($1,true)", [
            requestId(1),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select content from public.lesson_content"),
          /permission denied/,
        );
        assert.equal(
          (
            await rows(
              "select content from public.get_private_lesson_content('hsk1_bai4')",
            )
          )[0].content.answer,
          "PRIVATE_LEGACY_KEY",
        );
      },
    );
    await t.test(
      "admin creates validated rubric/question versions without public key access",
      async () => {
        await as(admin);
        await fail(
          "rubric_create",
          {
            rubric_key: "writing",
            kind: "writing",
            criteria: [{ id: "meaning", label: "Nghĩa", weight: 9 }],
          },
          /INVALID_RUBRIC/,
        );
        rubric = await command("rubric_create", {
          rubric_key: "writing",
          kind: "writing",
          criteria: [
            { id: "meaning", label: "Nội dung", weight: 6 },
            { id: "grammar", label: "Ngữ pháp", weight: 4 },
          ],
        });
        await fail(
          "question_create",
          {
            lesson_id: "hsk1_bai4",
            question_key: "q1",
            kind: "mcq",
            prompt: "Chọn",
            options: [
              { id: "A", text: "同" },
              { id: "B", text: "同" },
            ],
            answer_key: { value: "A" },
          },
          /INVALID_OPTIONS/,
        );
        question = await command("question_create", {
          lesson_id: "hsk1_bai4",
          question_key: "q1",
          kind: "mcq",
          prompt: "Chọn lời chào.",
          options: [
            { id: "A", text: "你好" },
            { id: "B", text: "再见" },
          ],
          answer_key: { value: "A" },
          explanation: "PRIVATE_EXPLANATION",
        });
        writing = await command("question_create", {
          lesson_id: "hsk1_bai4",
          question_key: "q2",
          kind: "writing",
          prompt: "Viết lời chào.",
          rubric_version_id: rubric.id,
        });
        await as(student);
        assert.deepEqual(
          await rows("select * from public.assignment_question_versions"),
          [],
        );
        assert.deepEqual(
          await rows("select * from public.assignment_rubric_versions"),
          [],
        );
      },
    );
    await t.test(
      "draft → preview → publish, separate explicit activation",
      async () => {
        await as(admin);
        definition = await command("definition_create", {
          lesson_id: "hsk1_bai4",
          title: "Bài nộp thử",
          time_limit_minutes: 30,
          question_version_ids: [question.id, writing.id],
        });
        await fail(
          "definition_publish",
          { version_id: definition.id },
          /PREVIEW_REQUIRED/,
        );
        await command("definition_preview", { version_id: definition.id });
        await command("definition_publish", { version_id: definition.id });
        await as(student);
        assert.deepEqual(await command("catalog"), []);
        await as(admin);
        await command("enable", { lesson_id: "hsk1_bai4", enabled: true });
        await as(student);
        assert.equal((await command("catalog")).length, 1);
        const payload = (
          await rows(
            "select content from public.get_private_lesson_content('hsk1_bai4')",
          )
        )[0].content;
        assert.deepEqual(payload, {
          officialAssignment: true,
          lessonId: "hsk1_bai4",
        });
      },
    );
    await t.test(
      "start pins questions, hides keys, is idempotent and cannot be created by ADMIN",
      async () => {
        await as(admin);
        await fail(
          "start",
          { lesson_id: "hsk1_bai4", request_id: requestId(1) },
          /LESSON_ACCESS_REQUIRED/,
        );
        await as(student);
        attempt = await command("start", {
          lesson_id: "hsk1_bai4",
          request_id: requestId(1),
        });
        assert.equal(attempt.answers.length, 2);
        assert.equal(attempt.result, null);
        assert(!JSON.stringify(attempt).includes("answer_key"));
        assert(!JSON.stringify(attempt).includes("PRIVATE_EXPLANATION"));
        assert.equal(
          (
            await command("start", {
              lesson_id: "hsk1_bai4",
              request_id: requestId(1),
            })
          ).attempt_id,
          attempt.attempt_id,
        );
        assert.equal(
          (await rows("select * from public.learning_attempts")).length,
          1,
        ); // only legacy before Publish
      },
    );
    await t.test(
      "cross-student denial and direct DML/old RPC cannot forge official history",
      async () => {
        await as(other);
        await fail(
          "get",
          { attempt_id: attempt.attempt_id },
          /ATTEMPT_NOT_FOUND/,
        );
        await as(student);
        await assert.rejects(
          db.query(
            "insert into public.learning_attempts(user_id,lesson_id,client_attempt_id,score,max_score,source) values($1,'hsk1_bai4','forged',100,100,'official')",
            [student],
          ),
          /row-level security/,
        );
        await assert.rejects(
          db.query(
            "select public.account_save_attempt('hsk1_bai4',$1,100,100,1,$2)",
            [`official:${requestId(1)}`, student],
          ),
          /OFFICIAL_ATTEMPT_PROTECTED/,
        );
        await assert.rejects(
          db.query(
            "update public.submission_answers set answer='\"forged\"' where attempt_id=$1",
            [attempt.attempt_id],
          ),
          /permission denied/,
        );
        await fail(
          "grade_publish",
          { attempt_id: attempt.attempt_id },
          /ADMIN_REQUIRED/,
        );
      },
    );
    await t.test(
      "autosave rejects stale revision and resume preserves latest answers",
      async () => {
        attempt = await command("save", {
          attempt_id: attempt.attempt_id,
          revision: 0,
          answers: { [question.id]: "A", [writing.id]: "你好！" },
        });
        await fail(
          "save",
          {
            attempt_id: attempt.attempt_id,
            revision: 0,
            answers: { [question.id]: "B" },
          },
          /VERSION_CONFLICT/,
        );
        await fail(
          "save",
          {
            attempt_id: attempt.attempt_id,
            revision: 1,
            answers: { [requestId(99)]: "injected" },
          },
          /INVALID_QUESTION/,
        );
        assert.equal(
          (await command("get", { attempt_id: attempt.attempt_id })).answers[0]
            .answer,
          "A",
        );
      },
    );
    await t.test(
      "submit auto-grades objective, leaves open manual and reveals neither before publish",
      async () => {
        submitted = await command("submit", {
          attempt_id: attempt.attempt_id,
          revision: 1,
        });
        assert.equal(submitted.state, "submitted");
        assert.equal(submitted.result, null);
        assert.equal(
          (
            await command("submit", {
              attempt_id: attempt.attempt_id,
              revision: 1,
            })
          ).revision,
          submitted.revision,
        );
        await fail(
          "save",
          {
            attempt_id: attempt.attempt_id,
            revision: submitted.revision,
            answers: {},
          },
          /SUBMISSION_LOCKED/,
        );
        await as(admin);
        const details = await command("get", {
          attempt_id: attempt.attempt_id,
        });
        assert.equal(details.grading.grades[0].score, 10);
        assert.equal(details.grading.grades[1].score, null);
        await fail(
          "grade_preview",
          {
            attempt_id: attempt.attempt_id,
            grade_revision: 1,
            edit_version: 0,
          },
          /UNGRADED_QUESTIONS/,
        );
      },
    );
    await t.test(
      "rubric grading, preview invalidation and normalization/publication",
      async () => {
        await fail(
          "grade",
          {
            attempt_id: attempt.attempt_id,
            grade_revision: 1,
            edit_version: 0,
            question_version_id: writing.id,
            criteria_scores: { meaning: 7, grammar: 4 },
          },
          /INVALID_RUBRIC_SCORE/,
        );
        await command("grade", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 0,
          question_version_id: writing.id,
          criteria_scores: { meaning: 5, grammar: 3 },
          feedback: "Lời chào rõ ràng.",
        });
        await fail(
          "grade_publish",
          {
            attempt_id: attempt.attempt_id,
            grade_revision: 1,
            edit_version: 1,
          },
          /PREVIEW_REQUIRED/,
        );
        const preview = await command("grade_preview", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 1,
        });
        assert.deepEqual(preview.preview, {
          raw_score: 18,
          raw_max_score: 20,
          normalized_score: 90,
          normalized_max: 100,
        });
        await command("grade", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 1,
          question_version_id: writing.id,
          criteria_scores: { meaning: 5, grammar: 3 },
          feedback: "Đã duyệt.",
        });
        await fail(
          "grade_publish",
          {
            attempt_id: attempt.attempt_id,
            grade_revision: 1,
            edit_version: 2,
          },
          /PREVIEW_REQUIRED/,
        );
        await command("grade_preview", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 2,
        });
        await command("grade_publish", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 2,
        });
        await as(student);
        const visible = await command("get", {
          attempt_id: attempt.attempt_id,
        });
        assert.equal(visible.result.normalized_score, 90);
        assert.equal(visible.result.questions[1].feedback, "Đã duyệt.");
        assert(!JSON.stringify(visible).includes("answer_key"));
        assert.equal(
          (
            await rows(
              "select score from public.learning_attempts where id=$1",
              [attempt.attempt_id],
            )
          )[0].score,
          "90.000000",
        );
        assert.deepEqual(
          await rows("select * from public.submission_grades"),
          [],
        );
        await as(admin);
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.official_learning_results",
            )
          )[0].n,
          1,
        );
      },
    );
    await t.test(
      "answer change does not regrade history; explicit regrade is audited and needs republish",
      async () => {
        const revised = await command("question_create", {
          lesson_id: "hsk1_bai4",
          question_key: "q1",
          kind: "mcq",
          prompt: "Chọn lời tạm biệt.",
          options: question.options,
          answer_key: { value: "B" },
        });
        const version = await command("definition_create", {
          lesson_id: "hsk1_bai4",
          title: "Bản mới",
          question_version_ids: [revised.id, writing.id],
        });
        await command("definition_preview", { version_id: version.id });
        await command("definition_publish", { version_id: version.id });
        await as(student);
        let old = await command("get", { attempt_id: attempt.attempt_id });
        assert.equal(old.answers[0].question.prompt, question.prompt);
        assert.equal(old.result.normalized_score, 90);
        const retake = await command("start", {
          lesson_id: "hsk1_bai4",
          request_id: requestId(2),
        });
        assert.notEqual(retake.attempt_id, attempt.attempt_id);
        assert.equal(retake.answers[0].question.id, revised.id);
        await as(admin);
        await command("regrade", {
          attempt_id: attempt.attempt_id,
          grade_revision: 1,
          edit_version: 2,
          question_version_id: question.id,
          new_question_version_id: revised.id,
          reason: "Sửa đáp án theo bản đã duyệt",
        });
        await as(student);
        old = await command("get", { attempt_id: attempt.attempt_id });
        assert.equal(old.result.normalized_score, 90);
        await as(admin);
        await command("grade_preview", {
          attempt_id: attempt.attempt_id,
          grade_revision: 2,
          edit_version: 0,
        });
        await command("grade_publish", {
          attempt_id: attempt.attempt_id,
          grade_revision: 2,
          edit_version: 0,
        });
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.audit_logs where action='assignment.regrade_started'",
            )
          )[0].n,
          1,
        );
        await as(student);
        assert.equal(
          (await command("get", { attempt_id: attempt.attempt_id })).result
            .normalized_score,
          40,
        );
      },
    );
    await t.test(
      "historical versions, rubric, submission and publications reject mutation even through privileged SQL",
      async () => {
        await db.exec("reset role");
        await assert.rejects(
          db.query(
            "update public.assignment_question_versions set prompt='changed' where id=$1",
            [question.id],
          ),
          /VERSION_IMMUTABLE/,
        );
        await assert.rejects(
          db.query(
            "delete from public.assignment_question_versions where id=$1",
            [question.id],
          ),
          /HISTORY_IMMUTABLE/,
        );
        await assert.rejects(
          db.query(
            "update public.assignment_rubric_versions set criteria='[]' where id=$1",
            [rubric.id],
          ),
          /VERSION_IMMUTABLE/,
        );
        await assert.rejects(
          db.query(
            "update public.submission_answers set answer='null' where attempt_id=$1",
            [attempt.attempt_id],
          ),
          /SUBMISSION_LOCKED/,
        );
        await assert.rejects(
          db.query(
            "update public.submission_results set raw_score=0 where attempt_id=$1 and revision=1",
            [attempt.attempt_id],
          ),
          /PUBLICATION_IMMUTABLE/,
        );
        await assert.rejects(
          db.query(
            "insert into public.assignment_version_questions values($1,3,$2)",
            [definition.id, writing.id],
          ),
          /VERSION_IMMUTABLE/,
        );
        await assert.rejects(
          db.query(
            "insert into public.submission_answers(attempt_id,question_version_id,position,prompt_snapshot) values($1,$2,3,'{}')",
            [attempt.attempt_id, writing.id],
          ),
          /SUBMISSION_LOCKED/,
        );
        await assert.rejects(
          db.query(
            "insert into public.submission_grades(attempt_id,revision,question_version_id,grading_question_version_id,method) values($1,1,$2,$2,'automatic')",
            [attempt.attempt_id, question.id],
          ),
          /PUBLICATION_IMMUTABLE/,
        );
        assert.deepEqual(
          (
            await rows(
              "select to_jsonb(a) value from public.learning_attempts a where id=$1",
              [legacy.id],
            )
          )[0].value,
          legacy,
        );
      },
    );
    await t.test(
      "all objective types are graded on server, alternatives accepted and raw scores normalize to 100",
      async () => {
        await as(admin);
        await db.query(
          "select public.account_admin_action($1,'course','hsk2',true)",
          [student],
        );
        await db.query(
          "select public.account_admin_action($1,'lesson','hsk2_bai5',true)",
          [student],
        );
        const specs = [
          {
            kind: "mcq",
            options: [
              { id: "A", text: "教师" },
              { id: "B", text: "学生" },
            ],
            answer_key: { value: "A" },
            answer: "A",
          },
          { kind: "true_false", answer_key: { value: true }, answer: true },
          {
            kind: "reorder",
            options: ["我", "学习", "汉语"],
            answer_key: { accepted: ["我学习汉语"] },
            answer: ["我", "学习", "汉语"],
          },
          {
            kind: "matching",
            options: ["a: 老师", "b: teacher", "c: student"],
            answer_key: { pairs: { a: "b" } },
            answer: { a: "c" },
          },
          {
            kind: "multi_fill",
            answer_key: {
              values: [["你"], ["好"], ["老师"], ["学生"], ["汉语"]],
            },
            answer: ["你", "好", "老师", "学生", "错误"],
          },
          {
            kind: "text_fill",
            answer_key: { accepted: ["học tiếng Trung", "学习汉语"] },
            answer: "  HỌC   TIẾNG TRUNG  ",
          },
        ];
        const questions = [];
        for (const [i, source] of specs.entries()) {
          const spec = { ...source };
          delete spec.answer;
          questions.push(
            await command("question_create", {
              ...spec,
              lesson_id: "hsk2_bai5",
              question_key: "objective" + i,
              prompt: "Câu hỏi " + i,
            }),
          );
        }
        const exam = await command("definition_create", {
          lesson_id: "hsk2_bai5",
          title: "Các dạng khách quan",
          question_version_ids: questions.map((q) => q.id),
        });
        await command("definition_preview", { version_id: exam.id });
        await command("definition_publish", { version_id: exam.id });
        await command("enable", { lesson_id: "hsk2_bai5", enabled: true });
        await as(student);
        let work = await command("start", {
          lesson_id: "hsk2_bai5",
          request_id: requestId(10),
        });
        assert.equal(work.deadline_at, null);
        work = await command("save", {
          attempt_id: work.attempt_id,
          revision: 0,
          answers: Object.fromEntries(
            questions.map((q, i) => [q.id, specs[i].answer]),
          ),
        });
        await command("submit", {
          attempt_id: work.attempt_id,
          revision: work.revision,
        });
        assert.equal(
          (await command("get", { attempt_id: work.attempt_id })).result,
          null,
        );
        await as(admin);
        const preview = await command("grade_preview", {
          attempt_id: work.attempt_id,
          grade_revision: 1,
          edit_version: 0,
        });
        assert.deepEqual(preview.preview, {
          raw_score: 48,
          raw_max_score: 60,
          normalized_score: 80,
          normalized_max: 100,
        });
        await command("grade_publish", {
          attempt_id: work.attempt_id,
          grade_revision: 1,
          edit_version: 0,
        });
      },
    );
    await t.test(
      "server expiry submits only persisted answers and retries cannot change the result",
      async () => {
        await as(student);
        let late = await command("start", {
          lesson_id: "hsk1_bai4",
          request_id: requestId(11),
        });
        const timedQuestion = late.answers[0].question.id;
        late = await command("save", {
          attempt_id: late.attempt_id,
          revision: 0,
          answers: { [timedQuestion]: "B" },
        });
        await db.exec("reset role");
        // Fixture clock shift, local test DB only: model a browser returning after its 30-minute deadline.
        await db.exec(
          "alter table public.submission_details disable trigger assignment_history_guard",
        );
        await db.query(
          "update public.submission_details set started_at=clock_timestamp()-interval '31 minutes',deadline_at=clock_timestamp()-interval '1 minute' where attempt_id=$1",
          [late.attempt_id],
        );
        await db.exec(
          "alter table public.submission_details enable trigger assignment_history_guard",
        );
        await as(student);
        const expired = await command("save", {
          attempt_id: late.attempt_id,
          revision: late.revision,
          answers: { [timedQuestion]: "A" },
        });
        assert.equal(expired.state, "submitted");
        assert.equal(expired.expired, true);
        assert.equal(expired.timed_out, true);
        assert.equal(expired.answers[0].answer, "B");
        assert.equal(expired.duration_seconds, 1800);
        assert.equal(expired.submitted_at, expired.deadline_at);
        assert.equal(expired.result, null);
        await fail(
          "save",
          {
            attempt_id: late.attempt_id,
            revision: expired.revision,
            answers: {},
          },
          /SUBMISSION_LOCKED/,
        );
        const retry = await command("submit", {
          attempt_id: late.attempt_id,
          revision: expired.revision,
        });
        assert.equal(retry.revision, expired.revision);
        await as(admin);
        assert.equal(
          (await command("get", { attempt_id: late.attempt_id })).grading
            .grades[0].score,
          10,
        );
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.submission_results where attempt_id=$1",
              [late.attempt_id],
            )
          )[0].n,
          1,
        );
      },
    );
    await t.test(
      "HSKK uses existing course/enrollment; recording assignments cannot activate before CP2",
      async () => {
        await db.exec("reset role");
        await db.exec(`insert into public.courses(id,title,level,program) values('hskk_primary','HSKK Sơ cấp',1,'HSKK');
        insert into public.lesson_content(id,course_id,level,lesson_no,title_zh,title_vi) values('hskk_task1','hskk_primary',1,4,'口语','Nói');`);
        await as(admin);
        await db.query(
          "select public.account_admin_action($1,'course','hskk_primary',true)",
          [student],
        );
        await db.query(
          "select public.account_admin_action($1,'lesson','hskk_task1',true)",
          [student],
        );
        const speakingRubric = await command("rubric_create", {
          rubric_key: "speaking",
          kind: "speaking",
          criteria: [{ id: "intelligibility", label: "Dễ hiểu", weight: 10 }],
        });
        const speaking = await command("question_create", {
          lesson_id: "hskk_task1",
          question_key: "s1",
          kind: "speaking",
          prompt: "请介绍自己。",
          rubric_version_id: speakingRubric.id,
        });
        const exam = await command("definition_create", {
          lesson_id: "hskk_task1",
          title: "HSKK",
          question_version_ids: [speaking.id],
        });
        await command("definition_preview", { version_id: exam.id });
        await command("definition_publish", { version_id: exam.id });
        await fail(
          "enable",
          { lesson_id: "hskk_task1", enabled: true },
          /RECORDING_NOT_READY/,
        );
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.enrollments where course_id='hskk_primary'",
            )
          )[0].n,
          1,
        );
      },
    );
    await t.test(
      "revocation denies new starts/writes while published history remains owned",
      async () => {
        await db.query(
          "select public.account_admin_action($1,'lesson','hsk1_bai4',false)",
          [student],
        );
        await as(student);
        await fail(
          "start",
          { lesson_id: "hsk1_bai4", request_id: requestId(3) },
          /LESSON_ACCESS_REQUIRED/,
        );
        assert.equal(
          (await command("get", { attempt_id: attempt.attempt_id })).result
            .normalized_score,
          40,
        );
        await as(other);
        assert.deepEqual(
          await rows("select * from public.official_learning_results"),
          [],
        );
      },
    );
  } finally {
    await db.close();
  }
});
