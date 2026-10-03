import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createExamHandler } from "../api/hskk-exams.js";
test("HSKK catalog is data-driven, authorizes before reading and exposes only factual review counts to Admin", async () => {
  const fixture = JSON.parse(
    await fs.readFile("server/hskk/H71002.json", "utf8"),
  );
  let reads = 0;
  const handler = createExamHandler({
    authorize: async (token) => {
      if (token !== "admin") throw Error("ADMIN_REQUIRED");
      return { rpc: async () => ({ data: null, error: null }) };
    },
    listDrafts: async () => ["H71002"],
    readDraft: async () => {
      reads++;
      return JSON.stringify(fixture);
    },
  });
  const call = async (token) => {
    let body;
    const res = {
      setHeader() {},
      end(value) {
        body = JSON.parse(value);
      },
    };
    await handler(
      {
        method: "GET",
        url: "/api/hskk-exams?action=catalog",
        headers: token ? { authorization: "Bearer " + token } : {},
      },
      res,
    );
    return { status: res.statusCode, body };
  };
  assert.equal((await call()).status, 401);
  assert.equal((await call("student")).status, 403);
  assert.equal(reads, 0);
  const catalog = await call("admin");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body[0].code, "H71002");
  assert.equal(catalog.body[0].audio.total, 27);
  assert.equal(catalog.body[0].audio.confirmed, 0);
  assert.equal(catalog.body[0].audio.needs_review, 27);
  assert.equal(catalog.body[0].provenance, undefined);
  assert.equal(catalog.body[0].questions, undefined);
});
