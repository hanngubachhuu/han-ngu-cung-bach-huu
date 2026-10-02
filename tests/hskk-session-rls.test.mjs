import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";
import { buildTimeline } from "../study/hskk-exam-core.mjs";
import fs from "node:fs/promises";
async function readyFixture(options) {
  const f = await deliveryFixture(options),
    { db, as, rpc, admin, student } = f;
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
  await db.query(
    "insert into account_internal.hskk_runtime_receipts(exam_id,runtime_version)values('H71002','hskk-official-v1')",
  );
  await as(admin);
  const publication = async (command, payload = {}) =>
    (
      await db.query("select public.hskk_publication($1,$2) value", [
        command,
        { exam_code: "H71002", version_id: prepared.version_id, ...payload },
      ])
    ).rows[0].value;
  assert.equal((await publication("readiness")).ready, true);
  await publication("publish");
  const session = async (command, payload = {}) =>
    (
      await db.query("select public.hskk_session_command($1,$2) value", [
        command,
        {
          ...payload,
          ...(payload.state === "COUNTDOWN"
            ? { runtime_version: "hskk-buffered-v2" }
            : {}),
        },
      ])
    ).rows[0].value;
  const recording = async (command, payload = {}) =>
    (
      await db.query("select public.recording_command($1,$2) value", [
        command,
        payload,
      ])
    ).rows[0].value;
  return { ...f, prepared, binding, publication, session, recording };
}
test("real transport schema: approved selected access, preflight creates no live attempt, authoritative timeline and private projection", async () => {
  const f = await readyFixture(),
    { db, as, student, session, recording } = f;
  try {
    await as(null, "anon");
    await assert.rejects(
      session("load", { exam_code: "H71002" }),
      /permission denied/,
    );
    await as(student);
    assert.deepEqual(
      (await db.query("select public.assignment_command('catalog','{}') value"))
        .rows[0].value,
      [],
    );
    const boot = await session("load", { exam_code: "H71002" });
    const id = boot.session.attempt_id;
    assert.equal(boot.exam.questions.length, 27);
    assert.equal(boot.exam.delivery_mode, "private_clips");
    const exposed = JSON.stringify(boot);
    for (const privateKey of [
      "source_sha256",
      "source_audio_id",
      "audio_segment",
      "run_id",
      "confidence",
      "object_path",
      "provenance",
      "authoring_revision",
    ])
      assert.equal(exposed.includes(privateKey), false, privateKey);
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
    await session("transition", {
      attempt_id: id,
      state: "CANDIDATE_VERIFIED",
    });
    await db.exec("reset role");
    await db.query(
      "update account_internal.hskk_preflights set expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [id],
    );
    await as(student);
    const reopened = await session("load", { exam_code: "H71002" });
    assert.equal(reopened.session.attempt_id, id);
    assert.equal(reopened.session.state, "CREATED");
    for (const state of [
      "CANDIDATE_VERIFIED",
      "DEVICE_CHECK",
      "MIC_CHECK",
      "READY",
      "STRUCTURE",
      "COUNTDOWN",
    ]) {
      if (state === "COUNTDOWN")
        await assert.rejects(
          db.query("select public.hskk_session_command('transition',$1)", [
            { attempt_id: id, state },
          ]),
          /RUNTIME_UPDATE_REQUIRED/,
        );
      await session("transition", { attempt_id: id, state });
    }
    const live = await session("get", { attempt_id: id });
    assert.ok(live.server_deadline > live.server_started_at);
    assert.equal(
      live.server_deadline - live.server_started_at,
      buildTimeline(boot.exam).at(-1).end,
    );
    const same = await session("transition", {
      attempt_id: id,
      state: "COUNTDOWN",
    });
    assert.equal(same.server_started_at, live.server_started_at);
    await assert.rejects(
      session("transition", { attempt_id: id, state: "COMPLETED" }),
      /INVALID_TRANSITION/,
    );
    await assert.rejects(
      session("submit", { attempt_id: id }),
      /EXAM_NOT_COMPLETED/,
    );
    await assert.rejects(
      recording("reserve", {
        attempt_id: id,
        question_version_id: boot.exam.questions[0].version_id,
        request_id: crypto.randomUUID(),
        sha256: "a".repeat(64),
        size: 100,
        mime: "audio/webm",
      }),
      /RECORDING_WINDOW_REQUIRED/,
    );
    await assert.rejects(
      db.query("select public.assignment_command('get',$1)", [
        { attempt_id: id },
      ]),
      /HSKK_TRANSPORT_REQUIRED/,
    );
    await as(f.admin);
    await assert.rejects(
      db.query("select public.assignment_command('enable',$1)", [
        { lesson_id: "exam-H71002", enabled: true },
      ]),
      /HSKK_PUBLICATION_REQUIRED/,
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from public.learning_attempts"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "update account_internal.hskk_sessions set exam_deadline=exam_deadline+interval '1 minute'",
      ),
      /AUTHORING_HISTORY_IMMUTABLE/,
    );
  } finally {
    await db.close();
  }
});
test("buffered migration leaves historical session rows, deadlines and timeline intact; recovery uses the original timing", async () => {
  const { db, as, student, session } = await readyFixture({
    bufferedPrompts: false,
  });
  try {
    await as(student);
    const boot = await session("load", { exam_code: "H71002" });
    const id = boot.session.attempt_id;
    for (const state of [
      "CANDIDATE_VERIFIED",
      "DEVICE_CHECK",
      "MIC_CHECK",
      "READY",
      "STRUCTURE",
      "COUNTDOWN",
    ])
      await session("transition", { attempt_id: id, state });
    await db.exec("reset role");
    const snapshot = async () =>
      (
        await db.query(
          "select to_jsonb(s) value from account_internal.hskk_sessions s where attempt_id=$1",
          [id],
        )
      ).rows[0].value;
    const before = await snapshot();
    assert.equal(
      before.timeline.some((frame) => frame.state === "PROMPT_LOADING"),
      false,
    );
    const sql = await fs.readFile(
      new URL(
        "../supabase/migrations/20261002144733_hskk_buffered_prompts.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    assert.deepEqual(await snapshot(), before);
    await as(student);
    const after = await session("get", { attempt_id: id });
    assert.deepEqual(after.delivery_timing, {
      prompt_load_seconds: 0,
      prompt_start_grace_ms: 0,
    });
    assert.equal(after.server_deadline, Date.parse(before.exam_deadline));
    assert.equal(after.upload_deadline, Date.parse(before.upload_deadline));
    const same = await session("transition", {
      attempt_id: id,
      state: "COUNTDOWN",
    });
    assert.equal(same.server_started_at, Date.parse(before.started_at));
  } finally {
    await db.close();
  }
});

test("synthetic elapsed attempt: 27 identities, single recording, denial of own playback, private Admin grading and published-only results", async () => {
  const f = await readyFixture(),
    { db, as, student, admin, session, recording } = f;
  try {
    await as(student);
    const boot = await session("load", { exam_code: "H71002" }),
      id = boot.session.attempt_id;
    // Local fixture only: seed an elapsed exam instead of waiting seventeen minutes.
    await db.exec("reset role");
    const frames = (
      await db.query("select account_internal.hskk_timeline($1) value", [
        f.prepared.version_id,
      ])
    ).rows[0].value;
    const duration = frames.at(-1).end;
    await db.query(
      "insert into public.learning_attempts(id,user_id,lesson_id,client_attempt_id,source,score,max_score,submitted_at)values($1,$2,'exam-H71002',$3,'official',null,null,null)",
      [id, student, "synthetic-elapsed:" + id],
    );
    await db.query(
      "insert into public.submission_details(attempt_id,assignment_version_id,started_at,deadline_at)values($1,$2,clock_timestamp()-make_interval(secs=>$3/1000.0)-interval '1 minute',clock_timestamp()+interval '29 minutes')",
      [id, f.prepared.version_id, duration],
    );
    await db.query(
      "insert into account_internal.hskk_sessions select d.attempt_id,$2,d.assignment_version_id,d.started_at,d.started_at+make_interval(secs=>$3/1000.0),d.started_at+make_interval(secs=>$3/1000.0)+interval '30 minutes',$4 from public.submission_details d where attempt_id=$1",
      [id, student, duration, frames],
    );
    await db.query(
      "insert into public.submission_answers(attempt_id,question_version_id,position,prompt_snapshot)select $1,q.id,b.position,account_internal.assignment_question_projection(q)from public.assignment_version_questions b join public.assignment_question_versions q on q.id=b.question_version_id where b.assignment_version_id=$2",
      [id, f.prepared.version_id],
    );
    await as(student);
    await assert.rejects(
      session("submit", { attempt_id: id }),
      /RECORDING_REQUIRED/,
    );
    const recordings = [];
    for (const q of boot.exam.questions) {
      const payload = {
        attempt_id: id,
        question_version_id: q.version_id,
        request_id: crypto.randomUUID(),
        sha256: q.number.toString(16).padStart(64, "0"),
        size: 100,
        mime: "audio/webm",
      };
      const reserve = await recording("reserve", payload);
      assert.equal((await recording("reserve", payload)).id, reserve.id);
      await assert.rejects(
        recording("reserve", { ...payload, request_id: crypto.randomUUID() }),
        /RECORDING_LOCKED/,
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
        [reserve.path, { size: 100, mimetype: "audio/webm" }],
      );
      const confirmed = await recording("confirm", {
        recording_id: reserve.id,
      });
      assert.equal("playback_path" in confirmed, false);
      const ref = await session("bind_recording", {
        attempt_id: id,
        recording_id: reserve.id,
      });
      assert.equal(ref.question_version_id, q.version_id);
      assert.equal(ref.owner_id, student);
      await session("bind_recording", {
        attempt_id: id,
        recording_id: reserve.id,
      });
      recordings.push(reserve.id);
    }
    assert.equal(
      (await session("submit", { attempt_id: id })).state,
      "SUBMITTED",
    );
    assert.equal(
      (await session("submit", { attempt_id: id })).state,
      "SUBMITTED",
    );
    const pending = await session("result", { attempt_id: id });
    assert.equal(pending.published_at, undefined);
    assert.equal(pending.score, undefined);
    await db.query(
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
    await db.exec("reset role");
    const grades = (
      await db.query(
        "select * from public.submission_grades where attempt_id=$1",
        [id],
      )
    ).rows;
    assert.equal(grades.length, 27);
    assert.ok(grades.every((g) => g.score === null && g.method === "manual"));
    // Synthetic converted fixtures exercise the scoped Admin playback policy.
    for (const rid of recordings) {
      await db.query(
        "update account_internal.speaking_recordings set conversion_status='completed',mp3_sha256=$2,mp3_size=100,duration_seconds=1 where id=$1",
        [rid, "b".repeat(64)],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
        [rid + "/audio.mp3", { size: 100, mimetype: "audio/mpeg" }],
      );
    }
    await as(admin);
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='speaking-private'",
        )
      ).rows.length,
      27,
    );
    const assignment = async (command, payload) =>
      (
        await db.query("select public.assignment_command($1,$2) value", [
          command,
          payload,
        ])
      ).rows[0].value;
    let data = await assignment("get", { attempt_id: id });
    assert.equal(data.answers.length, 27);
    assert.ok(data.grading);
    for (const q of boot.exam.questions)
      data = await assignment("grade", {
        attempt_id: id,
        grade_revision: 1,
        edit_version: data.grading.edit_version,
        question_version_id: q.version_id,
        criteria_scores: { teacher_review: 7 },
        feedback: "Teacher feedback",
      });
    await as(student);
    assert.equal(
      (await session("result", { attempt_id: id })).score,
      undefined,
    );
    await as(admin);
    await assignment("grade_preview", {
      attempt_id: id,
      grade_revision: 1,
      edit_version: data.grading.edit_version,
    });
    await assignment("grade_publish", {
      attempt_id: id,
      grade_revision: 1,
      edit_version: data.grading.edit_version,
    });
    await as(student);
    const published = await session("result", { attempt_id: id });
    assert.equal(published.score, 70);
    assert.equal(published.feedback.length, 27);
    assert.ok(published.published_at);
    assert.equal("grading" in published, false);
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='speaking-private'",
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role");
    const other = "00000000-0000-4000-8000-000000000003";
    await db.query(
      "insert into auth.users(id,email)values($1,'other@example.invalid')",
      [other],
    );
    await db.query(
      "update public.profiles set status='APPROVED' where user_id=$1",
      [other],
    );
    await as(other);
    await assert.rejects(
      session("load", { exam_code: "H71002" }),
      /EXAM_ACCESS_REQUIRED/,
    );
    await assert.rejects(
      session("get", { attempt_id: id }),
      /SESSION_NOT_FOUND/,
    );
    await assert.rejects(
      recording("get", { recording_id: recordings[0] }),
      /RECORDING_NOT_FOUND/,
    );
    await db.exec("reset role");
    const entry = (
      await db.query(
        "select * from account_internal.admin_exams where id='H71002'",
      )
    ).rows[0];
    const original = (
      await db.query(
        "select prompt_snapshot from public.submission_answers where attempt_id=$1 order by position",
        [id],
      )
    ).rows;
    const working = structuredClone(entry.working);
    working.questions[25].prompt += " (new local fixture version)";
    await as(admin);
    await db.query("select public.admin_exam_command('save_working',$1)", [
      {
        exam: working,
        expected_revision: entry.revision,
        request_id: crypto.randomUUID(),
      },
    ]);
    const next = await f.rpc("prepare", { expected_revision: 1 });
    assert.notEqual(next.version_id, f.prepared.version_id);
    await f.publication("publish", { version_id: next.version_id });
    await as(student);
    const newBoot = await session("load", { exam_code: "H71002" });
    assert.notEqual(newBoot.session.attempt_id, id);
    assert.equal(newBoot.exam.exam_version, 2);
    assert.equal((await session("get", { attempt_id: id })).exam_version, 1);
    const historical = (
      await db.query("select public.hskk_resume($1) value", [id])
    ).rows[0].value;
    assert.equal(historical.exam.exam_version, 1);
    assert.equal(historical.session.state, "SUBMITTED");
    assert.equal(historical.exam.questions.length, 27);
    assert.equal(
      (
        await db.query("select public.assignment_command('mine','{}') value")
      ).rows[0].value.some((a) => a.id === id),
      true,
    );
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select prompt_snapshot from public.submission_answers where attempt_id=$1 order by position",
          [id],
        )
      ).rows,
      original,
    );
  } finally {
    await db.close();
  }
});
