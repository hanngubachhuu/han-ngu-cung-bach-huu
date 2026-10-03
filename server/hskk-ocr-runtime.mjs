import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
export const ocrDirectory = path.resolve(process.cwd(), ".cache/hskk-ocr");
export const ocrModels = Object.freeze({
  chi_sim: {
    bytes: 2469156,
    sha256: "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730",
  },
  eng: {
    bytes: 4113088,
    sha256: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
  },
});
export async function verifyOCRModels() {
  for (const [name, expected] of Object.entries(ocrModels)) {
    const bytes = await fs.readFile(
      path.join(ocrDirectory, name + ".traineddata"),
    );
    if (
      bytes.length !== expected.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== expected.sha256
    )
      throw Error("DOCUMENT_OCR_UNAVAILABLE");
  }
}
