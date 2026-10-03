import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  analyzePCM,
  analyzeSource,
  proposeSegments,
  HSKKAudioSegmentationEngine,
} from "../server/hskk-audio-segmentation.mjs";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
import {
  appendSegmentationRun,
  reviewBoundary,
} from "../study/hskk-segment-review-state.mjs";
import { createExamHandler } from "../api/hskk-exams.js";
const exam = {
  exam_code: "SECOND_CONFIG",
  exam_version: 3,
  audio: { duration_seconds: 80, source_audio_id: "hash" },
  sections: [{ id: "s", preparation_seconds: 20 }],
  questions: [1, 2, 3].map((n) => ({
    id: "q" + n,
    number: n,
    version: 1,
    section_id: "s",
    response_seconds: 7,
    prompt_mode: "audio",
  })),
};
const analysis = {
  sha256: "hash",
  speech_regions: [
    { start_ms: 1000, end_ms: 2000 },
    { start_ms: 9000, end_ms: 10000 },
    { start_ms: 17000, end_ms: 18000 },
    { start_ms: 25000, end_ms: 26000 },
  ],
  silence: [{ start_ms: 26000, end_ms: 46000 }],
};
test("synthetic PCM detects actual energy and silence; empty signal invents no speech", () => {
  const pcm = Buffer.alloc(8000 * 2 * 3);
  for (let i = 8000; i < 16000; i++)
    pcm.writeInt16LE(Math.round(9000 * Math.sin(i * 0.3)), i * 2);
  const r = analyzePCM(pcm);
  assert.deepEqual(r.speech_regions, [{ start_ms: 1000, end_ms: 2000 }]);
  assert.equal(r.silence.length, 2);
  assert.deepEqual(analyzePCM(Buffer.alloc(16000)).speech_regions, []);
});
test("synthetic MP3 decode probes duration/channels/hash and leaves input immutable", async () => {
  const wave = syntheticWave(2),
    mp3 = (await normalizeRecording(wave, audioHash(wave))).bytes,
    hash = audioHash(mp3);
  const r = await analyzeSource(mp3, hash);
  assert.equal(r.decode_success, true);
  assert.ok(Math.abs(r.duration_ms - 2000) < 100);
  assert.equal(r.channels, 1);
  assert.equal(audioHash(mp3), hash);
  await assert.rejects(analyzeSource(mp3, "wrong"), /HASH/);
  await assert.rejects(
    analyzeSource(Buffer.from("broken"), audioHash(Buffer.from("broken"))),
    /DECODE/,
  );
});
test("second config: ordered measured candidates, partial detection and null unresolved timestamps", () => {
  const r = proposeSegments(exam, analysis);
  assert.equal(r.matched, 3);
  assert.deepEqual(
    r.questions.map((q) => q.start_ms),
    [1000, 9000, 17000],
  );
  assert.ok(
    r.questions.every((q) => q.status === "NEEDS_REVIEW" && !q.admin_confirmed),
  );
  assert.ok(r.non_questions.some((p) => p.segment_type === "PREPARATION"));
  const partial = proposeSegments(exam, {
    ...analysis,
    speech_regions: analysis.speech_regions.slice(0, 3),
  });
  assert.equal(partial.matched, 2);
  assert.equal(partial.questions[2].start_ms, null);
  const empty = proposeSegments(exam, { ...analysis, speech_regions: [] });
  assert.equal(empty.matched, 0);
  assert.ok(empty.questions.every((q) => q.end_ms === null));
});
test("adjacent beeps stay with prompts while isolated response-end signals preserve measured timing", () => {
  const adjacent = structuredClone(analysis);
  adjacent.speech_regions = [1000, 9000, 17000, 25000].flatMap((start) => [
    { start_ms: start, end_ms: start + 500 },
    { start_ms: start + 700, end_ms: start + 1000 },
  ]);
  adjacent.cue_tones = adjacent.speech_regions.filter((_, i) => i % 2);
  assert.equal(proposeSegments(exam, adjacent).matched, 3);
  const isolated = structuredClone(analysis);
  isolated.speech_regions = [1000, 11000, 21000, 31000].flatMap((start) => [
    { start_ms: start, end_ms: start + 1000 },
    { start_ms: start + 8000, end_ms: start + 8600 },
  ]);
  isolated.cue_tones = isolated.speech_regions.filter((_, i) => i % 2);
  const run = proposeSegments(exam, isolated);
  assert.equal(run.matched, 3);
  assert.deepEqual(
    run.questions.map((q) => q.start_ms),
    [1000, 11000, 21000],
  );
  assert.ok(
    run.questions.every(
      (q) => q.status === "NEEDS_REVIEW" && !q.admin_confirmed,
    ),
  );
});
for (const code of ["H80000", "H91002"]) {
  const file = `.cache/hskk-sources/${code}.mp3`;
  let exists = true;
  try {
    await fs.access(file);
  } catch {
    exists = false;
  }
  test(
    `REAL private ${code}: all ordered proposals remain unconfirmed and source is unchanged`,
    { skip: !exists },
    async () => {
      const config = JSON.parse(
        await fs.readFile(`server/hskk/${code}.json`, "utf8"),
      );
      const bytes = await fs.readFile(file),
        hash = audioHash(bytes);
      const run = await new HSKKAudioSegmentationEngine().segment({
        exam: config,
        bytes,
        sourceHash: config.audio.source_audio_id,
      });
      assert.equal(run.matched, config.questions.length);
      assert.ok(
        run.questions.every(
          (q) => q.status === "NEEDS_REVIEW" && !q.admin_confirmed,
        ),
      );
      assert.equal(audioHash(await fs.readFile(file)), hash);
    },
  );
}
test("rerun preserves edits and original proposals; manual override revokes confirmation and appends audit", () => {
  const e = structuredClone(exam),
    r = proposeSegments(e, analysis);
  appendSegmentationRun(e, r);
  const original = JSON.stringify(e.audio.segmentation_runs[0]);
  reviewBoundary(e, e.questions[0], r.questions[0], {
    start: 1,
    end: 2,
    actorId: "admin",
    confirm: true,
  });
  assert.equal(e.questions[0].audio_segment.status, "CONFIRMED");
  appendSegmentationRun(e, proposeSegments(e, analysis));
  assert.equal(e.questions[0].audio_segment.verified, true);
  reviewBoundary(e, e.questions[0], r.questions[0], {
    start: 1.1,
    end: 2,
    actorId: "admin",
  });
  assert.equal(e.questions[0].audio_segment.status, "MANUALLY_ADJUSTED");
  assert.equal(e.questions[0].audio_segment.detection_method, "manual");
  assert.equal(e.questions[0].audio_segment.verified, false);
  assert.equal(JSON.stringify(e.audio.segmentation_runs[0]), original);
  assert.equal(e.audio.review_audit.length, 2);
  assert.equal(e.audio.review_audit[1].previous.verified, true);
  assert.throws(() =>
    reviewBoundary(e, e.questions[0], r.questions[0], {
      start: 2,
      end: 1,
      actorId: "admin",
    }),
  );
});
test("local segmentation API requires Admin and works without OpenAI key", async () => {
  const bytes = Buffer.from("private"),
    e = {
      ...exam,
      provenance: {
        audio: "source.mp3",
        sha256: { "source.mp3": audioHash(bytes) },
      },
    };
  let called = 0;
  const invoke = async (token, deny = false) => {
    let status, body;
    await createExamHandler({
      authorize: async () => {
        if (deny) throw Error("ADMIN_REQUIRED");
        return {};
      },
      readDraft: async () => JSON.stringify(e),
      readAudio: async () => bytes,
      persistSegmentation: ({ segmenter }) => segmenter.segment(),
      segmenter: {
        segment: async () => {
          called++;
          return { matched: 3 };
        },
      },
    })(
      {
        method: "POST",
        url: "/api/hskk-exams?exam=SECOND_CONFIG&action=segment",
        headers: token ? { authorization: "Bearer valid" } : {},
      },
      {
        setHeader() {},
        set statusCode(v) {
          status = v;
        },
        end(v) {
          body = v;
        },
      },
    );
    return { status, body };
  };
  assert.equal((await invoke(false)).status, 401);
  assert.equal((await invoke(true, true)).status, 403);
  assert.equal(called, 0);
  assert.equal((await invoke(true)).status, 200);
  assert.equal(called, 1);
});
const privatePath = ".cache/hskk-sources/H71002.mp3";
let available = true;
try {
  await fs.access(privatePath);
} catch {
  available = false;
}
test(
  "REAL H71002 private source: decode and structural proposals, not Admin-verified boundaries",
  { skip: !available },
  async () => {
    const e = JSON.parse(await fs.readFile("server/hskk/H71002.json", "utf8")),
      bytes = await fs.readFile(privatePath),
      hash = audioHash(bytes);
    const r = await new HSKKAudioSegmentationEngine().segment({
      bytes,
      exam: e,
      sourceHash: e.audio.source_audio_id,
    });
    assert.equal(r.questions.length, 27);
    assert.ok(r.matched > 0);
    assert.ok(
      r.questions.every(
        (q) => !q.admin_confirmed && q.status === "NEEDS_REVIEW",
      ),
    );
    assert.equal(r.questions[25].match_kind, "unverified_cue");
    assert.equal(audioHash(await fs.readFile(privatePath)), hash);
    assert.equal(e.status, "draft");
    console.log(
      "REAL H71002:",
      JSON.stringify({
        detected: r.matched,
        review: r.questions.length,
        confirmed: 0,
        openai_used: false,
      }),
    );
  },
);
