import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { segmentAuthoringDraft } from "../server/hskk-segmentation-authoring.mjs";
import { proposeSegments } from "../server/hskk-audio-segmentation.mjs";
import { createExamHandler } from "../api/hskk-exams.js";

// Persistence fixtures only: these bytes are not the real H71002 MP3.
async function fixture() {
  const bytes = Buffer.from("synthetic persistence fixture"),
    hash = createHash("sha256").update(bytes).digest("hex"),
    exam = JSON.parse(await fs.readFile("server/hskk/H71002.json", "utf8"));
  exam.audio.source_audio_id = hash;
  exam.audio.byte_size = bytes.length;
  exam.provenance.sha256[exam.provenance.audio] = hash;
  let record = null,
    analyses = 0,
    saves = 0;
  const snapshots = [];
  const client = {
    rpc: async (_name, { command, payload }) => {
      if (command === "get") return { data: structuredClone(record) };
      assert.equal(command, "save");
      assert.equal(payload.expected_revision, record?.revision || 0);
      saves++;
      record = {
        configuration: structuredClone(payload.configuration),
        revision: (record?.revision || 0) + 1,
      };
      snapshots.push(structuredClone(record));
      return { data: structuredClone(record) };
    },
  };
  const segmenter = {
    segment: async () => {
      analyses++;
      return proposeSegments(exam, {
        sha256: hash,
        speech_regions: [],
        silence: [{ start_ms: 0, end_ms: 5000 }],
        waveform: { step_ms: 100, peaks: [0] },
      });
    },
  };
  return {
    client,
    exam,
    bytes,
    segmenter,
    snapshots,
    counts: () => ({ analyses, saves }),
  };
}

test("segmentation persists an immutable proposal snapshot; retry/refresh reuses it without processing or saving again", async () => {
  const f = await fixture();
  const first = await segmentAuthoringDraft(f);
  assert.equal(first.persisted, true);
  assert.equal(first.reused, false);
  assert.equal(first.database_revision, 1);
  assert.equal(first.questions.length, 27);
  assert.ok(
    first.questions.every(
      (p) => p.status === "NEEDS_REVIEW" && !p.admin_confirmed,
    ),
  );
  assert.ok(
    first.questions.every((p) => p.start_ms === null && p.end_ms === null),
  );
  assert.equal(first.questions[25].match_kind, "unverified_cue");
  assert.equal(first.questions[26].match_kind, "unverified_cue");
  assert.equal(first.non_questions.length, 1);
  assert.equal(first.configuration.audio.segmentation_runs.length, 1);
  const second = await segmentAuthoringDraft(f);
  assert.equal(second.run_id, first.run_id);
  assert.equal(second.reused, true);
  assert.deepEqual(f.counts(), { analyses: 1, saves: 1 });
  assert.ok(
    second.configuration.questions.every((q) => !q.audio_segment?.verified),
  );
  assert.equal(second.configuration.audio.review_audit?.length || 0, 0);
});

test("explicit segmentation request identities retry once and preserve earlier run snapshots", async () => {
  const f = await fixture(),
    requestId = "00000000-0000-4000-8000-000000000099";
  await segmentAuthoringDraft(f);
  const original = JSON.stringify(f.snapshots[0]);
  const next = await segmentAuthoringDraft({ ...f, requestId });
  const retry = await segmentAuthoringDraft({ ...f, requestId });
  assert.equal(next.database_revision, 2);
  assert.equal(retry.run_id, next.run_id);
  assert.equal(retry.configuration.audio.segmentation_runs.length, 2);
  assert.deepEqual(f.counts(), { analyses: 2, saves: 2 });
  assert.equal(JSON.stringify(f.snapshots[0]), original);
});

test("mismatched source bytes/size stop before analysis or draft access", async () => {
  const f = await fixture();
  await assert.rejects(
    segmentAuthoringDraft({ ...f, bytes: Buffer.from("wrong") }),
    /SOURCE_HASH_MISMATCH/,
  );
  const exam = structuredClone(f.exam);
  exam.audio.byte_size++;
  await assert.rejects(
    segmentAuthoringDraft({ ...f, exam }),
    /SOURCE_SIZE_MISMATCH/,
  );
  assert.deepEqual(f.counts(), { analyses: 0, saves: 0 });
});

test("unavailable persistence and save failures never report a persisted run", async () => {
  const f = await fixture();
  await assert.rejects(
    segmentAuthoringDraft({ ...f, client: {} }),
    /DRAFT_STORAGE_UNAVAILABLE/,
  );
  const client = {
    rpc: async (_name, { command }) =>
      command === "get" ? { data: null } : { error: { code: "unexpected" } },
  };
  await assert.rejects(
    segmentAuthoringDraft({ ...f, client }),
    /DRAFT_SAVE_FAILED/,
  );
  assert.equal(f.snapshots.length, 0);
});

test("analysis rebases on reviews saved concurrently and retries a revision conflict without clobbering them", async () => {
  const f = await fixture();
  const first = await segmentAuthoringDraft(f);
  let record = {
    configuration: structuredClone(first.configuration),
    revision: 2,
  };
  const prior = JSON.stringify(record.configuration.audio.segmentation_runs[0]);
  record.configuration.questions[0].audio_segment = {
    start_ms: 1000,
    end_ms: 2000,
    start_seconds: 1,
    end_seconds: 2,
    verified: false,
    status: "MANUALLY_ADJUSTED",
    detection_method: "manual",
  };
  let attempts = 0;
  const client = {
    rpc: async (_name, { command, payload }) => {
      if (command === "get") return { data: structuredClone(record) };
      attempts++;
      if (attempts === 1) {
        record.revision++;
        record.configuration.questions[0].audio_segment.end_ms = 3000;
        record.configuration.questions[0].audio_segment.end_seconds = 3;
        return { error: { code: "40001" } };
      }
      assert.equal(payload.expected_revision, 3);
      record = { configuration: payload.configuration, revision: 4 };
      return { data: structuredClone(record) };
    },
  };
  const result = await segmentAuthoringDraft({
    ...f,
    client,
    requestId: "00000000-0000-4000-8000-000000000100",
  });
  assert.equal(attempts, 2);
  assert.equal(result.database_revision, 4);
  assert.equal(result.configuration.questions[0].audio_segment.end_ms, 3000);
  assert.equal(
    JSON.stringify(result.configuration.audio.segmentation_runs[0]),
    prior,
  );
});

test("real handler accepts empty POST bodies, persists before returning, and denies Student/anonymous before reads", async () => {
  const f = await fixture();
  let reads = 0;
  const invoke = async (role, body = "") => {
    let status, result;
    await createExamHandler({
      authorize: async () => {
        if (role !== "admin") throw Error("ADMIN_REQUIRED");
        return f.client;
      },
      readDraft: async () => JSON.stringify(f.exam),
      readAudio: async () => {
        reads++;
        return f.bytes;
      },
      segmenter: f.segmenter,
    })(
      {
        method: "POST",
        url: "/api/hskk-exams?exam=H71002&action=segment",
        headers: role === "anon" ? {} : { authorization: "Bearer test" },
        body,
      },
      {
        setHeader() {},
        set statusCode(v) {
          status = v;
        },
        end(v) {
          result = JSON.parse(v);
        },
      },
    );
    return { status, result };
  };
  assert.deepEqual(await invoke("anon"), {
    status: 401,
    result: { error: "AUTH_REQUIRED" },
  });
  assert.deepEqual(await invoke("student"), {
    status: 403,
    result: { error: "ADMIN_REQUIRED" },
  });
  assert.equal(reads, 0);
  const first = await invoke("admin");
  assert.equal(first.status, 200);
  assert.equal(first.result.persisted, true);
  assert.equal(f.snapshots.length, 1);
  const retry = await invoke("admin");
  assert.equal(retry.result.run_id, first.result.run_id);
  assert.deepEqual(f.counts(), { analyses: 1, saves: 1 });
  assert.equal((await invoke("admin", "broken JSON")).status, 400);
});
