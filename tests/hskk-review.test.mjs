import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  checkFinalization,
  parseTimestamp,
  timestamp,
  sourceHash,
  reviewSummary,
} from "../study/hskk-review-validation.mjs";
import {
  reviewBoundary,
  appendSegmentationRun,
  replaceWithProposal,
} from "../study/hskk-segment-review-state.mjs";
import { generateConfirmedClip } from "../server/hskk-confirmed-clips.mjs";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
import { createExamHandler } from "../api/hskk-exams.js";
import { HSKKAudioSegmentationEngine } from "../server/hskk-audio-segmentation.mjs";
function fixture() {
  return {
    exam_code: "SECOND",
    exam_version: 1,
    audio: { source_audio_id: "hash", duration_seconds: 1000 },
    sections: [
      { id: "s1", preparation_seconds: 0 },
      { id: "s2", preparation_seconds: 420 },
    ],
    questions: [
      { id: "a", number: 1, version: 1, section_id: "s1", response_seconds: 7 },
      { id: "b", number: 2, version: 1, section_id: "s1", response_seconds: 7 },
      {
        id: "c",
        number: 3,
        version: 1,
        section_id: "s2",
        response_seconds: 90,
      },
    ],
  };
}
function reviewed() {
  const e = fixture();
  for (const [i, q] of e.questions.entries())
    reviewBoundary(e, q, null, {
      startMs: [1000, 9000, 437000][i],
      endMs: [2000, 10000, 440000][i],
      actorId: "admin",
      confirm: true,
    });
  return e;
}
test("millisecond timestamps reject invalid/blank/negative and retain exact precision", () => {
  assert.equal(parseTimestamp("01:02:03.004"), 3723004);
  assert.equal(timestamp(3723004), "01:02:03.004");
  assert.equal(parseTimestamp("1.234"), 1234);
  for (const v of ["", null, "-1", "00:60:00.000", "0.0001", 1.2])
    assert.throws(() => parseTimestamp(v));
  const e = fixture();
  for (const [a, b] of [
    [-1, 1000],
    [10, 10],
    [20, 10],
    [0, 1000001],
    [0.2, 200],
  ])
    assert.throws(() =>
      reviewBoundary(e, e.questions[0], null, {
        startMs: a,
        endMs: b,
        actorId: "a",
      }),
    );
});
test("finalization rejects identity, source, unconfirmed, ordering, overlaps and short regions", () => {
  assert.equal(checkFinalization(reviewed()).ready, true);
  for (const [field, value, code] of [
    ["source_sha256", "other", "SOURCE"],
    ["exam_version", 2, "IDENTITY"],
    ["question_id", "bad", "IDENTITY"],
    ["verified", false, "UNCONFIRMED"],
    ["status", "NEEDS_REVIEW", "UNCONFIRMED"],
    ["end_ms", 1000001, "BOUNDS"],
  ]) {
    const e = reviewed();
    e.questions[0].audio_segment[field] = value;
    assert.ok(checkFinalization(e).issues.some((x) => x.code === code));
  }
  const e = reviewed();
  e.questions[1].audio_segment.start_ms = 500;
  assert.ok(checkFinalization(e).issues.some((x) => x.code === "ORDER"));
  assert.ok(checkFinalization(e).issues.some((x) => x.code === "OVERLAP"));
  e.questions[1].audio_segment.start_ms = 9900;
  assert.ok(checkFinalization(e).issues.some((x) => x.code === "SHORT"));
});
test("response/preparation gaps expected, unexplained gaps require review without correction", () => {
  const e = reviewed();
  assert.ok(checkFinalization(e).gaps.every((g) => g.type === "EXPECTED_GAP"));
  e.questions[1].audio_segment.start_ms = 100000;
  e.questions[1].audio_segment.end_ms = 101000;
  const original = JSON.stringify(e);
  assert.ok(
    checkFinalization(e).gaps.some((g) => g.type === "REVIEW_REQUIRED_GAP"),
  );
  assert.equal(JSON.stringify(e), original);
  e.audio.non_question_reviews = [
    {
      start_ms: 2000,
      end_ms: 99000,
      segment_type: "TRANSITION",
      source_sha256: "hash",
      exam_version: 1,
      status: "CONFIRMED",
    },
  ];
  assert.equal(checkFinalization(e).gaps[0].type, "EXPECTED_GAP");
});
test("rerun preserves confirmed and manual edits; replacement needs explicit approval; stale source rejected", () => {
  const e = fixture(),
    run = {
      run_id: "run1",
      exam_code: e.exam_code,
      exam_version: 1,
      source_audio_hash: "hash",
      source_sha256: "hash",
      questions: [
        {
          question_id: "a",
          question_version: 1,
          run_id: "run1",
          start_ms: 1000,
          end_ms: 2000,
          detection_method: "structural_timing",
        },
      ],
      non_questions: [],
    };
  appendSegmentationRun(e, run);
  const p = e.audio.proposals[0];
  reviewBoundary(e, e.questions[0], p, {
    startMs: 1000,
    endMs: 2000,
    actorId: "admin",
    confirm: true,
  });
  reviewBoundary(e, e.questions[1], null, {
    startMs: 9000,
    endMs: 10000,
    actorId: "admin",
  });
  const before = JSON.stringify(e.questions);
  appendSegmentationRun(e, {
    ...run,
    run_id: "run2",
    questions: run.questions.map((p) => ({ ...p, run_id: "run2" })),
  });
  assert.equal(JSON.stringify(e.questions), before);
  assert.equal(reviewSummary(e).confirmed, 1);
  assert.equal(reviewSummary(e).manually_adjusted, 1);
  assert.throws(
    () => replaceWithProposal(e, e.questions[0], p, { actorId: "admin" }),
    /CONFIRMATION/,
  );
  replaceWithProposal(e, e.questions[0], p, {
    actorId: "admin",
    approved: true,
  });
  assert.equal(e.questions[0].audio_segment.verified, false);
  assert.equal(e.audio.segmentation_runs[0].questions[0].start_ms, 1000);
  e.audio.source_audio_id = "changed";
  assert.throws(
    () =>
      reviewBoundary(e, e.questions[0], p, {
        startMs: 1000,
        endMs: 2000,
        actorId: "admin",
        confirm: true,
      }),
    /STALE/,
  );
});
test("physical MP3 clip uses confirmed exact hash/ms and returns byte-verifiable provenance", async () => {
  const wave = syntheticWave(3),
    bytes = (await normalizeRecording(wave, audioHash(wave))).bytes,
    hash = audioHash(bytes),
    e = fixture();
  e.audio.source_audio_id = hash;
  e.audio.duration_seconds = 3;
  e.questions = e.questions.slice(0, 1);
  reviewBoundary(e, e.questions[0], null, {
    startMs: 500,
    endMs: 1500,
    actorId: "admin",
    confirm: true,
  });
  const clip = await generateConfirmedClip({ exam: e, bytes, questionId: "a" });
  assert.equal(clip.provenance.source_sha256, hash);
  assert.equal(clip.provenance.start_ms, 500);
  assert.equal(clip.provenance.end_ms, 1500);
  assert.equal(clip.provenance.clip_sha256, audioHash(clip.bytes));
  assert.equal(audioHash(bytes), hash);
  await assert.rejects(
    generateConfirmedClip({
      exam: e,
      bytes: Buffer.from("other"),
      questionId: "a",
    }),
    /HASH/,
  );
  e.questions[0].audio_segment.verified = false;
  await assert.rejects(
    generateConfirmedClip({ exam: e, bytes, questionId: "a" }),
    /NOT_READY/,
  );
});
test("waveform/finalize/clip endpoints authorize before source reads; unready persisted draft blocks clip", async () => {
  let reads = 0;
  for (const action of ["waveform", "finalize", "clip"])
    for (const role of ["anon", "student"]) {
      let status;
      await createExamHandler({
        authorize: async () => {
          throw Error("ADMIN_REQUIRED");
        },
        readAudio: async () => {
          reads++;
        },
        readDraft: async () => {
          reads++;
        },
      })(
        {
          method: action === "waveform" ? "GET" : "POST",
          url: "/api/hskk-exams?exam=SECOND&action=" + action,
          headers: role === "anon" ? {} : { authorization: "Bearer valid" },
        },
        {
          setHeader() {},
          set statusCode(v) {
            status = v;
          },
          end() {},
        },
      );
      assert.equal(status, role === "anon" ? 401 : 403);
    }
  assert.equal(reads, 0);
});
test("server clip gate reads persisted draft and stores provenance before returning audio", async () => {
  const canonical = JSON.parse(
    await fs.readFile("server/hskk/H71002.json", "utf8"),
  );
  let reads = 0;
  const invoke = async (configuration, bytes) => {
    let status, body, saved;
    const client = {
      rpc: async (name, args) =>
        args.command === "get"
          ? { data: { configuration, revision: 4 } }
          : ((saved = args.payload.configuration), { data: { revision: 5 } }),
    };
    await createExamHandler({
      authorize: async () => client,
      readDraft: async () => JSON.stringify(canonical),
      readAudio: async () => {
        reads++;
        return bytes;
      },
    })(
      {
        method: "POST",
        url: "/api/hskk-exams?exam=H71002&action=clip&question=q1",
        headers: { authorization: "Bearer valid" },
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
    return { status, body, saved };
  };
  const blocked = await invoke(canonical);
  assert.equal(blocked.status, 503);
  assert.equal(reads, 0);
  const wave = syntheticWave(3),
    bytes = (await normalizeRecording(wave, audioHash(wave))).bytes;
  canonical.audio.duration_seconds = 3;
  canonical.audio.source_audio_id = audioHash(bytes);
  canonical.provenance.sha256[canonical.provenance.audio] = audioHash(bytes);
  canonical.questions = canonical.questions.slice(0, 1);
  canonical.sections = canonical.sections.slice(0, 1);
  const reviewed = structuredClone(canonical);
  reviewBoundary(reviewed, reviewed.questions[0], null, {
    startMs: 500,
    endMs: 1500,
    actorId: "admin",
    confirm: true,
  });
  const result = await invoke(reviewed, bytes);
  assert.equal(result.status, 200);
  assert.equal(result.saved.audio.review_status, "READY_FOR_PUBLISH");
  assert.equal(
    result.saved.audio.clip_provenance[0].clip_sha256,
    audioHash(result.body),
  );
  assert.equal(result.saved.audio.clip_provenance[0].draft_revision, 4);
});
let real = true;
try {
  await fs.access(".cache/hskk-sources/H71002.mp3");
} catch {
  real = false;
}
test(
  "REAL H71002 signal validation report never confirms proposals",
  { skip: !real },
  async () => {
    const e = JSON.parse(await fs.readFile("server/hskk/H71002.json", "utf8")),
      bytes = await fs.readFile(".cache/hskk-sources/H71002.mp3");
    const run = await new HSKKAudioSegmentationEngine().segment({
      exam: e,
      bytes,
      sourceHash: sourceHash(e),
    });
    appendSegmentationRun(e, run);
    const basic = checkFinalization(e, { proposals: true });
    const suspicious = new Set(basic.issues.map((x) => x.question_id));
    const report = {
      proposals: run.matched,
      basic_signal_pass: 27 - suspicious.size,
      suspicious: suspicious.size,
      needs_review: 27,
      confirmed: 0,
      issues: basic.issues,
    };
    await fs.mkdir("test-results/hskk", { recursive: true });
    await fs.writeFile(
      "test-results/hskk/real-signal-review.json",
      JSON.stringify(report, null, 2),
    );
    console.log("REAL H71002 review", report);
    assert.equal(run.matched, 27);
    assert.equal(checkFinalization(e).ready, false);
    assert.equal(reviewSummary(e).confirmed, 0);
  },
);
