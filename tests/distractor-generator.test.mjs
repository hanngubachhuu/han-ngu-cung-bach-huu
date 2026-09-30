import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDistractors,
  generatorPrompt,
  generatorAnswer,
  inferGenerator,
  validateGeneratedQuestion,
} from "../study/distractor-generator.mjs";
import { questionForm, questionPayload } from "../study/assignment-editor.mjs";

function generate(rule, target, seed = 0) {
  return generateDistractors({
    rule,
    target,
    seed,
    kind: "mcq",
    correct: generatorAnswer(rule, target),
    prompt: generatorPrompt(rule, target),
  });
}
test("closed generator produces meaningful, unique final options with one correct answer across its whole supported domain", () => {
  const cases = [
    ...Array.from({ length: 100 }, (_, i) => ["number", String(i)]),
    ...Array.from({ length: 7 }, (_, i) => ["weekday", String(i)]),
    ...["female", "male", "object", "first"].map((s) => ["pronoun", s]),
    ...["我", "你", "他", "她", "我们", "你们", "他们", "她们"].flatMap((s) =>
      ["老师", "学生", "医生"].map((r) => ["negate_shi", `${s}是${r}。`]),
    ),
  ];
  for (const [rule, target] of cases)
    for (let seed = 0; seed < 12; seed++) {
      const result = generate(rule, target, seed);
      assert.equal(validateGeneratedQuestion(result, { rule, target }), true);
      assert.equal(result.options.length, 4);
      assert.equal(new Set(result.options.map((o) => o.text)).size, 4);
      assert.equal(result.rationale.length, 3);
      assert(
        result.rationale.every(
          (r) => /^N\d\d$/.test(r.code) && r.reason.length > 20,
        ),
      );
      assert(
        result.options.some(
          (o) =>
            o.id === result.answer_key.value &&
            o.text === generatorAnswer(rule, target),
        ),
      );
      assert.deepEqual(inferGenerator(result.prompt), {
        rule,
        target: String(target),
      });
      const payload = questionPayload(
        { ...questionForm(result), question_key: "synthetic" },
        "lesson",
      );
      assert.equal(validateGeneratedQuestion(payload, { rule, target }), true);
    }
});
test("regenerate rotates choices/key and preserves the original version data", () => {
  const first = generate("number", "17"),
    snapshot = structuredClone(first);
  const next = generate("number", "17", 1);
  assert.notDeepEqual(first.options, next.options);
  assert.notEqual(first.answer_key.value, next.answer_key.value);
  assert.deepEqual(first, snapshot);
  assert.equal(
    validateGeneratedQuestion(next, { rule: "number", target: "17" }),
    true,
  );
});
test("generator refuses arbitrary context, unsupported type and mismatched answer/prompt instead of filling meaningless choices", () => {
  assert.throws(
    () => generate("reading_inference", ""),
    /GENERATOR_UNSUPPORTED/,
  );
  assert.throws(
    () => generate("negate_shi", "他喜欢看书。"),
    /GENERATOR_CONTEXT_REQUIRED/,
  );
  assert.throws(() => generate("number", "100"), /GENERATOR_CONTEXT_REQUIRED/);
  assert.throws(
    () =>
      generateDistractors({ rule: "number", target: "17", kind: "writing" }),
    /GENERATOR_UNSUPPORTED/,
  );
  assert.throws(
    () =>
      generateDistractors({
        rule: "number",
        target: "17",
        prompt: "Chọn câu đúng",
        correct: "十七",
      }),
    /GENERATOR_PROMPT_CHANGED/,
  );
  assert.throws(
    () =>
      generateDistractors({
        rule: "number",
        target: "17",
        prompt: generatorPrompt("number", "17"),
        correct: "十八",
      }),
    /GENERATOR_KEY_CHANGED/,
  );
});
test("final edits reject a second equivalent answer, changed key and meaningless distractors", () => {
  const original = generate("weekday", "0"),
    correct = original.options.find((o) => o.id === original.answer_key.value),
    wrong = original.options.find((o) => o.id !== original.answer_key.value);
  const second = structuredClone(original);
  second.options.find((o) => o.id === wrong.id).text = "星期天";
  assert.throws(
    () => validateGeneratedQuestion(second, { rule: "weekday", target: "0" }),
    /GENERATOR_INVALID_DISTRACTOR|GENERATOR_KEY_CHANGED/,
  );
  const nonsense = structuredClone(original);
  nonsense.options.find((o) => o.id === wrong.id).text = "???????";
  assert.throws(
    () => validateGeneratedQuestion(nonsense, { rule: "weekday", target: "0" }),
    /GENERATOR_INVALID_DISTRACTOR/,
  );
  assert.throws(
    () =>
      validateGeneratedQuestion(
        { ...original, answer_key: { value: wrong.id } },
        { rule: "weekday", target: "0" },
      ),
    /GENERATOR_KEY_CHANGED/,
  );
  const equivalent = structuredClone(original);
  equivalent.options.find((o) => o.id === correct.id).text = "星期天";
  assert.equal(
    validateGeneratedQuestion(equivalent, { rule: "weekday", target: "0" }),
    true,
  );
});
