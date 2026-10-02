import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

test("LOCAL SYNTHETIC server clock: all 27 real SQL windows, retries, private prompts and one submission without changing production timing", async () => {
  const { db, as, rpc, admin, student, setClock } = await deliveryFixture({
    controlledClock: true,
  });
  const session = async (command, payload = {}) =>
    (
      await db.query("select public.hskk_session_command($1,$2) value", [
        command,
        payload,
      ])
    ).rows[0].value;
  const recording = async (command, payload) =>
    (
      await db.query("select public.recording_command($1,$2) value", [
        command,
        payload,
      ])
    ).rows[0].value;
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
    const id = boot.session.attempt_id;
    await assert.rejects(
      db.exec("update test_only.clock set ms=ms+1000000"),
      /permission denied/,
    );
    await assert.rejects(
      session("transition", { attempt_id: id, state: "COUNTDOWN" }),
      /INVALID_TRANSITION/,
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from public.learning_attempts"))
        .rows[0].n,
      0,
    );
    await as(student);
    for (const state of [
      "CANDIDATE_VERIFIED",
      "DEVICE_CHECK",
      "MIC_CHECK",
      "READY",
      "STRUCTURE",
      "COUNTDOWN",
    ])
      await session("transition", { attempt_id: id, state });
    const live = await session("get", { attempt_id: id });
    await db.exec("reset role");
    const frames = (
      await db.query(
        "select timeline from account_internal.hskk_sessions where attempt_id=$1",
        [id],
      )
    ).rows[0].timeline;
    assert.equal(
      live.server_deadline - live.server_started_at,
      frames.at(-1).end,
    );
    assert.equal(
      frames.find((f) => f.state === "PREPARATION").end -
        frames.find((f) => f.state === "PREPARATION").start,
      420000,
    );
    for (const q of boot.exam.questions) {
      const listen = frames.find(
        (f) => f.state === "LISTENING" && f.question_id === q.id,
      );
      const record = frames.find(
        (f) => f.state === "RECORDING" && f.question_id === q.id,
      );
      assert.equal(
        record.end - record.start,
        (q.number <= 15 ? 7 : q.number <= 25 ? 10 : 90) * 1000,
      );
      if (listen) {
        await setClock(live.server_started_at + listen.start);
        await as(student);
        await assert.rejects(
          db.query("select public.hskk_current_prompt($1)", [
            {
              owner_id: student,
              attempt_id: id,
              question_version_id: q.version_id,
            },
          ]),
          /permission denied/,
        );
        await as(null, "service_role");
        const prompt = async (qid, owner = student) =>
          (
            await db.query("select public.hskk_current_prompt($1) value", [
              { owner_id: owner, attempt_id: id, question_version_id: qid },
            ])
          ).rows[0].value;
        assert.equal(
          (await prompt(q.version_id)).sha256,
          binding.clips[q.number - 1].sha256,
        );
        await assert.rejects(
          prompt(boot.exam.questions.find((x) => x.id !== q.id).version_id),
          /PROMPT_WINDOW_REQUIRED/,
        );
        await assert.rejects(
          prompt(q.version_id, admin),
          /EXAM_ACCESS_REQUIRED/,
        );
        await setClock(live.server_started_at + listen.end);
        await as(null, "service_role");
        await assert.rejects(prompt(q.version_id), /PROMPT_WINDOW_REQUIRED/);
      }
      const payload = {
        attempt_id: id,
        question_version_id: q.version_id,
        request_id: crypto.randomUUID(),
        sha256: q.number.toString(16).padStart(64, "0"),
        size: 100,
        mime: "audio/webm",
      };
      await setClock(live.server_started_at + record.end - 1);
      await as(student);
      await assert.rejects(
        recording("reserve", payload),
        /RECORDING_WINDOW_REQUIRED/,
      );
      await assert.rejects(
        session("submit", {
          attempt_id: id,
          server_time: live.server_deadline + 10000,
        }),
        /EXAM_NOT_COMPLETED/,
      );
      await setClock(live.server_started_at + record.end);
      await as(student);
      const reserved = await recording("reserve", payload);
      assert.equal((await recording("reserve", payload)).id, reserved.id);
      await assert.rejects(
        recording("reserve", { ...payload, request_id: crypto.randomUUID() }),
        /RECORDING_LOCKED/,
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
        [reserved.path, { size: 100, mimetype: "audio/webm" }],
      );
      const confirmed = await recording("confirm", {
        recording_id: reserved.id,
      });
      assert.equal("playback_path" in confirmed, false);
      const ref = await session("bind_recording", {
        attempt_id: id,
        recording_id: reserved.id,
      });
      assert.equal(ref.question_version_id, q.version_id);
      await session("bind_recording", {
        attempt_id: id,
        recording_id: reserved.id,
      });
    }
    assert.equal(
      (await session("submit", { attempt_id: id })).state,
      "SUBMITTED",
    );
    assert.equal(
      (await session("submit", { attempt_id: id })).state,
      "SUBMITTED",
    );
    const result = await session("result", { attempt_id: id });
    assert.equal(result.score, undefined);
    assert.equal(result.published_at, undefined);
    await db.exec(
      "select set_config('storage.operation','object.get_authenticated',false)",
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='speaking-private'",
        )
      ).rows.length,
      0,
    );
    await as(null, "anon");
    await assert.rejects(
      db.query(
        "select * from storage.objects where bucket_id='speaking-private'",
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.speaking_recordings",
        )
      ).rows[0].n,
      27,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.learning_attempts"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.submission_grades where score is not null",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
