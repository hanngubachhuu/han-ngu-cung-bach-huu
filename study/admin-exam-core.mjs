import { extractExamQuestions } from "./exam-extraction.mjs";
import { questionForm, questionPayload } from "./assignment-editor.mjs";
import { safeMedia } from "./media-url.mjs";
export { safeMedia } from "./media-url.mjs";

export const examLevels = Object.freeze({
  HSK: Array.from({ length: 6 }, (_, i) => ({
    value: String(i + 1),
    label: `HSK ${i + 1}`,
  })),
  HSKK: [
    { value: "elementary", label: "HSKK Sơ cấp" },
    { value: "intermediate", label: "HSKK Trung cấp" },
    { value: "advanced", label: "HSKK Cao cấp" },
  ],
});
export const kindLabels = Object.freeze({
  mcq: "Trắc nghiệm",
  true_false: "Đúng / Sai",
  text_fill: "Câu trả lời ngắn",
  reorder: "Sắp xếp",
  matching: "Nối",
  multi_fill: "Điền nhiều chỗ",
  writing: "Tự luận",
  translation: "Dịch",
  speaking: "Nói",
  speaking_repeat: "Nghe và nhắc lại",
  speaking_answer: "Nghe và trả lời",
  speaking_long_answer: "Trả lời câu hỏi",
  picture_description: "Miêu tả tranh",
  read_aloud: "Đọc thành tiếng",
  short_response: "Trả lời ngắn",
  long_response: "Trả lời dài",
});

// The registry owns publication state; source drafts only add audio review data.
export function mergeExamCatalog(registered, sources) {
  const entries = new Map(registered.map((exam) => [exam.id, { ...exam }]));
  for (const source of sources) {
    entries.set(source.id, {
      ...source,
      ...entries.get(source.id),
      source_review: source.source_review,
      audio_source_name: source.audio_source_name,
      audio: source.audio,
    });
  }
  return [...entries.values()];
}

export function importedExam(
  document,
  { type, level, title, filename, sha256 },
) {
  const parsed = extractExamQuestions(document);
  return {
    id: crypto.randomUUID(),
    type,
    level,
    title,
    active: false,
    revision: 0,
    instructions: parsed.instructions || "",
    contexts: parsed.contexts || [],
    source: { filename, sha256 },
    warnings: document.warnings || [],
    questions: parsed.questions.map((q) => ({
      ...q,
      question_key: q.localId,
      kind: type === "HSKK" ? "speaking_long_answer" : q.kind,
      options: q.options || [],
      answer_key:
        q.kind === "mcq"
          ? { value: q.correctAnswer }
          : q.kind === "true_false"
            ? { value: q.correctAnswer === "true" }
            : q.kind === "text_fill"
              ? { accepted: q.correctAnswer ? [q.correctAnswer] : [] }
              : null,
      explanation: "",
      pinyin: "",
      image: "",
      audio: "",
      response_seconds: type === "HSKK" ? 90 : null,
    })),
  };
}
export function examValidation(model) {
  const issues = [];
  if (!model.title?.trim()) issues.push("Nhập tên đề.");
  if (!examLevels[model.type]?.some((l) => l.value === String(model.level)))
    issues.push("Chọn cấp độ phù hợp với loại đề.");
  if (!model.questions?.length || model.questions.length > 200)
    issues.push("Đề cần từ 1 đến 200 câu.");
  if (
    model.time_limit_minutes != null &&
    (!Number.isInteger(model.time_limit_minutes) ||
      model.time_limit_minutes < 1 ||
      model.time_limit_minutes > 240)
  )
    issues.push("Thời gian làm đề phải từ 1 đến 240 phút.");
  const keys = new Set();
  for (const [i, q] of (model.questions || []).entries()) {
    const prefix = `Câu ${i + 1}: `;
    if (!q.prompt?.trim()) issues.push(prefix + "bổ sung nội dung câu hỏi.");
    if (keys.has(q.question_key || q.id))
      issues.push(prefix + "trùng câu hỏi trong đề.");
    keys.add(q.question_key || q.id);
    if ([q.image, q.audio].some((v) => !safeMedia(v)))
      issues.push(prefix + "đường dẫn hình hoặc audio chưa hợp lệ.");
    if (model.type === "HSKK") {
      if (!Object.hasOwn(kindLabels, q.kind || q.type))
        issues.push(prefix + "chọn dạng câu hỏi.");
      if (!(q.response_seconds > 0 && q.response_seconds <= 600))
        issues.push(prefix + "thời gian trả lời phải từ 1 đến 600 giây.");
    } else {
      try {
        questionPayload(
          {
            ...questionForm({ ...q, options: q.options || [] }),
            rubric_version_id: q.rubric_version_id || "server-default",
          },
          "exam-validation",
        );
      } catch (e) {
        issues.push(
          prefix +
            ({
              INVALID_OPTIONS: "kiểm tra lựa chọn và đáp án đúng.",
              INVALID_ANSWER_KEY: "bổ sung đáp án hợp lệ.",
              UNSUPPORTED_QUESTION_TYPE: "chọn dạng câu hỏi.",
            }[e.message] || "kiểm tra nội dung và đáp án."),
        );
      }
    }
  }
  return issues;
}

// One immutable request per publication; uncertain retries reuse its exact bytes.
export class ExamEditSession {
  constructor(model) {
    this.model = structuredClone(model);
    this.index = 0;
    this.pending = null;
  }
  move(delta) {
    const next = this.index + delta;
    if (next < 0 || next >= this.model.questions.length) return;
    [this.model.questions[this.index], this.model.questions[next]] = [
      this.model.questions[next],
      this.model.questions[this.index],
    ];
    this.index = next;
  }
  publication() {
    if (this.pending) return this.pending;
    const issues = examValidation(this.model);
    if (issues.length)
      throw Object.assign(Error("EXAM_VALIDATION"), { issues });
    this.pending = {
      request_id: crypto.randomUUID(),
      expected_revision: this.model.revision || 0,
      exam: structuredClone(this.model),
    };
    return this.pending;
  }
  published(result) {
    this.model.revision = result.revision;
    this.model.active = true;
    this.pending = null;
  }
}
