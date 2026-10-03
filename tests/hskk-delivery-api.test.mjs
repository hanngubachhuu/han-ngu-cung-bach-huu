import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createDeliveryHandler } from "../api/hskk-delivery.js";
import { createSessionHandler } from "../api/hskk-session.js";
import {
  inspectClipArchive,
  sha256,
  storeExistingClips,
  readDeliveryReadiness,
} from "../server/hskk-delivery.mjs";
import { readCurrentPrompt } from "../server/hskk-session-service.mjs";
const response = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(body) {
    this.body = body;
  },
});

test("authoring readiness reads the actual server gate and remains closed on missing binding or RPC failure", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args.command]);
      return name === "hskk_delivery_admin"
        ? {
            data: {
              prepared: true,
              version_id: "existing-version",
              published: false,
            },
          }
        : { data: { ready: true } };
    },
  };
  assert.deepEqual(await readDeliveryReadiness(client, "H71002"), {
    ready: true,
    published: false,
    version_id: "existing-version",
    reasons: [],
  });
  assert.deepEqual(calls, [
    ["hskk_delivery_admin", "get"],
    ["hskk_publication", "readiness"],
  ]);
  client.rpc = async () => ({ error: { message: "provider error" } });
  assert.equal((await readDeliveryReadiness(client, "H71002")).ready, false);
  client.rpc = async () => ({ data: { prepared: false } });
  assert.equal((await readDeliveryReadiness(client, "H71002")).ready, false);
});
test("hosted handlers reject anonymous/unauthorized requests before touching source, archive or prompt storage", async () => {
  for (const factory of [createDeliveryHandler, createSessionHandler]) {
    let touched = 0;
    const handler = factory({
      authorize: async () => {
        touched++;
        throw Error(
          factory === createDeliveryHandler
            ? "ADMIN_REQUIRED"
            : "STUDENT_REQUIRED",
        );
      },
    });
    const anon = response();
    await handler(
      {
        method: "GET",
        headers: {},
        url: "/api/test?exam=H71002&action=prompt",
      },
      anon,
    );
    assert.equal(anon.statusCode, 401);
    assert.equal(touched, 0);
    const denied = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer synthetic.test.token" },
        url: "/api/test?exam=H71002&action=prompt",
      },
      denied,
    );
    assert.equal(denied.statusCode, 403);
    assert.equal(touched, 1);
    assert.equal(denied.body.includes("token"), false);
    assert.equal(denied.headers["Cache-Control"], "private, no-store");
  }
});
test("controlled test authorization uses the approved Admin boundary and never trusts a browser-supplied exam", async () => {
  const calls = [];
  const create = (authorize) =>
    createDeliveryHandler({
      authorize,
      controlledTest: async (_client, command, payload) => {
        calls.push({ command, payload });
        return { authorized: true, attempt_id: "new-test" };
      },
    });
  const req = {
    method: "POST",
    headers: { authorization: "Bearer synthetic.test.token" },
    url: "/api/hskk-delivery?exam=H71002&action=test-authorize",
    body: { exam_code: "OTHER", student_id: "selected", request_id: "stable" },
  };
  const anonymous = response();
  await create(async () => ({}))({ ...req, headers: {} }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(calls.length, 0);
  const student = response();
  await create(async () => {
    throw Error("ADMIN_REQUIRED");
  })(req, student);
  assert.equal(student.statusCode, 403);
  assert.equal(calls.length, 0);
  const allowed = response();
  await create(async () => ({}))(req, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(calls[0].command, "authorize");
  assert.equal(calls[0].payload.exam_code, "H71002");
  assert.equal(calls[0].payload.request_id, "stable");
});

test("makeup Admin actions and Student prompt/command routes retain actual authorization boundaries", async () => {
  const calls = [];
  const admin = createDeliveryHandler({
    authorize: async () => {
      throw Error("ADMIN_REQUIRED");
    },
    controlledTest: async () => {
      calls.push("unsafe");
    },
  });
  const denied = response();
  await admin(
    {
      method: "POST",
      headers: { authorization: "Bearer synthetic.test.token" },
      url: "/api/hskk-delivery?exam=H71002&action=makeup-open",
      body: {},
    },
    denied,
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(calls.length, 0);
  const handler = createSessionHandler({
    authorize: async () => ({ client: {}, userId: "real-approved-owner" }),
    command: async (_c, action, payload) => {
      calls.push({ action, payload });
      return { submitted: true };
    },
    prompt: async (owner, payload, _server, options) => {
      calls.push({ owner, payload, options });
      return Buffer.from("local-prompt");
    },
  });
  const anonymous = response();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      url: "/api/hskk-session?action=makeup_submit",
      body: {},
    },
    anonymous,
  );
  assert.equal(anonymous.statusCode, 401);
  assert.equal(calls.length, 0);
  const allowed = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer synthetic.test.token" },
      url: "/api/hskk-session?action=makeup_prompt&makeup_window_id=selected&owner_id=forged",
    },
    allowed,
  );
  assert.equal(allowed.statusCode, 200);
  assert.equal(calls[0].owner, "real-approved-owner");
  assert.equal(calls[0].options.makeup, true);
});

test("actual archive reader checks every pre-existing clip hash and rejects missing, altered, extra or traversal files", async () => {
  const zip = new JSZip(),
    clips = [];
  for (let n = 1; n <= 27; n++) {
    const bytes = Buffer.from("synthetic clip " + n);
    const question_key = "q" + n;
    zip.file(`H71002-Q${String(n).padStart(2, "0")}.mp3`, bytes);
    clips.push({
      question_key,
      sha256: sha256(bytes),
      path: sha256(bytes) + ".mp3",
    });
  }
  zip.file("provenance.json", "{}");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  assert.equal((await inspectClipArchive(bytes, clips)).length, 27);
  const altered = structuredClone(clips);
  altered[2].sha256 = "a".repeat(64);
  await assert.rejects(
    inspectClipArchive(bytes, altered),
    /CLIP_HASH_MISMATCH/,
  );
  zip.file("unexpected.mp3", "bad");
  await assert.rejects(
    inspectClipArchive(await zip.generateAsync({ type: "nodebuffer" }), clips),
    /INVALID_ARCHIVE/,
  );
  zip.remove("unexpected.mp3");
  zip.remove("H71002-Q01.mp3");
  await assert.rejects(
    inspectClipArchive(await zip.generateAsync({ type: "nodebuffer" }), clips),
    /INVALID_ARCHIVE/,
  );
  const corrupt = Buffer.from(bytes);
  corrupt[40] ^= 255;
  await assert.rejects(inspectClipArchive(corrupt, clips));
});
test("stored clips are independently hashed before server-only verification; resumed upload never overwrites", async () => {
  const zip = new JSZip(),
    clips = [];
  for (let n = 1; n <= 27; n++) {
    const bytes = Buffer.from("synthetic " + n),
      hash = sha256(bytes);
    zip.file(`H71002-Q${String(n).padStart(2, "0")}.mp3`, bytes);
    clips.push({ question_key: "q" + n, sha256: hash, path: hash + ".mp3" });
  }
  zip.file("provenance.json", "{}");
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const objects = new Map();
  let receipts = 0,
    corrupt = false;
  const client = {
    rpc: async () => ({ data: { clips, version_id: "synthetic-version" } }),
    auth: {
      getUser: async () => ({ data: { user: { id: "synthetic-admin" } } }),
    },
    storage: {
      from: () => ({
        upload: async (path, bytes, options) => {
          assert.equal(options.upsert, false);
          if (objects.has(path)) return { error: { statusCode: "409" } };
          objects.set(path, bytes);
          return {};
        },
        download: async (path) => ({
          data: new Blob([
            corrupt ? Buffer.from("wrong stored bytes") : objects.get(path),
          ]),
        }),
      }),
    },
  };
  const server = {
    rpc: async (name) => {
      assert.equal(name, "hskk_prompt_verified");
      receipts++;
      return {};
    },
  };
  assert.equal(
    (await storeExistingClips(client, archive, { server })).verified,
    27,
  );
  assert.equal(receipts, 27);
  assert.equal(objects.size, 27);
  assert.equal(
    (await storeExistingClips(client, archive, { server })).verified,
    27,
  );
  assert.equal(objects.size, 27);
  corrupt = true;
  await assert.rejects(
    storeExistingClips(client, archive, { server }),
    /STORED_CLIP_HASH_MISMATCH/,
  );
  assert.equal(receipts, 54);
});
test("current prompt authorization runs before storage and returned bytes must match the private descriptor", async () => {
  let reads = 0;
  const denied = {
    rpc: async () => ({ error: { message: "PROMPT_WINDOW_REQUIRED" } }),
    storage: {
      from: () => {
        reads++;
      },
    },
  };
  await assert.rejects(
    readCurrentPrompt("synthetic-student", {}, denied),
    /PROMPT_DENIED/,
  );
  assert.equal(reads, 0);
  const audio = Buffer.from("synthetic authorized prompt");
  const server = {
    rpc: async () => ({
      data: {
        bucket: "hskk-prompt-clips",
        path: "private.mp3",
        sha256: sha256(audio),
      },
    }),
    storage: {
      from: () => ({ download: async () => ({ data: new Blob([audio]) }) }),
    },
  };
  assert.deepEqual(
    await readCurrentPrompt("synthetic-student", {}, server),
    audio,
  );
  server.rpc = async () => ({
    data: {
      bucket: "hskk-prompt-clips",
      path: "private.mp3",
      sha256: "a".repeat(64),
    },
  });
  await assert.rejects(
    readCurrentPrompt("synthetic-student", {}, server),
    /PROMPT_UNAVAILABLE/,
  );
});
