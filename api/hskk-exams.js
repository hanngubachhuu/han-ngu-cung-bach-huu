import fs from "node:fs/promises";
import { documentContext } from "../server/document-service.mjs";
import { openAITranscriber } from "../server/audio-transcriber.mjs";
import { alignQuestions } from "../server/audio-segmentation.mjs";
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
// Read-only admin preview. A draft never starts a learner attempt or writes media.
export function createExamHandler({
  authorize = documentContext,
  readDraft = (code) =>
    fs.readFile(
      new URL("../server/hskk/" + code + ".json", import.meta.url),
      "utf8",
    ),
  readAudio = async (code, client) =>
    readSourceAudio(client, JSON.parse(await readDraft(code))),
  transcriber = openAITranscriber(),
  aiEnabled = process.env.HSKK_AUTHORING_AI_ENABLED === "true",
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
        return res.end(JSON.stringify({ ai_enabled: aiEnabled }));
      }
      if (req.method === "POST") {
        if (action !== "segment") {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
        }
        if (!aiEnabled) throw Error("TRANSCRIBER_NOT_CONFIGURED");
        const exam = JSON.parse(await readDraft(code)),
          bytes = await readAudio(code, client),
          hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== exam.provenance.sha256[exam.provenance.audio])
          throw Error("SOURCE_HASH_MISMATCH");
        const transcript = await transcriber.transcribe({
          bytes,
          filename: exam.provenance.audio,
        });
        res.statusCode = 200;
        return res.end(
          JSON.stringify(
            alignQuestions({
              exam,
              transcript,
              sourceHash: hash,
              jobId: randomUUID(),
            }),
          ),
        );
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
        "AUTH_REQUIRED",
        "ADMIN_REQUIRED",
        "TRANSCRIBER_NOT_CONFIGURED",
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
