// One explicitly authorized disposable run. No arbitrary paths, users or SQL.
// Remove the HTTP entry point after the hosted smoke and fixture cleanup.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  syntheticWave,
  audioHash,
  normalizeRecording,
} from "./recording-audio.mjs";
import { createDriveArchive, driveConfigured } from "./recording-drive.mjs";
import { recordingStorage, runRecordingJob } from "./recording-worker.mjs";

export const smokeFixture = Object.freeze({
  run: "e8bab12a-886f-4255-ab39-c1f4f25d43b3",
  course: "cp2-smoke-e8bab12a-886f-4255-ab39-c1f4f25d43b3",
  lesson: "cp2-smoke-e8bab12a-886f-4255-ab39-c1f4f25d43b3",
  question: "7d82f86f-a085-4d20-b46d-950932bfe3cb",
  expires: "2026-10-01T08:00:00Z",
  a: Object.freeze({
    user: "9d4f543b-6a64-4b93-b9c0-5bc1c3a7ab60",
    attempt: "57f6dcef-94b4-411e-a35d-7af71826edde",
    recording: "78a1e89d-a89d-45c7-92a0-23b3bce9c02f",
  }),
  b: Object.freeze({
    user: "9947a37b-5daa-424b-8152-08a256a1b0bb",
    attempt: "97964523-3068-4170-997a-e9915565cfdf",
    recording: "089d58bb-cffc-4e04-9eee-2dadc48b7369",
  }),
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const steps = new Set([
  "preflight",
  "users",
  "upload",
  "process",
  "isolation",
  "cleanup",
  "delete_users",
]);
const email = (label) =>
  `speaking-smoke-${label}-${smokeFixture.run}@example.invalid`;
export function validateSmokeRequest(body, now = Date.now()) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    JSON.stringify(body).length > 2048 ||
    Object.keys(body).some(
      (k) => !["step", "label", "lease_id", "drive_file_id"].includes(k),
    ) ||
    !steps.has(body.step)
  )
    throw Error("INVALID_REQUEST");
  if (body.step !== "delete_users" && now >= Date.parse(smokeFixture.expires))
    throw Error("SMOKE_WINDOW_CLOSED");
  if (
    body.step === "process" &&
    (!["a", "b"].includes(body.label) ||
      !uuid.test(body.lease_id || "") ||
      (body.drive_file_id &&
        !/^[A-Za-z0-9_-]{1,200}$/.test(body.drive_file_id)))
  )
    throw Error("INVALID_REQUEST");
}
export function assertSyntheticUser(user, label) {
  if (
    user?.id !== smokeFixture[label].user ||
    user.email !== email(label) ||
    user.app_metadata?.speaking_smoke_run !== smokeFixture.run
  )
    throw Error("SMOKE_IDENTITY_CONFLICT");
}
function makeClient(env, privileged = false) {
  return createClient(
    env.SUPABASE_URL,
    privileged ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(20000) }),
      },
    },
  );
}
async function requireFixture(service) {
  const { data, error } = await service
    .from("courses")
    .select("id,title,program")
    .eq("id", smokeFixture.course)
    .single();
  if (
    error ||
    data?.title !== "Synthetic Speaking smoke " + smokeFixture.run ||
    data.program !== "HSKK"
  )
    throw Error("SMOKE_FIXTURE_REQUIRED");
}
async function userAt(service, label, missing = false) {
  const { data, error } = await service.auth.admin.getUserById(
    smokeFixture[label].user,
  );
  if (error) {
    if (missing && error.status === 404) return null;
    throw Error("SMOKE_AUTH_LOOKUP_FAILED");
  }
  assertSyntheticUser(data.user, label);
  return data.user;
}
async function requireAttempt(service, label, submitted = false) {
  const f = smokeFixture[label];
  const { data, error } = await service
    .from("learning_attempts")
    .select("id,user_id,lesson_id,source")
    .eq("id", f.attempt)
    .single();
  if (
    error ||
    data.user_id !== f.user ||
    data.lesson_id !== smokeFixture.lesson ||
    data.source !== "official"
  )
    throw Error("SMOKE_ATTEMPT_CONFLICT");
  const answer = await service
    .from("submission_answers")
    .select("answer,question_version_id")
    .eq("attempt_id", f.attempt)
    .eq("question_version_id", smokeFixture.question)
    .single();
  if (answer.error || answer.data.answer?.recording_id !== f.recording)
    throw Error("SMOKE_ATTEMPT_CONFLICT");
  if (submitted) {
    const d = await service
      .from("submission_details")
      .select("state")
      .eq("attempt_id", f.attempt)
      .single();
    if (d.error || d.data.state !== "submitted")
      throw Error("SMOKE_SUBMISSION_REQUIRED");
  }
}
export async function runSpeakingSmoke(admin, body, env = process.env) {
  validateSmokeRequest(body);
  if (
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    env.SPEAKING_WORKER_SECRET?.length < 32 ||
    !env.SPEAKING_WORKER_SECRET ||
    !driveConfigured(env)
  )
    throw Error("RECORDING_NOT_CONFIGURED");
  const service = makeClient(env, true),
    storage = recordingStorage(service);
  if (body.step === "preflight") {
    const me = await admin.auth.getUser();
    if (me.error || !me.data.user) throw Error("AUTH_REQUIRED");
    const privileged = await service.auth.admin.getUserById(me.data.user.id);
    if (privileged.error || privileged.data.user?.id !== me.data.user.id)
      throw Error("RECORDING_NOT_CONFIGURED");
    await createDriveArchive(env);
    return {
      stage: "preflight",
      status: "passed",
      drive_private_owner_verified: true,
      service_role_verified: true,
      worker_secret_configured: true,
    };
  }
  if (body.step !== "delete_users") await requireFixture(service);
  if (body.step === "users") {
    for (const label of ["a", "b"]) {
      if (await userAt(service, label, true)) continue;
      const { data, error } = await service.auth.admin.createUser({
        id: smokeFixture[label].user,
        email: email(label),
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
        app_metadata: { speaking_smoke_run: smokeFixture.run },
        user_metadata: {
          full_name: "Synthetic Speaking " + label.toUpperCase(),
        },
      });
      if (error) throw Error("SMOKE_AUTH_CREATE_FAILED");
      assertSyntheticUser(data.user, label);
    }
    return { stage: "users", status: "passed", synthetic_accounts: 2 };
  }
  if (body.step === "delete_users") {
    for (const label of ["a", "b"]) {
      const user = await userAt(service, label, true);
      if (!user) continue;
      const remaining = await service
        .from("learning_attempts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (remaining.error || remaining.data.length)
        throw Error("SMOKE_HISTORY_NOT_REMOVED");
      const files = await service.storage
        .from("speaking-private")
        .list(smokeFixture[label].recording);
      if (files.error || files.data.length)
        throw Error("SMOKE_MEDIA_NOT_REMOVED");
      const { error } = await service.auth.admin.deleteUser(user.id);
      if (error) throw Error("SMOKE_AUTH_DELETE_FAILED");
    }
    return {
      stage: "delete_users",
      status: "passed",
      synthetic_accounts_remaining: 0,
    };
  }
  for (const label of ["a", "b"]) await userAt(service, label);
  if (body.step === "upload") {
    const bytes = syntheticWave(2),
      sha256 = audioHash(bytes);
    for (const label of ["a", "b"]) {
      await requireAttempt(service, label);
      const path = smokeFixture[label].recording + "/raw";
      const { error } = await service.storage
        .from("speaking-private")
        .upload(path, bytes, {
          contentType: "audio/wav",
          upsert: false,
          cacheControl: "0",
        });
      if (
        error &&
        !["409", "Duplicate"].includes(String(error.statusCode || error.code))
      )
        throw Error("STORAGE_WRITE_FAILED");
      if (audioHash(await storage.read(path)) !== sha256)
        throw Error("STORAGE_IDENTITY_CONFLICT");
    }
    return {
      stage: "upload",
      status: "passed",
      objects: 2,
      bytes: bytes.length,
      sha256,
      bootstrap: "privileged synthetic fixture; student gate remains off",
    };
  }
  const command = async (name, payload = {}) => {
    const { data, error } = await service.rpc("recording_worker", {
      command: name,
      payload,
    });
    if (error)
      throw Error(
        error.message === "STALE_RECORDING_LEASE"
          ? error.message
          : "SMOKE_WORKER_COMMAND_FAILED",
      );
    return data;
  };
  if (body.step === "process") {
    const f = smokeFixture[body.label];
    await requireAttempt(service, body.label, true);
    const meta = await admin.rpc("recording_command", {
      command: "get",
      payload: { recording_id: f.recording },
    });
    if (
      meta.error ||
      meta.data.attempt_id !== f.attempt ||
      meta.data.question_version_id !== smokeFixture.question ||
      !meta.data.raw_uploaded_at
    )
      throw Error("SMOKE_RECORDING_CONFLICT");
    if (meta.data.drive_status === "completed")
      return { stage: "process", status: "archived", already_completed: true };
    const raw = syntheticWave(2),
      job = {
        id: f.recording,
        attempt_id: f.attempt,
        question_version_id: smokeFixture.question,
        lease_id: body.lease_id,
        raw_size: raw.length,
        raw_sha256: audioHash(raw),
        raw_path: f.recording + "/raw",
        mp3_path: f.recording + "/audio.mp3",
        conversion_status: meta.data.conversion_status,
        drive_file_id: body.drive_file_id || null,
        job: "process",
      };
    if (job.conversion_status === "completed") {
      const bytes = await storage.read(job.mp3_path);
      job.mp3_sha256 = audioHash(bytes);
      job.mp3_size = bytes.length;
      job.duration_seconds = meta.data.duration_seconds;
    }
    // Validate a supplied retry identity against the immutable DB identity before Drive effects.
    if (job.drive_file_id)
      await command("drive_id", {
        recording_id: job.id,
        lease_id: job.lease_id,
        file_id: job.drive_file_id,
      });
    const drive = await createDriveArchive(env),
      proof = {
        conversion_retry: false,
        storage_retry: false,
        drive_retry: false,
      };
    let claimed = false;
    const result = await runRecordingJob({
      command: async (name, payload) =>
        name === "claim"
          ? claimed
            ? null
            : ((claimed = true), job)
          : command(name, payload),
      storage: {
        ...storage,
        writeOnce: async (...args) => {
          await storage.writeOnce(...args);
          await storage.writeOnce(...args);
          proof.storage_retry = true;
        },
      },
      convert: async (...args) => {
        const first = await normalizeRecording(...args),
          second = await normalizeRecording(...args);
        if (first.sha256 !== second.sha256) throw Error("AUDIO_RETRY_CONFLICT");
        proof.conversion_retry = true;
        return first;
      },
      drive: {
        ...drive,
        upload: async (...args) => {
          const first = await drive.upload(...args),
            second = await drive.upload(...args);
          if (first.fileId !== second.fileId)
            throw Error("DRIVE_RETRY_CONFLICT");
          proof.drive_retry = true;
          return first;
        },
      },
    });
    return { stage: "process", ...result, proof };
  }
  if (body.step === "cleanup") {
    for (const label of ["a", "b"]) {
      await requireAttempt(service, label, true);
      const r = await admin.rpc("recording_command", {
        command: "get",
        payload: { recording_id: smokeFixture[label].recording },
      });
      if (
        r.error ||
        r.data.drive_status !== "completed" ||
        !r.data.expires_at ||
        Date.parse(r.data.expires_at) > Date.now()
      )
        throw Error("SMOKE_CLEANUP_NOT_DUE");
    }
    const drive = await createDriveArchive(env);
    return {
      stage: "cleanup",
      ...(await runRecordingJob({
        command: async (name, payload) => {
          const value = await command(name, payload);
          if (
            name === "claim" &&
            value &&
            (![smokeFixture.a.recording, smokeFixture.b.recording].includes(
              value.id,
            ) ||
              value.job !== "cleanup")
          )
            throw Error("SMOKE_UNEXPECTED_JOB");
          return value;
        },
        storage,
        drive,
      })),
    };
  }
  if (body.step === "isolation") return isolation(service, admin, env, storage);
  throw Error("INVALID_REQUEST");
}
async function isolation(service, admin, env, storage) {
  const sessions = [];
  let outcome,
    revokeFailed = false;
  const check = (ok, code) => {
    if (!ok) throw Error(code);
  };
  const denial = async (client, rpc, command, payload) => {
    const r = await client.rpc(rpc, { command, payload });
    check(!!r.error, "SMOKE_RPC_BOUNDARY_FAILED");
  };
  try {
    for (const label of ["a", "b"]) {
      const link = await service.auth.admin.generateLink({
        type: "magiclink",
        email: email(label),
      });
      if (link.error || !link.data.properties?.hashed_token)
        throw Error("SMOKE_LOGIN_FAILED");
      const client = makeClient(env),
        signed = await client.auth.verifyOtp({
          type: "magiclink",
          token_hash: link.data.properties.hashed_token,
        });
      if (signed.error || !signed.data.session?.access_token)
        throw Error("SMOKE_LOGIN_FAILED");
      sessions.push(client);
      assertSyntheticUser(signed.data.user, label);
      const confirmed = await client.auth.getUser();
      check(
        !confirmed.error && confirmed.data.user.id === smokeFixture[label].user,
        "SMOKE_LOGIN_FAILED",
      );
    }
    const [a, b] = sessions,
      anonymous = makeClient(env),
      proof = {};
    for (const [own, other, label] of [
      [a, b, "a"],
      [b, a, "b"],
    ]) {
      const f = smokeFixture[label];
      const meta = await own.rpc("recording_command", {
        command: "get",
        payload: { recording_id: f.recording },
      });
      check(
        !meta.error && meta.data.attempt_id === f.attempt,
        "SMOKE_OWNER_READ_FAILED",
      );
      for (const suffix of ["raw", "audio.mp3"]) {
        const path = f.recording + "/" + suffix,
          bytes = await own.storage.from("speaking-private").download(path);
        check(!bytes.error, "SMOKE_OWNER_AUDIO_FAILED");
        check(
          audioHash(Buffer.from(await bytes.data.arrayBuffer())) ===
            audioHash(await storage.read(path)),
          "SMOKE_OWNER_AUDIO_FAILED",
        );
        const cross = await other.storage
            .from("speaking-private")
            .download(path),
          anon = await anonymous.storage
            .from("speaking-private")
            .download(path);
        check(!!cross.error && !!anon.error, "SMOKE_AUDIO_ISOLATION_FAILED");
      }
      await denial(other, "recording_command", "get", {
        recording_id: f.recording,
      });
      await denial(anonymous, "recording_command", "get", {
        recording_id: f.recording,
      });
      await denial(other, "assignment_command", "get", {
        attempt_id: f.attempt,
      });
      const attempt = await own.rpc("assignment_command", {
        command: "get",
        payload: { attempt_id: f.attempt },
      });
      check(
        !attempt.error &&
          attempt.data.result === null &&
          !attempt.data.grading &&
          attempt.data.answers.every((x) => !x.private_question && !x.rubric),
        "SMOKE_DRAFT_RESULT_LEAK",
      );
      const keys = await own
        .from("assignment_question_versions")
        .select("answer_key")
        .eq("id", smokeFixture.question);
      const grades = await own
        .from("submission_grades")
        .select("*")
        .eq("attempt_id", f.attempt);
      check(
        (!!keys.error || keys.data.length === 0) &&
          (!!grades.error || grades.data.length === 0),
        "SMOKE_PRIVATE_DATA_LEAK",
      );
      for (const name of ["grade", "grade_publish", "question_create"])
        await denial(own, "assignment_command", name, {
          attempt_id: f.attempt,
        });
      await denial(own, "recording_worker", "claim", {});
      await denial(own, "recording_command", "reserve", {
        attempt_id: f.attempt,
        question_version_id: smokeFixture.question,
        request_id: f.recording,
        sha256: audioHash(syntheticWave(2)),
        size: syntheticWave(2).length,
        mime: "audio/wav",
      });
      const list = await own.storage.from("speaking-private").list(f.recording);
      check(!!list.error || list.data.length === 0, "SMOKE_STORAGE_LIST_LEAK");
      const signed = await own.storage
        .from("speaking-private")
        .createSignedUrl(f.recording + "/raw", 60);
      check(!!signed.error, "SMOKE_SIGNED_URL_LEAK");
      const overwrite = await own.storage
        .from("speaking-private")
        .update(f.recording + "/raw", syntheticWave(2), {
          contentType: "audio/wav",
        });
      check(!!overwrite.error, "SMOKE_AUDIO_MUTATION_ALLOWED");
      proof[label + "_owner_and_cross_isolation"] = true;
    }
    const playback = await admin.storage
      .from("speaking-private")
      .download(smokeFixture.a.recording + "/audio.mp3");
    check(!playback.error, "SMOKE_ADMIN_PLAYBACK_FAILED");
    const raw = await admin.storage
      .from("speaking-private")
      .download(smokeFixture.a.recording + "/raw");
    check(!!raw.error, "SMOKE_ADMIN_RAW_LEAK");
    outcome = {
      stage: "isolation",
      status: "passed",
      ...proof,
      anonymous_denied: true,
      keys_and_draft_grade_private: true,
      student_mutations_denied: true,
      gate_still_denies_reservation: true,
      list_and_sign_denied: true,
      admin_mp3_download: true,
      admin_raw_denied: true,
    };
  } finally {
    for (const client of sessions) {
      const { error } = await client.auth.signOut({ scope: "global" });
      if (error) revokeFailed = true;
    }
  }
  if (revokeFailed) throw Error("SMOKE_SESSION_REVOKE_FAILED");
  return outcome;
}
