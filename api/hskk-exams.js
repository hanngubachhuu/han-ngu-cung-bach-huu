import fs from "node:fs/promises";
import { documentContext } from "../server/document-service.mjs";
import { generateConfirmedClip } from "../server/hskk-confirmed-clips.mjs";
import { checkFinalization } from "../study/hskk-review-validation.mjs";
import {
  analyzeSource,
  HSKKAudioSegmentationEngine,
} from "../server/hskk-audio-segmentation.mjs";

import { createHash, randomUUID } from "node:crypto";
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
  readDraft = (code) =>
    fs.readFile(
      new URL("../server/hskk/" + code + ".json", import.meta.url),
      "utf8",
    ),
  readAudio = async (code, client) =>
    readSourceAudio(client, JSON.parse(await readDraft(code))),
  segmenter = new HSKKAudioSegmentationEngine(),
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
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(code || "")) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "EXAM_NOT_FOUND" }));
      }
      const action = url.searchParams.get("action");
      if (req.method === "GET" && action === "waveform") {
        const exam = JSON.parse(await readDraft(code));
        const analyzed = await analyzeSource(
          await readAudio(code, client),
          exam.provenance.sha256[exam.provenance.audio],
        );
        res.statusCode = 200;
        return res.end(JSON.stringify(analyzed.waveform));
      }
      if (req.method === "POST" && ["finalize", "clip"].includes(action)) {
        const saved = (await readDraftRevision(client, code)).record;
        if (!saved) throw Error("DRAFT_STORAGE_UNAVAILABLE");
        const { validateSourceReview } = await import(
          "../server/hskk-authoring.mjs"
        );
        const exam = validateSourceReview(
          JSON.parse(await readDraft(code)),
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
        const clip = await generateConfirmedClip({
          exam,
          bytes: await readAudio(code, client),
          questionId: url.searchParams.get("question"),
        });
        exam.audio.clip_provenance = [
          ...(exam.audio.clip_provenance || []),
          { ...clip.provenance, draft_revision: saved.revision },
        ];
        await saveDraftRevision(client, JSON.parse(await readDraft(code)), {
          configuration: exam,
          expected_revision: saved.revision,
          request_id: randomUUID(),
        });
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
              JSON.parse(await readDraft(code)),
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
          JSON.parse(await readDraft(code)),
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
        const exam = JSON.parse(await readDraft(code)),
          bytes = await readAudio(code, client),
          hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== exam.provenance.sha256[exam.provenance.audio])
          throw Error("SOURCE_HASH_MISMATCH");
        const proposal = await segmenter.segment({
          bytes,
          exam,
          sourceHash: hash,
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
      const draft = JSON.parse(await readDraft(code));
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ...(saved?.configuration || draft),
          database_revision: saved?.revision || 0,
          draft_storage_available: storage.available,
        }),
      );
    } catch (e) {
      const error = [
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
      ].includes(e.message)
        ? e.message
        : "EXAM_UNAVAILABLE";
      res.statusCode =
        error === "AUTH_REQUIRED"
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
