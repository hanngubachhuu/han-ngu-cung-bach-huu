import {
  HttpError,
  validateInput,
  createContext,
  runAction,
} from "../server/study-service.mjs";
export const config = { maxDuration: 120 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const action = new URL(req.url, "http://localhost").searchParams.get(
      "action",
    );
    const aiEnabled =
      process.env.STUDY_AI_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
    if (req.method === "GET" && action === "status") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      res.end(JSON.stringify({ aiEnabled }));
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      throw new HttpError(405, "Chỉ nhận yêu cầu POST.");
    }
    if (
      !String(req.headers["content-type"] || "").startsWith("application/json")
    )
      throw new HttpError(415, "Cần dữ liệu JSON.");
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]+)$/,
    )?.[1];
    if (!token) throw new HttpError(401, "Đăng nhập để sử dụng AI.");
    if (!aiEnabled)
      throw new HttpError(
        503,
        "AI tạm chưa bật. Kho từ, luyện nét và bài đọc mẫu vẫn sử dụng được.",
      );
    let body = req.body;
    if (typeof body === "string") {
      if (Buffer.byteLength(body) > 650000)
        throw new HttpError(413, "Dữ liệu quá lớn.");
      try {
        body = JSON.parse(body);
      } catch {
        throw new HttpError(400, "Dữ liệu JSON không hợp lệ.");
      }
    }
    if (Buffer.byteLength(JSON.stringify(body || {})) > 650000)
      throw new HttpError(413, "Dữ liệu quá lớn.");
    const input = validateInput(action, body);
    const context = await createContext(token);
    const result = await runAction(action, input, context);
    if (result.audio) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.statusCode = 200;
      res.end(result.audio);
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      res.end(JSON.stringify(result.json));
    }
  } catch (error) {
    res.statusCode = error.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (error.status === 429) res.setHeader("Retry-After", "3600");
    res.end(
      JSON.stringify({
        error:
          error instanceof HttpError
            ? error.message
            : "Dịch vụ tạm thời chưa sẵn sàng. Hãy thử lại sau.",
      }),
    );
  }
}
