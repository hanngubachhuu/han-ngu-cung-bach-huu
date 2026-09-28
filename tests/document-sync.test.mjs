import test from "node:test";
import { runDocumentAction } from "../server/document-service.mjs";
import assert from "node:assert/strict";
import {
  documentBlock,
  parseDocument,
  planSync,
  validateFields,
} from "../server/document-sync.mjs";
import { googleAdapter } from "../server/google-docs-adapter.mjs";
import handler from "../api/account.js";
const base = { full_name: "Name", phone: "123", learning_goal: "Learn" };
test("document status verifies Google access and never reports expired credentials as connected", async () => {
  const offline = await runDocumentAction(
    null,
    "status",
    {},
    {
      configured: false,
      adapterFactory: async () => {
        throw Error("must not connect");
      },
    },
  );
  assert.deepEqual(offline, { configured: false, connected: false });
  assert.deepEqual(
    await runDocumentAction(
      null,
      "status",
      {},
      {
        configured: true,
        adapterFactory: async () => ({}),
      },
    ),
    { configured: true, connected: true },
  );
  await assert.rejects(
    runDocumentAction(
      null,
      "status",
      {},
      {
        configured: true,
        adapterFactory: async () => {
          throw Error("GOOGLE_AUTH_FAILED");
        },
      },
    ),
    /GOOGLE_AUTH_FAILED/,
  );
});
test("Google document parser rejects authority fields, malformed and duplicate blocks", () => {
  assert.deepEqual(
    parseDocument("Notes\n" + documentBlock(base) + "\nNotes").fields,
    base,
  );
  assert.throws(() => validateFields({ ...base, role: "ADMIN" }));
  assert.throws(() => parseDocument(documentBlock(base) + documentBlock(base)));
  assert.throws(() => validateFields({ ...base, full_name: "x".repeat(121) }));
});
test("three-way sync merges independent changes and never silently resolves a conflict", () => {
  assert.deepEqual(
    planSync(base, { ...base, full_name: "Web" }, { ...base, phone: "456" })
      .fields,
    { ...base, full_name: "Web", phone: "456" },
  );
  const g = { ...base, full_name: "Google" },
    w = { ...base, full_name: "Web" };
  assert.equal(planSync(base, w, g).conflicts.length, 1);
  assert.equal(
    planSync(base, w, g, { full_name: "google" }).fields.full_name,
    "Google",
  );
  assert.equal(planSync(base, w, g, { role: "ADMIN" }).conflicts.length, 1);
});
test("adapter pins Google identity and uses required revision on writes", async () => {
  const calls = [],
    env = {
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      GOOGLE_REFRESH_TOKEN: "test",
    };
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () =>
        url.includes("/token")
          ? { access_token: "mock" }
          : url.includes("userinfo")
            ? { email: "bachhuu1809@gmail.com", email_verified: true }
            : {
                replies: [{ replaceAllText: { occurrencesChanged: 1 } }],
                writeControl: { requiredRevisionId: "next" },
              },
    };
  };
  const adapter = await googleAdapter(env, request);
  assert.equal(
    await adapter.write(
      "valid_document_123",
      { revision: "read-version", block: documentBlock(base) },
      base,
    ),
    "next",
  );
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).writeControl, {
    requiredRevisionId: "read-version",
  });
  await assert.rejects(
    googleAdapter(env, async (url) => ({
      ok: true,
      json: async () =>
        url.includes("/token")
          ? { access_token: "mock" }
          : { email: "someone@example.invalid", email_verified: true },
    })),
    /GOOGLE_ACCOUNT_MISMATCH/,
  );
});
test("document API denies anonymous access before connecting to Google", async () => {
  const response = {
    setHeader() {},
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  await handler(
    {
      method: "POST",
      url: "/api/account?action=sync",
      headers: { "content-type": "application/json" },
      body: {},
    },
    response,
  );
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "AUTH_REQUIRED");
});

test("adapter classifies disabled API and missing scopes without leaking provider details", async () => {
  for (const [reason, status, expected] of [
    ["SERVICE_DISABLED", 403, "GOOGLE_DOCS_API_DISABLED"],
    ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", 403, "GOOGLE_SCOPE_REQUIRED"],
    ["RATE_LIMIT_EXCEEDED", 429, "GOOGLE_RATE_LIMITED"],
    ["UNKNOWN", 403, "GOOGLE_REQUEST_FAILED"],
  ]) {
    const adapter = await googleAdapter(
      {
        GOOGLE_CLIENT_ID: "test",
        GOOGLE_CLIENT_SECRET: "test",
        GOOGLE_REFRESH_TOKEN: "test",
      },
      async (url) => ({
        ok: url.includes("/token") || url.includes("userinfo"),
        status,
        json: async () =>
          url.includes("/token")
            ? { access_token: "mock" }
            : url.includes("userinfo")
              ? { email: "bachhuu1809@gmail.com", email_verified: true }
              : {
                  error: {
                    message: "private-provider-detail",
                    details: [{ reason }],
                  },
                },
      }),
    );
    await assert.rejects(adapter.create("test-user", base), (error) => {
      assert.equal(error.message, expected);
      assert.equal(error.message.includes("private-provider-detail"), false);
      return true;
    });
  }
});

test("sync rejects stale previews and records partial Google/DB failure without reporting success", async () => {
  const fields = { full_name: "Student", phone: "", learning_goal: "Learn" },
    id = "00000000-0000-4000-8000-000000000003";
  const calls = [];
  let writes = 0;
  const c = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return {
            data:
              table === "documents"
                ? {
                    id,
                    student_id: id,
                    google_document_id: "test_document_123",
                    base_fields: fields,
                    sync_version: 1,
                  }
                : { user_id: id, version: 2, ...fields },
          };
        },
      };
    },
    async rpc(_name, { command }) {
      calls.push(command);
      return command === "complete"
        ? { error: { code: "40001" } }
        : { data: { operation_id: id } };
    },
  };
  const options = {
    configured: true,
    adapterFactory: async () => ({
      read: async () => ({ fields, revision: "r1" }),
      write: async () => {
        writes++;
        return "r2";
      },
    }),
  };
  await assert.rejects(
    runDocumentAction(
      c,
      "sync",
      {
        documentId: id,
        profileVersion: 1,
        syncVersion: 1,
        googleRevision: "r1",
      },
      options,
    ),
    /VERSION_CONFLICT/,
  );
  assert.equal(writes, 0);
  assert.deepEqual(calls, []);
  await assert.rejects(
    runDocumentAction(
      c,
      "sync",
      {
        documentId: id,
        profileVersion: 2,
        syncVersion: 1,
        googleRevision: "r1",
      },
      options,
    ),
    /SYNC_INCOMPLETE_REVIEW_REQUIRED/,
  );
  assert.equal(writes, 1);
  assert.deepEqual(calls, ["start", "complete", "fail"]);
});
