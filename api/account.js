import {
  documentContext,
  runDocumentAction,
} from "../server/document-service.mjs";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const action = new URL(req.url, "http://localhost").searchParams.get(
      "action",
    );
    if (
      !(req.method === "GET" && action === "status") &&
      req.method !== "POST"
    ) {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    }
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]+)$/,
    )?.[1];
    if (!token) throw Error("AUTH_REQUIRED");
    if (
      req.method === "POST" &&
      !String(req.headers["content-type"] || "").startsWith("application/json")
    )
      throw Error("INVALID_REQUEST");
    if (
      Buffer.byteLength(
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {}),
      ) > 16000
    )
      throw Error("INVALID_REQUEST");
    let body;
    try {
      body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch {
      throw Error("INVALID_REQUEST");
    }
    const context = await documentContext(token),
      result = await runDocumentAction(context, action, body);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    const allowed = new Set([
      "AUTH_REQUIRED",
      "ADMIN_REQUIRED",
      "GOOGLE_NOT_CONFIGURED",
      "GOOGLE_ACCOUNT_MISMATCH",
      "GOOGLE_AUTH_FAILED",
      "INVALID_REQUEST",
      "VERSION_CONFLICT",
      "UNRESOLVED_CONFLICT",
      "DOCUMENT_ALREADY_LINKED",
      "DOCUMENT_CREATED_BIND_FAILED",
      "SYNC_INCOMPLETE_REVIEW_REQUIRED",
      "INVALID_DOCUMENT_FIELDS",
      "DOCUMENT_MARKERS_INVALID",
      "SYNC_BUSY",
    ]);
    const code = allowed.has(error.message)
      ? error.message
      : error.code === "40001"
        ? "VERSION_CONFLICT"
        : "DOCUMENT_SERVICE_UNAVAILABLE";
    res.statusCode =
      code === "AUTH_REQUIRED"
        ? 401
        : code === "ADMIN_REQUIRED"
          ? 403
          : ["VERSION_CONFLICT", "UNRESOLVED_CONFLICT", "SYNC_BUSY"].includes(
                code,
              )
            ? 409
            : code === "INVALID_REQUEST"
              ? 400
              : 503;
    res.end(
      JSON.stringify({
        error: code,
        ...(code === "DOCUMENT_CREATED_BIND_FAILED"
          ? { documentId: error.documentId }
          : {}),
      }),
    );
  }
}
