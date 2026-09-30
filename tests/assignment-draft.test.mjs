import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentDraft } from "../study/assignment-draft.mjs";

const snapshot = (revision = 0, answer = null) => ({
  attempt_id: "attempt",
  state: "draft",
  revision,
  answers: [{ question: { id: "q" }, answer }],
});
function memoryStorage(initial) {
  const values = new Map(initial ? [["key", JSON.stringify(initial)]] : []);
  return {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("autosave serializes requests and retains newer input while an earlier save returns", async () => {
  const first = deferred(),
    calls = [],
    storage = memoryStorage();
  const draft = createAssignmentDraft({
    snapshot: snapshot(),
    storage,
    key: "key",
    save: async (p) => {
      calls.push(p);
      return calls.length === 1
        ? first.promise
        : snapshot(p.revision + 1, p.answers.q);
    },
  });
  draft.edit("q", "第一版");
  const pending = draft.flush();
  draft.edit("q", "第二版");
  const joined = draft.flush();
  assert.equal(calls.length, 1);
  first.resolve(snapshot(1, "第一版"));
  await Promise.all([pending, joined]);
  assert.deepEqual(
    calls.map((p) => [p.revision, p.answers.q]),
    [
      [0, "第一版"],
      [1, "第二版"],
    ],
  );
  assert.deepEqual(draft.pending, {});
  assert.equal(storage.getItem("key"), null);
});
test("offline draft survives reload; a response lost after acceptance is not sent again", async () => {
  const storage = memoryStorage();
  const draft = createAssignmentDraft({
    snapshot: snapshot(),
    storage,
    key: "key",
    save: async () => {
      throw Error("offline");
    },
  });
  draft.edit("q", "你好");
  await assert.rejects(draft.flush(), /offline/);
  draft.dispose();
  const resumed = createAssignmentDraft({
    snapshot: snapshot(),
    storage,
    key: "key",
    save: async (p) => snapshot(1, p.answers.q),
  });
  assert.equal(resumed.pending.q, "你好");
  await resumed.flush();
  storage.setItem(
    "key",
    JSON.stringify({
      attemptId: "attempt",
      revision: 0,
      answers: { q: "你好", removed: "old" },
    }),
  );
  let requests = 0;
  const accepted = createAssignmentDraft({
    snapshot: snapshot(1, "你好"),
    storage,
    key: "key",
    save: async () => requests++,
  });
  assert.deepEqual(accepted.pending, {});
  assert.equal(accepted.conflicted, false);
  await accepted.flush();
  assert.equal(requests, 0);
});
test("another tab's newer revision and server conflicts preserve local edits without overwrite", async () => {
  const storage = memoryStorage({
    attemptId: "attempt",
    revision: 0,
    answers: { q: "local" },
  });
  let requests = 0;
  const draft = createAssignmentDraft({
    snapshot: snapshot(1, "remote"),
    storage,
    key: "key",
    save: async () => requests++,
  });
  assert.equal(draft.conflicted, true);
  await assert.rejects(draft.flush(), /VERSION_CONFLICT/);
  assert.equal(requests, 0);
  assert.equal(draft.pending.q, "local");
  const conflicting = createAssignmentDraft({
    snapshot: snapshot(),
    storage: memoryStorage(),
    key: "key",
    save: async () => {
      throw Object.assign(Error("VERSION_CONFLICT"), { code: "40001" });
    },
  });
  conflicting.edit("q", "unsent");
  await assert.rejects(conflicting.flush(), /VERSION_CONFLICT/);
  assert.equal(conflicting.conflicted, true);
  assert.equal(conflicting.pending.q, "unsent");
});
test("expiry keeps late input locally; account changes ignore responses from the old account", async () => {
  const draft = createAssignmentDraft({
    snapshot: snapshot(),
    storage: memoryStorage(),
    key: "key",
    save: async () => ({
      ...snapshot(1, null),
      state: "submitted",
      expired: true,
    }),
  });
  draft.edit("q", "late");
  assert.equal((await draft.flush()).state, "submitted");
  assert.equal(draft.pending.q, "late");
  draft.edit("q", "later");
  assert.equal(draft.pending.q, "late");
  const response = deferred();
  const old = createAssignmentDraft({
    snapshot: snapshot(),
    storage: memoryStorage(),
    key: "key",
    save: () => response.promise,
  });
  old.edit("q", "old account");
  const saving = old.flush();
  old.dispose();
  response.resolve(snapshot(1, "old account"));
  await assert.rejects(saving, /ACCOUNT_CHANGED/);
  assert.equal(old.snapshot.revision, 0);
  assert.equal(old.pending.q, "old account");
});
test("storage failure is visible while server saving still works", async () => {
  const notices = [],
    storage = {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
      removeItem() {
        throw Error("blocked");
      },
    };
  const draft = createAssignmentDraft({
    snapshot: snapshot(),
    storage,
    key: "key",
    save: async (p) => snapshot(1, p.answers.q),
    notify: (s) => notices.push(s),
  });
  draft.edit("q", "answer");
  assert.equal(notices.at(-1).storageFailed, true);
  await draft.flush();
  assert.equal(draft.snapshot.revision, 1);
  assert.equal(notices.at(-1).storageFailed, true);
  assert.deepEqual(draft.pending, {});
});
