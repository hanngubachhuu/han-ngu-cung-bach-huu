import { documentContext } from "../server/document-service.mjs";
import {
  importAssetCommand,
  verifiedImportBytes,
  prepareImportAudio,
  attachImportAudio,
} from "../server/hskk-import-media.mjs";
export const config = { maxDuration: 120 };
export function createImportHandler({
  authorize = documentContext,
  assetCommand = importAssetCommand,
  prepare = prepareImportAudio,
  attach = attachImportAudio,
  verify = verifiedImportBytes,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "POST") {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
      }
      const token = req.headers.authorization?.match(
        /^Bearer ([A-Za-z0-9._-]+)$/,
      )?.[1];
      if (!token) throw Error("AUTH_REQUIRED");
      const client = await authorize(token);
      if (
        !String(req.headers["content-type"] || "").startsWith(
          "application/json",
        )
      )
        throw Error("INVALID_REQUEST");
      const raw =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw) > 16384) throw Error("INVALID_REQUEST");
      const body = JSON.parse(raw),
        action = new URL(req.url, "https://local.invalid").searchParams.get(
          "action",
        );
      let result;
      if (action === "reserve")
        result = await assetCommand(client, "reserve", body);
      else if (action === "audio") result = await prepare(client, body.id);
      else if (action === "attach")
        result = await attach(client, body.exam_code, body.id);
      else if (action === "verify") {
        const asset = await assetCommand(client, "get", { id: body.id });
        await verify(client, asset);
        result = {
          verified: true,
          sha256: asset.sha256,
          byte_size: asset.byte_size,
        };
      } else throw Error("INVALID_REQUEST");
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (e) {
      const allowed = [
        "AUTH_REQUIRED",
        "ADMIN_REQUIRED",
        "INVALID_REQUEST",
        "INVALID_SOURCE",
        "SOURCE_DEFINITION_LOCKED",
        "SOURCE_STORAGE_UNAVAILABLE",
        "SOURCE_AUDIO_UNAVAILABLE",
        "SOURCE_HASH_MISMATCH",
        "SOURCE_SIZE_MISMATCH",
        "SOURCE_UPLOAD_FAILED",
        "AUDIO_DECODE_FAILED",
      ];
      const error = allowed.includes(e.message)
        ? e.message
        : "SOURCE_IMPORT_UNAVAILABLE";
      res.statusCode =
        error === "AUTH_REQUIRED"
          ? 401
          : error === "ADMIN_REQUIRED"
            ? 403
            : [
                  "INVALID_REQUEST",
                  "INVALID_SOURCE",
                  "SOURCE_DEFINITION_LOCKED",
                ].includes(error)
              ? 400
              : 503;
      res.end(JSON.stringify({ error }));
    }
  };
}
export default createImportHandler();
