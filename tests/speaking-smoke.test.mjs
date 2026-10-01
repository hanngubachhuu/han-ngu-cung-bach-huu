import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSmokeRequest,
  assertSyntheticUser,
  smokeFixture,
} from "../server/speaking-smoke.mjs";
import handler from "../api/recordings.js";
const during = Date.parse("2026-10-01T04:00:00Z");
test("temporary smoke bridge refuses arbitrary paths/users, missing leases and a closed run", () => {
  assert.doesNotThrow(() =>
    validateSmokeRequest({ step: "preflight" }, during),
  );
  for (const body of [
    { step: "upload", path: "another-recording/raw" },
    { step: "users", user_id: "another-user" },
    { step: "process", label: "other", lease_id: smokeFixture.a.user },
    { step: "process", label: "a", lease_id: "invalid" },
    { step: "unknown" },
  ])
    assert.throws(() => validateSmokeRequest(body, during), /INVALID_REQUEST/);
  assert.throws(
    () =>
      validateSmokeRequest({ step: "users" }, Date.parse(smokeFixture.expires)),
    /SMOKE_WINDOW_CLOSED/,
  );
  assert.doesNotThrow(() =>
    validateSmokeRequest(
      { step: "delete_users" },
      Date.parse(smokeFixture.expires) + 1,
    ),
  );
});
test("Auth cleanup requires the exact two IDs and server-controlled app marker, not editable user metadata", () => {
  const user = {
    id: smokeFixture.a.user,
    email: `speaking-smoke-a-${smokeFixture.run}@example.invalid`,
    app_metadata: { speaking_smoke_run: smokeFixture.run },
  };
  assert.doesNotThrow(() => assertSyntheticUser(user, "a"));
  assert.throws(
    () => assertSyntheticUser({ ...user, id: smokeFixture.b.user }, "a"),
    /SMOKE_IDENTITY_CONFLICT/,
  );
  assert.throws(
    () => assertSyntheticUser({ ...user, email: "real@example.com" }, "a"),
    /SMOKE_IDENTITY_CONFLICT/,
  );
  assert.throws(
    () =>
      assertSyntheticUser(
        {
          ...user,
          app_metadata: {},
          user_metadata: { speaking_smoke_run: smokeFixture.run },
        },
        "a",
      ),
    /SMOKE_IDENTITY_CONFLICT/,
  );
});
test("smoke endpoint authenticates and checks approved Admin before privileged configuration or provider calls", async () => {
  const previousFetch = globalThis.fetch,
    previousUrl = process.env.SUPABASE_URL,
    previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://synthetic.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "synthetic-key";
  let reads = 0;
  globalThis.fetch = async (url) => {
    reads++;
    const path = new URL(url).pathname;
    if (path === "/auth/v1/user")
      return new Response(
        JSON.stringify({ id: smokeFixture.a.user, aud: "authenticated" }),
      );
    assert.equal(path, "/rest/v1/profiles");
    return new Response(
      JSON.stringify({ role: "STUDENT", status: "APPROVED" }),
    );
  };
  const invoke = async (headers) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(v) {
        this.body = v;
      },
    };
    await handler(
      {
        method: "POST",
        url: "/api/recordings?action=smoke",
        headers,
        body: { step: "users" },
      },
      res,
    );
    return res;
  };
  try {
    const anon = await invoke({});
    assert.equal(anon.statusCode, 401);
    assert.equal(reads, 0);
    const student = await invoke({ authorization: "Bearer fixture.token" });
    assert.equal(student.statusCode, 403);
    assert.equal(reads, 2);
    assert.equal(student.body, '{"error":"ADMIN_REQUIRED"}');
    assert.equal(student.headers["Cache-Control"], "private, no-store");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
