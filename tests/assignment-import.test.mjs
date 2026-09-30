import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAssignmentImport,
  IMPORT_MAX_BYTES,
} from "../study/assignment-import.mjs";
import {
  QuestionWriteSession,
  sourceDescription,
} from "../study/assignment-author-ui.mjs";
import {
  generateDistractors,
  generatorPrompt,
} from "../study/distractor-generator.mjs";
const question = {
  question_key: "fixture",
  source_item_id: "original-1",
  kind: "mcq",
  prompt: "Chọn lời chào.",
  options: [
    { id: "A", text: "你好" },
    { id: "B", text: "再见" },
  ],
  answer_key: { value: "A" },
};
const packet = () => ({
  format: "hnh-question-import-v1",
  lesson_id: "lesson",
  source: {
    source: "Synthetic author",
    source_identifier: "fixture:1",
    source_revision: "1",
  },
  questions: [structuredClone(question)],
});
const parse = (p) => parseAssignmentImport(JSON.stringify(p), "lesson");
test("JSON import preserves origin identifiers and validates final generated choices", () => {
  const p = packet(),
    original = structuredClone(p),
    result = parse(p);
  assert.equal(result.source.source_identifier, "fixture:1");
  assert.equal(result.questions[0].source_item_id, "original-1");
  assert.deepEqual(p, original);
  const g = generateDistractors({
    rule: "number",
    target: "17",
    correct: "十七",
    prompt: generatorPrompt("number", "17"),
  });
  p.questions[0] = {
    ...question,
    prompt: g.prompt,
    options: g.options,
    answer_key: g.answer_key,
    generator: { rule: g.rule, target: g.target, rule_version: g.rule_version },
  };
  assert.deepEqual(parse(p).questions[0].options, g.options);
  p.questions[0].options.find((o) => o.id !== g.answer_key.value).text = "十七";
  assert.throws(() => parse(p), /INVALID_OPTIONS|GENERATOR_INVALID_DISTRACTOR/);
});
test("import rejects cross-lesson, executable/malformed, duplicate and forged authority payloads", () => {
  assert.throws(
    () => parseAssignmentImport("export default {}", "lesson"),
    /INVALID_IMPORT_JSON/,
  );
  assert.throws(
    () => parseAssignmentImport("x".repeat(IMPORT_MAX_BYTES + 1), "lesson"),
    /IMPORT_TOO_LARGE/,
  );
  const cases = [
    [
      (p) => {
        p.lesson_id = "other";
      },
      /IMPORT_LESSON_MISMATCH/,
    ],
    [
      (p) => {
        delete p.source.source_revision;
      },
      /INVALID_SOURCE/,
    ],
    [
      (p) => {
        p.imported_by = "forged";
      },
      /INVALID_IMPORT_JSON/,
    ],
    [
      (p) => {
        p.questions[0].imported_at = "forged";
      },
      /INVALID_IMPORT_JSON/,
    ],
    [
      (p) => {
        p.questions[0].options[0].private_answer = "forged";
      },
      /INVALID_OPTIONS/,
    ],
    [
      (p) => {
        p.questions[0].answer_key.hidden = "forged";
      },
      /INVALID_ANSWER_KEY/,
    ],
    [
      (p) => {
        p.questions.push({ ...question, question_key: "other" });
      },
      /INVALID_QUESTIONS/,
    ],
    [
      (p) => {
        p.questions[0].kind = "writing";
        p.questions[0].options = [];
        p.questions[0].answer_key = null;
      },
      /INVALID_RUBRIC/,
    ],
  ];
  for (const [mutate, error] of cases) {
    const p = packet();
    mutate(p);
    assert.throws(() => parse(p), error);
  }
});
test("lost write response retries the exact request; changed payload cannot duplicate an uncertain write", async () => {
  const sent = [];
  let fail = true;
  const session = new QuestionWriteSession(
    async (c, p) => {
      sent.push(structuredClone(p));
      if (fail) {
        fail = false;
        throw Error("connection lost");
      }
      return { id: "saved" };
    },
    () => "stable-request",
  );
  await assert.rejects(
    session.save(question, { generator: null }),
    /connection lost/,
  );
  assert(session.pending);
  await assert.rejects(
    session.save({ ...question, prompt: "changed" }, { generator: null }),
    /AUTHORING_PENDING_CHANGED/,
  );
  assert.deepEqual(await session.retry(), { id: "saved" });
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(session.pending, null);
  const rejected = new QuestionWriteSession(async () => {
    throw { code: "40001", message: "VERSION_CONFLICT" };
  });
  await assert.rejects(rejected.save(question, {}));
  assert.equal(rejected.pending, null);
});
test("unknown historic provenance is labelled honestly and derived versions retain their origin description", () => {
  assert.match(
    sourceDescription({ provenance: { origin: "legacy_unknown" } }),
    /chưa được xác định/,
  );
  assert.match(
    sourceDescription({
      provenance: {
        source: "Book",
        source_identifier: "isbn:fixture",
        source_item_id: "q1",
        source_revision: "r1",
        parent_version_id: "parent",
      },
    }),
    /isbn:fixture.*q1.*version trước/,
  );
});
