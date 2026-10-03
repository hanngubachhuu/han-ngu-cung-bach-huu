import { createClient } from "@supabase/supabase-js";
import { receiptClient, sha256 } from "./hskk-delivery.mjs";
import fs from "node:fs/promises";
export async function readCurrentPicture(
  userId,
  payload,
  server = receiptClient(),
  { makeup = false } = {},
) {
  const { data, error } = await server.rpc(
    makeup ? "hskk_makeup_picture" : "hskk_current_picture",
    {
      payload: {
        owner_id: userId,
        attempt_id: payload.attempt_id,
        question_version_id: payload.question_version_id,
        ...(makeup ? { makeup_window_id: payload.makeup_window_id } : {}),
      },
    },
  );
  if (
    error ||
    !data ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(data.exam_code) ||
    !/^q\d+$/.test(data.question_id)
  )
    throw Error("PROMPT_DENIED");
  const bytes = data.bytes
    ? Buffer.from(data.bytes, "base64")
    : await fs.readFile(
        new URL(
          `./hskk/assets/${data.exam_code}-${data.question_id}.jpg`,
          import.meta.url,
        ),
      );
  if (
    bytes.length !== data.picture?.byte_size ||
    sha256(bytes) !== data.picture.sha256
  )
    throw Error("PROMPT_UNAVAILABLE");
  return bytes;
}
export async function studentContext(token, env = process.env) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Error("AUTH_REQUIRED");
  const p = await client
    .from("profiles")
    .select("role,status")
    .eq("user_id", data.user.id)
    .single();
  if (p.error || p.data.role !== "STUDENT" || p.data.status !== "APPROVED")
    throw Error("STUDENT_REQUIRED");
  return { client, userId: data.user.id };
}
export async function sessionCommand(client, command, payload) {
  const { data, error } = await client.rpc(
    command.startsWith("makeup_")
      ? "hskk_makeup"
      : command === "resume"
        ? "hskk_resume"
        : "hskk_session_command",
    command === "resume"
      ? { attempt_id: payload.attempt_id }
      : { command: command.replace(/^makeup_/, ""), payload },
  );
  if (error) {
    const allowed = [
      "EXAM_ACCESS_REQUIRED",
      "SESSION_NOT_FOUND",
      "INVALID_TRANSITION",
      "RUNTIME_UPDATE_REQUIRED",
      "PREFLIGHT_EXPIRED",
      "EXAM_UNAVAILABLE",
      "EXAM_NOT_COMPLETED",
      "RECORDING_REQUIRED",
      "UPLOAD_WINDOW_EXPIRED",
      "RECORDING_LOCKED",
      "INVALID_RECORDING_REFERENCE",
      "SUBMISSION_LOCKED",
      "MAKEUP_NOT_AVAILABLE",
      "MAKEUP_TRANSPORT_REQUIRED",
      "RECORDING_WINDOW_REQUIRED",
      "VERSION_CONFLICT",
    ];
    throw Error(
      allowed.includes(error.message) ? error.message : "SESSION_UNAVAILABLE",
    );
  }
  return data;
}
export async function readCurrentPrompt(
  userId,
  payload,
  server = receiptClient(),
  { makeup = false } = {},
) {
  const { data, error } = await server.rpc(
    makeup ? "hskk_makeup_prompt" : "hskk_current_prompt",
    {
      payload: {
        owner_id: userId,
        attempt_id: payload.attempt_id,
        question_version_id: payload.question_version_id,
        ...(makeup ? { makeup_window_id: payload.makeup_window_id } : {}),
      },
    },
  );
  if (error || !data) throw Error("PROMPT_DENIED");
  const { data: audio, error: readError } = await server.storage
    .from(data.bucket)
    .download(data.path);
  if (readError || !audio) throw Error("PROMPT_UNAVAILABLE");
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (sha256(bytes) !== data.sha256) throw Error("PROMPT_UNAVAILABLE");
  return bytes;
}
