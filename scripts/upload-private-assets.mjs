// Operator-only release step. Secrets come from environment and are never logged.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
if (!process.argv.includes("--apply"))
  throw Error("Requires explicit --apply after production approval.");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
  throw Error("Operator credentials are not configured.");
const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { assets } = JSON.parse(
  await fs.readFile(".cache/private-publication.json", "utf8"),
);
const { data: bucket, error } =
  await client.storage.getBucket("lesson-private");
if (error || bucket?.public !== false)
  throw Error("Expected an existing private lesson-private bucket.");
for (const asset of assets) {
  const file = path.resolve(asset.source);
  if (
    !file.startsWith(path.resolve("audio") + path.sep) ||
    asset.bucket !== "lesson-private"
  )
    throw Error("Invalid asset scope");
  const bytes = await fs.readFile(file),
    hash = (b) => createHash("sha256").update(b).digest("hex");
  if (hash(bytes) !== asset.sha256) throw Error("Asset changed since build");
  const storage = client.storage.from(asset.bucket),
    existing = await storage.download(asset.object_path);
  if (existing.data) {
    if (hash(Buffer.from(await existing.data.arrayBuffer())) !== asset.sha256)
      throw Error("Remote asset differs; manual review required");
    continue;
  }
  if (!["404", "400"].includes(String(existing.error?.statusCode)))
    throw Error("Could not verify remote asset");
  const result = await storage.upload(asset.object_path, bytes, {
    contentType: "audio/mpeg",
    upsert: false,
  });
  if (result.error) throw Error("Private upload failed; originals retained");
  const check = await storage.download(asset.object_path);
  if (
    check.error ||
    hash(Buffer.from(await check.data.arrayBuffer())) !== asset.sha256
  )
    throw Error("Uploaded hash mismatch");
}
console.log(
  `Verified ${assets.length} private audio files. No public permissions were added.`,
);
