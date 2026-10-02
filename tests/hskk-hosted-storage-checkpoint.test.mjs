import test from "node:test";
import assert from "node:assert/strict";
import {
  runHostedStorageCheckpoint,
  buildHostedStorageConsole,
} from "../scripts/hskk-private-storage-checkpoint.mjs";

const student = "00000000-0000-4000-8000-000000000002";
const options = () => ({
  origin: "https://hanngubachhuu.vercel.app",
  config: {
    url: "https://dmeqxdznzobbarvkmxyg.supabase.co",
    publishableKey: "public-fixture",
  },
  session: {
    user: { id: student },
    access_token: "fixture-secret-must-not-appear",
  },
  probePath: "a".repeat(64) + ".mp3",
  expectedStudentId: student,
  client: {
    auth: { getUser: async () => ({ data: { user: { id: student } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role: "STUDENT", status: "APPROVED" },
          }),
        }),
      }),
    }),
  },
});
test("HTTP checkpoint accepts actual denials/empty RLS list and never emits JWT or private URLs", async () => {
  const out = await runHostedStorageCheckpoint({
    ...options(),
    request: async (url) =>
      new Response(
        JSON.stringify(
          url.includes("/list/") ? [] : { message: "Object not found" },
        ),
        { status: url.includes("/list/") ? 200 : 400 },
      ),
  });
  assert.equal(out.state, "PASS");
  assert.deepEqual(
    out.results.map((r) => r.http_status),
    [400, 400, 400, 200],
  );
  const text = JSON.stringify(out);
  for (const privateValue of [
    "fixture-secret",
    "supabase.co",
    "a".repeat(64),
    "storage/v1",
  ])
    assert.equal(text.includes(privateValue), false);
});
test("HTTP checkpoint does not count provider/network failures, unexpected data or generic 400 as a security PASS", async () => {
  for (const status of [200, 400, 500]) {
    const out = await runHostedStorageCheckpoint({
      ...options(),
      request: async () =>
        new Response(JSON.stringify({ error: "Unexpected request" }), {
          status,
        }),
    });
    assert.equal(out.state, "FAIL");
  }
  const out = await runHostedStorageCheckpoint({
    ...options(),
    request: async () => {
      throw Error("Network error");
    },
  });
  assert.equal(out.state, "NOT_TESTED");
});
test("HTTP checkpoint validates the actual authenticated identity before protected requests", async () => {
  const input = options();
  let requests = 0;
  input.expectedStudentId = "00000000-0000-4000-8000-000000000003";
  const out = await runHostedStorageCheckpoint({
    ...input,
    request: async () => {
      requests++;
    },
  });
  assert.equal(out.reason, "CONTROLLED_STUDENT_REQUIRED");
  assert.equal(requests, 0);
  assert.match(buildHostedStorageConsole(options()), /HSKK_CLIP_STORAGE_HTTP/);
  assert.throws(() =>
    buildHostedStorageConsole({
      probePath: "../bad",
      expectedStudentId: student,
    }),
  );
});

test("Admin HTTP checkpoint reads all 27 version-bound clips and rejects stored hash or provenance mismatches", async () => {
  const input = options();
  input.client.from = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { role: "ADMIN", status: "APPROVED" } }),
      }),
    }),
  });
  const sourceHash = "b".repeat(64);
  const clips = Array.from({ length: 27 }, (_, i) => ({
    question_key: "q" + (i + 1),
    question_version_id: crypto.randomUUID(),
    sha256: (i + 1).toString(16).padStart(64, "0"),
    duration_ms: 3000,
  })).map((q) => ({ ...q, path: q.sha256 + ".mp3" }));
  const source = {
    exam_version: 1,
    database_revision: 159,
    provenance: { audio: "source.mp3", sha256: { "source.mp3": sourceHash } },
    questions: clips.map((q) => ({
      id: q.question_key,
      version: 1,
      audio_segment: { run_id: "fixture-run", start_ms: 1, end_ms: 3001 },
    })),
    audio: {
      source_audio_id: sourceHash,
      clip_provenance: clips.map((q) => ({
        question_id: q.question_key,
        question_version: 1,
        exam_version: 1,
        source_sha256: sourceHash,
        run_id: "fixture-run",
        start_ms: 1,
        end_ms: 3001,
        clip_sha256: q.sha256,
        duration_ms: 3000,
      })),
    },
  };
  const request = async (url, options) => {
    if (url.includes("/api/hskk-delivery"))
      return Response.json({ version_id: crypto.randomUUID(), clips });
    if (url.includes("/api/hskk-exams")) return Response.json(source);
    if (!options.headers.Authorization)
      return Response.json({ message: "Object not found" }, { status: 400 });
    const clip = clips.find((q) => url.endsWith(q.path));
    return new Response(
      new Uint8Array([73, 68, 51, Number.parseInt(clip.sha256, 16)]),
      { headers: { "content-type": "audio/mpeg" } },
    );
  };
  const digest = async (bytes) =>
    new Uint8Array(bytes)[3].toString(16).padStart(64, "0");
  let out = await runHostedStorageCheckpoint({
    ...input,
    request,
    digest,
    decodeMp3: async () => 3,
  });
  assert.equal(out.state, "PASS");
  assert.equal(
    out.results.filter((r) => r.name === "admin_clip" && r.state === "PASS")
      .length,
    27,
  );
  source.audio.clip_provenance[2].run_id = "changed-run";
  out = await runHostedStorageCheckpoint({
    ...input,
    request,
    digest: async () => "c".repeat(64),
    decodeMp3: async () => 3,
  });
  assert.equal(out.state, "FAIL");
  assert.equal(
    out.results.find((r) => r.question === "q3").provenance_match,
    false,
  );
  assert.ok(
    out.results
      .filter((r) => r.name === "admin_clip")
      .every((r) => !r.hash_match),
  );
});
