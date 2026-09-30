import { questionForm, questionPayload } from "./assignment-editor.mjs";
import { validateGeneratedQuestion } from "./distractor-generator.mjs";
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const only = (x, keys) =>
  object(x) && Object.keys(x).every((key) => keys.includes(key));
function required(s, max) {
  if (typeof s !== "string" || !s.trim() || s.trim().length > max)
    throw Error("INVALID_SOURCE");
  return s.trim();
}
export function parseAssignmentImport(raw, lessonId) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > IMPORT_MAX_BYTES
  )
    throw Error("IMPORT_TOO_LARGE");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error("INVALID_IMPORT_JSON");
  }
  if (
    !only(data, ["format", "lesson_id", "source", "questions"]) ||
    data.format !== "hnh-question-import-v1"
  )
    throw Error("INVALID_IMPORT_JSON");
  if (data.lesson_id !== lessonId) throw Error("IMPORT_LESSON_MISMATCH");
  if (!only(data.source, ["source", "source_identifier", "source_revision"]))
    throw Error("INVALID_SOURCE");
  const source = Object.fromEntries(
    ["source", "source_identifier", "source_revision"].map((key) => [
      key,
      required(data.source[key], key === "source_identifier" ? 1000 : 120),
    ]),
  );
  if (
    !Array.isArray(data.questions) ||
    !data.questions.length ||
    data.questions.length > 200
  )
    throw Error("INVALID_QUESTIONS");
  const keys = new Set(),
    ids = new Set();
  const questions = data.questions.map((q) => {
    if (
      !only(q, [
        "question_key",
        "kind",
        "prompt",
        "options",
        "answer_key",
        "explanation",
        "tip",
        "rubric_version_id",
        "source_item_id",
        "generator",
      ])
    )
      throw Error("INVALID_IMPORT_JSON");
    const source_item_id = required(q.source_item_id, 120);
    const question_key = required(q.question_key, 120);
    if (keys.has(question_key) || ids.has(source_item_id))
      throw Error("INVALID_QUESTIONS");
    keys.add(question_key);
    ids.add(source_item_id);
    if (
      typeof q.prompt !== "string" ||
      !q.prompt.trim() ||
      q.prompt.length > 12000 ||
      !Array.isArray(q.options)
    )
      throw Error("INVALID_QUESTION");
    if (
      q.options.some((o) =>
        q.kind === "mcq"
          ? !only(o, ["id", "text"]) ||
            typeof o.id !== "string" ||
            typeof o.text !== "string" ||
            /[\r\n]/u.test(o.text)
          : typeof o !== "string" || /[\r\n]/u.test(o),
      )
    )
      throw Error("INVALID_OPTIONS");
    if (["writing", "translation", "speaking"].includes(q.kind)) {
      if (
        q.answer_key != null ||
        typeof q.rubric_version_id !== "string" ||
        !q.rubric_version_id
      )
        throw Error("INVALID_RUBRIC");
    } else if (!object(q.answer_key)) throw Error("INVALID_ANSWER_KEY");
    let normalized;
    try {
      normalized = questionPayload(
        questionForm({ ...q, question_key }),
        lessonId,
      );
    } catch (e) {
      if (e instanceof TypeError) throw Error("INVALID_ANSWER_KEY");
      throw e;
    }
    // The serialized form must not lose hidden nested properties or separators.
    if (
      q.kind === "mcq" &&
      (Object.keys(q.answer_key).join(",") !== "value" ||
        typeof q.answer_key.value !== "string")
    )
      throw Error("INVALID_ANSWER_KEY");
    if (
      q.kind === "true_false" &&
      (Object.keys(q.answer_key).join(",") !== "value" ||
        typeof q.answer_key.value !== "boolean")
    )
      throw Error("INVALID_ANSWER_KEY");
    if (
      ["text_fill", "reorder"].includes(q.kind) &&
      (!only(q.answer_key, ["accepted"]) ||
        !Array.isArray(q.answer_key.accepted) ||
        q.answer_key.accepted.some(
          (a) => typeof a !== "string" || /[\r\n]/u.test(a),
        ))
    )
      throw Error("INVALID_ANSWER_KEY");
    if (
      q.kind === "multi_fill" &&
      (!only(q.answer_key, ["values"]) ||
        !Array.isArray(q.answer_key.values) ||
        q.answer_key.values.some(
          (a) =>
            !Array.isArray(a) ||
            a.some((s) => typeof s !== "string" || /[|\r\n]/u.test(s)),
        ))
    )
      throw Error("INVALID_ANSWER_KEY");
    if (
      q.kind === "matching" &&
      (!only(q.answer_key, ["pairs"]) ||
        !object(q.answer_key.pairs) ||
        Object.entries(q.answer_key.pairs).some(
          ([a, b]) => typeof b !== "string" || /[=\r\n]/u.test(a + b),
        ))
    )
      throw Error("INVALID_ANSWER_KEY");
    if (
      (typeof q.explanation !== "undefined" &&
        typeof q.explanation !== "string") ||
      (typeof q.tip !== "undefined" && typeof q.tip !== "string")
    )
      throw Error("INVALID_IMPORT_JSON");
    // MCQ extra option fields were rejected above; objective key properties are allowlisted.
    if (
      !["writing", "translation", "speaking"].includes(q.kind) &&
      q.rubric_version_id != null
    )
      throw Error("INVALID_RUBRIC");
    delete normalized.lesson_id;
    const generator = q.generator ?? null;
    if (generator) {
      if (
        !only(generator, ["rule", "target", "rule_version"]) ||
        generator.rule_version !== "zh-closed-1"
      )
        throw Error("GENERATOR_UNSUPPORTED");
      validateGeneratedQuestion(normalized, generator);
    }
    return {
      ...normalized,
      source_item_id,
      ...(generator ? { generator } : {}),
    };
  });
  return { lesson_id: lessonId, source, questions };
}
