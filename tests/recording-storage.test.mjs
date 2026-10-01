import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { audioHash } from "../server/recording-audio.mjs";
import {
  recordingStorage,
  recordingServerFetch,
} from "../server/recording-worker.mjs";
const origin = "https://synthetic.supabase.invalid";
const path = "78a1e89d-a89d-45c7-92a0-23b3bce9c02f/audio.mp3";
function storageFixture({
  stuck = false,
  wrong = false,
  missingStatus = 404,
} = {}) {
  const bytes = Buffer.from("synthetic cached MP3");
  let exists = true,
    deletes = 0;
  const gets = [];
  const fetcher = async (input, options) => {
    const url = new URL(input);
    if (options.method === "DELETE") {
      exists = false;
      deletes++;
      return new Response(JSON.stringify([{ name: path }]), { status: 200 });
    }
    const nonce = url.searchParams.get("cacheNonce");
    gets.push({ nonce, cache: options.cache });
    // CDN keeps returning the old bytes for the unversioned URL after DELETE.
    if (!exists && nonce && !stuck)
      return new Response(
        JSON.stringify({
          statusCode: "404",
          error: "not_found",
          message: "Object not found",
        }),
        { status: missingStatus },
      );
    return new Response(wrong ? Buffer.from("other object") : bytes, {
      status: 200,
    });
  };
  const client = createClient(origin, "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: recordingServerFetch(origin, fetcher) },
  });
  return {
    storage: recordingStorage(client),
    hash: audioHash(bytes),
    gets,
    get deletes() {
      return deletes;
    },
  };
}
test("Storage cleanup bypasses stale CDN bytes and repeats without deleting twice", async () => {
  const f = storageFixture();
  await f.storage.remove(path, f.hash);
  await f.storage.remove(path, f.hash);
  assert.equal(f.deletes, 1);
  assert.equal(f.gets.length, 3);
  assert(f.gets.every((x) => x.nonce && x.cache === "no-store"));
  assert.equal(new Set(f.gets.map((x) => x.nonce)).size, 3);
});
test("Storage origin still serving deleted bytes leaves cleanup unconfirmed", async () => {
  const f = storageFixture({ stuck: true });
  await assert.rejects(
    f.storage.remove(path, f.hash),
    /STORAGE_DELETE_UNCONFIRMED/,
  );
});
test("Pinned SDK wrapped 400/404 missing response is safe for cleanup retries", async () => {
  const f = storageFixture({ missingStatus: 400 });
  await f.storage.remove(path, f.hash);
  await f.storage.remove(path, f.hash);
  assert.equal(f.deletes, 1);
});
test("An authorization failure cannot be treated as successful deletion", async () => {
  const f = storageFixture({ missingStatus: 403 });
  await assert.rejects(f.storage.remove(path, f.hash), /STORAGE_READ_FAILED/);
});
test("Storage identity mismatch blocks removal before the side effect", async () => {
  const f = storageFixture({ wrong: true });
  await assert.rejects(
    f.storage.remove(path, f.hash),
    /STORAGE_IDENTITY_CONFLICT/,
  );
  assert.equal(f.deletes, 0);
});
test("Worker fresh reads preserve authorization and leave other origins and mutations unchanged", async () => {
  const calls = [],
    headers = { Authorization: "Bearer synthetic" };
  const request = recordingServerFetch(origin, async (url, options) => {
    calls.push({ url, options });
    return new Response();
  });
  await request(origin + "/storage/v1/object/speaking-private/" + path, {
    headers,
  });
  await request(origin + "/rest/v1/rpc/recording_worker", {
    method: "POST",
    headers,
  });
  await request("https://another.invalid/storage/v1/object/x", { headers });
  assert.equal(calls[0].options.headers, headers);
  assert(new URL(calls[0].url).searchParams.get("cacheNonce"));
  assert.equal(calls[1].url, origin + "/rest/v1/rpc/recording_worker");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].url, "https://another.invalid/storage/v1/object/x");
});
