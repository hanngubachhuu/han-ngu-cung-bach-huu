import examImportHandler from "../api/exam-import.js";
import recordingHandler from "../api/recordings.js";
import hskkHandler from "../api/hskk-exams.js";
import hskkDeliveryHandler from "../api/hskk-delivery.js";
import hskkSessionHandler from "../api/hskk-session.js";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/study.js";
import accountHandler from "../api/account.js";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        [
          "/api/study",
          "/api/account",
          "/api/recordings",
          "/api/exam-import",
          "/api/hskk-exams",
          "/api/hskk-delivery",
          "/api/hskk-session",
        ].includes(url.pathname)
      ) {
        let body = "",
          size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (
            size >
            (["/api/exam-import", "/api/hskk-delivery"].includes(url.pathname)
              ? 4.3 * 1024 * 1024
              : 650000)
          ) {
            res.writeHead(413);
            res.end();
            return;
          }
          body += chunk;
        }
        req.body = body;
        await (
          url.pathname === "/api/hskk-session"
            ? hskkSessionHandler
            : url.pathname === "/api/hskk-delivery"
              ? hskkDeliveryHandler
              : url.pathname === "/api/hskk-exams"
                ? hskkHandler
                : url.pathname === "/api/exam-import"
                  ? examImportHandler
                  : url.pathname === "/api/recordings"
                    ? recordingHandler
                    : url.pathname === "/api/account"
                      ? accountHandler
                      : handler
        )(req, res);
        return;
      }
      const decoded = decodeURIComponent(url.pathname),
        file = path.resolve(
          root,
          "." + (decoded === "/" ? "/index.html" : decoded),
        );
      if (
        !file.startsWith(path.resolve(root) + path.sep) ||
        decoded.split("/").some((x) => x.startsWith("."))
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw Error("Not file");
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT) || 4173, "127.0.0.1", () =>
    console.log("Study app: http://127.0.0.1:" + (process.env.PORT || 4173)),
  );
