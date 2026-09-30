// No model/provider requests. Closed rules generate real Chinese forms and prove
// that every final option differs from the exact target in the controlled prompt.
export const DISTRACTOR_RULE_VERSION = "zh-closed-1";
const digits = "零一二三四五六七八九";
const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .trim();
const fail = (code) => {
  throw Error(code);
};
export function chineseNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99)
    fail("GENERATOR_CONTEXT_REQUIRED");
  if (n < 10) return digits[n];
  return (
    (n < 20 ? "" : digits[Math.floor(n / 10)]) +
    "十" +
    (n % 10 ? digits[n % 10] : "")
  );
}
function numberValue(s) {
  s = norm(s).replaceAll("〇", "零");
  // Restrict to ordinary cardinal forms: no arbitrary characters, classifiers,
  // telephone-style digit strings, approximation or punctuation.
  for (let n = 0; n <= 99; n++) if (chineseNumber(n) === s) return n;
  return null;
}
const weekdays = [
  "Chủ nhật",
  "thứ Hai",
  "thứ Ba",
  "thứ Tư",
  "thứ Năm",
  "thứ Sáu",
  "thứ Bảy",
];
const pronouns = {
  female: {
    correct: "她",
    description: "ngôi thứ ba, số ít, chỉ một người nữ",
    code: "N21",
  },
  male: {
    correct: "他",
    description: "ngôi thứ ba, số ít, chỉ một người nam",
    code: "N21",
  },
  object: {
    correct: "它",
    description: "ngôi thứ ba, số ít, chỉ một đồ vật",
    code: "N21",
  },
  first: { correct: "我", description: "ngôi thứ nhất, số ít", code: "N19" },
};
const pronounPool = [
  "我",
  "我们",
  "你",
  "你们",
  "他",
  "他们",
  "她",
  "她们",
  "它",
  "它们",
];
const subjects = ["我", "你", "他", "她", "我们", "你们", "他们", "她们"];
const roles = ["老师", "学生", "医生"];
export const DISTRACTOR_RULES = [
  {
    id: "number",
    label: "Viết số bằng chữ Hán (0–99)",
    hint: "Nhập số, ví dụ 17",
  },
  {
    id: "weekday",
    label: "Ngày trong tuần",
    hint: "1=thứ Hai … 6=thứ Bảy, 0=Chủ nhật",
  },
  {
    id: "pronoun",
    label: "Đại từ theo ngôi/số/đối tượng",
    hint: "female / male / object / first",
  },
  {
    id: "negate_shi",
    label: "Phủ định câu 是",
    hint: "Câu gốc rõ chủ ngữ, ví dụ 他是老师。",
  },
];
function context(rule, target) {
  target = String(target ?? "").trim();
  if (rule === "number") {
    if (!/^\d{1,2}$/.test(target)) fail("GENERATOR_CONTEXT_REQUIRED");
    const n = Number(target);
    return {
      prompt: `Chọn cách viết bằng chữ Hán của số ${n}.`,
      correct: chineseNumber(n),
      code: "N19",
      classify: numberValue,
      correctValue: n,
      candidates: [
        ...new Set([
          n + 1,
          n - 1,
          n + 10,
          n - 10,
          (n % 10) * 10 + Math.floor(n / 10),
          n + 2,
          n - 2,
          n + 20,
          n - 20,
          n % 10,
        ]),
      ]
        .filter((x) => x >= 0 && x <= 99 && x !== n)
        .map(chineseNumber),
      reason: (s) =>
        `Đây là số ${numberValue(s)}, khác số ${n} trong đề; kiểm tra hàng chục/hàng đơn vị.`,
    };
  }
  if (rule === "weekday") {
    if (!/^[0-6]$/.test(target)) fail("GENERATOR_CONTEXT_REQUIRED");
    const day = Number(target),
      chinese = (d) => "星期" + (d ? digits[d] : "日");
    return {
      prompt: `Chọn cách nói “${weekdays[day]}” bằng tiếng Trung.`,
      correct: chinese(day),
      code: "N15",
      correctValue: day,
      classify: (s) => {
        const match = norm(s).match(/^(?:星期|周|礼拜)([一二三四五六日天])$/u);
        if (!match) return null;
        return "日天".includes(match[1]) ? 0 : digits.indexOf(match[1]);
      },
      candidates: [1, 2, 3, 4, 5, 6, 0].filter((d) => d !== day).map(chinese),
      reason: (s) => `${s} chỉ một ngày khác, không phải ${weekdays[day]}.`,
    };
  }
  if (rule === "pronoun") {
    const p = pronouns[target];
    if (!p) fail("GENERATOR_CONTEXT_REQUIRED");
    return {
      prompt: `Chọn đại từ ${p.description} bằng chữ Hán.`,
      correct: p.correct,
      correctValue: p.correct,
      code: p.code,
      classify: (s) => (pronounPool.includes(norm(s)) ? norm(s) : null),
      candidates: pronounPool.filter((s) => s !== p.correct),
      reason: (s) =>
        `${s} khác ngôi, số hoặc đối tượng được chỉ; đề yêu cầu ${p.description}.`,
    };
  }
  if (rule === "negate_shi") {
    const match = norm(target).match(
      /^(我|你|他|她|我们|你们|他们|她们)是(老师|学生|医生)[。.]?$/u,
    );
    if (!match) fail("GENERATOR_CONTEXT_REQUIRED");
    const [, subject, role] = match,
      correct = `${subject}不是${role}。`;
    return {
      prompt: `Chọn câu phủ định giữ nguyên chủ ngữ và nghề/người học của câu “${subject}是${role}。”.`,
      correct,
      correctValue: norm(correct).replace(/[。.]$/u, ""),
      code: "N20",
      classify: (s) => {
        const plain = norm(s).replace(/[。.]$/u, "");
        return /^(我|你|他|她|我们|你们|他们|她们)(?:是|不是)(老师|学生|医生)$/u.test(
          plain,
        )
          ? plain
          : null;
      },
      candidates: [
        `${subject}是${role}。`,
        ...roles.filter((r) => r !== role).map((r) => `${subject}不是${r}。`),
        ...subjects
          .filter((s) => s !== subject)
          .map((s) => `${s}不是${role}。`),
      ],
      reason: (s) =>
        s.includes("不是")
          ? "Câu có 不 nhưng thay đổi chủ ngữ hoặc thông tin danh từ của câu gốc."
          : "Câu vẫn khẳng định với 是, chưa phủ định bằng 不是.",
    };
  }
  fail("GENERATOR_UNSUPPORTED");
}
export function generatorPrompt(rule, target) {
  return context(rule, target).prompt;
}
export function generatorAnswer(rule, target) {
  return context(rule, target).correct;
}
export function inferGenerator(prompt) {
  for (let n = 0; n <= 99; n++)
    if (norm(prompt) === norm(generatorPrompt("number", n)))
      return { rule: "number", target: String(n) };
  for (let d = 0; d <= 6; d++)
    if (norm(prompt) === norm(generatorPrompt("weekday", d)))
      return { rule: "weekday", target: String(d) };
  for (const key of Object.keys(pronouns))
    if (norm(prompt) === norm(generatorPrompt("pronoun", key)))
      return { rule: "pronoun", target: key };
  const match = String(prompt).match(/câu “(.+)”\.$/u);
  if (match) {
    try {
      if (norm(prompt) === norm(generatorPrompt("negate_shi", match[1])))
        return { rule: "negate_shi", target: match[1] };
    } catch {
      /* An unrelated sentence is never treated as a supported rule. */
    }
  }
  return null;
}
export function validateGeneratedQuestion(question, spec) {
  if (question.kind !== "mcq") fail("GENERATOR_UNSUPPORTED");
  const rule = context(spec.rule, spec.target);
  if (norm(question.prompt) !== norm(rule.prompt))
    fail("GENERATOR_PROMPT_CHANGED");
  if (!Array.isArray(question.options) || question.options.length !== 4)
    fail("INVALID_OPTIONS");
  const seen = new Set(),
    values = new Set();
  let correctCount = 0;
  for (const option of question.options) {
    const value = rule.classify(option.text);
    if (value === null || seen.has(norm(option.text)) || values.has(value))
      fail("GENERATOR_INVALID_DISTRACTOR");
    seen.add(norm(option.text));
    values.add(value);
    const right = value === rule.correctValue;
    if (right) correctCount++;
    if (right !== (option.id === question.answer_key?.value))
      fail("GENERATOR_KEY_CHANGED");
  }
  if (correctCount !== 1) fail("GENERATOR_KEY_CHANGED");
  return true;
}
export function generateDistractors({
  rule,
  target,
  correct,
  prompt,
  kind = "mcq",
  seed = 0,
}) {
  if (kind !== "mcq") fail("GENERATOR_UNSUPPORTED");
  const ctx = context(rule, target);
  if (norm(prompt) !== norm(ctx.prompt)) fail("GENERATOR_PROMPT_CHANGED");
  if (ctx.classify(correct) !== ctx.correctValue) fail("GENERATOR_KEY_CHANGED");
  if (!Number.isSafeInteger(seed) || seed < 0)
    fail("GENERATOR_CONTEXT_REQUIRED");
  const offset = seed % ctx.candidates.length;
  const candidates = [
    ...ctx.candidates.slice(offset),
    ...ctx.candidates.slice(0, offset),
  ];
  const wrong = candidates.slice(0, 3);
  if (wrong.length !== 3) fail("GENERATOR_CONTEXT_REQUIRED");
  const texts = [correct.trim(), ...wrong],
    shift = seed % 4;
  const ordered = [...texts.slice(shift), ...texts.slice(0, shift)];
  const question = {
    kind,
    prompt,
    options: ordered.map((text, i) => ({ id: "ABCD"[i], text })),
    answer_key: { value: "ABCD"[ordered.indexOf(correct.trim())] },
  };
  validateGeneratedQuestion(question, { rule, target });
  return {
    ...question,
    rule,
    target: String(target),
    rule_version: DISTRACTOR_RULE_VERSION,
    rationale: question.options
      .filter((o) => o.id !== question.answer_key.value)
      .map((o) => ({ id: o.id, code: ctx.code, reason: ctx.reason(o.text) })),
  };
}
