import { createHash } from "node:crypto";
import { engineVersion } from "./hskk-audio-segmentation.mjs";
import { readDraftRevision, saveDraftRevision } from "./hskk-authoring.mjs";
import { appendSegmentationRun } from "../study/hskk-segment-review-state.mjs";

// The default request represents the first analysis of this source/version/engine.
// Explicit UUIDs allow a separately requested rerun; retries reuse its stored run.
export async function segmentAuthoringDraft({
  client,
  exam,
  bytes,
  segmenter,
  requestId,
}) {
  if (
    requestId &&
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)
  )
    throw Error("INVALID_DRAFT");
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== exam.provenance.sha256[exam.provenance.audio])
    throw Error("SOURCE_HASH_MISMATCH");
  if (bytes.length !== exam.audio.byte_size)
    throw Error("SOURCE_SIZE_MISMATCH");
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        exam.exam_code,
        exam.exam_version,
        hash,
        engineVersion,
        requestId || "initial",
      ]),
    )
    .digest("hex");
  const saveId = `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
  const find = (record) =>
    record?.configuration.audio.segmentation_runs?.find(
      (run) =>
        run.request_key === key &&
        run.source_audio_hash === hash &&
        run.exam_code === exam.exam_code &&
        run.exam_version === exam.exam_version &&
        run.engine_version === engineVersion,
    );
  const response = (record, run, reused) => ({
    ...run,
    configuration: record.configuration,
    database_revision: record.revision,
    persisted: true,
    reused,
  });
  let storage = await readDraftRevision(client, exam.exam_code);
  if (!storage.available) throw Error("DRAFT_STORAGE_UNAVAILABLE");
  const existing = find(storage.record);
  if (existing) return response(storage.record, existing, true);
  const run = await segmenter.segment({ bytes, exam, sourceHash: hash });
  run.request_key = key;
  // Preserve the engine's unresolved bounds/non-question regions; never confirm.
  if (
    run.questions.some((p) => p.status !== "NEEDS_REVIEW" || p.admin_confirmed)
  )
    throw Error("INVALID_DRAFT");
  for (let attempt = 0; attempt < 2; attempt++) {
    // Re-read after processing to preserve reviews saved while analysis was running.
    storage = await readDraftRevision(client, exam.exam_code);
    const winner = find(storage.record);
    if (winner) return response(storage.record, winner, true);
    const configuration = structuredClone(
      storage.record?.configuration || exam,
    );
    appendSegmentationRun(configuration, run);
    try {
      const saved = await saveDraftRevision(
        client,
        exam,
        {
          configuration,
          expected_revision: storage.record?.revision || 0,
          request_id: saveId,
        },
        { event: "draft_saved" },
      );
      return response(saved, run, false);
    } catch (error) {
      const latest = (await readDraftRevision(client, exam.exam_code)).record;
      const completed = find(latest);
      if (completed) return response(latest, completed, true);
      if (error.message !== "VERSION_CONFLICT" || attempt === 1) throw error;
    }
  }
}
