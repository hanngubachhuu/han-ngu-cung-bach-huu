import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

for (const variant of ["retry", "received", "expired"])
  test(
    "Admin makeup preserves accepted answers, privacy and late receipt; " +
      variant,
    async () => {
      const existingUpload = variant === "received";
      const { db, as, rpc, admin, student, setClock } = await deliveryFixture({
        controlledClock: true,
      });
      const fn = async (name, command, payload = {}) =>
        (
          await db.query("select public." + name + "($1,$2) value", [
            command,
            payload,
          ])
        ).rows[0].value;
      const session = (c, p) => fn("hskk_session_command", c, p),
        recording = (c, p) => fn("recording_command", c, p);
      let id;
      let original26;
      const makeup = (c, p = {}) =>
        fn("hskk_makeup", c, { exam_code: "H71002", attempt_id: id, ...p });
      try {
        const prepared = await rpc("prepare", { expected_revision: 1 });
        await rpc("grant_access", { student_id: student });
        const binding = await rpc("get");
        await db.exec("reset role");
        for (const q of binding.clips) {
          await db.query(
            "insert into storage.objects(bucket_id,name,metadata)values('hskk-prompt-clips',$1,$2)",
            [q.path, { size: 100, mimetype: "audio/mpeg" }],
          );
          await db.query(
            "insert into account_internal.hskk_prompt_receipts(sha256,byte_size,verified_by)values($1,100,$2)",
            [q.sha256, admin],
          );
        }
        await db.exec(
          "insert into account_internal.hskk_runtime_receipts(exam_id,runtime_version)values('H71002','hskk-official-v1')",
        );
        await as(admin);
        await db.query("select public.hskk_publication('publish',$1)", [
          { exam_code: "H71002", version_id: prepared.version_id },
        ]);
        await as(student);
        const boot = await session("load", { exam_code: "H71002" });
        id = boot.session.attempt_id;
        for (const state of [
          "CANDIDATE_VERIFIED",
          "DEVICE_CHECK",
          "MIC_CHECK",
          "READY",
          "STRUCTURE",
          "COUNTDOWN",
        ])
          await session("transition", {
            attempt_id: id,
            state,
            runtime_version: "hskk-buffered-v2",
          });
        const live = await session("get", { attempt_id: id });
        await setClock(live.server_deadline + 1);
        await as(student);
        const payloads = boot.exam.questions.map((q) => ({
          attempt_id: id,
          question_version_id: q.version_id,
          request_id: crypto.randomUUID(),
          sha256: q.number.toString(16).padStart(64, "0"),
          size: 100,
          mime: "audio/webm",
        }));
        for (let i = 0; i < 27; i++) {
          const r = await recording("reserve", payloads[i]);
          if (i === 25) original26 = r;
          if (i === 26 || (i === 25 && !existingUpload)) continue;
          await db.query(
            "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
            [r.path, { size: 100, mimetype: "audio/webm" }],
          );
          await recording("confirm", { recording_id: r.id });
          if (i === 25) continue; // Bytes received; the original bind failed.
          await session("bind_recording", {
            attempt_id: id,
            recording_id: r.id,
          });
        }
        await db.exec("reset role");
        const snapshot = async () =>
          (
            await db.query(
              `select jsonb_build_object('session',(select to_jsonb(s)from account_internal.hskk_sessions s where attempt_id=$1),
   'answers',(select jsonb_agg(to_jsonb(a)order by position)from public.submission_answers a where attempt_id=$1 and position<=25),
   'recordings',(select jsonb_agg(to_jsonb(r)order by id)from account_internal.speaking_recordings r where attempt_id=$1))value`,
              [id],
            )
          ).rows[0].value;
        const before = await snapshot();
        await as(student);
        await assert.rejects(
          makeup("open", { student_id: student }),
          /ADMIN_REQUIRED/,
        );
        await as(null, "anon");
        await assert.rejects(makeup("load"), /permission denied/);
        await as(admin);
        await assert.rejects(
          makeup("open", {
            student_id: student,
            request_id: crypto.randomUUID(),
          }),
          /MAKEUP_NOT_AVAILABLE/,
        );
        await setClock(live.upload_deadline + 1);
        await as(admin);
        const inspect = await makeup("inspect", { student_id: student });
        assert.deepEqual(inspect.missing_numbers, [26, 27]);
        const openPayload = {
          student_id: student,
          request_id: crypto.randomUUID(),
          expected_revision: inspect.revision,
          expected_version_id: inspect.version_id,
          expected_missing: inspect.missing,
        };
        await assert.rejects(
          makeup("open", {
            ...openPayload,
            expected_missing: [boot.exam.questions[0].version_id],
          }),
          /VERSION_CONFLICT/,
        );
        let opened = await makeup("open", openPayload);
        assert.equal(
          (await makeup("open", openPayload)).window_id,
          opened.window_id,
        );
        await assert.rejects(
          makeup("open", { ...openPayload, request_id: crypto.randomUUID() }),
          /MAKEUP_ALREADY_OPEN/,
        );
        await as(student);
        let loaded = await makeup("load");
        await as(null, "service_role");
        await assert.rejects(
          db.query("select public.hskk_makeup_prompt($1)", [
            {
              makeup_window_id: opened.window_id,
              owner_id: student,
              question_version_id: boot.exam.questions[0].version_id,
            },
          ]),
          /PROMPT_DENIED/,
        );
        await as(student);
        if (variant === "expired") {
          await setClock(loaded.expires_at + 1);
          await as(student);
          await assert.rejects(
            makeup("start", { question_version_id: inspect.missing[0] }),
            /UPLOAD_WINDOW_EXPIRED/,
          );
          await assert.rejects(makeup("submit"), /UPLOAD_WINDOW_EXPIRED/);
          await assert.rejects(
            recording("reserve", {
              ...payloads[25],
              makeup_window_id: opened.window_id,
            }),
            /UPLOAD_WINDOW_EXPIRED/,
          );
          await as(admin);
          const current = await makeup("inspect", { student_id: student });
          assert.equal(current.window_id, null);
          assert.equal(current.last_window_id, opened.window_id);
          const reopened = await makeup("open", {
            ...openPayload,
            request_id: crypto.randomUUID(),
          });
          assert.notEqual(reopened.window_id, opened.window_id);
          opened = reopened;
          await as(student);
          loaded = await makeup("load");
        }
        assert.deepEqual(
          loaded.questions.map((q) => q.number),
          [26, 27],
        );
        await assert.rejects(makeup("open", openPayload), /ADMIN_REQUIRED/);
        await assert.rejects(
          makeup("start", {
            question_version_id: boot.exam.questions[0].version_id,
          }),
          /RECORDING_LOCKED/,
        );
        await assert.rejects(makeup("submit"), /RECORDING_REQUIRED/);
        await assert.rejects(
          session("submit", { attempt_id: id }),
          /UPLOAD_WINDOW_EXPIRED/,
        );
        await assert.rejects(
          db.query("select public.hskk_makeup_prompt($1)", [
            {
              makeup_window_id: opened.window_id,
              owner_id: student,
              question_version_id: inspect.missing[0],
            },
          ]),
          /permission denied/,
        );
        await db.exec("reset role");
        const other = crypto.randomUUID();
        await db.query(
          "insert into auth.users(id,email)values($1,'other@example.invalid')",
          [other],
        );
        await db.query(
          "update public.profiles set status='APPROVED' where user_id=$1",
          [other],
        );
        await as(other);
        await assert.rejects(makeup("load"), /SESSION_NOT_FOUND/);
        await as(student);
        // Retained original bytes can be sent without rerecording; recovery identity is distinct and stable.
        const p26 = {
          ...payloads[25],
          request_id: crypto.randomUUID(),
          original_request_id: payloads[25].request_id,
          makeup_window_id: opened.window_id,
        };
        let r26;
        if (existingUpload) {
          assert.equal(
            loaded.existing_recordings[inspect.missing[0]],
            original26.id,
          );
          r26 = original26;
        } else {
          r26 = await recording("reserve", p26);
          assert.equal((await recording("reserve", p26)).id, r26.id);
          await assert.rejects(
            recording("reserve", { ...p26, sha256: "f".repeat(64) }),
            /RECORDING_LOCKED/,
          );
          await assert.rejects(
            recording("confirm", { recording_id: r26.id }),
            /UPLOAD_NOT_CONFIRMED/,
          );
          await db.query(
            "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
            [r26.path, { size: 100, mimetype: "audio/webm" }],
          );
          await recording("confirm", { recording_id: r26.id });
          await assert.rejects(
            session("bind_recording", { attempt_id: id, recording_id: r26.id }),
            /MAKEUP_TRANSPORT_REQUIRED/,
          );
        }
        // Match the production trigger's expired clock, not only the RPC clock.
        // The first implementation failed here with SUBMISSION_LOCKED.
        await db.exec("reset role");
        await assert.rejects(
          db.query(
            "update public.submission_answers set answer='null'::jsonb where attempt_id=$1 and position=1",
            [id],
          ),
          /SUBMISSION_LOCKED/,
        );
        await assert.rejects(
          db.query(
            "update public.submission_answers set answer=$2 where attempt_id=$1 and position=27",
            [id, { recording_id: r26.id }],
          ),
          /SUBMISSION_LOCKED/,
        );
        await as(student);
        await makeup("bind", { recording_id: r26.id });
        await makeup("bind", { recording_id: r26.id });
        await assert.rejects(
          makeup("start", { question_version_id: inspect.missing[0] }),
          /RECORDING_LOCKED/,
        );
        // New final-question recording has the canonical 90-second server window.
        const p27 = {
          ...payloads[26],
          request_id: crypto.randomUUID(),
          makeup_window_id: opened.window_id,
        };
        await assert.rejects(
          recording("reserve", p27),
          /RECORDING_WINDOW_REQUIRED/,
        );
        const timing = await makeup("start", {
          question_version_id: inspect.missing[1],
        });
        assert.equal(timing.record_end - timing.record_start, 90000);
        assert.equal(
          (await makeup("start", { question_version_id: inspect.missing[1] }))
            .record_end,
          timing.record_end,
        );
        await setClock(timing.record_end);
        await as(student);
        const r27 = await recording("reserve", p27);
        await db.query(
          "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
          [r27.path, { size: 100, mimetype: "audio/webm" }],
        );
        await recording("confirm", { recording_id: r27.id });
        await makeup("bind", { recording_id: r27.id });
        await db.exec("reset role");
        const after = await snapshot();
        assert.deepEqual(after.session, before.session);
        assert.deepEqual(after.answers, before.answers);
        for (const old of before.recordings)
          assert.deepEqual(
            after.recordings.find((r) => r.id === old.id),
            old,
          );
        await as(student);
        const result = await makeup("submit");
        assert.equal(result.submitted, true);
        assert.equal((await makeup("submit")).submitted, true);
        assert.equal(
          (await session("get", { attempt_id: id })).state,
          "SUBMITTED",
        );
        assert.equal(
          "playback_path" in (await recording("get", { recording_id: r27.id })),
          false,
        );
        await db.exec(
          "select set_config('storage.operation','object.get_authenticated',false)",
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from storage.objects where bucket_id='speaking-private'",
            )
          ).rows[0].n,
          0,
        );
        await db.exec("reset role");
        const received = (
          await db.query(
            "select submitted_at from public.learning_attempts where id=$1",
            [id],
          )
        ).rows[0].submitted_at;
        assert.ok(new Date(received).getTime() >= timing.record_end);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from public.submission_results where attempt_id=$1",
              [id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from public.submission_results where attempt_id=$1 and state='published'",
              [id],
            )
          ).rows[0].n,
          0,
        );
        assert.deepEqual((await snapshot()).session, before.session);
        await as(admin);
        const processing = (
          await db.query(
            "select public.hskk_publication('process_list',$1) value",
            [{ exam_code: "H71002", attempt_id: id }],
          )
        ).rows[0].value;
        assert.equal(processing.recording_ids.length, 27);
        assert.equal(new Set(processing.recording_ids).size, 27);
        const review = (
          await db.query("select public.assignment_command('get',$1) value", [
            { attempt_id: id },
          ])
        ).rows[0].value;
        assert.deepEqual(review.makeup.questions, [26, 27]);
        await setClock(loaded.expires_at + 1);
        await as(student);
        await assert.rejects(
          makeup("start", { question_version_id: inspect.missing[1] }),
          /SUBMISSION_LOCKED/,
        );
      } finally {
        await db.close();
      }
    },
  );
