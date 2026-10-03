import { parentPort, workerData } from "node:worker_threads";
import { parseExamDocument } from "./exam-document-parser.mjs";
try {
  const parse = workerData.hskkLevel
    ? (await import("./hskk-document-parser.mjs")).parseHSKKDocument
    : parseExamDocument;
  parentPort.postMessage({
    result: await parse(Buffer.from(workerData.bytes), workerData.name, {
      level: workerData.hskkLevel,
    }),
  });
} catch (error) {
  parentPort.postMessage({
    error: /^DOCUMENT_[A-Z_]+$/.test(error.message)
      ? error.message
      : "DOCUMENT_UNREADABLE",
  });
}
