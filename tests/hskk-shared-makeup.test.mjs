import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

// Isolated SQL security/timing evidence; no hosted accounts or source files.
for (const [examCode, missingNumbers] of [
  ["H80000", [11, 12]],
  ["H91002", [3, 6]],
])
  test(`Shared ${examCode} missing-only makeup preserves received answers and protects timed pictures`, async () => {
    const { db, as, rpc, admin, student, config, setClock } =
      await deliveryFixture({ examCode, controlledClock: true });
    const fn = async (name, command, payload = {}) =>
      (
        await db.query(`select public.${name}($1,$2) r`, [
          command,
          { exam_code: examCode, ...payload },
        ])
      ).rows[0].r;
    let attempt;
    const session = (c, p) => fn("hskk_session_command", c, p),
      recording = (c, p) => fn("recording_command", c, p);
    const makeup = (c, p = {}) =>
      fn("hskk_makeup", c, { attempt_id: attempt, ...p });
    try {
      const working = {
        id: examCode,
        code: examCode,
        type: "HSKK",
        level: config.level,
        title: examCode,
        sections: config.sections,
        questions: config.questions.map((q) => ({
          ...q,
          question_key: q.id,
          kind: q.type,
        })),
      };
      await db.query("select public.admin_exam_command('save_working',$1)", [
        {
          exam: working,
          request_id: crypto.randomUUID(),
          expected_revision: 0,
        },
      ]);
      await rpc("review_content", { expected_revision: 1 });
      const prepared = await rpc("prepare", { expected_revision: 1 }),
        binding = await rpc("get");
      await db.exec("reset role");
      for (const clip of binding.clips) {
        await db.query(
          "insert into storage.objects(bucket_id,name,metadata)values('hskk-prompt-clips',$1,$2)",
          [clip.path, { size: 100 }],
        );
        await db.query(
          "insert into account_internal.hskk_prompt_receipts(sha256,byte_size,verified_by)values($1,100,$2)",
          [clip.sha256, admin],
        );
      }
      await db.query(
        "insert into account_internal.hskk_runtime_receipts(exam_id,runtime_version)values($1,'hskk-official-v1')",
        [examCode],
      );
      await as(admin);
      await rpc("grant_access", { student_id: student });
      await fn("hskk_publication", "publish", {
        version_id: prepared.version_id,
      });
      await as(student);
      const boot = await session("load");
      attempt = boot.session.attempt_id;
      for (const state of [
        "CANDIDATE_VERIFIED",
        "DEVICE_CHECK",
        "MIC_CHECK",
        "READY",
        "STRUCTURE",
        "COUNTDOWN",
      ])
        await session("transition", {
          attempt_id: attempt,
          state,
          runtime_version: "hskk-buffered-v2",
        });
      const live = await session("get", { attempt_id: attempt });
      await setClock(live.server_deadline + 1);
      const upload = async (q, window) => {
        const asset = await recording("reserve", {
          attempt_id: attempt,
          question_version_id: q.version_id,
          request_id: crypto.randomUUID(),
          sha256: q.number.toString(16).padStart(64, "0"),
          size: 100,
          mime: "audio/webm",
          ...(window ? { makeup_window_id: window } : {}),
        });
        await db.query(
          "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
          [asset.path, { size: 100, mimetype: "audio/webm" }],
        );
        await recording("confirm", { recording_id: asset.id });
        await (window
          ? makeup("bind", { recording_id: asset.id })
          : session("bind_recording", {
              attempt_id: attempt,
              recording_id: asset.id,
            }));
      };
      for (const q of boot.exam.questions.filter(
        (q) => !missingNumbers.includes(q.number),
      ))
        await upload(q);
      await db.exec("reset role");
      const accepted = (
        await db.query(
          "select * from public.submission_answers where attempt_id=$1 order by position",
          [attempt],
        )
      ).rows;
      const original = (
        await db.query(
          "select to_jsonb(s) r from account_internal.hskk_sessions s where attempt_id=$1",
          [attempt],
        )
      ).rows[0].r;
      await setClock(live.upload_deadline + 1);
      await as(student);
      await assert.rejects(
        makeup("open", { student_id: student }),
        /ADMIN_REQUIRED/,
      );
      await as(admin);
      const inspected = await makeup("inspect", { student_id: student });
      assert.deepEqual(inspected.missing_numbers, missingNumbers);
      const opened = await makeup("open", {
        student_id: student,
        request_id: crypto.randomUUID(),
        expected_revision: inspected.revision,
        expected_version_id: inspected.version_id,
        expected_missing: inspected.missing,
      });
      for (const q of boot.exam.questions.filter((q) =>
        missingNumbers.includes(q.number),
      )) {
        const payload = {
          owner_id: student,
          attempt_id: attempt,
          question_version_id: q.version_id,
          makeup_window_id: opened.window_id,
        };
        if (q.prompt_mode === "image") {
          await as(student);
          await assert.rejects(
            db.query("select public.hskk_makeup_picture($1)", [payload]),
            /permission denied/,
          );
          await as(admin, "service_role");
          await assert.rejects(
            db.query("select public.hskk_makeup_picture($1)", [payload]),
            /PROMPT_DENIED/,
          );
        }
        await as(student);
        const timing = await makeup("start", {
          question_version_id: q.version_id,
        });
        assert.equal(
          timing.record_end - timing.record_start,
          q.response_seconds * 1000,
        );
        await setClock(timing.record_start + 1);
        if (q.prompt_mode === "image") {
          await as(admin, "service_role");
          const picture = (
            await db.query("select public.hskk_makeup_picture($1) r", [payload])
          ).rows[0].r;
          assert.equal(picture.question_id, q.id);
          await assert.rejects(
            db.query("select public.hskk_makeup_picture($1)", [
              { ...payload, owner_id: admin },
            ]),
            /PROMPT_DENIED/,
          );
          await assert.rejects(
            db.query("select public.hskk_makeup_picture($1)", [
              {
                ...payload,
                question_version_id: boot.exam.questions[0].version_id,
              },
            ]),
            /PROMPT_DENIED/,
          );
          await setClock(timing.record_end + 1);
          await as(admin, "service_role");
          await assert.rejects(
            db.query("select public.hskk_makeup_picture($1)", [payload]),
            /PROMPT_DENIED/,
          );
        }
        await setClock(timing.record_end + 1);
        await as(student);
        await upload(q, opened.window_id);
        await assert.rejects(
          makeup("start", { question_version_id: q.version_id }),
          /RECORDING_LOCKED/,
        );
      }
      await as(student);
      assert.equal((await makeup("submit")).submitted, true);
      assert.equal(
        (await session("get", { attempt_id: attempt })).state,
        "SUBMITTED",
      );
      await db.exec("reset role");
      const after = (
        await db.query(
          "select * from public.submission_answers where attempt_id=$1 order by position",
          [attempt],
        )
      ).rows;
      assert.equal(after.length, config.questions.length);
      for (const a of accepted.filter((a) => a.answer !== null))
        assert.deepEqual(
          after.find((b) => b.question_version_id === a.question_version_id),
          a,
        );
      assert.deepEqual(
        (
          await db.query(
            "select to_jsonb(s) r from account_internal.hskk_sessions s where attempt_id=$1",
            [attempt],
          )
        ).rows[0].r,
        original,
      );
      await as(admin);
      assert.equal(
        (await fn("hskk_publication", "process_list", { attempt_id: attempt }))
          .recording_ids.length,
        config.questions.length,
      );
    } finally {
      await db.close();
    }
  });
