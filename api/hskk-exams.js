import {
  readCanonicalSource,
  listCanonicalSources,
  registerCanonicalSource,
  readCanonicalPicture,
  sameImportedSource,
} from "../server/hskk-canonical-source.mjs";
import { readCachedReview } from "../server/hskk-cached-review.mjs";
import { documentContext } from "../server/document-service.mjs";
import { generateConfirmedClip } from "../server/hskk-confirmed-clips.mjs";
import { readDeliveryReadiness } from "../server/hskk-delivery.mjs";
import {
  checkFinalization,
  reviewSummary,
} from "../study/hskk-review-validation.mjs";
import {
  analyzeSource,
  HSKKAudioSegmentationEngine,
} from "../server/hskk-audio-segmentation.mjs";

import { randomUUID, createHash } from "node:crypto";
import {
  importAssetCommand,
  immutableImportUpload,
  verifiedImportBytes,
} from "../server/hskk-import-media.mjs";
import { segmentAuthoringDraft } from "../server/hskk-segmentation-authoring.mjs";
import {
  readDraftRevision,
  saveDraftRevision,
} from "../server/hskk-authoring.mjs";
import {
  sourceMetadata,
  readSourceAudio,
} from "../server/hskk-source-audio.mjs";
export const config = { maxDuration: 120 };
// Admin-only authoring. Segmentation never starts a learner attempt or publishes.
export function createExamHandler({
  authorize = documentContext,
  readDraft = async (code, client) =>
    JSON.stringify(await readCanonicalSource(code, client)),
  readPicture = (_name, code, q, client) =>
    readCanonicalPicture(code, q, client),
  readAudio = async (code, client) =>
    readSourceAudio(client, JSON.parse(await readDraft(code, client))),
  segmenter = new HSKKAudioSegmentationEngine(),
  persistSegmentation = segmentAuthoringDraft,
  listDrafts = listCanonicalSources,
  registerSource = registerCanonicalSource,
  cachedReview = readCachedReview,
  deliveryReadiness = readDeliveryReadiness,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!["GET", "POST"].includes(req.method)) {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
      }
      const token = req.headers.authorization?.match(
        /^Bearer ([A-Za-z0-9._-]+)$/,
      )?.[1];
      if (!token) throw Error("AUTH_REQUIRED");
      const client = await authorize(token);
      const url = new URL(req.url, "https://local.invalid");
      const code = url.searchParams.get("exam");
      const action = url.searchParams.get("action");
      if (req.method === "GET" && action === "catalog") {
        const catalog = await Promise.all(
          (await listDrafts(client)).map(async (examCode) => {
            const canonical = JSON.parse(await readDraft(examCode, client));
            const storage = await readDraftRevision(client, examCode);
            const value =
              storage.record?.configuration || (await cachedReview(canonical));
            return {
              id: value.exam_code,
              code: value.exam_code,
              type: "HSKK",
              level: value.level,
              title: value.title,
              active: value.status === "published",
              question_count: value.questions.length,
              audio_source_name: value.provenance.audio,
              audio: reviewSummary(value),
              updated_at:
                storage.record?.created_at || value.provenance.imported_at,
              source_review: true,
            };
          }),
        );
        res.statusCode = 200;
        return res.end(JSON.stringify(catalog));
      }
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(code || "")) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "EXAM_NOT_FOUND" }));
      }
      if (req.method === "POST" && action === "register") {
        const raw =
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          ) ||
          Buffer.byteLength(raw) > 1048576
        )
          throw Error("INVALID_DRAFT");
        const body = JSON.parse(raw);
        if (body.configuration?.exam_code !== code)
          throw Error("INVALID_DRAFT");
        // Existing bundled sources cannot be replaced through the import wizard.
        const existing = await readDraft(code, client).catch((error) => {
          if (error.message !== "EXAM_NOT_FOUND") throw error;
          return null;
        });
        if (
          existing &&
          !sameImportedSource(JSON.parse(existing), body.configuration)
        )
          throw Error("SOURCE_DEFINITION_LOCKED");
        res.statusCode = 200;
        return res.end(
          JSON.stringify(
            await registerSource(client, body.configuration, body.pictures),
          ),
        );
      }
      if (req.method === "GET" && action === "picture") {
        const exam = JSON.parse(await readDraft(code, client));
        const question = exam.questions.find(
          (q) => q.id === url.searchParams.get("question"),
        );
        const picture = question?.prompt_image;
        if (
          question?.prompt_mode !== "image" ||
          !picture ||
          picture.file_name !== `${code}-${question.id}.jpg` ||
          !/^[A-Za-z0-9_-]+-q\d+\.jpg$/.test(picture.file_name)
        ) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: "PICTURE_NOT_FOUND" }));
        }
        const bytes = await readPicture(
          picture.file_name,
          code,
          question,
          client,
        );
        if (
          bytes.length !== picture.byte_size ||
          createHash("sha256").update(bytes).digest("hex") !== picture.sha256
        )
          throw Error("SOURCE_HASH_MISMATCH");
        res.setHeader("Content-Type", "image/jpeg");
        res.statusCode = 200;
        return res.end(bytes);
      }
      if (req.method === "GET" && action === "waveform") {
        const exam = JSON.parse(await readDraft(code, client));
        const analyzed = await analyzeSource(
          await readAudio(code, client),
          exam.provenance.sha256[exam.provenance.audio],
        );
        res.statusCode = 200;
        return res.end(JSON.stringify(analyzed.waveform));
      }
      if (
        req.method === "POST" &&
        ["finalize", "clip", "stage_clip"].includes(action)
      ) {
        const saved = (await readDraftRevision(client, code)).record;
        if (!saved) throw Error("DRAFT_STORAGE_UNAVAILABLE");
        const { validateSourceReview } = await import(
          "../server/hskk-authoring.mjs"
        );
        const exam = validateSourceReview(
          JSON.parse(await readDraft(code, client)),
          saved.configuration,
        );
        const gate = checkFinalization(exam);
        if (action === "finalize") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({ ...gate, database_revision: saved.revision }),
          );
        }
        if (!gate.ready) throw Error("DRAFT_NOT_READY");
        if (exam.provenance.timing_review === "REQUIRED_SOURCE_AUDIO_REVIEW") {
          const checked = await client.rpc("hskk_delivery_admin", {
            command: "review_status",
            payload: { exam_code: code },
          });
          if (checked.error || checked.data?.reviewed !== true)
            throw Error("CONTENT_REVIEW_REQUIRED");
        }
        if (action === "stage_clip") {
          const question = exam.questions.find(
            (q) => q.id === url.searchParams.get("question"),
          );
          const previous = exam.audio.clip_provenance?.find(
            (p) => p.question_id === question?.id,
          );
          const segment = question?.audio_segment;
          if (
            previous &&
            segment &&
            previous.source_sha256 === exam.audio.source_audio_id &&
            previous.exam_version === exam.exam_version &&
            previous.question_version === question.version &&
            previous.start_ms === segment.start_ms &&
            previous.end_ms === segment.end_ms &&
            previous.run_id === segment.run_id &&
            previous.reviewed_by === segment.reviewed_by &&
            previous.reviewed_at === segment.reviewed_at
          ) {
            try {
              const asset = await importAssetCommand(client, "get", {
                exam_code: code,
                sha256: previous.clip_sha256,
                kind: "mp3",
              });
              await verifiedImportBytes(client, asset);
              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  staged: true,
                  reused: true,
                  question_id: question.id,
                  sha256: previous.clip_sha256,
                }),
              );
            } catch (e) {
              if (e.message === "SOURCE_HASH_MISMATCH") throw e;
              // Missing staged bytes can be recreated from the same reviewed source.
            }
          }
        }
        const clip = await generateConfirmedClip({
          exam,
          bytes: await readAudio(code, client),
          questionId: url.searchParams.get("question"),
        });
        exam.audio.clip_provenance = [
          ...(exam.audio.clip_provenance || []).filter(
            (p) => p.question_id !== clip.provenance.question_id,
          ),
          { ...clip.provenance, draft_revision: saved.revision },
        ];
        await saveDraftRevision(
          client,
          JSON.parse(await readDraft(code, client)),
          {
            configuration: exam,
            expected_revision: saved.revision,
            request_id: randomUUID(),
          },
        );
        if (action === "stage_clip") {
          const asset = await importAssetCommand(client, "reserve", {
            exam_code: code,
            sha256: clip.provenance.clip_sha256,
            byte_size: clip.bytes.length,
            kind: "mp3",
          });
          await immutableImportUpload(client, asset, clip.bytes, "audio/mpeg");
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              staged: true,
              question_id: clip.provenance.question_id,
              sha256: clip.provenance.clip_sha256,
            }),
          );
        }
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="confirmed-clip.mp3"',
        );
        res.setHeader("X-Clip-Provenance", JSON.stringify(clip.provenance));
        res.statusCode = 200;
        return res.end(clip.bytes);
      }
      if (req.method === "POST" && action === "reserve_source") {
        res.statusCode = 200;
        return res.end(
          JSON.stringify(
            await sourceMetadata(
              client,
              JSON.parse(await readDraft(code, client)),
              "reserve_source",
            ),
          ),
        );
      }
      if (req.method === "POST" && action === "save") {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw Error("INVALID_DRAFT");
        const raw =
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
        if (Buffer.byteLength(raw) > 1048576) throw Error("INVALID_DRAFT");
        const result = await saveDraftRevision(
          client,
          JSON.parse(await readDraft(code, client)),
          JSON.parse(raw),
        );
        res.statusCode = 200;
        return res.end(JSON.stringify(result));
      }
      if (action === "status" && req.method === "GET") {
        res.statusCode = 200;
        return res.end(
          JSON.stringify({
            local_segmentation_enabled: true,
            external_ai_enabled: false,
          }),
        );
      }
      if (req.method === "POST") {
        if (action !== "segment") {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
        }
        const exam = JSON.parse(await readDraft(code, client));
        let body = req.body;
        if (typeof body === "string") {
          try {
            body = body ? JSON.parse(body) : {};
          } catch {
            throw Error("INVALID_DRAFT");
          }
        }
        const proposal = await persistSegmentation({
          client,
          exam,
          bytes: await readAudio(code, client),
          segmenter,
          requestId: body?.request_id,
        });
        res.statusCode = 200;
        return res.end(JSON.stringify(proposal));
      }

      if (url.searchParams.get("action") === "audio") {
        res.setHeader("Content-Type", "audio/mpeg");
        res.statusCode = 200;
        return res.end(await readAudio(code, client));
      }
      const storage = await readDraftRevision(client, code),
        saved = storage.record;
      const draft = JSON.parse(await readDraft(code, client));
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ...(saved?.configuration || (await cachedReview(draft))),
          database_revision: saved?.revision || 0,
          draft_storage_available: storage.available,
          publish_readiness: await deliveryReadiness(client, code),
        }),
      );
    } catch (e) {
      const error = [
        "EXAM_NOT_FOUND",
        "CONTENT_REVIEW_REQUIRED",
        "SOURCE_UPLOAD_FAILED",
        "DRAFT_NOT_READY",
        "CLIP_GENERATION_FAILED",
        "CLIP_INVALID_OUTPUT",
        "INVALID_QUESTION",
        "AUTH_REQUIRED",
        "ADMIN_REQUIRED",
        "AUDIO_RUNTIME_UNAVAILABLE",
        "AUDIO_DECODE_FAILED",
        "AUDIO_INVALID_DURATION",
        "TRANSCRIBER_RATE_LIMIT",
        "TRANSCRIBER_QUOTA_EXHAUSTED",
        "TRANSCRIPTION_FAILED",
        "INVALID_DRAFT",
        "SOURCE_DEFINITION_LOCKED",
        "VERSION_CONFLICT",
        "DRAFT_STORAGE_UNAVAILABLE",
        "DRAFT_SAVE_FAILED",
        "SOURCE_STORAGE_UNAVAILABLE",
        "SOURCE_AUDIO_UNAVAILABLE",
        "SOURCE_HASH_MISMATCH",
        "SOURCE_SIZE_MISMATCH",
      ].includes(e.message)
        ? e.message
        : "EXAM_UNAVAILABLE";
      res.statusCode =
        error === "EXAM_NOT_FOUND"
          ? 404
          : error === "AUTH_REQUIRED"
            ? 401
            : error === "ADMIN_REQUIRED"
              ? 403
              : error === "VERSION_CONFLICT"
                ? 409
                : error === "INVALID_DRAFT" ||
                    error === "SOURCE_DEFINITION_LOCKED"
                  ? 400
                  : error === "TRANSCRIBER_RATE_LIMIT"
                    ? 429
                    : 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error }));
    }
  };
}
export default createExamHandler();
