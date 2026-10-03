import { getClient, getSession } from "./auth.mjs";
export async function recordingCommand(command, payload, ownerId) {
  const session = await getSession();
  if (!session || (ownerId && session.user.id !== ownerId))
    throw Error("ACCOUNT_CHANGED");
  const client = await getClient();
  const { data, error } = await client.rpc("recording_command", {
    command,
    payload,
  });
  if (error) throw error;
  if ((await getSession())?.user.id !== session.user.id)
    throw Error("ACCOUNT_CHANGED");
  return data;
}
export async function uploadRecording({
  blob,
  requestId,
  attemptId,
  questionId,
  ownerId,
  makeupWindowId,
  originalRequestId,
  assignmentMakeupWindowId,
}) {
  if (!blob.size || blob.size > 8 * 1024 * 1024)
    throw Error("AUDIO_INVALID_SIZE");
  const bytes = await blob.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const reserved = await recordingCommand(
    "reserve",
    {
      attempt_id: attemptId,
      question_version_id: questionId,
      request_id: requestId,
      sha256: hash,
      size: blob.size,
      mime: blob.type.split(";")[0],
      ...(assignmentMakeupWindowId
        ? { assignment_makeup_window_id: assignmentMakeupWindowId }
        : {}),
      ...(makeupWindowId
        ? {
            makeup_window_id: makeupWindowId,
            original_request_id: originalRequestId,
          }
        : {}),
    },
    ownerId,
  );
  if (!reserved.raw_uploaded_at) {
    if ((await getSession())?.user.id !== ownerId)
      throw Error("ACCOUNT_CHANGED");
    const client = await getClient();
    const { error } = await client.storage
      .from(reserved.bucket)
      .upload(reserved.path, blob, {
        upsert: false,
        contentType: blob.type.split(";")[0],
        cacheControl: "0",
      });
    if (
      error &&
      !["409", "Duplicate"].includes(String(error.statusCode || error.code))
    )
      throw Error("STORAGE_WRITE_FAILED");
  }
  await recordingCommand("confirm", { recording_id: reserved.id }, ownerId);
  return { recording_id: reserved.id };
}
export async function downloadRecording(recordingId, ownerId) {
  const meta = await recordingCommand(
    "get",
    { recording_id: recordingId },
    ownerId,
  );
  if (!meta.playback_path)
    throw Error(
      meta.cleanup_status === "completed" ||
        (meta.expires_at && Date.parse(meta.expires_at) <= Date.now())
        ? "AUDIO_EXPIRED"
        : "AUDIO_PROCESSING",
    );
  const client = await getClient(),
    { data, error } = await client.storage
      .from("speaking-private")
      .download(meta.playback_path);
  if (error) throw Error("AUDIO_PLAYBACK_FAILED");
  if (ownerId && (await getSession())?.user.id !== ownerId)
    throw Error("ACCOUNT_CHANGED");
  return { blob: data, meta };
}
