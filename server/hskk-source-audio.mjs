import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateExam } from "../study/hskk-exam-core.mjs";
export async function sourceMetadata(client, exam, command = "get_source") {
  validateExam(exam);
  const { data, error } = await client.rpc("hskk_authoring_draft", {
    command,
    payload: {
      exam_code: exam.exam_code,
      source_sha256: exam.provenance.sha256[exam.provenance.audio],
      byte_size: exam.audio.byte_size,
    },
  });
  if (error) throw Error("SOURCE_STORAGE_UNAVAILABLE");
  return data;
}
export async function readSourceAudio(
  client,
  exam,
  { allowLocal = !process.env.VERCEL } = {},
) {
  validateExam(exam);
  let bytes;
  if (client?.storage) {
    try {
      const asset = await sourceMetadata(client, exam);
      if (asset) {
        const { data, error } = await client.storage
          .from(asset.bucket)
          .download(asset.path);
        if (!error) bytes = Buffer.from(await data.arrayBuffer());
      }
    } catch {}
  }
  if (!bytes && allowLocal)
    try {
      bytes = await fs.readFile(
        new URL(
          "../.cache/hskk-sources/" + exam.exam_code + ".mp3",
          import.meta.url,
        ),
      );
    } catch {}
  if (!bytes) throw Error("SOURCE_AUDIO_UNAVAILABLE");
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    exam.provenance.sha256[exam.provenance.audio]
  )
    throw Error("SOURCE_HASH_MISMATCH");
  return bytes;
}
