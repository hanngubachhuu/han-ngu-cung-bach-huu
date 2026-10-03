import test from "node:test";
import assert from "node:assert/strict";
import { HSKKExamEngine } from "../study/hskk-exam-engine.mjs";
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const definition = () => ({
  exam_code: "AUTO_NEXT",
  exam_version: 2,
  title: "Test",
  level: "intermediate",
  source_type: "mock",
  audio: { url: "/synthetic.mp3", duration_seconds: 2 },
  timing: { countdown_seconds: 0.01 },
  sections: [{ id: "s", title_vi: "Test", preparation_seconds: 0 }],
  questions: [1, 2].map((n) => ({
    id: "q" + n,
    version_id: "v" + n,
    version: n,
    number: n,
    section_id: "s",
    type: "short_response",
    prompt_mode: "text",
    prompt: "Test",
    response_seconds: 0.02,
    auto_start: true,
    auto_stop: true,
    allow_replay: false,
    allow_rerecord: false,
  })),
});

test("submission waits for the in-flight Q26/Q27 uploads, shares retries and submits once", async () => {
  const e = definition();
  e.questions.forEach((q, i) => {
    q.id = "q" + (26 + i);
    q.number = 26 + i;
    q.response_seconds = 90;
  });
  const releases = [],
    calls = [],
    entries = e.questions.map((q, i) => ({
      blob: new Blob([new Uint8Array(i ? 1438519 : 1467601)], {
        type: "audio/webm",
      }),
      requestId: "stable-" + q.id,
      ownerId: "A",
      attemptId: "attempt",
      question_key: q.id,
      questionId: q.version_id,
      question_version: q.version,
      exam_version: e.exam_version,
    }));
  const completed = {
    ...session(e, 181010),
    server_deadline: 181010,
    upload_deadline: 1981010,
    state: "COMPLETED",
  };
  let transitions = 0,
    submits = 0;
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => 0,
    transport: {
      loadSession: async () => completed,
      saveRecording: async (entry) => {
        calls.push(entry);
        await new Promise((resolve) => releases.push(resolve));
        return {
          owner_id: "A",
          attempt_id: "attempt",
          question_version_id: entry.questionId,
          confirmed: true,
        };
      },
      transition: async () => {
        transitions++;
        return completed;
      },
      submit: async () => {
        submits++;
        return { ...completed, state: "SUBMITTED" };
      },
    },
    journal: {
      load: async () =>
        entries.map((entry, i) => ({ questionId: e.questions[i].id, entry })),
      remove: async () => {},
      close() {},
    },
    audio: { stop() {} },
    recorder: { dispose: async () => {} },
  });
  await engine.recover();
  const uploads = engine.retrySaves();
  await flush();
  const first = engine.submit(),
    second = engine.submit();
  // Handle a failing implementation without leaking rejected promises.
  const outcomes = Promise.allSettled([first, second]);
  await flush();
  const earlyTransitions = transitions;
  releases.forEach((resolve) => resolve());
  await uploads;
  const results = await outcomes;
  assert.equal(
    earlyTransitions,
    0,
    "Do not submit while the two large uploads are still in flight.",
  );
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.equal(
    calls.length,
    2,
    "One immutable upload identity per question, including concurrent retry.",
  );
  assert.equal(submits, 1);
  assert.equal(engine.view().saved, 2);
  assert.equal(engine.view().state, "SUBMITTED");
  await engine.dispose();
});
function session(e, time = 1000) {
  return {
    candidate_id: "A",
    attempt_id: "attempt",
    exam_code: e.exam_code,
    exam_version: e.exam_version,
    question_versions: Object.fromEntries(
      e.questions.map((q) => [q.id, q.version]),
    ),
    question_version_ids: Object.fromEntries(
      e.questions.map((q) => [q.id, q.version_id]),
    ),
    state: "COUNTDOWN",
    server_started_at: 1000,
    server_deadline: 1050,
    server_time: time,
  };
}
test("production background retry retains a long Blob, backs off and never retries after upload expiry", async () => {
  const e = definition();
  let elapsed = 0,
    calls = 0;
  const entry = {
    blob: new Blob([new Uint8Array(1467601)], { type: "audio/webm" }),
    requestId: "stable-long",
    ownerId: "A",
    attemptId: "attempt",
    question_key: "q1",
    questionId: "v1",
    question_version: 1,
    exam_version: 2,
  };
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      production: true,
      loadSession: async () => ({
        ...session(e, 1050),
        state: "COMPLETED",
        upload_deadline: 10000,
      }),
      saveRecording: async (saved) => {
        calls++;
        assert.equal(saved.blob, entry.blob);
        assert.equal(saved.requestId, entry.requestId);
        if (calls === 1) throw Error("storage temporarily unavailable");
        return {
          owner_id: "A",
          attempt_id: "attempt",
          question_version_id: "v1",
          confirmed: true,
        };
      },
    },
    journal: {
      load: async () => [{ questionId: "q1", entry }],
      remove: async () => {},
      close() {},
    },
    audio: { stop() {} },
    recorder: { dispose: async () => {} },
  });
  await engine.recover();
  await flush();
  assert.equal(calls, 1);
  elapsed = 1999;
  await engine.tick();
  await flush();
  assert.equal(calls, 1);
  elapsed = 2000;
  await engine.tick();
  await flush();
  assert.equal(calls, 2);
  assert.equal(engine.view().saved, 1);
  engine.pending.set("q2", {
    ...entry,
    question_key: "q2",
    questionId: "v2",
    question_version: 2,
    requestId: "stable-expired",
  });
  elapsed = 8950;
  await engine.tick();
  await flush();
  assert.equal(calls, 2);
  assert.equal(engine.pending.size, 1);
  await assert.rejects(engine.retrySaves(), /UPLOAD_WINDOW_EXPIRED/);
  await engine.dispose();
});

test("deadline seals Blob and auto-advances despite stalled local write/network; last deadline completes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const e = definition();
  let elapsed = 0,
    release;
  const held = new Promise((r) => (release = r)),
    writes = [],
    starts = [],
    stops = [],
    calls = [];
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      loadSession: async () => session(e, 1000 + elapsed),
      saveRecording: async (entry) => {
        calls.push(entry);
        throw Error("network");
      },
    },
    journal: {
      load: async () => [],
      put: async (id, entry) => {
        writes.push({ id, entry });
        await held;
      },
      close() {},
    },
    audio: { stop() {} },
    recorder: {
      start() {
        starts.push(engine.question().id);
      },
      stop: async () => {
        stops.push(elapsed);
        return new Blob(["actual sealed bytes"]);
      },
      dispose: async () => {},
    },
  });
  await engine.recover();
  elapsed = 10;
  await engine.tick();
  assert.equal(engine.view().question.id, "q1");
  elapsed = 29;
  t.mock.timers.tick(19);
  await flush();
  assert.equal(stops.length, 0);
  elapsed = 30;
  t.mock.timers.tick(1);
  await flush();
  assert.equal(stops[0], 30);
  assert.equal(engine.view().question.id, "q2");
  assert.equal(engine.pending.size, 1);
  assert.equal(calls.length, 0);
  assert.equal(writes[0].entry.blob.size, 19);
  assert.equal(writes[0].entry.saving, undefined);
  assert.equal(writes[0].entry.exam_version, 2);
  assert.equal(writes[0].entry.questionId, "v1");
  elapsed = 50;
  t.mock.timers.tick(20);
  await flush();
  assert.equal(engine.view().state, "COMPLETED");
  assert.equal(engine.pending.size, 2);
  assert.deepEqual(starts, ["q1", "q2"]);
  assert.deepEqual(stops, [30, 50]);
  release();
  await flush();
  assert.equal(engine.pending.size, 2);
  await engine.dispose();
});

test("concurrent deadline/render ticks seal once and retain absolute timing after a slow recorder stop", async () => {
  const e = definition();
  let elapsed = 10,
    release,
    stops = 0,
    starts = 0;
  const sealed = new Promise((resolve) => {
    release = resolve;
  });
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      loadSession: async () => session(e, 1000 + elapsed),
      saveRecording: async () => {
        throw Error("offline");
      },
    },
    audio: { stop() {} },
    recorder: {
      start() {
        starts++;
      },
      stop: async () => {
        stops++;
        return sealed;
      },
      dispose: async () => {},
    },
  });
  await engine.recover();
  elapsed = 30;
  const first = engine.tick(),
    second = engine.tick();
  await flush();
  assert.equal(stops, 1);
  elapsed = 40;
  release(new Blob(["sealed"]));
  await Promise.all([first, second]);
  assert.equal(engine.view().question.id, "q2");
  assert.equal(starts, 2);
  assert.equal(engine.frame.end, 50);
  assert.equal(engine.pending.size, 1);
  await engine.dispose();
});

test("failed local persistence is retried with retained Blob and request ID without delaying the next question", async () => {
  const e = definition();
  let elapsed = 10,
    writes = 0,
    uploads = 0;
  const blobs = [],
    ids = [];
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      loadSession: async () => session(e, 1000 + elapsed),
      saveRecording: async (entry) => {
        uploads++;
        return {
          owner_id: entry.ownerId,
          attempt_id: entry.attemptId,
          question_version_id: entry.questionId,
          confirmed: true,
        };
      },
    },
    journal: {
      load: async () => [],
      put: async (_id, entry) => {
        writes++;
        blobs.push(entry.blob);
        ids.push(entry.requestId);
        if (writes === 1) throw Error("local transaction failed");
      },
      remove: async () => {},
      close() {},
    },
    audio: { stop() {} },
    recorder: {
      start() {},
      stop: async () => new Blob(["bytes"]),
      dispose: async () => {},
    },
  });
  await engine.recover();
  elapsed = 30;
  await engine.tick();
  await flush();
  assert.equal(engine.view().question.id, "q2");
  assert.equal(engine.pending.size, 1);
  assert.equal(uploads, 0);
  await engine.retrySaves();
  assert.equal(writes, 2);
  assert.equal(uploads, 1);
  assert.equal(blobs[0], blobs[1]);
  assert.equal(ids[0], ids[1]);
  assert.equal(engine.pending.size, 0);
  await engine.dispose();
});

for (const [binding, wrongValue] of Object.entries({
  ownerId: "B",
  attemptId: "other",
  question_key: "q2",
  questionId: "other-version",
  question_version: 99,
  exam_version: 99,
})) {
  test(`recovery never retries a Blob with mismatched ${binding}`, async () => {
    const e = definition();
    let calls = 0;
    const entry = {
      blob: new Blob(["private"]),
      requestId: "stable",
      ownerId: "A",
      attemptId: "attempt",
      question_key: "q1",
      questionId: "v1",
      question_version: 1,
      exam_version: 2,
      [binding]: wrongValue,
    };
    const engine = new HSKKExamEngine({
      exam: e,
      candidateId: "A",
      monotonic: () => 0,
      transport: {
        loadSession: async () => session(e, 1050),
        saveRecording: async () => {
          calls++;
        },
      },
      journal: { load: async () => [{ questionId: "q1", entry }], close() {} },
      audio: { stop() {} },
      recorder: { dispose: async () => {} },
    });
    await engine.recover();
    await engine.retrySaves();
    assert.equal(engine.pending.size, 0);
    assert.equal(calls, 0);
    await engine.dispose();
  });
}
test("closing the view waits for queued local durability, preserves media and does not wait for or start network upload", async () => {
  const e = definition();
  let elapsed = 10,
    release,
    closed = false,
    uploads = 0;
  const held = new Promise((resolve) => {
      release = resolve;
    }),
    rows = [];
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      loadSession: async () => session(e, 1000 + elapsed),
      saveRecording: async () => {
        uploads++;
        throw Error("offline");
      },
    },
    journal: {
      load: async () => [],
      put: async (id, entry) => {
        await held;
        rows.push({ questionId: id, entry });
      },
      close() {
        closed = true;
      },
    },
    audio: { stop() {} },
    recorder: {
      start() {},
      stop: async () => new Blob(["private bytes"]),
      dispose: async () => {},
    },
  });
  await engine.recover();
  elapsed = 30;
  await engine.tick();
  const closing = engine.dispose();
  await flush();
  assert.equal(closed, false);
  assert.equal(engine.pending.size, 1);
  release();
  await closing;
  assert.equal(closed, true);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].entry.blob.size > 0);
  assert.equal(uploads, 0);
});

test("failed/lost acknowledgement retries same identity without duplicates, does not restart answered questions", async () => {
  const e = definition();
  let elapsed = 10,
    lose = true,
    starts = 0;
  const stored = new Map(),
    requests = [],
    journalRows = [];
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => elapsed,
    transport: {
      loadSession: async () => session(e, 1000 + elapsed),
      saveRecording: async (entry) => {
        requests.push(entry.requestId);
        if (!stored.has(entry.requestId))
          stored.set(entry.requestId, {
            owner_id: entry.ownerId,
            attempt_id: entry.attemptId,
            question_version_id: entry.questionId,
            confirmed: true,
          });
        if (lose) {
          lose = false;
          throw Error("ack lost");
        }
        return stored.get(entry.requestId);
      },
    },
    journal: {
      load: async () => [],
      put: async (id, entry) => journalRows.push({ questionId: id, entry }),
      remove: async () => {},
      close() {},
    },
    audio: { stop() {} },
    recorder: {
      start() {
        starts++;
      },
      stop: async () => new Blob(["data"]),
      dispose: async () => {},
    },
  });
  await engine.recover();
  elapsed = 30;
  await engine.tick();
  await flush();
  assert.equal(engine.view().question.id, "q2");
  assert.equal(engine.pending.size, 1);
  await engine.retrySaves();
  assert.equal(stored.size, 1);
  assert.equal(requests[0], requests[1]);
  assert.equal(journalRows[0].entry.requestId, requests[0]);
  elapsed = 50;
  await engine.tick();
  await flush();
  await engine.retrySaves();
  assert.equal(stored.size, 2);
  assert.equal(engine.view().state, "COMPLETED");
  elapsed = 10;
  await engine.recover();
  assert.equal(starts, 2);
  await engine.dispose();
});
test("journal recovery drops cross owner/attempt/version entries and resets transient save flags", async () => {
  const e = definition();
  const entry = {
    blob: new Blob(["data"]),
    ownerId: "A",
    attemptId: "attempt",
    questionId: "v1",
    question_key: "q1",
    question_version: 1,
    exam_version: 2,
    requestId: "stable",
    saving: true,
  };
  let calls = 0;
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "A",
    monotonic: () => 0,
    transport: {
      loadSession: async () => session(e, 1050),
      saveRecording: async (x) => {
        calls++;
        assert.equal(x.requestId, "stable");
        return {
          owner_id: "A",
          attempt_id: "attempt",
          question_version_id: "v1",
          confirmed: true,
        };
      },
    },
    journal: {
      load: async () => [
        { questionId: "q1", entry },
        {
          questionId: "q2",
          entry: {
            ...entry,
            ownerId: "B",
            questionId: "v2",
            question_key: "q2",
            question_version: 2,
          },
        },
      ],
      remove: async () => {},
      close() {},
    },
    audio: { stop() {} },
    recorder: { dispose: async () => {} },
  });
  await engine.recover();
  assert.equal(engine.pending.size, 1);
  await engine.retrySaves();
  assert.equal(calls, 1);
  await engine.dispose();
});
