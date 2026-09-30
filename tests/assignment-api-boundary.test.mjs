import test from "node:test";
import assert from "node:assert/strict";
import examHandler from "../api/exam-import.js";
import recordingHandler from "../api/recordings.js";
import { syntheticDocx, tenQuestions } from "./helpers/exam-fixtures.mjs";
import { decoderEnvironment } from "../server/recording-runtime.mjs";

async function invoke(handler, req) {
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v = "") {
      this.body = v;
    },
  };
  await handler(
    { method: "POST", url: "/api/exam-import", headers: {}, ...req },
    res,
  );
  return res;
}
test("document and recording endpoints deny anonymous calls before provider or decoder work", async () => {
  const document = await invoke(examHandler, { body: "broken" });
  const audio = await invoke(recordingHandler, {
    url: "/api/recordings?action=health",
  });
  const worker = await invoke(recordingHandler, {
    url: "/api/recordings?action=work",
    headers: { authorization: "Bearer fixture" },
  });
  assert.equal(document.statusCode, 401);
  assert.equal(audio.statusCode, 401);
  assert.equal(worker.statusCode, 401);
  assert.equal(document.headers["Cache-Control"], "private, no-store");
  assert.equal(
    Object.keys(decoderEnvironment).some((k) => /TOKEN|SECRET|KEY/i.test(k)),
    false,
  );
});
test("server auth/profile boundary denies student and permits approved Admin parse/native health", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL,
    previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://synthetic.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "synthetic-key";
  let role = "STUDENT",
    status = "APPROVED",
    reads = 0;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal((options.method || "GET").toUpperCase(), "GET");
    const route = new URL(String(url)).pathname;
    reads++;
    if (route === "/auth/v1/user")
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
        }),
        { status: 200 },
      );
    assert.equal(route, "/rest/v1/profiles");
    return new Response(JSON.stringify({ role, status }), { status: 200 });
  };
  const headers = {
    authorization: "Bearer fixture.token",
    "content-type": "application/json",
  };
  try {
    for (const handler of [examHandler, recordingHandler]) {
      const result = await invoke(handler, {
        headers,
        url: "/api/recordings?action=health",
        body: "{}",
      });
      assert.equal(result.statusCode, 403);
      assert.equal(JSON.parse(result.body).error, "ADMIN_REQUIRED");
    }
    role = "ADMIN";
    status = "PENDING";
    assert.equal(
      (await invoke(examHandler, { headers, body: "{}" })).statusCode,
      403,
    );
    status = "APPROVED";
    const docx = await syntheticDocx(tenQuestions());
    const parsed = await invoke(examHandler, {
      headers,
      body: JSON.stringify({
        filename: "synthetic.docx",
        bytes: docx.toString("base64"),
      }),
    });
    assert.equal(parsed.statusCode, 200);
    assert.match(JSON.parse(parsed.body).sha256, /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(parsed.body).pages.length, 1);
    const health = await invoke(recordingHandler, {
      headers,
      url: "/api/recordings?action=health",
    });
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).conversion, "passed");
    assert(reads >= 10);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
test("Pages preflight is exact-origin and does not open credentialed access", async () => {
  for (const handler of [examHandler, recordingHandler]) {
    const allowed = await invoke(handler, {
      method: "OPTIONS",
      headers: { origin: "https://hanngubachhuu.github.io" },
    });
    assert.equal(allowed.statusCode, 204);
    assert.equal(
      allowed.headers["Access-Control-Allow-Origin"],
      "https://hanngubachhuu.github.io",
    );
    assert.equal(
      allowed.headers["Access-Control-Allow-Credentials"],
      undefined,
    );
    const denied = await invoke(handler, {
      method: "OPTIONS",
      headers: { origin: "https://other.invalid" },
    });
    assert.equal(denied.statusCode, 405);
    assert.equal(denied.headers["Access-Control-Allow-Origin"], undefined);
  }
});
