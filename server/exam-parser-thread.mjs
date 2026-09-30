import { parentPort, workerData } from "node:worker_threads";
import { parseExamDocument } from "./exam-document-parser.mjs";
try {
  parentPort.postMessage({
    result: await parseExamDocument(
      Buffer.from(workerData.bytes),
      workerData.name,
    ),
  });
} catch (error) {
  parentPort.postMessage({
    error: /^DOCUMENT_[A-Z_]+$/.test(error.message)
      ? error.message
      : "DOCUMENT_UNREADABLE",
  });
}
