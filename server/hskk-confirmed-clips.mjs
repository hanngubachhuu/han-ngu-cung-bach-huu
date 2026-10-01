import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ffmpeg, ffprobe, decoderEnvironment } from "./recording-runtime.mjs";
import {
  checkFinalization,
  sourceHash,
} from "../study/hskk-review-validation.mjs";
const run = promisify(execFile),
  hash = (b) => createHash("sha256").update(b).digest("hex");
export async function generateConfirmedClip({ exam, bytes, questionId }) {
  if (!checkFinalization(exam).ready) throw Error("DRAFT_NOT_READY");
  if (hash(bytes) !== sourceHash(exam)) throw Error("SOURCE_HASH_MISMATCH");
  const q = exam.questions.find((q) => q.id === questionId);
  if (!q) throw Error("INVALID_QUESTION");
  const s = q.audio_segment,
    directory = await mkdtemp(path.join(tmpdir(), "hskk-clip-"));
  const execute = async (binary, args) => {
    try {
      return await run(binary, args, {
        timeout: 90000,
        maxBuffer: 256 * 1024,
        windowsHide: true,
        env: decoderEnvironment,
      });
    } catch {
      throw Error("CLIP_GENERATION_FAILED");
    }
  };
  try {
    const input = path.join(directory, "source.mp3"),
      output = path.join(directory, "clip.mp3");
    await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
    await execute(ffmpeg, [
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-threads",
      "1",
      "-protocol_whitelist",
      "file",
      "-format_whitelist",
      "mp3",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-af",
      `atrim=start=${s.start_ms / 1000}:end=${s.end_ms / 1000},asetpts=PTS-STARTPTS`,
      "-map_metadata",
      "-1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      "-n",
      output,
    ]);
    const metadata = JSON.parse(
        (
          await execute(ffprobe, [
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            output,
          ])
        ).stdout,
      ),
      duration = Number(metadata.format?.duration);
    if (
      metadata.streams?.length !== 1 ||
      metadata.streams[0].codec_name !== "mp3" ||
      !Number.isFinite(duration) ||
      Math.abs(duration - (s.end_ms - s.start_ms) / 1000) > 0.2
    )
      throw Error("CLIP_INVALID_OUTPUT");
    const clip = await readFile(output);
    return {
      bytes: clip,
      provenance: {
        exam_code: exam.exam_code,
        exam_version: exam.exam_version,
        question_id: q.id,
        question_version: q.version,
        source_audio_id: exam.audio.source_audio_id,
        source_sha256: sourceHash(exam),
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        clip_sha256: hash(clip),
        duration_ms: Math.round(duration * 1000),
        run_id: s.run_id,
        reviewed_by: s.reviewed_by,
        reviewed_at: s.reviewed_at,
        created_at: new Date().toISOString(),
        method: "ffmpeg_atrim_confirmed_ms",
      },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
