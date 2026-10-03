import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ffmpeg, ffprobe, decoderEnvironment } from "./recording-runtime.mjs";
import { readCanonicalSource } from "./hskk-canonical-source.mjs";
import { sourceMetadata, readSourceAudio } from "./hskk-source-audio.mjs";

const run = promisify(execFile);
export const importBucket = "hskk-import-originals";
export const mediaHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export async function importAssetCommand(client, command, payload) {
  const { data, error } = await client.rpc("hskk_import_asset", {
    command,
    payload,
  });
  if (error)
    throw Error(
      ["ADMIN_REQUIRED", "INVALID_SOURCE", "SOURCE_DEFINITION_LOCKED"].includes(
        error.message,
      )
        ? error.message
        : "SOURCE_STORAGE_UNAVAILABLE",
    );
  return data;
}
export async function verifiedImportBytes(client, asset) {
  if (!asset?.id || asset.bucket !== importBucket)
    throw Error("INVALID_SOURCE");
  if (asset.chunks?.length) {
    if (asset.kind !== "mp4" || asset.chunks.length > 8)
      throw Error("INVALID_SOURCE");
    const parts = [];
    for (const [i, chunk] of asset.chunks.entries()) {
      if (chunk.position !== i || chunk.byte_size > 33554432)
        throw Error("INVALID_SOURCE");
      const { data, error } = await client.storage
        .from(asset.bucket)
        .download(chunk.path);
      if (error || !data) throw Error("SOURCE_AUDIO_UNAVAILABLE");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.length !== chunk.byte_size || mediaHash(bytes) !== chunk.sha256)
        throw Error("SOURCE_HASH_MISMATCH");
      parts.push(bytes);
    }
    const bytes = Buffer.concat(parts);
    if (bytes.length !== asset.byte_size || mediaHash(bytes) !== asset.sha256)
      throw Error("SOURCE_HASH_MISMATCH");
    return bytes;
  }
  const { data, error } = await client.storage
    .from(asset.bucket)
    .download(asset.path);
  if (error || !data) throw Error("SOURCE_AUDIO_UNAVAILABLE");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length !== asset.byte_size || mediaHash(bytes) !== asset.sha256)
    throw Error("SOURCE_HASH_MISMATCH");
  return bytes;
}
// Decoding only creates a derivative for MP4. The supplied MP3 and original
// video are immutable, separately hashed private objects.
export async function extractImportAudio(bytes, format) {
  if (
    !["mp3", "mp4"].includes(format) ||
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > 256 * 1024 * 1024
  )
    throw Error("INVALID_SOURCE");
  const directory = await mkdtemp(path.join(tmpdir(), "hskk-import-"));
  const execute = async (binary, args) => {
    try {
      return await run(binary, args, {
        timeout: 90000,
        maxBuffer: 262144,
        windowsHide: true,
        env: decoderEnvironment,
      });
    } catch {
      throw Error("AUDIO_DECODE_FAILED");
    }
  };
  try {
    const input = path.join(directory, `original.${format}`);
    await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
    const metadata = JSON.parse(
      (
        await execute(ffprobe, [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-format_whitelist",
          format === "mp4" ? "mov" : "mp3",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          input,
        ])
      ).stdout,
    );
    const audio =
      metadata.streams?.filter((s) => s.codec_type === "audio") || [];
    const duration = Number(metadata.format?.duration);
    if (
      audio.length !== 1 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 3600 ||
      (format === "mp3" &&
        (audio[0].codec_name !== "mp3" || bytes.length > 33554432))
    )
      throw Error("INVALID_SOURCE");
    let source = bytes;
    if (format === "mp4") {
      const output = path.join(directory, "derived.mp3");
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
        "mov",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-vn",
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
      source = await readFile(output);
      const derived = JSON.parse(
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
      );
      if (
        derived.streams?.length !== 1 ||
        derived.streams[0].codec_name !== "mp3" ||
        Math.abs(Number(derived.format?.duration) - duration) > 0.2
      )
        throw Error("INVALID_SOURCE");
      if (source.length > 33554432) throw Error("INVALID_SOURCE");
      return {
        bytes: source,
        duration: Number(derived.format.duration),
        method: "ffmpeg_extract_mp4_audio_128k",
        original_sha256: mediaHash(bytes),
      };
    }
    return {
      bytes: source,
      duration,
      method: "original_mp3_unchanged",
      original_sha256: mediaHash(bytes),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function immutableImportUpload(client, asset, bytes, contentType) {
  const { error } = await client.storage
    .from(asset.bucket)
    .upload(asset.path, bytes, {
      contentType,
      upsert: false,
      cacheControl: "0",
    });
  // A duplicate may be HTTP 400, and a lost response may follow a successful
  // write. Only the immutable object's verified bytes establish success.
  try {
    await verifiedImportBytes(client, asset);
  } catch (verification) {
    if (error && verification.message === "SOURCE_AUDIO_UNAVAILABLE")
      throw Error("SOURCE_UPLOAD_FAILED");
    throw verification;
  }
}
export async function prepareImportAudio(client, id) {
  const original = await importAssetCommand(client, "get", { id });
  if (!["mp3", "mp4"].includes(original?.kind)) throw Error("INVALID_SOURCE");
  const decoded = await extractImportAudio(
    await verifiedImportBytes(client, original),
    original.kind,
  );
  const hash = mediaHash(decoded.bytes);
  const derived =
    original.kind === "mp3"
      ? original
      : await importAssetCommand(client, "reserve", {
          exam_code: original.exam_code,
          sha256: hash,
          byte_size: decoded.bytes.length,
          kind: "mp3",
          original_id: original.id,
        });
  if (original.kind === "mp4")
    await immutableImportUpload(client, derived, decoded.bytes, "audio/mpeg");
  return {
    asset_id: derived.id,
    original_id: original.id,
    original_sha256: decoded.original_sha256,
    original_kind: original.kind,
    sha256: hash,
    byte_size: decoded.bytes.length,
    duration_seconds: decoded.duration,
    method: decoded.method,
  };
}
export async function attachImportAudio(client, code, id) {
  const asset = await importAssetCommand(client, "get", { id });
  const exam = await readCanonicalSource(code, client);
  if (
    asset?.exam_code !== code ||
    asset.kind !== "mp3" ||
    asset.sha256 !== exam.audio.source_audio_id ||
    asset.byte_size !== exam.audio.byte_size
  )
    throw Error("INVALID_SOURCE");
  const bytes = await verifiedImportBytes(client, asset);
  const reserved = await sourceMetadata(client, exam, "reserve_source");
  const { error } = await client.storage
    .from(reserved.bucket)
    .upload(reserved.path, bytes, {
      contentType: "audio/mpeg",
      upsert: false,
      cacheControl: "0",
    });
  let stored;
  try {
    stored = await readSourceAudio(client, exam, { allowLocal: false });
  } catch (verification) {
    if (error && verification.message === "SOURCE_AUDIO_UNAVAILABLE")
      throw Error("SOURCE_UPLOAD_FAILED");
    throw verification;
  }
  if (stored.length !== bytes.length) throw Error("SOURCE_SIZE_MISMATCH");
  return {
    attached: true,
    stored_hash_verified: true,
    byte_size: stored.length,
    sha256: mediaHash(stored),
  };
}
