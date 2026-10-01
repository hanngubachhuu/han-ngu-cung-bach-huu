import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  validateExam,
  buildTimeline,
  frameAt,
  remainingSeconds,
  verifySession,
  canSubmit,
  publicResult,
  serverClock,
  recordingIdentity,
} from "../study/hskk-exam-core.mjs";
import { HSKKExamEngine } from "../study/hskk-exam-engine.mjs";
import { createExamHandler } from "../api/hskk-exams.js";
const fixture = () => ({
  exam_code: "ENGINE_B",
  exam_version: 4,
  title: "Đề kiểm thử cục bộ",
  level: "intermediate",
  source_type: "mock",
  audio: { url: "/sample.mp3", duration_seconds: 20 },
  timing: { countdown_seconds: 0.1 },
  sections: [
    { id: "short", title_vi: "Phần ngắn", preparation_seconds: 0 },
    { id: "long", title_vi: "Phần dài", preparation_seconds: 0.2 },
  ],
  questions: [
    {
      id: "q-a",
      version_id: "version-a",
      number: 1,
      version: 2,
      section_id: "short",
      type: "short_response",
      prompt: "你好",
      prompt_mode: "audio",
      audio_segment: { start_seconds: 2, end_seconds: 2.2, verified: true },
      response_seconds: 0.3,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
    },
    {
      id: "q-b",
      version_id: "version-b",
      number: 2,
      version: 3,
      section_id: "long",
      type: "read_aloud",
      prompt: "我喜欢学习。",
      prompt_mode: "text",
      response_seconds: 0.4,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
    },
    {
      id: "q-c",
      version_id: "version-c",
      number: 3,
      version: 1,
      section_id: "long",
      type: "picture_description",
      prompt: "Describe the source picture",
      prompt_mode: "image",
      response_seconds: 0.2,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
    },
  ],
});
const sessionFor = (e) => ({
  candidate_id: "owner-a",
  attempt_id: "attempt-a",
  exam_code: e.exam_code,
  exam_version: e.exam_version,
  question_versions: Object.fromEntries(
    e.questions.map((q) => [q.id, q.version]),
  ),
  question_version_ids: Object.fromEntries(
    e.questions.map((q) => [q.id, q.version_id]),
  ),
  state: "COUNTDOWN",
  server_started_at: 100000,
  server_deadline: 101400,
  server_time: 100000,
});
test("H71002 source content, timing and unchanged binary checksums; transcript is not an answer key", async () => {
  const e = JSON.parse(await fs.readFile("server/hskk/H71002.json", "utf8"));
  validateExam(e);
  assert.equal(e.status, "draft");
  assert.equal(e.questions.length, 27);
  assert.deepEqual(
    e.sections.map(
      (s) => e.questions.filter((q) => q.section_id === s.id).length,
    ),
    [15, 10, 2],
  );
  assert.deepEqual(
    e.questions.map((q) => q.response_seconds),
    [...Array(15).fill(7), ...Array(10).fill(10), 90, 90],
  );
  assert.equal(e.sections[2].preparation_seconds, 420);
  assert.equal(e.rubric, null);
  assert.ok(e.questions.every((q) => q.answer_key === null));
  assert.equal(e.audio.url, "");
  assert.throws(() => buildTimeline(e), /AUDIO_SEGMENTS_UNVERIFIED/);
  for (const file of ["H71002.pdf"]) {
    const b = await fs.readFile(
      (file.endsWith("mp3") ? ".cache/hskk-sources/" : "media/hskk/") + file,
    );
    assert.equal(
      createHash("sha256").update(b).digest("hex"),
      e.provenance.sha256[file],
    );
  }
});
test("second config drives three question types and two sections without engine edits", () => {
  const e = fixture(),
    timeline = buildTimeline(e);
  assert.deepEqual(
    timeline.map((f) => f.state),
    [
      "COUNTDOWN",
      "LISTENING",
      "RECORDING",
      "PREPARATION",
      "RECORDING",
      "RECORDING",
    ],
  );
  assert.equal(timeline.at(-1).end, 1400);
  assert.equal(frameAt(timeline, 100000, 100601).state, "PREPARATION");
  assert.equal(frameAt(timeline, 100000, 101401).state, "COMPLETED");
  assert.equal(remainingSeconds(timeline[2], 100000, 100500), 1);
  const one = fixture();
  one.sections = one.sections.slice(0, 1);
  one.questions = one.questions.slice(0, 1);
  assert.equal(buildTimeline(one).length, 3);
  one.sections = [];
  assert.throws(() => validateExam(one), /SECTIONS_REQUIRED/);
});
test("draft audio offsets cannot be guessed or accepted outside source duration", () => {
  for (const value of [
    null,
    { start_seconds: 1, end_seconds: 2, verified: false },
    { start_seconds: 4, end_seconds: 3, verified: true },
    { start_seconds: 1, end_seconds: 99, verified: true },
  ]) {
    const e = fixture();
    e.questions[0].audio_segment = value;
    assert.throws(() => buildTimeline(e));
  }
});
test("session owner, exam version, question version and server clock are mandatory", () => {
  const e = fixture(),
    s = sessionFor(e);
  verifySession(e, s, "owner-a");
  for (const mutant of [
    { ...s, candidate_id: "owner-b" },
    { ...s, exam_version: 99 },
    { ...s, question_versions: { ...s.question_versions, "q-b": 9 } },
    {
      ...s,
      question_version_ids: {
        ...s.question_version_ids,
        "q-b": "other-version",
      },
    },
    { ...s, server_time: NaN },
  ])
    assert.throws(() => verifySession(e, mutant, "owner-a"));
  let mono = 10;
  const clock = serverClock(10000, () => mono);
  mono = 2010;
  assert.equal(clock(), 12000);
  mono = 5;
  assert.equal(clock(), 10000);
  assert.throws(
    () => recordingIdentity(s, { version_id: null }),
    /QUESTION_VERSION_MISMATCH/,
  );
});
test("submission denies wrong owner/attempt/question, unconfirmed, expired and cleaned audio", () => {
  const e = fixture(),
    s = { ...sessionFor(e), state: "COMPLETED" };
  const valid = Object.fromEntries(
    e.questions.map((q) => [
      q.id,
      {
        owner_id: s.candidate_id,
        attempt_id: s.attempt_id,
        question_version_id: q.version_id,
        confirmed: true,
        expires_at: 100001,
        cleanup_status: "pending",
      },
    ]),
  );
  assert.equal(canSubmit(e, s, valid, 100000), true);
  for (const mutation of [
    { owner_id: "other" },
    { attempt_id: "other" },
    { question_version_id: "version-b" },
    { confirmed: false },
    { expires_at: 99999 },
    { cleanup_status: "completed" },
  ]) {
    const r = structuredClone(valid);
    Object.assign(r["q-a"], mutation);
    assert.throws(() => canSubmit(e, s, r, 100000));
  }
  assert.throws(() =>
    canSubmit(e, { ...s, state: "IN_PROGRESS" }, valid, 100000),
  );
  assert.deepEqual(
    publicResult({ score: 98, feedback: "private", published_at: null }),
    { status: "pending", message: "Chưa công bố kết quả." },
  );
  assert.equal(
    publicResult({
      source: "official",
      score: 87,
      feedback: "Good",
      published_at: "now",
    }).score,
    87,
  );
  assert.equal(
    publicResult({ source: "self_reported", score: 100, published_at: "now" })
      .status,
    "pending",
  );
});
test("engine saves separate recordings, keeps retry request identity and restores same attempt without resetting time", async () => {
  const e = fixture(),
    s = sessionFor(e);
  let elapsed = 0,
    active = false,
    fail = true;
  const calls = [],
    sessions = [];
  const transport = {
    loadSession: async () => {
      sessions.push(s.attempt_id);
      return { ...s, server_time: 100000 + elapsed };
    },
    saveRecording: async (entry) => {
      calls.push(structuredClone(entry));
      if (fail) {
        fail = false;
        throw Error("offline");
      }
      return {
        owner_id: entry.ownerId,
        attempt_id: entry.attemptId,
        question_version_id: entry.questionId,
        confirmed: true,
      };
    },
  };
  const engine = new HSKKExamEngine({
    exam: e,
    candidateId: "owner-a",
    transport,
    monotonic: () => elapsed,
    audio: { stop() {}, playSegment: async () => {} },
    recorder: {
      start() {
        assert.equal(active, false);
        active = true;
      },
      stop: async () => {
        active = false;
        return new Blob(["actual-interface-sample"], { type: "audio/webm" });
      },
      dispose: async () => {
        active = false;
      },
    },
  });
  await engine.recover();
  elapsed = 301;
  await engine.tick();
  assert.equal(active, true);
  elapsed = 601;
  await engine.tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(engine.pending.size, 1);
  await engine.retrySaves();
  assert.equal(engine.pending.size, 0);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(calls[1].questionId, "version-a");
  await engine.recover();
  assert.deepEqual(sessions, ["attempt-a", "attempt-a"]);
  assert.equal(engine.frame.state, "PREPARATION");
  elapsed = 801;
  await engine.tick();
  assert.equal(engine.activeQuestion.id, "q-b");
  elapsed = 1201;
  await engine.tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.at(-1).questionId, "version-b");
  elapsed = 1401;
  await engine.tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(engine.view().saved, 3);
  assert.equal(engine.frame.state, "COMPLETED");
  await engine.dispose();
});
test("read-only authoring API authorizes before any file read or AI call, rejects traversal and non-Admin", async () => {
  let reads = 0,
    ai = 0;
  const invoke = async (
    headers = {},
    query = "exam=ENGINE_B",
    method = "GET",
    authorize = async () => {},
  ) => {
    let output, status;
    const res = {
      setHeader() {},
      set statusCode(s) {
        status = s;
      },
      end(b) {
        output = b;
      },
    };
    const handler = createExamHandler({
      authorize,
      readDraft: async () => {
        reads++;
        return JSON.stringify(fixture());
      },
      readAudio: async () => {
        reads++;
        return Buffer.from("private");
      },
      transcriber: {
        transcribe: async () => {
          ai++;
          return {};
        },
      },
    });
    await handler({ method, headers, url: "/api/hskk-exams?" + query }, res);
    return { status, output };
  };
  assert.equal((await invoke()).status, 401);
  assert.equal(reads, 0);
  assert.equal(
    (
      await invoke(
        { authorization: "Bearer valid" },
        "exam=ENGINE_B",
        "GET",
        async () => {
          throw Error("ADMIN_REQUIRED");
        },
      )
    ).status,
    403,
  );
  assert.equal(reads, 0);
  assert.equal(
    (await invoke({ authorization: "Bearer valid" }, "exam=../../secret"))
      .status,
    404,
  );
  assert.equal(reads, 0);
  assert.equal(
    (
      await invoke(
        { authorization: "Bearer valid" },
        "exam=ENGINE_B&action=segment",
        "POST",
      )
    ).status,
    503,
  );
  assert.equal(ai, 0);
  assert.equal((await invoke({ authorization: "Bearer valid" })).status, 200);
});
export { fixture };
