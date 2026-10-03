import JSZip from "jszip";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { checkFinalization } from "../study/hskk-review-validation.mjs";
import { readDraftRevision, validateSourceReview } from "./hskk-authoring.mjs";
import { readCanonicalSource } from "./hskk-canonical-source.mjs";
import {
  importAssetCommand,
  verifiedImportBytes,
} from "./hskk-import-media.mjs";
export const promptBucket = "hskk-prompt-clips";
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export async function deliveryCommand(client, command, payload) {
  const { data, error } = await client.rpc("hskk_delivery_admin", {
    command,
    payload,
  });
  if (error)
    throw Error(
      error.code === "40001" ? "VERSION_CONFLICT" : "DELIVERY_NOT_READY",
    );
  return data;
}
export async function controlledTestCommand(
  client,
  command,
  payload,
  { makeup = false } = {},
) {
  const { data, error } = await client.rpc(
    makeup ? "hskk_makeup" : "hskk_controlled_test",
    {
      command,
      payload,
    },
  );
  if (error) {
    const allowed = new Set([
      "ADMIN_REQUIRED",
      "EXAM_ACCESS_REQUIRED",
      "EXAM_UNAVAILABLE",
      "INVALID_REQUEST",
      "VERSION_CONFLICT",
      "TEST_ATTEMPT_ALREADY_AUTHORIZED",
      "TEST_ATTEMPT_NOT_AVAILABLE",
      "MAKEUP_NOT_AVAILABLE",
      "MAKEUP_ALREADY_OPEN",
      "SESSION_NOT_FOUND",
    ]);
    throw Error(
      allowed.has(error.message) ? error.message : "DELIVERY_NOT_READY",
    );
  }
  return data;
}
// Read the authoritative publication gate; never prepare or publish on a GET.
export async function readDeliveryReadiness(client, code) {
  const unavailable = {
    ready: false,
    reasons: ["Đề chưa đủ điều kiện mở cho học viên."],
  };
  try {
    const binding = await deliveryCommand(client, "get", { exam_code: code });
    if (!binding?.prepared || !binding.version_id) return unavailable;
    const { data, error } = await client.rpc("hskk_publication", {
      command: "readiness",
      payload: { exam_code: code, version_id: binding.version_id },
    });
    if (error || !data) return unavailable;
    return {
      ready: data.ready === true || binding.published === true,
      published: binding.published === true,
      version_id: binding.version_id,
      reasons:
        data.ready === true || binding.published === true
          ? []
          : unavailable.reasons,
    };
  } catch {
    return unavailable;
  }
}
export function receiptClient(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("SERVER_NOT_READY");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function prepareDelivery(client, code) {
  const saved = (await readDraftRevision(client, code)).record;
  if (!saved) throw Error("DELIVERY_NOT_READY");
  const canonical = await readCanonicalSource(code, client);
  const exam = validateSourceReview(canonical, saved.configuration);
  if (!checkFinalization(exam).ready) throw Error("DELIVERY_NOT_READY");
  return deliveryCommand(client, "prepare", {
    exam_code: code,
    expected_revision: saved.revision,
  });
}
// Reuses the already generated archive. Never decodes, cuts or re-encodes audio.
export async function inspectClipArchive(bytes, clips, code = "H71002") {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 4 * 1024 * 1024 ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(code) ||
    ![6, 14, 27].includes(clips?.length) ||
    new Set(clips.map((q) => q.question_key)).size !== clips.length ||
    clips.some((q, i) => q.question_key !== `q${i + 1}`)
  )
    throw Error("INVALID_ARCHIVE");
  // Inspect declared sizes before decompressing. The persisted SHA-256 then
  // checks each decoded file against the approved bytes, including corruption.
  const zip = await JSZip.loadAsync(bytes);
  const names = clips.map(
    (q) => `${code}-Q${q.question_key.slice(1).padStart(2, "0")}.mp3`,
  );
  const files = Object.values(zip.files);
  if (
    files.length !== clips.length + 1 ||
    files.some(
      (f) =>
        f.dir ||
        f._data.uncompressedSize > 1048576 ||
        f.unsafeOriginalName !== f.name ||
        ![...names, "provenance.json"].includes(f.name),
    )
  )
    throw Error("INVALID_ARCHIVE");
  const result = [];
  for (const [index, name] of names.entries()) {
    const file = zip.file(name);
    if (!file || file._data.uncompressedSize > 1048576)
      throw Error("INVALID_ARCHIVE");
    const audio = await file.async("nodebuffer"),
      clip = clips[index];
    if (
      !audio.length ||
      audio.length > 1048576 ||
      sha256(audio) !== clip.sha256
    )
      throw Error("CLIP_HASH_MISMATCH");
    result.push({ clip, bytes: audio });
  }
  return result;
}
export async function storeExistingClips(
  client,
  bytes,
  { server = receiptClient(), code = "H71002" } = {},
) {
  const binding = await deliveryCommand(client, "get", { exam_code: code });
  const files = await inspectClipArchive(bytes, binding.clips, code);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw Error("AUTH_REQUIRED");
  let verified = 0;
  const store = async (item) => {
    const { clip, bytes: audio } = item;
    const { error } = await client.storage
      .from(promptBucket)
      .upload(clip.path, audio, {
        contentType: "audio/mpeg",
        upsert: false,
        cacheControl: "0",
      });
    if (
      error &&
      !["409", "Duplicate"].includes(String(error.statusCode || error.code))
    )
      throw Error("CLIP_UPLOAD_FAILED");
    const { data: stored, error: readError } = await client.storage
      .from(promptBucket)
      .download(clip.path);
    if (readError || !stored) throw Error("CLIP_READ_FAILED");
    const restored = Buffer.from(await stored.arrayBuffer());
    if (restored.length !== audio.length || sha256(restored) !== clip.sha256)
      throw Error("STORED_CLIP_HASH_MISMATCH");
    const { error: receiptError } = await server.rpc("hskk_prompt_verified", {
      payload: {
        sha256: clip.sha256,
        byte_size: restored.length,
        actor: auth.user.id,
      },
    });
    if (receiptError) throw Error("CLIP_RECEIPT_FAILED");
    verified++;
  };
  // Bounded parallelism keeps the existing 27-file operation within the hosted
  // request budget. Each independent immutable object is read and hashed first.
  for (let i = 0; i < files.length; i += 3)
    await Promise.all(files.slice(i, i + 3).map(store));
  return {
    verified,
    version_id: binding.version_id,
    original_source: "UNCHANGED",
    published: false,
  };
}
// One previously generated private clip per request avoids archive/body limits.
// Binding, stored bytes and the server-only verification receipt must all agree.
export async function storeStagedClip(
  client,
  code,
  questionKey,
  server = receiptClient(),
) {
  const binding = await deliveryCommand(client, "get", { exam_code: code });
  const clip = binding.clips?.find((q) => q.question_key === questionKey);
  if (!clip) throw Error("INVALID_REQUEST");
  const asset = await importAssetCommand(client, "get", {
    exam_code: code,
    sha256: clip.sha256,
    kind: "mp3",
  });
  const bytes = await verifiedImportBytes(client, asset);
  const { error } = await client.storage
    .from(promptBucket)
    .upload(clip.path, bytes, {
      contentType: "audio/mpeg",
      upsert: false,
      cacheControl: "0",
    });
  if (
    error &&
    !["409", "Duplicate"].includes(String(error.statusCode || error.code))
  )
    throw Error("CLIP_UPLOAD_FAILED");
  const { data: stored, error: readError } = await client.storage
    .from(promptBucket)
    .download(clip.path);
  if (readError || !stored) throw Error("CLIP_READ_FAILED");
  const restored = Buffer.from(await stored.arrayBuffer());
  if (restored.length !== bytes.length || sha256(restored) !== clip.sha256)
    throw Error("STORED_CLIP_HASH_MISMATCH");
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user) throw Error("AUTH_REQUIRED");
  const { error: receiptError } = await server.rpc("hskk_prompt_verified", {
    payload: {
      sha256: clip.sha256,
      byte_size: restored.length,
      actor: auth.user.id,
    },
  });
  if (receiptError) throw Error("CLIP_RECEIPT_FAILED");
  return {
    verified: true,
    question_key: questionKey,
    version_id: binding.version_id,
    published: false,
  };
}
