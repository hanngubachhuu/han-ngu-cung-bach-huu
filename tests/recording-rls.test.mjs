import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
const admin = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const rid = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("Speaking private DB state machine and storage RLS", async (t) => {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.query(
      "select set_config('storage.operation','object.get_authenticated',false)",
    );
    await db.exec("set role " + role);
  };
  const call = async (rpc, command, payload = {}) =>
    (await rows(`select public.${rpc}($1,$2) value`, [command, payload]))[0]
      .value;
  const base = (c, p) => call("assignment_command", c, p),
    rec = (c, p) => call("recording_command", c, p),
    worker = (c, p) => call("recording_worker", c, p);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select current_setting('storage.operation',true)=any(operations)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${student}','a@example.invalid'),('${other}','b@example.invalid');`);
    const dir = new URL("../supabase/migrations/", import.meta.url),
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|official_assignment|assignment_authoring_provenance_archive|speaking_private_pipeline|document_exam_import/.test(
          file,
        )
      )
        continue;
      if (file.includes("learner_accounts_and_access"))
        await db.exec(
          `insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,content) values('speaking_test',1,1,'测试','Synthetic','{}');insert into public.student_lesson_access(user_id,lesson_id) values('${student}','speaking_test'),('${other}','speaking_test');`,
        );
      await db.exec(await fs.readFile(new URL(file, dir), "utf8"));
    }
    await db.exec(
      "grant select,insert,update,delete on storage.objects to anon,authenticated",
    );
    await db.exec(
      `update public.profiles set status='APPROVED';update public.profiles set role='ADMIN' where user_id='${admin}';`,
    );
    await as(admin);
    const rubric = await base("rubric_create", {
      rubric_key: "speaking_test",
      kind: "speaking",
      criteria: [{ id: "clarity", label: "Clarity", weight: 10 }],
    });
    const q = await base("question_create", {
      lesson_id: "speaking_test",
      question_key: "speak",
      kind: "speaking",
      prompt: "Synthetic prompt",
      options: [],
      rubric_version_id: rubric.id,
    });
    const def = await base("definition_create", {
      lesson_id: "speaking_test",
      title: "Synthetic Speaking",
      question_version_ids: [q.id],
    });
    await base("definition_preview", { version_id: def.id });
    await base("definition_publish", { version_id: def.id });
    await t.test(
      "Speaking stays disabled until verified operator gate",
      async () => {
        await assert.rejects(
          base("enable", { lesson_id: "speaking_test", enabled: true }),
          /RECORDING_NOT_READY/,
        );
        await assert.rejects(
          db.exec("update account_internal.speaking_settings set enabled=true"),
          /permission denied/,
        );
      },
    );
    await db.exec(
      "reset role;update account_internal.speaking_settings set enabled=true,verified_at=clock_timestamp()",
    );
    await as(admin);
    await base("enable", { lesson_id: "speaking_test", enabled: true });
    await as(student);
    let attempt = await base("start", {
      lesson_id: "speaking_test",
      request_id: rid(1),
    });
    const payload = {
      attempt_id: attempt.attempt_id,
      question_version_id: q.id,
      request_id: rid(2),
      sha256: "a".repeat(64),
      size: 1000,
      mime: "audio/webm",
    };
    const recording = await rec("reserve", payload);
    await t.test(
      "reservation retry stable and conflicting retry rejected",
      async () => {
        assert.equal((await rec("reserve", payload)).id, recording.id);
        await assert.rejects(
          rec("reserve", { ...payload, size: 1001 }),
          /IDEMPOTENCY_CONFLICT/,
        );
      },
    );
    await t.test(
      "anonymous, student B and direct private metadata access denied",
      async () => {
        await as(null, "anon");
        await assert.rejects(
          rec("get", { recording_id: recording.id }),
          /permission denied/,
        );
        assert.equal(
          (
            await rows(
              "select * from storage.objects where bucket_id='speaking-private'",
            )
          ).length,
          0,
        );
        await as(other);
        await assert.rejects(
          rec("get", { recording_id: recording.id }),
          /RECORDING_NOT_FOUND/,
        );
        await assert.rejects(
          rows(
            "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,'{}')",
            [recording.path],
          ),
          /row-level security/,
        );
        await as(student);
        await assert.rejects(
          rows("select * from account_internal.speaking_recordings"),
          /permission denied/,
        );
        await assert.rejects(worker("claim"), /permission denied/);
      },
    );
    await rows(
      "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
      [recording.path, { size: 1000, mimetype: "audio/webm" }],
    );
    await rec("confirm", { recording_id: recording.id });
    await rec("confirm", { recording_id: recording.id });
    await t.test(
      "no overwrite/delete or cross-submission answer binding",
      async () => {
        assert.equal(
          (
            await rows(
              "update storage.objects set metadata='{}' where name=$1 returning id",
              [recording.path],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await rows(
              "delete from storage.objects where name=$1 returning id",
              [recording.path],
            )
          ).length,
          0,
        );
        const second = await base("start", {
          lesson_id: "speaking_test",
          request_id: rid(3),
        });
        await assert.rejects(
          base("save", {
            attempt_id: second.attempt_id,
            revision: second.revision,
            answers: { [q.id]: { recording_id: recording.id } },
          }),
          /INVALID_RECORDING_REFERENCE/,
        );
      },
    );
    attempt = await base("save", {
      attempt_id: attempt.attempt_id,
      revision: attempt.revision,
      answers: { [q.id]: { recording_id: recording.id } },
    });
    attempt = await base("submit", {
      attempt_id: attempt.attempt_id,
      revision: attempt.revision,
    });
    await t.test(
      "submitted reference immutable and draft grade hidden",
      async () => {
        assert.equal(attempt.result, null);
        await assert.rejects(
          base("save", {
            attempt_id: attempt.attempt_id,
            revision: attempt.revision,
            answers: { [q.id]: null },
          }),
          /SUBMISSION_LOCKED/,
        );
        await assert.rejects(
          rec("reserve", { ...payload, request_id: rid(4) }),
          /SUBMISSION_LOCKED/,
        );
      },
    );
    await as(null, "service_role");
    let job = await worker("claim");
    assert.equal(job.id, recording.id);
    const lease = { recording_id: job.id, lease_id: job.lease_id };
    await t.test("stale conversion lease cannot finalize", async () => {
      await assert.rejects(
        worker("converted", {
          ...lease,
          lease_id: rid(50),
          sha256: "b".repeat(64),
          size: 100,
          duration: 1,
        }),
        /STALE_RECORDING_LEASE/,
      );
    });
    await worker("converted", {
      ...lease,
      sha256: "b".repeat(64),
      size: 100,
      duration: 1,
    });
    await worker("converted", {
      ...lease,
      sha256: "b".repeat(64),
      size: 100,
      duration: 1,
    });
    await worker("drive_id", { ...lease, file_id: "synthetic_drive_id" });
    await worker("failed", { ...lease, error_code: "DRIVE_REQUEST_FAILED" });
    await db.exec("reset role");
    await t.test(
      "Drive failure retains objects and no expiry starts",
      async () => {
        const r = (
          await rows(
            "select * from account_internal.speaking_recordings where id=$1",
            [recording.id],
          )
        )[0];
        assert.equal(r.expires_at, null);
        assert.equal(r.uploaded_at, null);
        assert.equal(r.retry_count, 1);
        assert.equal(
          (
            await rows("select * from storage.objects where name=$1", [
              recording.path,
            ])
          ).length,
          1,
        );
      },
    );
    await db.query(
      "update account_internal.speaking_recordings set next_attempt_at=clock_timestamp() where id=$1",
      [recording.id],
    );
    await as(null, "service_role");
    job = await worker("claim");
    await worker("archived", {
      recording_id: job.id,
      lease_id: job.lease_id,
      file_id: "synthetic_drive_id",
    });
    await db.exec("reset role");
    await rows(
      "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,'{}')",
      [recording.id + "/audio.mp3"],
    );
    const archived = (
      await rows(
        "select * from account_internal.speaking_recordings where id=$1",
        [recording.id],
      )
    )[0];
    assert.equal(
      new Date(archived.expires_at) - new Date(archived.uploaded_at),
      7 * 86400000,
    );
    await t.test(
      "Admin playback allowed; B isolated; raw unavailable to Admin",
      async () => {
        await as(admin);
        assert.equal(
          (
            await rows(
              "select name from storage.objects where bucket_id='speaking-private'",
            )
          ).length,
          1,
        );
        assert.equal(
          (await rec("get", { recording_id: recording.id })).playback_path,
          recording.id + "/audio.mp3",
        );
        await as(other);
        assert.equal(
          (
            await rows(
              "select name from storage.objects where bucket_id='speaking-private'",
            )
          ).length,
          0,
        );
        await as(student);
        assert.equal(
          (
            await rows(
              "select name from storage.objects where bucket_id='speaking-private'",
            )
          ).length,
          2,
        );
      },
    );
    await as(null, "service_role");
    assert.equal(await worker("claim"), null);
    await db.exec("reset role");
    await t.test(
      "retention dates immutable even for direct privileged updates",
      async () => {
        await assert.rejects(
          rows(
            "update account_internal.speaking_recordings set expires_at=expires_at-interval '8 days',uploaded_at=uploaded_at-interval '8 days' where id=$1",
            [recording.id],
          ),
          /RECORDING_HISTORY_IMMUTABLE/,
        );
      },
    );

    await t.test(
      "expired cleanup is fenced/idempotent and preserves all submission/grade/history rows",
      async () => {
        await db.exec("reset role");
        const before = (
          await rows(
            "select jsonb_build_object('attempts',(select jsonb_agg(to_jsonb(a) order by id) from public.learning_attempts a),'answers',(select jsonb_agg(to_jsonb(a) order by attempt_id,question_version_id) from public.submission_answers a),'grades',(select jsonb_agg(to_jsonb(g) order by attempt_id,revision,question_version_id) from public.submission_grades g)) value",
          )
        )[0].value;
        const expired = rid(60);
        await rows(
          "insert into account_internal.speaking_recordings(id,attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,created_at,upload_deadline,raw_uploaded_at,conversion_status,mp3_sha256,mp3_size,duration_seconds,drive_status,drive_file_id,uploaded_at,expires_at) values($1,$2,$3,$4,$5,$6,1000,'audio/webm',clock_timestamp()-interval '9 days',clock_timestamp()-interval '8 days',clock_timestamp()-interval '9 days','completed',$7,100,1,'completed','expired_fixture',clock_timestamp()-interval '8 days',clock_timestamp()-interval '1 day')",
          [
            expired,
            attempt.attempt_id,
            q.id,
            student,
            rid(61),
            "c".repeat(64),
            "d".repeat(64),
          ],
        );
        await rows(
          "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,'{}')",
          [expired + "/audio.mp3"],
        );
        await as(student);
        assert.equal(
          (
            await rows("select * from storage.objects where name=$1", [
              expired + "/audio.mp3",
            ])
          ).length,
          0,
        );
        await as(null, "service_role");
        const cleanup = await worker("claim");
        assert.equal(cleanup.id, expired);
        assert.equal(cleanup.job, "cleanup");
        const ct = { recording_id: cleanup.id, lease_id: cleanup.lease_id };
        await worker("cleanup_check", ct);
        await worker("failed", { ...ct, error_code: "STORAGE_DELETE_FAILED" });
        await assert.rejects(worker("cleaned", ct), /STALE_RECORDING_LEASE/);
        await db.exec("reset role");
        await rows(
          "update account_internal.speaking_recordings set next_attempt_at=clock_timestamp() where id=$1",
          [expired],
        );
        await as(null, "service_role");
        const retry = await worker("claim");
        assert.notEqual(retry.lease_id, cleanup.lease_id);
        await worker("cleaned", {
          recording_id: expired,
          lease_id: retry.lease_id,
        });
        assert.equal(await worker("claim"), null);
        await db.exec("reset role");
        const after = (
          await rows(
            "select jsonb_build_object('attempts',(select jsonb_agg(to_jsonb(a) order by id) from public.learning_attempts a),'answers',(select jsonb_agg(to_jsonb(a) order by attempt_id,question_version_id) from public.submission_answers a),'grades',(select jsonb_agg(to_jsonb(g) order by attempt_id,revision,question_version_id) from public.submission_grades g)) value",
          )
        )[0].value;
        assert.deepEqual(after, before);
        assert.equal(
          (
            await rows(
              "select cleanup_status from account_internal.speaking_recordings where id=$1",
              [expired],
            )
          )[0].cleanup_status,
          "completed",
        );
      },
    );
    await t.test(
      "document import is Admin-only, atomic, idempotent, auto-provenanced and pins shared context",
      async () => {
        const payload = {
          request_id: rid(100),
          lesson_id: "speaking_test",
          title: "Imported synthetic",
          filename: "synthetic.pdf",
          file_sha256: "e".repeat(64),
          instructions: "Synthetic instructions",
          contexts: [
            {
              key: "passage",
              title: "Đoạn đọc chung",
              text: "小王每天七点起床。",
            },
          ],
          questions: [
            {
              item_id: "one",
              source_item_id: "question:one",
              kind: "mcq",
              prompt: "他几点起床？",
              options: [
                { id: "A", text: "七点" },
                { id: "B", text: "八点" },
              ],
              answer_key: { value: "A" },
              context_key: "passage",
            },
            {
              item_id: "two",
              source_item_id: "question:two",
              kind: "writing",
              prompt: "请写一句话。",
              options: [],
              answer_key: null,
              explanation: "Đáp án mẫu: 你好",
              context_key: null,
            },
          ],
        };
        const doc = (p) =>
          rows("select public.document_exam_import($1) value", [p]).then(
            (r) => r[0].value,
          );
        await as(student);
        await assert.rejects(doc(payload), /ADMIN_REQUIRED/);
        await as(null, "anon");
        await assert.rejects(doc(payload), /permission denied/);
        await as(admin);
        const imported = await doc(payload);
        assert.equal(imported.count, 2);
        assert.equal(
          (await doc(payload)).definition_id,
          imported.definition_id,
        );
        await assert.rejects(
          doc({ ...payload, title: "Conflict" }),
          /IDEMPOTENCY_CONFLICT/,
        );
        const preview = await base("definition_preview", {
          version_id: imported.definition_id,
        });
        assert.equal(preview.contexts.length, 2);
        await base("definition_publish", {
          version_id: imported.definition_id,
        });
        await as(student);
        const submitted = await base("start", {
          lesson_id: "speaking_test",
          request_id: rid(101),
        });
        assert.equal(submitted.contexts.length, 2);
        assert(submitted.answers[0].question.context_version_id);
        assert(!JSON.stringify(submitted).includes("Đáp án mẫu"));
        await db.exec("reset role");
        await assert.rejects(
          rows(
            "update account_internal.assignment_context_versions set content='changed'",
          ),
          /immutable/i,
        );
        const count = (
          await rows(
            "select count(*)::int n from public.assignment_question_versions",
          )
        )[0].n;
        await as(admin);
        const derived = (
          await rows(
            "select public.assignment_authoring('question_create',$1) value",
            [
              {
                request_id: rid(103),
                question: {
                  lesson_id: "speaking_test",
                  question_key: "derived-import",
                  kind: "mcq",
                  prompt: "他几点起床？",
                  options: payload.questions[0].options,
                  answer_key: { value: "A" },
                },
                metadata: { parent_version_id: imported.questions[0] },
              },
            ],
          )
        )[0].value;
        await assert.rejects(
          rows(
            "select context_version_id from account_internal.assignment_question_contexts where question_version_id=$1",
            [derived.id],
          ),
          /permission denied/,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await rows(
              "select count(*)::int n from account_internal.assignment_question_contexts where question_version_id=$1",
              [derived.id],
            )
          )[0].n,
          1,
        );
        await as(admin);
        const manual = await doc({
          ...payload,
          request_id: rid(104),
          source_kind: "manual",
          file_sha256: null,
          filename: "Đề mới",
          contexts: [],
          instructions: "",
          questions: [{ ...payload.questions[1], context_key: null }],
        });
        assert.equal(manual.count, 1);
        await db.exec("reset role");
        const manualSource = (
          await rows(
            "select source,source_identifier from account_internal.assignment_question_sources where question_version_id=$1",
            [manual.questions[0]],
          )
        )[0];
        assert.equal(manualSource.source, "admin_manual");
        assert.equal(manualSource.source_identifier, "form:" + rid(104));
        const countAfterDerived = (
          await rows(
            "select count(*)::int n from public.assignment_question_versions",
          )
        )[0].n;
        assert.equal(countAfterDerived, count + 2);
        await as(admin);
        await assert.rejects(
          doc({
            ...payload,
            request_id: rid(102),
            questions: [
              payload.questions[0],
              { ...payload.questions[1], prompt: "" },
            ],
          }),
          /INVALID_QUESTION/,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.assignment_question_versions",
            )
          )[0].n,
          countAfterDerived,
        );
      },
    );
    await t.test(
      "even owner cannot create signed URLs or list object metadata",
      async () => {
        await as(student);
        for (const operation of [
          "object.sign",
          "object.sign_many",
          "object.list",
        ]) {
          await rows("select set_config('storage.operation',$1,false)", [
            operation,
          ]);
          assert.equal(
            (
              await rows(
                "select * from storage.objects where bucket_id='speaking-private'",
              )
            ).length,
            0,
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});
