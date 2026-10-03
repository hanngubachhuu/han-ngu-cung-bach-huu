import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateExam } from "../study/hskk-exam-core.mjs";
import { sourceDefinition } from "./hskk-authoring.mjs";
import { isDeepStrictEqual } from "node:util";

export function sameImportedSource(a, b) {
  const stable = (value) => {
    const result = sourceDefinition(value);
    delete result.provenance.imported_at;
    delete result.provenance.imported_by;
    return result;
  };
  return !!a.provenance?.original && isDeepStrictEqual(stable(a), stable(b));
}

export async function canonicalCommand(client, command, payload = {}) {
  const { data, error } = await client.rpc("hskk_canonical_source", {
    command,
    payload,
  });
  if (error)
    throw Error(
      error.message === "SOURCE_DEFINITION_LOCKED"
        ? error.message
        : "SOURCE_REGISTRY_UNAVAILABLE",
    );
  return data;
}
export async function readCanonicalSource(code, client) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) throw Error("EXAM_NOT_FOUND");
  // Repository sources remain immutable fallbacks for already registered exams.
  try {
    return JSON.parse(
      await fs.readFile(
        new URL(`./hskk/${code}.json`, import.meta.url),
        "utf8",
      ),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const saved = await canonicalCommand(client, "get", { exam_code: code });
  if (!saved) throw Error("EXAM_NOT_FOUND");
  return saved.configuration;
}
export async function listCanonicalSources(client) {
  const local = (await fs.readdir(new URL("./hskk/", import.meta.url)))
    .filter((f) => /^[A-Za-z0-9_-]+\.json$/.test(f))
    .map((f) => f.slice(0, -5));
  const stored = await canonicalCommand(client, "catalog");
  return [...new Set([...local, ...stored.map((s) => s.exam_code)])];
}
export async function registerCanonicalSource(
  client,
  configuration,
  pictures = {},
) {
  validateExam(configuration);
  const code = configuration.exam_code;
  const source = sourceDefinition(configuration);
  const hash = source.audio.source_audio_id;
  if (
    !/^[a-f0-9]{64}$/.test(hash) ||
    source.provenance.sha256[source.provenance.audio] !== hash ||
    !Number.isSafeInteger(source.audio.byte_size) ||
    source.audio.byte_size <= 0 ||
    source.audio.byte_size > 32 * 1024 * 1024 ||
    !Number.isFinite(source.audio.duration_seconds) ||
    source.audio.duration_seconds <= 0 ||
    source.audio.duration_seconds > 3600
  )
    throw Error("INVALID_SOURCE");
  const validated = {};
  for (const q of source.questions.filter((q) => q.prompt_mode === "image")) {
    const bytes = Buffer.from(pictures[q.id] || "", "base64");
    if (
      !bytes.length ||
      bytes.length > 250000 ||
      bytes.length !== q.prompt_image?.byte_size ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      createHash("sha256").update(bytes).digest("hex") !== q.prompt_image.sha256
    )
      throw Error("INVALID_PICTURE");
    validated[q.id] = bytes.toString("base64");
  }
  if (Object.keys(pictures).some((key) => !(key in validated)))
    throw Error("INVALID_PICTURE");
  const existing = await canonicalCommand(client, "get", { exam_code: code });
  if (existing) {
    if (
      !sameImportedSource(existing.configuration, source) ||
      !isDeepStrictEqual(existing.pictures, validated)
    )
      throw Error("SOURCE_DEFINITION_LOCKED");
    return { registered: true, resumed: true, exam_code: code };
  }
  return canonicalCommand(client, "register", {
    exam_code: code,
    configuration: source,
    pictures: validated,
  });
}
export async function readCanonicalPicture(code, q, client) {
  let bytes;
  try {
    bytes = await fs.readFile(
      new URL(`./hskk/assets/${code}-${q.id}.jpg`, import.meta.url),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const saved = await canonicalCommand(client, "get", { exam_code: code });
    bytes = Buffer.from(saved?.pictures?.[q.id] || "", "base64");
  }
  if (
    bytes.length !== q.prompt_image.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== q.prompt_image.sha256
  )
    throw Error("SOURCE_HASH_MISMATCH");
  return bytes;
}
