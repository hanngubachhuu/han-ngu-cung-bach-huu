// Temporary Admin-only fixture tooling; remove after hosted browser verification and cleanup.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { browserFixture as f } from "./speaking-browser-fixture.mjs";
import { createDriveArchive } from "./recording-drive.mjs";
import {
  recordingServerFetch,
  recordingStorage,
  runRecordingJob,
} from "./recording-worker.mjs";
export const fixtureEmail = (label) =>
  `speaking-browser-${label}-${f.run}@example.invalid`;
export function validateBrowserCheckpoint(body, now = Date.now()) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !["step", "label"].includes(k)) ||
    !["users", "login", "work", "delete_users"].includes(body.step) ||
    (body.step === "login" && !["a", "b"].includes(body.label))
  )
    throw Error("INVALID_REQUEST");
  if (body.step !== "delete_users" && now >= Date.parse(f.expires))
    throw Error("CANARY_WINDOW_CLOSED");
}
export function checkFixtureUser(user, label) {
  if (
    user?.id !== f[label].user ||
    user.email !== fixtureEmail(label) ||
    user.app_metadata?.speaking_browser_run !== f.run
  )
    throw Error("CANARY_IDENTITY_CONFLICT");
}
export async function runBrowserCheckpoint(admin, body, env = process.env) {
  validateBrowserCheckpoint(body);
  if (
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    new URL(env.SUPABASE_URL).hostname !== "dmeqxdznzobbarvkmxyg.supabase.co"
  )
    throw Error("CANARY_NOT_CONFIGURED");
  const service = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: recordingServerFetch(env.SUPABASE_URL, fetch, 20000) },
    },
  );
  const lookup = async (label, allowMissing = false) => {
    const r = await service.auth.admin.getUserById(f[label].user);
    if (r.error) {
      if (allowMissing && r.error.status === 404) return null;
      throw Error("CANARY_AUTH_LOOKUP_FAILED");
    }
    checkFixtureUser(r.data.user, label);
    return r.data.user;
  };
  if (body.step !== "delete_users") {
    const r = await service
      .from("courses")
      .select("id,title,program")
      .eq("id", f.course)
      .single();
    if (r.error || r.data.title !== f.title || r.data.program !== "HSKK")
      throw Error("CANARY_FIXTURE_REQUIRED");
  }
  if (body.step === "users") {
    for (const label of ["a", "b"]) {
      if (await lookup(label, true)) continue;
      const r = await service.auth.admin.createUser({
        id: f[label].user,
        email: fixtureEmail(label),
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
        app_metadata: { speaking_browser_run: f.run },
        user_metadata: {
          full_name: "Synthetic browser " + label.toUpperCase(),
        },
      });
      if (r.error) throw Error("CANARY_AUTH_CREATE_FAILED");
      checkFixtureUser(r.data.user, label);
    }
    return { status: "passed", synthetic_users: 2 };
  }
  if (body.step === "login") {
    await lookup(body.label);
    const link = await service.auth.admin.generateLink({
      type: "magiclink",
      email: fixtureEmail(body.label),
    });
    if (link.error || !link.data.properties?.hashed_token)
      throw Error("CANARY_LOGIN_FAILED");
    checkFixtureUser(link.data.user, body.label);
    const host = env.VERCEL_URL;
    if (
      !/^hanngubachhuu-[a-z0-9]+-hanngubachhuu\.vercel\.app$/.test(host || "")
    )
      throw Error("CANARY_ORIGIN_INVALID");
    // Short-lived one-time Auth challenge goes only to the actual synthetic browser login.
    // Never return service secrets, passwords, access/refresh tokens or Drive metadata.
    const snapshot = await admin.rpc("assignment_command", {
      command: "get",
      payload: { attempt_id: f.a.attempt },
    });
    const recording = snapshot.error
      ? null
      : snapshot.data.answers.find((x) => x.question?.id === f.question)?.answer
          ?.recording_id;
    return {
      studentOrigin: "https://" + host,
      token_hash: link.data.properties.hashed_token,
      label: body.label,
      owner: f[body.label].user,
      attempt: f[body.label].attempt,
      outsideAttempt: f.a.outsideAttempt,
      question: f.question,
      otherQuestion: f.otherQuestion,
      otherAttempt: body.label === "a" ? f.b.attempt : f.a.attempt,
      recording: recording || null,
      outsideRecording: f.b.recording,
    };
  }
  if (body.step === "work") {
    await lookup("a");
    const a = await service
      .from("learning_attempts")
      .select("id,user_id,lesson_id,submitted_at")
      .eq("id", f.a.attempt)
      .single();
    if (
      a.error ||
      a.data.user_id !== f.a.user ||
      a.data.lesson_id !== f.lesson ||
      !a.data.submitted_at
    )
      throw Error("CANARY_SUBMISSION_REQUIRED");
    const data = await admin.rpc("assignment_command", {
      command: "get",
      payload: { attempt_id: f.a.attempt },
    });
    const id = data.data?.answers.find((x) => x.question?.id === f.question)
      ?.answer?.recording_id;
    if (data.error || !/^[0-9a-f-]{36}$/.test(id || ""))
      throw Error("CANARY_REFERENCE_REQUIRED");
    const command = async (name, payload) => {
      const r = await service.rpc("recording_worker", {
        command: name,
        payload: name === "claim" ? { recording_id: id } : payload,
      });
      if (r.error) throw Error("CANARY_WORKER_FAILED");
      if (
        name === "claim" &&
        r.data &&
        (r.data.id !== id ||
          r.data.owner_id !== f.a.user ||
          r.data.attempt_id !== f.a.attempt ||
          r.data.question_version_id !== f.question)
      )
        throw Error("CANARY_SCOPE_CONFLICT");
      return r.data;
    };
    const result = await runRecordingJob({
      command,
      storage: recordingStorage(service),
      drive: await createDriveArchive(env),
    });
    return { status: result.status };
  }
  for (const label of ["a", "b"]) {
    const user = await lookup(label, true);
    if (!user) continue;
    const attempts = await service
      .from("learning_attempts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    if (attempts.error || attempts.data.length)
      throw Error("CANARY_FIXTURE_REMAINS");
    if (label === "b") {
      const objects = await service.storage
        .from("speaking-private")
        .list(f.b.recording);
      if (objects.error || objects.data.length)
        throw Error("CANARY_MEDIA_REMAINS");
    }
    const removed = await service.auth.admin.deleteUser(user.id);
    if (removed.error) throw Error("CANARY_AUTH_DELETE_FAILED");
  }
  return { status: "passed", synthetic_users_remaining: 0 };
}
