import { createHash } from "node:crypto";
import { documentContext } from "../server/document-service.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import { documentLimits } from "../server/exam-file.mjs";
export const config = { maxDuration: 60 };
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
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]+)$/,
    )?.[1];
    if (!token) throw Error("AUTH_REQUIRED");
    await documentContext(token);
    if (
      !String(req.headers["content-type"] || "").startsWith("application/json")
    )
      throw Error("DOCUMENT_UNSUPPORTED");
    const raw =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw) > 4.3 * 1024 * 1024)
      throw Error("DOCUMENT_TOO_LARGE");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw Error("DOCUMENT_UNREADABLE");
    }
    if (
      typeof body.filename !== "string" ||
      body.filename.length > 180 ||
      typeof body.bytes !== "string" ||
      body.bytes.length > Math.ceil(documentLimits.bytes / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.bytes)
    )
      throw Error("DOCUMENT_UNSUPPORTED");
    const bytes = Buffer.from(body.bytes, "base64");
    const parsed = await parseExamFile(bytes, body.filename);
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ...parsed,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    );
  } catch (error) {
    const allowed = new Set([
      "AUTH_REQUIRED",
      "ADMIN_REQUIRED",
      "DOCUMENT_TOO_LARGE",
      "DOCUMENT_UNSUPPORTED",
      "DOCUMENT_UNREADABLE",
      "DOCUMENT_TOO_COMPLEX",
      "DOCUMENT_SCAN_UNSUPPORTED",
    ]);
    const code = allowed.has(error.message)
      ? error.message
      : "DOCUMENT_UNREADABLE";
    res.statusCode =
      code === "AUTH_REQUIRED" ? 401 : code === "ADMIN_REQUIRED" ? 403 : 400;
    res.end(JSON.stringify({ error: code }));
  }
}
