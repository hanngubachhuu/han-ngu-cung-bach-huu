import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
const admin = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002";
test("central exam RPC is Admin-only, atomic, idempotent and pins historic attempts to immutable versions", async (t) => {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec("set role " + role);
  };
  const call = async (command, payload = {}) =>
    (
      await rows("select public.admin_exam_command($1,$2) value", [
        command,
        payload,
      ])
    )[0].value;
  const assignment = async (command, payload = {}) =>
    (
      await rows("select public.assignment_command($1,$2) value", [
        command,
        payload,
      ])
    )[0].value;
  let model, first, oldAttempt;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,storage to anon,authenticated,service_role;
      create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select current_setting('storage.operation',true)=any(operations)$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;
      insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${student}','student@example.invalid');`);
    const dir = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await fs.readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|official_assignment|assignment_authoring_provenance_archive|speaking_private_pipeline|document_exam_import|speaking_submission_boundary|speaking_synthetic_canary|hskk_authoring_drafts|central_admin_exam_workspace/.test(
          file,
        )
      )
        continue;
      if (file.includes("learner_accounts_and_access"))
        await db.exec(
          `insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,content)values('hsk1_bai1',1,1,'你好','Bài học','{}');insert into public.student_lesson_access(user_id,lesson_id)values('${student}','hsk1_bai1');`,
        );
      await db.exec(await fs.readFile(new URL(file, dir), "utf8"));
    }
    await db.exec(
      `update public.profiles set status='APPROVED';update public.profiles set role='ADMIN' where user_id='${admin}';update public.enrollments set access_mode='ALL' where user_id='${student}';`,
    );
    await t.test(
      "anon and student cannot enumerate, edit, publish or read private working content",
      async () => {
        await as(null, "anon");
        await assert.rejects(call("list"), /permission denied/);
        await as(student);
        await assert.rejects(call("list"), /ADMIN_REQUIRED/);
        await assert.rejects(call("publish", {}), /ADMIN_REQUIRED/);
        await assert.rejects(
          rows("select * from account_internal.admin_exams"),
          /permission denied/,
        );
      },
    );
    await as(admin);
    await t.test(
      "existing lesson assignments do not become HSK exams",
      async () => {
        const q = await assignment("question_create", {
          lesson_id: "hsk1_bai1",
          question_key: "lesson-q",
          kind: "true_false",
          prompt: "课堂题",
          options: [],
          answer_key: { value: true },
        });
        await assignment("definition_create", {
          lesson_id: "hsk1_bai1",
          title: "Bài tập của bài học",
          question_version_ids: [q.id],
        });
        assert.deepEqual(await call("list"), []);
        assert.equal((await call("summary")).active, 0);
      },
    );
    model = {
      id: "HSK_REAL",
      type: "HSK",
      level: "1",
      title: "Đề HSK thật",
      revision: 0,
      instructions: "Hướng dẫn làm đề",
      source: { filename: "fixture.docx", sha256: "a".repeat(64) },
      contexts: [{ localId: "reading", title: "Đoạn đọc", text: "原文" }],
      questions: [
        {
          id: "q",
          question_key: "exam-q",
          kind: "mcq",
          prompt: "你好",
          options: [
            { id: "A", text: "你好" },
            { id: "B", text: "再见" },
          ],
          answer_key: { value: "A" },
          contextId: "reading",
          pinyin: "nǐ hǎo",
          image: "",
          audio: "",
          teacher_answer: "private teacher note",
        },
      ],
    };
    const payload = {
      request_id: crypto.randomUUID(),
      expected_revision: 0,
      exam: model,
    };
    await t.test(
      "invalid contents roll back catalog, versions and activation together",
      async () => {
        const bad = structuredClone(payload);
        bad.exam.questions[0].answer_key.value = "Z";
        await assert.rejects(call("publish", bad), /INVALID_OPTIONS/);
        assert.deepEqual(await call("list"), []);
      },
    );
    await t.test(
      "one click publishes and enables the exam; retries cannot duplicate versions",
      async () => {
        first = await call("publish", payload);
        assert.equal(first.published, true);
        assert.deepEqual(await call("publish", payload), first);
        assert.equal((await call("summary")).active, 1);
        await assert.rejects(
          call("publish", { ...payload, exam: { ...model, title: "changed" } }),
          /IDEMPOTENCY_CONFLICT/,
        );
      },
    );
    await as(student);
    oldAttempt = await assignment("start", {
      lesson_id: first.delivery_id,
      request_id: crypto.randomUUID(),
    });
    const oldQuestion = structuredClone(oldAttempt.answers[0].question);
    await t.test(
      "learner projection carries supported content without answers or authoring internals",
      async () => {
        assert.equal(oldQuestion.prompt, "你好");
        assert.equal(oldQuestion.pinyin, "nǐ hǎo");
        const visible = JSON.stringify(oldAttempt);
        for (const forbidden of [
          "private teacher note",
          "sha256",
          "segmentation",
          "teacher_answer",
          "answer_key",
        ])
          assert.ok(!visible.includes(forbidden));
      },
    );
    await as(admin);
    const edited = structuredClone(model);
    edited.questions[0].prompt = "新内容";
    edited.contexts[0].text = "新原文";
    const next = await call("publish", {
      request_id: crypto.randomUUID(),
      expected_revision: 1,
      exam: edited,
    });
    await t.test(
      "new attempts use new versions and existing attempt/question/context snapshots stay pinned",
      async () => {
        assert.notEqual(next.version_id, first.version_id);
        await as(student);
        const current = await assignment("start", {
          lesson_id: first.delivery_id,
          request_id: crypto.randomUUID(),
        });
        const prior = await assignment("get", {
          attempt_id: oldAttempt.attempt_id,
        });
        assert.equal(prior.assignment_version_id, first.version_id);
        assert.deepEqual(prior.answers[0].question, oldQuestion);
        assert.equal(
          prior.contexts.find((c) => c.title === "Đoạn đọc").content,
          "原文",
        );
        assert.equal(current.assignment_version_id, next.version_id);
        assert.equal(current.answers[0].question.prompt, "新内容");
        assert.equal(
          current.contexts.find((c) => c.title === "Đoạn đọc").content,
          "新原文",
        );
      },
    );
    await as(admin);
    await t.test(
      "stale versions and forged HSKK readiness cannot publish",
      async () => {
        await assert.rejects(
          call("publish", {
            request_id: crypto.randomUUID(),
            expected_revision: 1,
            exam: edited,
          }),
          /VERSION_CONFLICT/,
        );
        await assert.rejects(
          call("publish", {
            request_id: crypto.randomUUID(),
            expected_revision: 0,
            exam: {
              ...model,
              id: "HSKK_FORGED",
              type: "HSKK",
              level: "elementary",
              audio: { confirmed: 27 },
              publish_readiness: { ready: true },
            },
          }),
          /HSKK_OFFICIAL_BINDING_REQUIRED/,
        );
        assert.equal((await call("list")).length, 1);
      },
    );
  } finally {
    await db.close();
  }
});
