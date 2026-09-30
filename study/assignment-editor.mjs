// Admin editor state. Published content is copied into NEW versions by the existing RPC.
export class AssignmentSelection {
  constructor(lessonId = "") {
    this.lessonId = lessonId;
    this.questions = [];
    this.title = "";
    this.minutes = "";
  }
  choose(question) {
    if (question.lesson_id !== this.lessonId) throw Error("INVALID_QUESTIONS");
    const index = this.questions.findIndex(
      (q) => q.question_key === question.question_key,
    );
    if (index >= 0) this.questions[index] = question;
    else {
      if (this.questions.length >= 200) throw Error("INVALID_QUESTIONS");
      this.questions.push(question);
    }
  }
  remove(id) {
    this.questions = this.questions.filter((q) => q.id !== id);
  }
  move(id, direction) {
    const index = this.questions.findIndex((q) => q.id === id);
    const target = index + direction;
    if (
      ![1, -1].includes(direction) ||
      index < 0 ||
      target < 0 ||
      target >= this.questions.length
    )
      return;
    [this.questions[index], this.questions[target]] = [
      this.questions[target],
      this.questions[index],
    ];
  }
  reuse(definition) {
    const next = new AssignmentSelection(definition.lesson_id);
    for (const question of definition.questions) next.choose(question);
    if (
      next.questions.length !== definition.questions.length ||
      !next.questions.length
    )
      throw Error("INVALID_QUESTIONS");
    next.title = `${definition.title} (từ v${definition.version})`.slice(
      0,
      200,
    );
    next.minutes = definition.time_limit_minutes ?? "";
    return next;
  }
  payload() {
    if (!this.title.trim() || !this.questions.length)
      throw Error("INVALID_QUESTIONS");
    return {
      lesson_id: this.lessonId,
      title: this.title.trim(),
      time_limit_minutes: this.minutes === "" ? null : Number(this.minutes),
      question_version_ids: this.questions.map((q) => q.id),
    };
  }
}

const lines = (value) =>
  String(value || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const normalized = (value) => value.trim().replace(/\s+/gu, " ").toLowerCase();
export function questionPayload(fields, lessonId) {
  const kind = fields.kind;
  const options =
    kind === "mcq"
      ? lines(fields.options).map((line) => {
          const [id, ...label] = line.split("|");
          return { id: id.trim(), text: label.join("|").trim() };
        })
      : lines(fields.options);
  const answer = String(fields.answer || "").trim();
  let answer_key = null;
  if (kind === "mcq") {
    if (
      options.length < 2 ||
      options.length > 8 ||
      options.some(
        (o) =>
          !/^[A-Za-z0-9_-]{1,30}$/.test(o.id) ||
          !o.text ||
          o.text.length > 2000,
      ) ||
      new Set(options.map((o) => o.id)).size !== options.length ||
      new Set(options.map((o) => normalized(o.text))).size !== options.length ||
      !options.some((o) => o.id === answer)
    )
      throw Error("INVALID_OPTIONS");
    answer_key = { value: answer };
  } else if (kind === "true_false") {
    if (!["true", "false"].includes(answer)) throw Error("INVALID_ANSWER_KEY");
    answer_key = { value: answer === "true" };
  } else if (["text_fill", "reorder"].includes(kind)) {
    const accepted = lines(answer);
    if (!accepted.length || accepted.length > 30)
      throw Error("INVALID_ANSWER_KEY");
    answer_key = { accepted };
  } else if (kind === "multi_fill") {
    const values = lines(answer).map((s) => s.split("|").map((x) => x.trim()));
    if (
      !values.length ||
      values.length > 30 ||
      values.some((a) => a.some((s) => !s))
    )
      throw Error("INVALID_ANSWER_KEY");
    answer_key = { values };
  } else if (kind === "matching") {
    const pairs = lines(answer).map((s) => s.split("=").map((x) => x.trim()));
    if (
      !pairs.length ||
      pairs.some((a) => a.length !== 2 || a.some((s) => !s)) ||
      new Set(pairs.map(([key]) => key)).size !== pairs.length
    )
      throw Error("INVALID_ANSWER_KEY");
    answer_key = { pairs: Object.fromEntries(pairs) };
  } else if (!["writing", "translation", "speaking"].includes(kind)) {
    throw Error("UNSUPPORTED_QUESTION_TYPE");
  } else if (!fields.rubric_version_id) throw Error("INVALID_RUBRIC");
  if (
    !String(fields.question_key || "").trim() ||
    !String(fields.prompt || "").trim()
  )
    throw Error("INVALID_QUESTION");
  return {
    lesson_id: lessonId,
    question_key: fields.question_key.trim(),
    kind,
    prompt: fields.prompt.trim(),
    options,
    answer_key,
    explanation: fields.explanation || "",
    tip: fields.tip || "",
    ...(["writing", "translation", "speaking"].includes(kind)
      ? { rubric_version_id: fields.rubric_version_id }
      : {}),
  };
}

export function questionForm(question, duplicate = false) {
  const key = question.answer_key;
  return {
    question_key: duplicate
      ? question.question_key.slice(0, 115) + "_copy"
      : question.question_key,
    kind: question.kind,
    prompt: question.prompt,
    options:
      question.kind === "mcq"
        ? question.options.map((o) => `${o.id} | ${o.text}`).join("\n")
        : question.options.join("\n"),
    answer:
      key?.value !== undefined
        ? String(key.value)
        : key?.accepted
          ? key.accepted.join("\n")
          : key?.values
            ? key.values.map((a) => a.join(" | ")).join("\n")
            : key?.pairs
              ? Object.entries(key.pairs)
                  .map(([a, b]) => `${a}=${b}`)
                  .join("\n")
              : "",
    rubric_version_id: question.rubric_version_id || "",
    explanation: question.explanation || "",
    tip: question.tip || "",
  };
}
