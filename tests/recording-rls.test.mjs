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
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
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
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|official_assignment|assignment_authoring_provenance_archive|speaking_private_pipeline|document_exam_import|speaking_submission_boundary|speaking_synthetic_canary/.test(
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
    await t.test(
      "synthetic gate requires exact owner/attempt/question/time; outsiders and expired Storage writes denied",
      async () => {
        await db.exec("reset role;begin");
        const denied = async (fn, pattern) => {
          await db.exec("savepoint expected_denial");
          try {
            await assert.rejects(fn, pattern);
          } finally {
            await db.exec(
              "rollback to savepoint expected_denial;release savepoint expected_denial",
            );
          }
        };
        const run = rid(900),
          lesson = "cp2-browser-" + run,
          qa = rid(901),
          av = rid(902),
          attemptA = rid(903),
          attemptB = rid(904),
          outside = rid(905),
          rawB = rid(906);
        try {
          await db.query(
            "update auth.users set email=$1,raw_app_meta_data=$2 where id=$3",
            [
              "speaking-browser-a-" + run + "@example.invalid",
              { speaking_browser_run: run },
              student,
            ],
          );
          await db.exec(`insert into public.courses(id,title,program,level) values('${lesson}','Synthetic browser Speaking ${run}','HSKK',1);
          insert into public.lesson_content(id,course_id,level,lesson_no,title_zh,title_vi,content) values('${lesson}','${lesson}',1,1,'测试','Synthetic browser','{}');
          insert into public.enrollments(user_id,course_id,active,access_mode) values('${student}','${lesson}',true,'SELECTED'),('${other}','${lesson}',true,'SELECTED');
          insert into public.student_lesson_access(user_id,lesson_id,active) values('${student}','${lesson}',true),('${other}','${lesson}',true);
          insert into public.assignment_question_versions(id,lesson_id,question_key,version,kind,prompt,options,rubric_version_id,created_by) values('${qa}','${lesson}','canary',1,'speaking','Synthetic prompt','[]','${rubric.id}','${admin}');
          insert into public.assignment_versions(id,lesson_id,version,title,created_by) values('${av}','${lesson}',1,'Synthetic browser','${admin}');
          insert into public.assignment_version_questions(assignment_version_id,position,question_version_id) values('${av}',1,'${qa}');
          update public.assignment_question_versions set published_at=clock_timestamp(),published_by='${admin}' where id='${qa}';
          update public.assignment_versions set status='published',previewed_at=clock_timestamp(),published_at=clock_timestamp(),published_by='${admin}' where id='${av}';
          insert into public.learning_attempts(id,user_id,lesson_id,client_attempt_id,source,score,max_score,submitted_at) values('${attemptA}','${student}','${lesson}','canary-a','official',null,null,null),('${attemptB}','${other}','${lesson}','canary-b','official',null,null,null),('${outside}','${student}','${lesson}','canary-outside','official',null,null,null);
          insert into public.submission_details(attempt_id,assignment_version_id) values('${attemptA}','${av}'),('${attemptB}','${av}'),('${outside}','${av}');
          insert into public.submission_answers(attempt_id,question_version_id,position,prompt_snapshot) select a.id,'${qa}',1,account_internal.assignment_question_projection(q) from public.learning_attempts a cross join public.assignment_question_versions q where a.id in ('${attemptA}','${attemptB}','${outside}') and q.id='${qa}';
          insert into account_internal.speaking_test_gate(owner_id,attempt_id,question_version_id,run_id,expires_at) values('${student}','${attemptA}','${qa}','${run}',clock_timestamp()+interval '1 hour');
          insert into account_internal.speaking_recordings(id,attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline) values('${rawB}','${attemptB}','${qa}','${other}','${rawB}','${"a".repeat(64)}',1000,'audio/webm',clock_timestamp()+interval '10 minutes');`);
          const payload = {
            attempt_id: attemptA,
            question_version_id: qa,
            request_id: rid(907),
            sha256: "a".repeat(64),
            size: 1000,
            mime: "audio/webm",
          };
          await as(student);
          await denied(
            () => rows("select * from account_internal.speaking_test_gate"),
            /permission denied/,
          );
          await denied(
            () =>
              rows(
                "insert into account_internal.speaking_test_gate(owner_id,attempt_id,question_version_id,run_id,expires_at) values($1,$2,$3,$4,clock_timestamp()+interval '1 hour')",
                [student, outside, qa, run],
              ),
            /permission denied/,
          );
          await denied(
            () =>
              rows(
                "select account_internal.speaking_canary_allowed($1,$2,$3)",
                [student, attemptA, qa],
              ),
            /permission denied/,
          );
          await denied(
            () => rec("reserve", { ...payload, attempt_id: outside }),
            /RECORDING_NOT_READY/,
          );
          await denied(
            () => rec("reserve", { ...payload, question_version_id: q.id }),
            /RECORDING_NOT_READY/,
          );
          await as(other);
          await denied(
            () => rec("reserve", { ...payload, attempt_id: attemptB }),
            /RECORDING_NOT_READY/,
          );
          await denied(() => rec("reserve", payload), /RECORDING_NOT_READY/);
          await denied(
            () =>
              rows(
                "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
                [rawB + "/raw", { size: 1000, mimetype: "audio/webm" }],
              ),
            /row-level security/,
          );
          await as(null, "anon");
          await denied(() => rec("reserve", payload), /permission denied/);
          await as(student);
          const reserved = await rec("reserve", payload);
          await rows(
            "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
            [reserved.path, { size: 1000, mimetype: "audio/webm" }],
          );
          await db.exec("reset role");
          await rows(
            "update account_internal.speaking_test_gate set expires_at=clock_timestamp()+interval '1 second'",
          );
          await as(student);
          const expires = await rec("reserve", {
            ...payload,
            request_id: rid(920),
          });
          const pending = await rec("reserve", {
            ...payload,
            request_id: rid(921),
          });
          await rows(
            "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
            [expires.path, { size: 1000, mimetype: "audio/webm" }],
          );
          await new Promise((resolve) => setTimeout(resolve, 1100));
          await denied(
            () => rec("confirm", { recording_id: expires.id }),
            /SUBMISSION_LOCKED/,
          );
          await denied(
            () =>
              rows(
                "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
                [pending.path, { size: 1000, mimetype: "audio/webm" }],
              ),
            /row-level security/,
          );
          await db.exec("reset role");
          await rows(
            "update account_internal.speaking_test_gate set expires_at=clock_timestamp()+interval '1 hour'",
          );
          await as(student);
          await rec("confirm", { recording_id: reserved.id });
          let draft = await base("save", {
            attempt_id: attemptA,
            revision: 0,
            answers: { [qa]: { recording_id: reserved.id } },
          });
          draft = await base("submit", {
            attempt_id: attemptA,
            revision: draft.revision,
          });
          assert.equal(draft.state, "submitted");
          await as(null, "service_role");
          assert.equal(await worker("claim", { recording_id: rawB }), null);
          assert.equal((await worker("claim")).id, reserved.id);
          await db.exec("reset role");
          assert.equal(
            (
              await rows(
                "select enabled from account_internal.speaking_settings",
              )
            )[0].enabled,
            false,
          );
          await rows(
            "update account_internal.speaking_test_gate set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second'",
          );
          await as(student);
          await denied(
            () => rec("reserve", { ...payload, request_id: rid(908) }),
            /RECORDING_NOT_READY/,
          );
          await db.exec("reset role");
          await rows(
            "update account_internal.speaking_test_gate set created_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour'",
          );
          await rows(
            "update auth.users set raw_app_meta_data='{}',raw_user_meta_data=$1 where id=$2",
            [{ speaking_browser_run: run }, student],
          );
          await as(student);
          await denied(
            () => rec("reserve", { ...payload, request_id: rid(909) }),
            /RECORDING_NOT_READY/,
          );
        } finally {
          await db.exec("rollback");
          await as(admin);
        }
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
      "confirmed draft recording does not start archival or expiry",
      async () => {
        await as(null, "service_role");
        assert.equal(await worker("claim"), null);
        await db.exec("reset role");
        assert.equal(
          (
            await rows(
              "select expires_at from account_internal.speaking_recordings where id=$1",
              [recording.id],
            )
          )[0].expires_at,
          null,
        );
        await as(student);
      },
    );
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
      "superseded recording is not archived after the attempt is submitted",
      async () => {
        await rows(
          "insert into account_internal.speaking_recordings(attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,upload_deadline,raw_uploaded_at) values($1,$2,$3,$4,$5,1000,'audio/webm',clock_timestamp()+interval '1 day',clock_timestamp())",
          [attempt.attempt_id, q.id, student, rid(501), "e".repeat(64)],
        );
        await as(null, "service_role");
        assert.equal(await worker("claim"), null);
        await db.exec("reset role");
      },
    );
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
    await t.test(
      "expired or cleaned reference cannot be saved or submitted from a draft",
      async () => {
        await as(admin);
        const speakingDefinition = await base("definition_create", {
          lesson_id: "speaking_test",
          title: "Synthetic expired audio submission",
          question_version_ids: [q.id],
        });
        await base("definition_preview", { version_id: speakingDefinition.id });
        await base("definition_publish", { version_id: speakingDefinition.id });
        await as(student);
        const draft = await base("start", {
          lesson_id: "speaking_test",
          request_id: rid(502),
        });
        for (const cleaned of [false, true]) {
          const expired = rid(cleaned ? 504 : 503);
          await db.exec("reset role");
          await rows(
            "insert into account_internal.speaking_recordings(id,attempt_id,question_version_id,owner_id,request_id,raw_sha256,raw_size,raw_mime,created_at,upload_deadline,raw_uploaded_at,conversion_status,mp3_sha256,mp3_size,duration_seconds,drive_status,drive_file_id,uploaded_at,expires_at,cleanup_status,cleaned_at) values($1,$2,$3,$4,$5,$6,1000,'audio/webm',clock_timestamp()-interval '9 days',clock_timestamp()-interval '8 days',clock_timestamp()-interval '9 days','completed',$7,100,1,'completed',$8,clock_timestamp()-interval '8 days',clock_timestamp()-interval '1 day',$9,$10)",
            [
              expired,
              draft.attempt_id,
              q.id,
              student,
              expired,
              "c".repeat(64),
              "d".repeat(64),
              "synthetic_expired_" + cleaned,
              cleaned ? "completed" : "pending",
              cleaned ? new Date() : null,
            ],
          );
          await as(student);
          await assert.rejects(
            base("save", {
              attempt_id: draft.attempt_id,
              revision: draft.revision,
              answers: { [q.id]: { recording_id: expired } },
            }),
            /RECORDING_EXPIRED/,
          );
          await db.exec("reset role");
          await rows(
            "update public.submission_answers set answer=$1 where attempt_id=$2 and question_version_id=$3",
            [{ recording_id: expired }, draft.attempt_id, q.id],
          );
          await as(student);
          await assert.rejects(
            base("submit", {
              attempt_id: draft.attempt_id,
              revision: draft.revision,
            }),
            /RECORDING_EXPIRED/,
          );
        }
        await db.exec("reset role");
        assert.equal(
          (
            await rows(
              "select state from public.submission_details where attempt_id=$1",
              [draft.attempt_id],
            )
          )[0].state,
          "draft",
        );
      },
    );
  } finally {
    await db.close();
  }
});
