import test from "node:test";
import assert from "node:assert/strict";
import { runRecordingJob } from "../server/recording-worker.mjs";
import { audioHash } from "../server/recording-audio.mjs";
import recordingHandler, { authorizeWorker } from "../api/recordings.js";
function fixture({ cleanup = false } = {}) {
  const raw = Buffer.from("synthetic raw"),
    mp3 = Buffer.from("synthetic normalized"),
    objects = new Map([["id/raw", raw]]),
    files = new Map(),
    events = [];
  const record = {
    id: "id",
    raw_path: "id/raw",
    mp3_path: "id/audio.mp3",
    raw_sha256: audioHash(raw),
    raw_size: raw.length,
    lease_id: "lease",
    conversion_status: "pending",
    drive_status: "pending",
    job: cleanup ? "cleanup" : "process",
  };
  if (cleanup)
    Object.assign(record, {
      conversion_status: "completed",
      mp3_sha256: audioHash(mp3),
      mp3_size: mp3.length,
      drive_status: "completed",
      drive_file_id: "file",
      expires_at: "2000-01-01",
    });
  if (cleanup) {
    objects.set(record.mp3_path, mp3);
    files.set("file", mp3);
  }
  let uploadFail = false,
    cleanupFail = false,
    stale = false,
    convertCalls = 0,
    idCalls = 0;
  const command = async (name, payload) => {
    if (name === "claim") {
      if (record.cleaned) return null;
      return { ...record };
    }
    if (payload.lease_id !== record.lease_id || stale)
      throw Error("STALE_RECORDING_LEASE");
    events.push(name);
    if (name === "converted")
      Object.assign(record, {
        conversion_status: "completed",
        mp3_sha256: payload.sha256,
        mp3_size: payload.size,
      });
    if (name === "drive_id") record.drive_file_id = payload.file_id;
    if (name === "archived") {
      record.drive_status = "completed";
      record.uploaded_at = "2026-10-01";
      record.expires_at = "2026-10-08";
    }
    if (name === "cleaned") record.cleaned = true;
    if (name === "failed") record.error = payload.error_code;
    return { ok: true };
  };
  const storage = {
    read: async (name) => objects.get(name),
    writeOnce: async (name, bytes, hash) => {
      if (objects.has(name)) assert.equal(audioHash(objects.get(name)), hash);
      else objects.set(name, bytes);
    },
    remove: async (name, hash) => {
      if (cleanupFail) {
        cleanupFail = false;
        throw Error("STORAGE_DELETE_FAILED");
      }
      if (objects.has(name)) {
        assert.equal(audioHash(objects.get(name)), hash);
        objects.delete(name);
      }
    },
  };
  const drive = {
    allocateId: async () => {
      idCalls++;
      return "file";
    },
    upload: async (r, bytes) => {
      if (uploadFail) throw Error("DRIVE_REQUEST_FAILED");
      if (files.has(r.drive_file_id))
        assert.deepEqual(files.get(r.drive_file_id), bytes);
      else files.set(r.drive_file_id, bytes);
      return { fileId: r.drive_file_id };
    },
    remove: async (r) => {
      files.delete(r.drive_file_id);
    },
  };
  const convert = async () => {
    convertCalls++;
    return {
      bytes: mp3,
      sha256: audioHash(mp3),
      size: mp3.length,
      duration: 1,
    };
  };
  return {
    record,
    objects,
    files,
    events,
    run: () => runRecordingJob({ command, storage, drive, convert }),
    failUpload: () => (uploadFail = true),
    recoverUpload: () => (uploadFail = false),
    failCleanup: () => (cleanupFail = true),
    stale: () => (stale = true),
    get convertCalls() {
      return convertCalls;
    },
    get idCalls() {
      return idCalls;
    },
  };
}
test("Drive failure retains sole Storage copies and starts no expiry", async () => {
  const f = fixture();
  f.failUpload();
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.objects.size, 2);
  assert.equal(f.record.expires_at, undefined);
  assert(!f.events.includes("cleaned"));
});
test("conversion and Drive upload retries reuse objects and reserved Drive ID", async () => {
  const f = fixture();
  f.failUpload();
  await f.run();
  f.recoverUpload();
  assert.equal((await f.run()).status, "archived");
  assert.equal(f.convertCalls, 1);
  assert.equal(f.idCalls, 1);
  assert.equal(f.files.size, 1);
});
test("cleanup retries tolerate partial success and retain metadata", async () => {
  const f = fixture({ cleanup: true });
  f.failCleanup();
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.files.size, 0);
  assert.equal(f.objects.size, 2);
  assert.equal((await f.run()).status, "cleaned");
  assert.equal(f.objects.size, 0);
  assert.equal(f.record.id, "id");
  assert.equal((await f.run()).status, "idle");
});
test("stale cleanup cannot delete an object belonging to a newer recording", async () => {
  const f = fixture({ cleanup: true });
  f.objects.set("new/raw", Buffer.from("new"));
  f.stale();
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.objects.size, 3);
  assert.equal(f.files.size, 1);
});
test("conversion failure does not finalize or archive invalid MP3", async () => {
  const f = fixture();
  const result = await runRecordingJob({
    command: async (c) => (c === "claim" ? f.record : { ok: true }),
    storage: { read: async () => Buffer.from("bad") },
    drive: {},
    convert: async () => {
      throw Error("AUDIO_DECODE_FAILED");
    },
  });
  assert.equal(result.status, "retry");
  assert.equal(f.record.conversion_status, "pending");
  assert.equal(f.files.size, 0);
});
test("worker endpoint requires explicit server secret and timing-safe match", () => {
  const secret = "s".repeat(40);
  assert.equal(authorizeWorker("Bearer " + secret, secret), true);
  assert.equal(authorizeWorker("Bearer " + secret + "x", secret), false);
  assert.equal(authorizeWorker("Bearer anything", undefined), false);
  assert.equal(authorizeWorker("Bearer short", "short"), false);
});
test("retired synthetic smoke action cannot invoke provider or Auth fixture commands", async () => {
  let body;
  const res = {
    setHeader() {},
    end(value) {
      body = JSON.parse(value);
    },
  };
  await recordingHandler(
    {
      method: "POST",
      url: "/api/recordings?action=smoke",
      headers: { authorization: "Bearer synthetic" },
      body: { step: "users" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.deepEqual(body, { error: "INVALID_REQUEST" });
});
