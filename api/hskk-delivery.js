import { documentContext } from "../server/document-service.mjs";
import {
  deliveryCommand,
  prepareDelivery,
  storeExistingClips,
  receiptClient,
} from "../server/hskk-delivery.mjs";
import { productionRecordingJob } from "../server/recording-worker.mjs";
import { recordingRuntimeHealth } from "../server/recording-audio.mjs";
import { createDriveArchive } from "../server/recording-drive.mjs";
// Importing the actual handler and transport is part of the production bundle;
// readiness cannot be asserted by a browser-supplied boolean.
import sessionHandler from "./hskk-session.js";
async function verifyRuntime(client) {
  if (typeof sessionHandler !== "function") throw Error("DELIVERY_NOT_READY");
  await recordingRuntimeHealth();
  await createDriveArchive();
  const { data } = await client.auth.getUser();
  const server = receiptClient();
  const { error } = await server.rpc("hskk_runtime_verified", {
    payload: {
      actor: data.user.id,
      exam_code: "H71002",
      runtime_version: "hskk-official-v1",
    },
  });
  if (error) throw Error("DELIVERY_NOT_READY");
  return { verified: true, runtime_version: "hskk-official-v1" };
}
export const config = { maxDuration: 120 };
export function createDeliveryHandler({
  authorize = documentContext,
  prepare = prepareDelivery,
  upload = storeExistingClips,
  processRecording = productionRecordingJob,
  runtime = verifyRuntime,
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
      const url = new URL(req.url, "https://local.invalid"),
        code = url.searchParams.get("exam"),
        action = url.searchParams.get("action") || "get";
      if (code !== "H71002") throw Error("EXAM_UNAVAILABLE");
      let result;
      if (req.method === "GET" && action === "get")
        result = await deliveryCommand(client, "get", { exam_code: code });
      else if (req.method === "POST" && action === "prepare")
        result = await prepare(client, code);
      else if (req.method === "POST" && action === "runtime")
        result = await runtime(client);
      else if (req.method === "POST" && action === "process") {
        const body =
          typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { data, error } = await client.rpc("hskk_publication", {
          command: "process_list",
          payload: { exam_code: code, attempt_id: body?.attempt_id },
        });
        if (error) throw Error("DELIVERY_NOT_READY");
        const id = data.recording_ids?.[0];
        result = id
          ? {
              processed: await processRecording(process.env, {
                hskkRecordingId: id,
              }),
              remaining: data.recording_ids.length,
            }
          : { remaining: 0 };
      } else if (req.method === "POST" && action === "upload") {
        const raw =
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          ) ||
          Buffer.byteLength(raw) > 4.3 * 1024 * 1024
        )
          throw Error("INVALID_ARCHIVE");
        const body = JSON.parse(raw);
        if (
          typeof body.bytes !== "string" ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(body.bytes)
        )
          throw Error("INVALID_ARCHIVE");
        result = await upload(client, Buffer.from(body.bytes, "base64"), {
          code,
        });
      } else {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
      }
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      const category = [
        "AUTH_REQUIRED",
        "ADMIN_REQUIRED",
        "VERSION_CONFLICT",
        "INVALID_ARCHIVE",
        "CLIP_HASH_MISMATCH",
        "STORED_CLIP_HASH_MISMATCH",
        "EXAM_UNAVAILABLE",
      ].includes(error.message)
        ? error.message
        : "DELIVERY_NOT_READY";
      res.statusCode =
        category === "AUTH_REQUIRED"
          ? 401
          : category === "ADMIN_REQUIRED"
            ? 403
            : category === "VERSION_CONFLICT"
              ? 409
              : ["INVALID_ARCHIVE", "CLIP_HASH_MISMATCH"].includes(category)
                ? 400
                : 503;
      res.end(JSON.stringify({ error: category }));
    }
  };
}
export default createDeliveryHandler();
