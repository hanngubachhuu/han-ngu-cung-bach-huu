import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  ocrDirectory,
  ocrModels,
  verifyOCRModels,
} from "../server/hskk-ocr-runtime.mjs";
await fs.mkdir(ocrDirectory, { recursive: true });
for (const [name, expected] of Object.entries(ocrModels)) {
  const file = path.join(ocrDirectory, name + ".traineddata");
  let bytes = await fs.readFile(file).catch(() => null);
  const valid = () =>
    bytes?.length === expected.bytes &&
    createHash("sha256").update(bytes).digest("hex") === expected.sha256;
  if (!valid()) {
    const response = await fetch(
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/${name}.traineddata`,
      { signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok) throw Error("OCR model download failed");
    bytes = Buffer.from(await response.arrayBuffer());
    if (!valid()) throw Error("OCR model checksum mismatch");
    await fs.writeFile(file, bytes, { mode: 0o600 });
  }
}
await verifyOCRModels();
console.log("HSKK OCR models: verified, local CPU only");
