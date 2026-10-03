import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateExam, buildTimeline } from "../study/hskk-exam-core.mjs";
import { createExamHandler } from "../api/hskk-exams.js";
const sources = await Promise.all(
  ["H80000", "H91002"].map(async (code) =>
    JSON.parse(await fs.readFile(`server/hskk/${code}.json`, "utf8")),
  ),
);
test("new practice sources preserve the supplied content/level, one shared preparation period and private unverified draft state", () => {
  for (const [i, exam] of sources.entries()) {
    validateExam(exam);
    assert.equal(exam.title, exam.exam_code);
    assert.equal(exam.questions.length, i === 0 ? 14 : 6);
    assert.equal(exam.status, "draft");
    assert.equal(exam.audio.url, "");
    assert.equal(
      exam.sections.reduce((n, s) => n + s.preparation_seconds, 0),
      600,
    );
    assert.ok(
      exam.questions.every(
        (q) => q.audio_segment === null && q.answer_key === null,
      ),
    );
    assert.throws(() => buildTimeline(exam), /AUDIO_SEGMENTS_UNVERIFIED/);
  }
});
test("both picture assets are exact extracted source bytes and require Admin before reads", async () => {
  const exam = sources[0];
  for (const q of exam.questions.filter((q) => q.prompt_image)) {
    const bytes = await fs.readFile(
      `server/hskk/assets/${q.prompt_image.file_name}`,
    );
    assert.equal(bytes.length, q.prompt_image.byte_size);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      q.prompt_image.sha256,
    );
  }
  let reads = 0;
  const invoke = async (token, authorize, question = "q11") => {
    let status, body;
    await createExamHandler({
      authorize,
      readDraft: async () => {
        reads++;
        return JSON.stringify(exam);
      },
    })(
      {
        method: "GET",
        headers: token ? { authorization: "Bearer " + token } : {},
        url: "/api/hskk-exams?exam=H80000&action=picture&question=" + question,
      },
      {
        setHeader() {},
        set statusCode(value) {
          status = value;
        },
        end(value) {
          body = value;
        },
      },
    );
    return { status, body };
  };
  assert.equal((await invoke(null, async () => {})).status, 401);
  assert.equal(
    (
      await invoke("student", async () => {
        throw Error("ADMIN_REQUIRED");
      })
    ).status,
    403,
  );
  assert.equal(reads, 0);
  assert.equal((await invoke("admin", async () => ({}))).status, 200);
  assert.equal(
    (await invoke("admin", async () => ({}), "../../other")).status,
    404,
  );
});
