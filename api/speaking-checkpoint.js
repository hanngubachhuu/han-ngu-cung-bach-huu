import { documentContext } from "../server/document-service.mjs";
import { runBrowserCheckpoint } from "../server/speaking-browser-checkpoint.mjs";
export const config = { maxDuration: 120 };
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
  }
  try {
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]+)$/,
    )?.[1];
    if (!token) throw Error("AUTH_REQUIRED");
    const admin = await documentContext(token);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    res.statusCode = 200;
    res.end(JSON.stringify(await runBrowserCheckpoint(admin, body)));
  } catch (error) {
    const code =
      ["AUTH_REQUIRED", "ADMIN_REQUIRED", "INVALID_REQUEST"].includes(
        error.message,
      ) || /^CANARY_[A-Z_]{1,64}$/.test(error.message)
        ? error.message
        : "CANARY_SERVICE_UNAVAILABLE";
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
