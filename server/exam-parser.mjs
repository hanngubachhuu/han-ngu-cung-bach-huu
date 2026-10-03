import { Worker } from "node:worker_threads";
import { detectDocument } from "./exam-file.mjs";
export async function parseExamFile(bytes, name, { hskkLevel } = {}) {
  detectDocument(bytes, name);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./exam-parser-thread.mjs", import.meta.url),
      {
        workerData: { bytes, name, hskkLevel },
        resourceLimits: { maxOldGenerationSizeMb: hskkLevel ? 384 : 128 },
      },
    );
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(Error("DOCUMENT_TOO_COMPLEX")),
      hskkLevel ? 105000 : 20000,
    );
    worker.once("message", (value) =>
      finish(value.error ? Error(value.error) : null, value.result),
    );
    worker.once("error", () => finish(Error("DOCUMENT_UNREADABLE")));
    worker.once("exit", (code) => {
      if (!done)
        finish(Error(code ? "DOCUMENT_UNREADABLE" : "DOCUMENT_TOO_COMPLEX"));
    });
  });
}
