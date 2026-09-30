import { createClient } from "@supabase/supabase-js";
import { normalizeRecording, audioHash } from "./recording-audio.mjs";
import { createDriveArchive, driveConfigured } from "./recording-drive.mjs";

// One bounded job per scheduler invocation. No 7-day timer or in-memory queue.
export async function runRecordingJob({
  command,
  storage,
  drive,
  convert = normalizeRecording,
}) {
  const job = await command("claim", {});
  if (!job) return { status: "idle" };
  const token = { recording_id: job.id, lease_id: job.lease_id };
  const mutation = (name, values = {}) =>
    command(name, { ...token, ...values });
  try {
    if (job.job === "cleanup") {
      await mutation("cleanup_check");
      await drive.remove(job);
      // Re-check lease before each destructive operation; paths are immutable recording IDs.
      await mutation("cleanup_check");
      await storage.remove(job.mp3_path, job.mp3_sha256);
      await mutation("cleanup_check");
      await storage.remove(job.raw_path, job.raw_sha256);
      await mutation("cleaned");
      return { status: "cleaned" };
    }
    let bytes;
    if (job.conversion_status !== "completed") {
      const raw = await storage.read(job.raw_path);
      if (raw.length !== job.raw_size) throw Error("AUDIO_INVALID_SIZE");
      const mp3 = await convert(raw, job.raw_sha256);
      await storage.writeOnce(job.mp3_path, mp3.bytes, mp3.sha256);
      await mutation("converted", {
        sha256: mp3.sha256,
        size: mp3.size,
        duration: mp3.duration,
      });
      Object.assign(job, {
        conversion_status: "completed",
        mp3_sha256: mp3.sha256,
        mp3_size: mp3.size,
        duration_seconds: mp3.duration,
      });
      bytes = mp3.bytes;
    } else bytes = await storage.read(job.mp3_path);
    if (audioHash(bytes) !== job.mp3_sha256 || bytes.length !== job.mp3_size)
      throw Error("MP3_IDENTITY_CONFLICT");
    if (!job.drive_file_id) {
      const id = await drive.allocateId();
      // Persist identity before the external side effect, so response loss cannot duplicate a file.
      await mutation("drive_id", { file_id: id });
      job.drive_file_id = id;
    }
    const uploaded = await drive.upload(job, bytes);
    await mutation("archived", { file_id: uploaded.fileId });
    return { status: "archived" };
  } catch (error) {
    const safe =
      /^(?:AUDIO|MP3|DRIVE|STORAGE|STALE|CLEANUP|ARCHIVE)_[A-Z_]{1,64}$/.test(
        error.message,
      )
        ? error.message
        : "RECORDING_WORKER_FAILED";
    try {
      await mutation("failed", { error_code: safe });
    } catch {
      /* A newer lease owns retries. */
    }
    return { status: "retry", error: safe };
  }
}
export function recordingStorage(client) {
  const bucket = client.storage.from("speaking-private");
  const valid = (name) => {
    if (!/^[0-9a-f-]{36}\/(raw|audio\.mp3)$/.test(name))
      throw Error("STORAGE_INVALID_PATH");
  };
  const missing = (error) =>
    ["404", "not_found", "NoSuchKey"].includes(
      String(error?.statusCode || error?.code),
    );
  async function read(name, allowMissing = false) {
    valid(name);
    const { data, error } = await bucket.download(name);
    if (error) {
      if (allowMissing && missing(error)) return null;
      throw Error("STORAGE_READ_FAILED");
    }
    return Buffer.from(await data.arrayBuffer());
  }
  return {
    read,
    async writeOnce(name, bytes, sha256) {
      valid(name);
      const { error } = await bucket.upload(name, bytes, {
        contentType: "audio/mpeg",
        upsert: false,
        cacheControl: "0",
      });
      if (error) {
        if (
          !["409", "Duplicate"].includes(String(error.statusCode || error.code))
        )
          throw Error("STORAGE_WRITE_FAILED");
        if (audioHash(await read(name)) !== sha256)
          throw Error("MP3_IDENTITY_CONFLICT");
      }
    },
    async remove(name, sha256) {
      const bytes = await read(name, true);
      if (bytes === null) return;
      if (audioHash(bytes) !== sha256) throw Error("STORAGE_IDENTITY_CONFLICT");
      const { error } = await bucket.remove([name]);
      if (error && !missing(error)) throw Error("STORAGE_DELETE_FAILED");
      if ((await read(name, true)) !== null)
        throw Error("STORAGE_DELETE_UNCONFIRMED");
    },
  };
}
export async function productionRecordingJob(env = process.env) {
  if (
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_URL ||
    !driveConfigured(env)
  )
    throw Error("RECORDING_NOT_CONFIGURED");
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(30000) }),
    },
  });
  const command = async (name, payload) => {
    const { data, error } = await client.rpc("recording_worker", {
      command: name,
      payload,
    });
    if (error)
      throw Error(
        error.message === "STALE_RECORDING_LEASE"
          ? error.message
          : "RECORDING_COMMAND_FAILED",
      );
    return data;
  };
  return runRecordingJob({
    command,
    storage: recordingStorage(client),
    drive: await createDriveArchive(env),
  });
}
