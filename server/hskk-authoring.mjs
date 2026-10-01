import {
  checkFinalization,
  validBounds,
} from "../study/hskk-review-validation.mjs";
import { validateExam } from "../study/hskk-exam-core.mjs";
import { isDeepStrictEqual } from "node:util";
export function sourceDefinition(value) {
  const v = structuredClone(value);
  for (const k of [
    "reviewed_at",
    "draft_revision",
    "preview_actor_id",
    "database_revision",
    "draft_storage_available",
  ])
    delete v[k];
  for (const k of [
    "url",
    "proposals",
    "non_question_proposals",
    "job_id",
    "review_audit",
    "segmentation_runs",
    "non_question_reviews",
    "review_status",
    "clip_provenance",
  ])
    delete v.audio[k];
  for (const q of v.questions) delete q.audio_segment;
  return v;
}
export function validateSourceReview(canonical, configuration) {
  validateExam(configuration);
  if (
    !isDeepStrictEqual(
      sourceDefinition(canonical),
      sourceDefinition(configuration),
    )
  )
    throw Error("SOURCE_DEFINITION_LOCKED");
  const value = structuredClone(configuration);
  for (const q of value.questions) {
    const s = q.audio_segment;
    if (!s) continue;
    if (
      !validBounds(s.start_ms, s.end_ms, value.audio.duration_seconds) ||
      s.start_seconds !== s.start_ms / 1000 ||
      s.end_seconds !== s.end_ms / 1000
    )
      throw Error("INVALID_DRAFT");
  }
  value.audio.review_status = checkFinalization(value).status;
  value.audio.url = "";
  for (const k of [
    "preview_actor_id",
    "database_revision",
    "draft_storage_available",
  ])
    delete value[k];
  return value;
}
export async function readDraftRevision(client, examCode) {
  if (!client?.rpc) return { available: false, record: null };
  const { data, error } = await client.rpc("hskk_authoring_draft", {
    command: "get",
    payload: { exam_code: examCode },
  });
  if (error?.code === "PGRST202") return { available: false, record: null };
  if (error) throw Error("DRAFT_READ_FAILED");
  return { available: true, record: data };
}
export async function saveDraftRevision(
  client,
  canonical,
  body,
  { event = "segment_review_saved" } = {},
) {
  if (!client?.rpc) throw Error("DRAFT_STORAGE_UNAVAILABLE");
  const configuration = validateSourceReview(canonical, body.configuration);
  if (
    !Number.isInteger(body.expected_revision) ||
    body.expected_revision < 0 ||
    !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(body.request_id || "")
  )
    throw Error("INVALID_DRAFT");
  const { data, error } = await client.rpc("hskk_authoring_draft", {
    command: "save",
    payload: {
      exam_code: canonical.exam_code,
      configuration,
      expected_revision: body.expected_revision,
      request_id: body.request_id,
      source_sha256: canonical.provenance.sha256[canonical.provenance.audio],
      event,
    },
  });
  if (error)
    throw Error(
      error.code === "40001"
        ? "VERSION_CONFLICT"
        : error.code === "PGRST202"
          ? "DRAFT_STORAGE_UNAVAILABLE"
          : "DRAFT_SAVE_FAILED",
    );
  return data;
}
