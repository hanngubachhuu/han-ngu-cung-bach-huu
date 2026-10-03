import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

test("one Admin-authorized H71002 test keeps the old attempt immutable and uses normal preflight/timing", async () => {
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
  const authorize = async (command, payload) =>
    (
      await db.query("select public.hskk_controlled_test($1,$2) value", [
        command,
        { exam_code: "H71002", student_id: student, ...payload },
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
    const old = await session("load", { exam_code: "H71002" });
    const oldId = old.session.attempt_id;
    for (const state of [
      "CANDIDATE_VERIFIED",
      "DEVICE_CHECK",
      "MIC_CHECK",
      "READY",
      "STRUCTURE",
      "COUNTDOWN",
    ])
      await session("transition", {
        attempt_id: oldId,
        state,
        runtime_version: "hskk-buffered-v2",
      });
    const oldLive = await session("get", { attempt_id: oldId });
    const request_id = crypto.randomUUID();
    const payload = {
      request_id,
      expected_version_id: prepared.version_id,
      expected_previous_attempt_id: oldId,
    };
    await assert.rejects(authorize("authorize", payload), /ADMIN_REQUIRED/);
    await as(null, "anon");
    await assert.rejects(authorize("authorize", payload), /permission denied/);
    await as(admin);
    await assert.rejects(
      authorize("authorize", payload),
      /TEST_ATTEMPT_NOT_AVAILABLE/,
    );
    await setClock(oldLive.upload_deadline + 1);
    await db.exec("reset role");
    const history = async () =>
      (
        await db.query(
          `select jsonb_build_object(
      'preflight',(select to_jsonb(x) from account_internal.hskk_preflights x where id=$1),
      'session',(select to_jsonb(x) from account_internal.hskk_sessions x where attempt_id=$1),
      'attempt',(select to_jsonb(x) from public.learning_attempts x where id=$1),
      'submission',(select to_jsonb(x) from public.submission_details x where attempt_id=$1),
      'answers',(select jsonb_agg(to_jsonb(x) order by position) from public.submission_answers x where attempt_id=$1)) value`,
          [oldId],
        )
      ).rows[0].value;
    const before = await history();
    await as(admin);
    await assert.rejects(
      authorize("authorize", {
        ...payload,
        expected_version_id: crypto.randomUUID(),
      }),
      /VERSION_CONFLICT/,
    );
    const granted = await authorize("authorize", payload);
    assert.notEqual(granted.attempt_id, oldId);
    assert.equal(granted.version_id, prepared.version_id);
    assert.equal(granted.label, "HOSTED E2E TEST ONLY");
    assert.equal(
      (await authorize("authorize", payload)).attempt_id,
      granted.attempt_id,
    );
    await assert.rejects(
      authorize("authorize", { ...payload, request_id: crypto.randomUUID() }),
      /TEST_ATTEMPT_ALREADY_AUTHORIZED/,
    );
    await db.exec("reset role");
    assert.deepEqual(await history(), before);
    assert.equal(
      (await db.query("select count(*)::int n from public.learning_attempts"))
        .rows[0].n,
      1,
      "Authorization alone creates no live attempt.",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_controlled_test_authorizations",
        )
      ).rows[0].n,
      1,
    );
    await as(student);
    await assert.rejects(
      db.exec(
        "select * from account_internal.hskk_controlled_test_authorizations",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select public.hskk_session_command_before_controlled_tests($1,$2)",
        ["load", { exam_code: "H71002" }],
      ),
      /permission denied/,
    );
    const fresh = await session("load", { exam_code: "H71002" });
    assert.equal(fresh.session.attempt_id, granted.attempt_id);
    assert.equal(fresh.session.state, "CREATED");
    assert.equal(fresh.exam.assignment_version_id, prepared.version_id);
    assert.equal(fresh.exam.questions.length, 27);
    assert.equal(
      (await session("load", { exam_code: "H71002" })).session.attempt_id,
      granted.attempt_id,
    );
    await assert.rejects(
      session("transition", {
        attempt_id: granted.attempt_id,
        state: "COUNTDOWN",
        runtime_version: "hskk-buffered-v2",
      }),
      /INVALID_TRANSITION/,
    );
    for (const state of [
      "CANDIDATE_VERIFIED",
      "DEVICE_CHECK",
      "MIC_CHECK",
      "READY",
      "STRUCTURE",
      "COUNTDOWN",
    ])
      await session("transition", {
        attempt_id: granted.attempt_id,
        state,
        runtime_version: "hskk-buffered-v2",
      });
    const live = await session("get", { attempt_id: granted.attempt_id });
    assert.ok(live.server_started_at > oldLive.upload_deadline);
    await db.exec("reset role");
    assert.deepEqual(await history(), before);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_sessions",
        )
      ).rows[0].n,
      2,
    );
    const frames = (
      await db.query(
        "select timeline from account_internal.hskk_sessions where attempt_id=$1",
        [granted.attempt_id],
      )
    ).rows[0].timeline;
    assert.equal(frames.filter((f) => f.state === "RECORDING").length, 27);
    assert.equal(frames.filter((f) => f.state === "PROMPT_LOADING").length, 25);
    assert.equal(
      frames.find((f) => f.question_id === "q27" && f.state === "RECORDING")
        .end -
        frames.find((f) => f.question_id === "q27" && f.state === "RECORDING")
          .start,
      90000,
    );
    await as(admin);
    await assert.rejects(
      db.query(
        "insert into account_internal.hskk_preflights(owner_id,assignment_version_id)values($1,$2)",
        [student, prepared.version_id],
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    await assert.rejects(
      db.query(
        "insert into account_internal.hskk_preflights(owner_id,assignment_version_id)values($1,$2)",
        [student, prepared.version_id],
      ),
      /TEST_AUTHORIZATION_REQUIRED/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_preflights",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
