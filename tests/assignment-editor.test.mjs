import test from "node:test";
import assert from "node:assert/strict";
import {
  AssignmentSelection,
  questionForm,
  questionPayload,
} from "../study/assignment-editor.mjs";

const q = (id, key = id, version = 1) => ({
  id,
  question_key: key,
  version,
  lesson_id: "lesson",
  kind: "mcq",
  prompt: "Chọn lời chào",
  options: [
    { id: "A", text: "你好" },
    { id: "B", text: "再见" },
  ],
  answer_key: { value: "A" },
  explanation: "Giải thích",
  tip: "Gợi ý",
  rubric_version_id: null,
});
test("definition selection retains cross-page order, replaces a version in place and rejects cross-lesson selection", () => {
  const s = new AssignmentSelection("lesson");
  s.choose(q("old", "stable"));
  s.choose(q("second"));
  s.choose(q("new", "stable", 2));
  assert.deepEqual(
    s.questions.map((q) => q.id),
    ["new", "second"],
  );
  s.move("second", -1);
  s.move("second", -1);
  s.move("missing", 1);
  assert.deepEqual(
    s.questions.map((q) => q.id),
    ["second", "new"],
  );
  assert.throws(
    () => s.choose({ ...q("foreign"), lesson_id: "other" }),
    /INVALID_QUESTIONS/,
  );
  s.title = "Đề mới";
  s.minutes = "30";
  assert.deepEqual(s.payload(), {
    lesson_id: "lesson",
    title: "Đề mới",
    time_limit_minutes: 30,
    question_version_ids: ["second", "new"],
  });
  s.remove("second");
  assert.deepEqual(s.payload().question_version_ids, ["new"]);
});
test("restore builds a new draft with the exact old versions without changing the source definition", () => {
  const old = {
    lesson_id: "lesson",
    title: "Đề cũ",
    version: 2,
    time_limit_minutes: null,
    questions: [q("older"), q("writing")],
  };
  const original = structuredClone(old);
  const s = new AssignmentSelection("lesson").reuse(old);
  assert.deepEqual(s.payload().question_version_ids, ["older", "writing"]);
  assert.equal(s.payload().time_limit_minutes, null);
  assert.deepEqual(old, original);
  assert.throws(
    () => s.reuse({ ...old, questions: [q("a", "same"), q("b", "same")] }),
    /INVALID_QUESTIONS/,
  );
});
test("copy/editor round trips private keys for all supported formats without mutation", () => {
  const cases = [
    q("mcq"),
    {
      ...q("tf"),
      kind: "true_false",
      options: [],
      answer_key: { value: false },
    },
    {
      ...q("fill"),
      kind: "text_fill",
      options: [],
      answer_key: { accepted: ["你好", "您好"] },
    },
    {
      ...q("order"),
      kind: "reorder",
      options: ["我", "是", "老师"],
      answer_key: { accepted: ["我是老师"] },
    },
    {
      ...q("multi"),
      kind: "multi_fill",
      options: [],
      answer_key: { values: [["我"], ["老师", "教师"]] },
    },
    {
      ...q("match"),
      kind: "matching",
      options: ["A", "B"],
      answer_key: { pairs: { a: "A", b: "B" } },
    },
    {
      ...q("open"),
      kind: "writing",
      options: [],
      answer_key: null,
      rubric_version_id: "rubric",
    },
  ];
  for (const question of cases) {
    const before = structuredClone(question);
    const payload = questionPayload(questionForm(question), "lesson");
    assert.deepEqual(payload.answer_key, question.answer_key);
    assert.deepEqual(payload.options, question.options);
    assert.deepEqual(question, before);
    const copy = questionPayload(questionForm(question, true), "lesson");
    assert.notEqual(copy.question_key, question.question_key);
    assert.deepEqual(copy.answer_key, question.answer_key);
  }
});
test("editor blocks ambiguous distractors and malformed keys before requesting a new version", () => {
  const fields = questionForm(q("mcq"));
  assert.throws(
    () =>
      questionPayload({ ...fields, options: "A | 你好\nB |  你好" }, "lesson"),
    /INVALID_OPTIONS/,
  );
  assert.throws(
    () =>
      questionPayload({ ...fields, options: "A | 你好\nA | 再见" }, "lesson"),
    /INVALID_OPTIONS/,
  );
  assert.throws(
    () => questionPayload({ ...fields, answer: "C" }, "lesson"),
    /INVALID_OPTIONS/,
  );
  assert.throws(
    () =>
      questionPayload(
        { ...fields, kind: "true_false", answer: "maybe" },
        "lesson",
      ),
    /INVALID_ANSWER_KEY/,
  );
  assert.throws(
    () =>
      questionPayload(
        { ...fields, kind: "matching", answer: "a=A\na=B" },
        "lesson",
      ),
    /INVALID_ANSWER_KEY/,
  );
  assert.throws(
    () =>
      questionPayload(
        { ...fields, kind: "multi_fill", answer: "你好|" },
        "lesson",
      ),
    /INVALID_ANSWER_KEY/,
  );
  assert.throws(
    () => questionPayload({ ...fields, kind: "writing", answer: "" }, "lesson"),
    /INVALID_RUBRIC/,
  );
});
