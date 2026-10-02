import JSZip from "jszip";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { checkFinalization } from "../study/hskk-review-validation.mjs";
import { readDraftRevision, validateSourceReview } from "./hskk-authoring.mjs";
import fs from "node:fs/promises";
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
  const canonical = JSON.parse(
    await fs.readFile(new URL(`./hskk/${code}.json`, import.meta.url), "utf8"),
  );
  const exam = validateSourceReview(canonical, saved.configuration);
  if (!checkFinalization(exam).ready) throw Error("DELIVERY_NOT_READY");
  return deliveryCommand(client, "prepare", {
    exam_code: code,
    expected_revision: saved.revision,
  });
}
// Reuses the already generated archive. Never decodes, cuts or re-encodes audio.
export async function inspectClipArchive(bytes, clips) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 4 * 1024 * 1024 ||
    clips?.length !== 27
  )
    throw Error("INVALID_ARCHIVE");
  // Inspect declared sizes before decompressing. The persisted SHA-256 then
  // checks each decoded file against the approved bytes, including corruption.
  const zip = await JSZip.loadAsync(bytes);
  const names = clips.map(
    (q) => `H71002-Q${q.question_key.slice(1).padStart(2, "0")}.mp3`,
  );
  const files = Object.values(zip.files);
  if (
    files.length !== 28 ||
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
  const files = await inspectClipArchive(bytes, binding.clips);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw Error("AUTH_REQUIRED");
  let verified = 0;
  for (const item of files) {
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
  }
  return {
    verified,
    version_id: binding.version_id,
    original_source: "UNCHANGED",
    published: false,
  };
}
