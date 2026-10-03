import {
  studentContext,
  sessionCommand,
  readCurrentPrompt,
} from "../server/hskk-session-service.mjs";
export const config = { maxDuration: 30 };
export function createSessionHandler({
  authorize = studentContext,
  command = sessionCommand,
  prompt = readCurrentPrompt,
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
      const { client, userId } = await authorize(token),
        url = new URL(req.url, "https://local.invalid"),
        action = url.searchParams.get("action");
      let payload;
      if (req.method === "GET") payload = Object.fromEntries(url.searchParams);
      else {
        const raw =
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
        if (
          Buffer.byteLength(raw) > 12000 ||
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw Error("INVALID_REQUEST");
        payload = JSON.parse(raw);
      }
      if (
        ["prompt", "makeup_prompt"].includes(action) &&
        req.method === "GET"
      ) {
        const audio = await prompt(userId, payload, undefined, {
          makeup: action === "makeup_prompt",
        });
        res.setHeader("Content-Type", "audio/mpeg");
        res.statusCode = 200;
        return res.end(audio);
      }
      if (
        !(
          req.method === "GET"
            ? ["catalog", "load", "get", "result", "resume", "makeup_load"]
            : [
                "transition",
                "bind_recording",
                "submit",
                "makeup_start",
                "makeup_bind",
                "makeup_submit",
              ]
        ).includes(action)
      )
        throw Error("INVALID_REQUEST");
      const result = await command(client, action, payload);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      const allowed = [
        "AUTH_REQUIRED",
        "STUDENT_REQUIRED",
        "EXAM_ACCESS_REQUIRED",
        "SESSION_NOT_FOUND",
        "INVALID_REQUEST",
        "INVALID_TRANSITION",
        "RUNTIME_UPDATE_REQUIRED",
        "PREFLIGHT_EXPIRED",
        "EXAM_UNAVAILABLE",
        "EXAM_NOT_COMPLETED",
        "RECORDING_REQUIRED",
        "UPLOAD_WINDOW_EXPIRED",
        "RECORDING_LOCKED",
        "INVALID_RECORDING_REFERENCE",
        "SUBMISSION_LOCKED",
        "PROMPT_DENIED",
        "MAKEUP_NOT_AVAILABLE",
        "MAKEUP_TRANSPORT_REQUIRED",
        "RECORDING_WINDOW_REQUIRED",
        "VERSION_CONFLICT",
      ];
      const category = allowed.includes(error.message)
        ? error.message
        : "SESSION_UNAVAILABLE";
      res.statusCode =
        category === "AUTH_REQUIRED"
          ? 401
          : [
                "STUDENT_REQUIRED",
                "EXAM_ACCESS_REQUIRED",
                "SESSION_NOT_FOUND",
                "PROMPT_DENIED",
                "MAKEUP_NOT_AVAILABLE",
              ].includes(category)
            ? 403
            : category === "SESSION_UNAVAILABLE"
              ? 503
              : 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: category }));
    }
  };
}
export default createSessionHandler();
