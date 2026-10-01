import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBrowserCheckpoint,
  checkFixtureUser,
  fixtureEmail,
} from "../server/speaking-browser-checkpoint.mjs";
import { browserFixture as f } from "../server/speaking-browser-fixture.mjs";
import handler from "../api/speaking-checkpoint.js";
test("temporary browser helper accepts only bounded fixture steps and Auth identities", () => {
  const now = Date.parse(f.expires) - 1000;
  validateBrowserCheckpoint({ step: "users" }, now);
  validateBrowserCheckpoint({ step: "login", label: "a" }, now);
  for (const body of [
    { step: "login", label: "real" },
    { step: "users", user_id: f.a.user },
    { step: "sql" },
    { step: "work", path: "real/audio.mp3" },
    null,
  ])
    assert.throws(
      () => validateBrowserCheckpoint(body, now),
      /INVALID_REQUEST/,
    );
  assert.throws(
    () => validateBrowserCheckpoint({ step: "users" }, Date.parse(f.expires)),
    /CANARY_WINDOW_CLOSED/,
  );
  validateBrowserCheckpoint(
    { step: "delete_users" },
    Date.parse(f.expires) + 1000,
  );
  const user = {
    id: f.a.user,
    email: fixtureEmail("a"),
    app_metadata: { speaking_browser_run: f.run },
  };
  checkFixtureUser(user, "a");
  assert.throws(
    () => checkFixtureUser({ ...user, id: f.b.user }, "a"),
    /CANARY_IDENTITY_CONFLICT/,
  );
  assert.throws(
    () =>
      checkFixtureUser(
        {
          ...user,
          app_metadata: {},
          user_metadata: { speaking_browser_run: f.run },
        },
        "a",
      ),
    /CANARY_IDENTITY_CONFLICT/,
  );
});
test("temporary fixture endpoint refuses unauthenticated calls before service effects", async () => {
  let body;
  const res = {
    setHeader() {},
    end(value) {
      body = JSON.parse(value);
    },
  };
  await handler({ method: "POST", headers: {}, body: { step: "users" } }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(body, { error: "AUTH_REQUIRED" });
});
