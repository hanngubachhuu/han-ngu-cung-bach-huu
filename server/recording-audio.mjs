import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  ffmpeg,
  ffprobe,
  decoderEnvironment,
  runtimeVersion,
} from "./recording-runtime.mjs";

const run = promisify(execFile);
export const audioLimits = Object.freeze({
  rawBytes: 8 * 1024 * 1024,
  mp3Bytes: 3 * 1024 * 1024,
  seconds: 360,
});
export const audioHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const formats = "matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,ogg,wav,mp3";
async function execute(binary, args) {
  try {
    return await run(binary, args, {
      timeout: 45000,
      maxBuffer: 512 * 1024,
      windowsHide: true,
      env: decoderEnvironment,
    });
  } catch (error) {
    // Decoder stderr may contain input metadata. Do not expose it in API/log output.
    throw Error(
      error.code === "ENOENT" || error.code === "EACCES"
        ? "AUDIO_RUNTIME_UNAVAILABLE"
        : "AUDIO_DECODE_FAILED",
    );
  }
}
async function probe(file) {
  const { stdout } = await execute(ffprobe, [
    "-v",
    "error",
    "-protocol_whitelist",
    "file",
    "-format_whitelist",
    formats,
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  try {
    return JSON.parse(stdout);
  } catch {
    throw Error("AUDIO_INVALID_METADATA");
  }
}
export async function normalizeRecording(bytes, expectedHash) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > audioLimits.rawBytes
  )
    throw Error("AUDIO_INVALID_SIZE");
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash || "") ||
    audioHash(bytes) !== expectedHash
  )
    throw Error("AUDIO_HASH_MISMATCH");
  const directory = await mkdtemp(path.join(tmpdir(), "hnh-speaking-"));
  try {
    const input = path.join(directory, "input"),
      output = path.join(directory, "audio.mp3");
    await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
    const source = await probe(input);
    if (
      source.streams?.length !== 1 ||
      source.streams[0].codec_type !== "audio"
    )
      throw Error("AUDIO_INVALID_STREAMS");
    const seconds = Number(source.format?.duration);
    // Browser WebM may omit duration; bounded decode below measures actual samples.
    if (
      Number.isFinite(seconds) &&
      (seconds <= 0 || seconds > audioLimits.seconds + 0.1)
    )
      throw Error("AUDIO_INVALID_DURATION");
    await execute(ffmpeg, [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-xerror",
      "-threads",
      "1",
      "-protocol_whitelist",
      "file",
      "-format_whitelist",
      formats,
      "-i",
      input,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-map_metadata",
      "-1",
      "-t",
      "361",
      "-ac",
      "1",
      "-ar",
      "32000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      "-af",
      "loudnorm=I=-20:TP=-2:LRA=7",
      "-threads",
      "1",
      "-f",
      "mp3",
      "-n",
      output,
    ]);
    const normalized = await probe(output),
      stream = normalized.streams?.[0];
    const duration = Number(normalized.format?.duration);
    if (
      normalized.streams?.length !== 1 ||
      stream?.codec_name !== "mp3" ||
      stream.channels !== 1 ||
      Number(stream.sample_rate) !== 32000 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 360.15
    )
      throw Error("AUDIO_INVALID_OUTPUT");
    await execute(ffmpeg, [
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-protocol_whitelist",
      "file",
      "-i",
      output,
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ]);
    const mp3 = await readFile(output);
    if (!mp3.length || mp3.length > audioLimits.mp3Bytes)
      throw Error("AUDIO_INVALID_OUTPUT");
    return {
      bytes: mp3,
      sha256: audioHash(mp3),
      duration,
      size: mp3.length,
      mime: "audio/mpeg",
      codec: "mp3",
    };
  } finally {
    // Remove only our exclusive temporary directory, never a caller-supplied path.
    await rm(directory, { recursive: true, force: true });
  }
}
export function syntheticWave(seconds = 1) {
  const rate = 16000,
    samples = Math.floor(seconds * rate),
    wave = Buffer.alloc(44 + samples * 2);
  wave.write("RIFF");
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(rate, 24);
  wave.writeUInt32LE(rate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wave.writeInt16LE(
      Math.round(3000 * Math.sin((i * 2 * Math.PI * 440) / rate)),
      44 + i * 2,
    );
  return wave;
}
export async function recordingRuntimeHealth() {
  for (const binary of [ffmpeg, ffprobe]) {
    const { stdout } = await execute(binary, ["-version"]);
    if (!stdout.split("\n")[0].includes("n" + runtimeVersion))
      throw Error("AUDIO_RUNTIME_UNAVAILABLE");
  }
  const started = Date.now(),
    raw = syntheticWave(),
    result = await normalizeRecording(raw, audioHash(raw));
  return {
    conversion: "passed",
    runtime: runtimeVersion,
    codec: result.codec,
    mime: result.mime,
    bytes: result.size,
    duration: result.duration,
    elapsedMs: Date.now() - started,
  };
}
