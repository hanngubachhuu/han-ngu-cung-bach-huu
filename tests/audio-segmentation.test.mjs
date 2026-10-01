import test from "node:test";
import assert from "node:assert/strict";
import {
  alignQuestions,
  normalizeSpeech,
  phraseSimilarity,
  confirmSegment,
} from "../server/audio-segmentation.mjs";
import { openAITranscriber } from "../server/audio-transcriber.mjs";
const exam = {
  exam_code: "ANOTHER_AUDIO",
  exam_version: 3,
  audio: { duration_seconds: 1000 },
  questions: [
    { id: "a", version: 2, prompt: "今天是三月十日。" },
    { id: "b", version: 1, prompt: "你喜欢什么？" },
  ],
};
test("ASR normalization accepts punctuation/spacing/numerals without changing source questions", () => {
  assert.equal(
    normalizeSpeech("今天是 3 月 10 日！"),
    normalizeSpeech(exam.questions[0].prompt),
  );
  assert.ok(phraseSimilarity("你喜欢什么", "你喜欢甚么") >= 0.75);
  const proposal = alignQuestions({
    exam,
    sourceHash: "hash",
    jobId: "job",
    transcript: {
      segments: [
        { text: "你好你叫什么名字", start: 1, end: 3 },
        { text: "今天是3月10日", start: 12, end: 14 },
        { text: "你喜欢什么", start: 25, end: 27 },
        { text: "考试结束谢谢你", start: 40, end: 43 },
      ],
    },
  });
  assert.equal(proposal.matched, 2);
  assert.deepEqual(
    proposal.questions.map((p) => p.start_ms),
    [12000, 25000],
  );
  assert.ok(proposal.questions.every((p) => p.admin_confirmed === false));
  assert.equal(proposal.ready, false);
  assert.deepEqual(
    proposal.non_questions.map((p) => p.segment_type),
    ["CANDIDATE_INFO", "OUTRO"],
  );
  assert.equal(exam.questions[0].prompt, "今天是三月十日。");
});
test("ambiguous repeats, similar questions and silence/music never auto-confirm; long preparation does not become question", () => {
  const e = {
    ...exam,
    questions: [
      { id: "a", version: 1, prompt: "你好。" },
      { id: "b", version: 1, prompt: "你叫什么名字？" },
      { id: "c", version: 1, prompt: "请介绍家人。" },
    ],
  };
  const p = alignQuestions({
    exam: e,
    sourceHash: "x",
    jobId: "j",
    transcript: {
      segments: [
        { text: "你好", start: 2, end: 3 },
        { text: "你好", start: 10, end: 11 },
        { text: "你叫什么名字", start: 14, end: 16 },
        { text: "现在开始准备准备时间为七分钟", start: 18, end: 21 },
        { text: "考试结束", start: 450, end: 454 },
      ],
    },
  });
  assert.equal(p.questions[0].status, "NEEDS_REVIEW");
  assert.equal(p.questions[2].status, "PENDING");
  assert.equal(p.questions[2].start_ms, null);
  assert.ok(p.non_questions.some((s) => s.segment_type === "PREPARATION"));
  assert.throws(
    () =>
      alignQuestions({
        exam: e,
        transcript: { segments: [{ text: "bad", start: 9, end: 2 }] },
      }),
    /INVALID_TRANSCRIPT/,
  );
});
test("an explicit source announcement is only a review proposal, never invented spoken question text", () => {
  const e = {
    ...exam,
    questions: [
      {
        id: "last",
        version: 1,
        prompt: "请介绍家人。",
        audio_cues: ["好，现在开始第二十六题。"],
      },
    ],
  };
  const p = alignQuestions({
    exam: e,
    sourceHash: "x",
    jobId: "j",
    transcript: {
      segments: [{ text: "好现在开始第26题", start: 500, end: 503 }],
    },
  });
  assert.equal(p.matched, 1);
  assert.equal(p.questions[0].match_kind, "source_cue");
  assert.equal(p.questions[0].status, "NEEDS_REVIEW");
});
test("confirmation creates new revision and audit, preserving original proposal; invalid duration is denied", () => {
  const original = {
    id: "p",
    start_ms: 12000,
    end_ms: 14000,
    status: "AI_DETECTED",
    revision: 1,
  };
  const confirmed = confirmSegment(original, {
    actorId: "admin",
    startMs: 12100,
    endMs: 14100,
    at: "date",
    sourceDurationMs: 20000,
  });
  assert.equal(original.revision, 1);
  assert.equal(confirmed.segment.revision, 2);
  assert.equal(confirmed.segment.status, "MANUALLY_ADJUSTED");
  assert.deepEqual(confirmed.audit.previous, original);
  assert.throws(() =>
    confirmSegment(original, {
      actorId: "admin",
      startMs: 1,
      endMs: 90000,
      sourceDurationMs: 20000,
    }),
  );
});
test("transcriber requests true timestamp ASR and returns word boundaries; secrets never become output", async () => {
  const adapter = openAITranscriber({
    key: "test-secret-only",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
      assert.equal(options.body.get("model"), "whisper-1");
      assert.deepEqual(options.body.getAll("timestamp_granularities[]"), [
        "segment",
        "word",
      ]);
      assert.equal(options.headers.Authorization, "Bearer test-secret-only");
      return {
        ok: true,
        json: async () => ({
          text: "你好",
          words: [{ word: "你好", start: 1, end: 2 }],
        }),
      };
    },
  });
  const t = await adapter.transcribe({
    bytes: Buffer.from("audio-fixture"),
    filename: "fixture.mp3",
  });
  assert.deepEqual(t.segments, [{ text: "你好", start: 1, end: 2 }]);
  assert.ok(!JSON.stringify(t).includes("test-secret-only"));
  await assert.rejects(
    () =>
      openAITranscriber({
        key: "test",
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          json: async () => ({
            error: { code: "insufficient_quota", message: "private error" },
          }),
        }),
      }).transcribe({ bytes: Buffer.from("x"), filename: "x.mp3" }),
    /TRANSCRIBER_QUOTA_EXHAUSTED/,
  );
});
