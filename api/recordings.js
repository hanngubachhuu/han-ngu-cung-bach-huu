import { timingSafeEqual } from "node:crypto";
import { documentContext } from "../server/document-service.mjs";
import { recordingRuntimeHealth } from "../server/recording-audio.mjs";
import { productionRecordingJob } from "../server/recording-worker.mjs";
export const config = { maxDuration: 120 };
export function authorizeWorker(value, secret) {
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    typeof value !== "string"
  )
    return false;
  const actual = Buffer.from(value),
    expected = Buffer.from("Bearer " + secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers.origin === "https://hanngubachhuu.github.io") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://hanngubachhuu.github.io",
    );
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.statusCode = 204;
      return res.end();
    }
  }
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    }
    const action = new URL(req.url, "http://localhost").searchParams.get(
      "action",
    );
    let result;
    if (action === "health") {
      const token = req.headers.authorization?.match(
        /^Bearer ([A-Za-z0-9._-]+)$/,
      )?.[1];
      if (!token) throw Error("AUTH_REQUIRED");
      await documentContext(token);
      result = await recordingRuntimeHealth();
    } else if (action === "work") {
      if (
        !authorizeWorker(
          req.headers.authorization,
          process.env.SPEAKING_WORKER_SECRET,
        )
      )
        throw Error("AUTH_REQUIRED");
      result = await productionRecordingJob();
    } else throw Error("INVALID_REQUEST");
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    const allowed = new Set([
      "AUTH_REQUIRED",
      "ADMIN_REQUIRED",
      "INVALID_REQUEST",
      "AUDIO_RUNTIME_UNAVAILABLE",
      "AUDIO_DECODE_FAILED",
      "AUDIO_INVALID_OUTPUT",
      "RECORDING_NOT_CONFIGURED",
      "DRIVE_NOT_CONFIGURED",
      "DRIVE_AUTH_FAILED",
      "DRIVE_ACCOUNT_MISMATCH",
      "DRIVE_NOT_PRIVATE",
    ]);
    const code = allowed.has(error.message)
      ? error.message
      : "RECORDING_SERVICE_UNAVAILABLE";
    res.statusCode =
      code === "AUTH_REQUIRED"
        ? 401
        : code === "ADMIN_REQUIRED"
          ? 403
          : code === "INVALID_REQUEST"
            ? 400
            : 503;
    res.end(JSON.stringify({ error: code }));
  }
}
