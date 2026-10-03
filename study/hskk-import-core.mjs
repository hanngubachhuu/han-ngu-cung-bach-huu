import { levels } from "./hskk-exam-core.mjs";
// Printed HSKK questions use both numbered sentences and single-question
// headings (for example 第4题: 朗读). Section ranges are instructions.
export function extractHSKKPrintedQuestions(document) {
  const questions = [],
    warnings = [...(document.warnings || [])];
  let current;
  for (const page of document.pages || []) {
    for (const original of page.text.split(/\r?\n/u)) {
      const line = original.trim();
      if (!line) continue;
      if (
        /^(?:第[一二三四五六七八九十]+部分|第\s*\d+\s*[-—–~至]\s*\d+\s*题|参考答案|答案)/u.test(
          line,
        )
      ) {
        current = null;
        continue;
      }
      const heading =
        /^第\s*(\d{1,2})\s*题\s*[:：]\s*(?:朗读|读短文|回答问题|看图说话)\s*$/u.exec(
          line,
        );
      const numbered = /^(\d{1,2})\s*[.．、，,:：)]\s*(.*)$/u.exec(line);
      if (heading || numbered) {
        current = {
          number: Number((heading || numbered)[1]),
          prompt: heading ? "" : numbered[2],
          sourcePage: page.number,
        };
        questions.push(current);
      } else if (current && /\p{Script=Han}/u.test(line))
        current.prompt += "\n" + line;
    }
  }
  for (const q of questions) {
    // Keep recognition mistakes for human review; only remove the explicit
    // printed time annotation, which is already represented by response timing.
    q.prompt = q.prompt
      .replace(/[（(]\s*\d+(?:\s*[.．]\s*\d+)?\s*分钟\s*[）)]/gu, "")
      .trim();
    if (questions.filter((x) => x.number === q.number).length !== 1)
      warnings.push("AMBIGUOUS_QUESTION_" + q.number);
  }
  return { questions, warnings };
}
export const levelStructures = Object.freeze({
  elementary: [
    [15, "speaking_repeat", "audio", 7, "Nghe và nhắc lại", 0],
    [10, "speaking_answer", "audio", 10, "Nghe và trả lời", 0],
    [2, "speaking_long_answer", "text", 90, "Trả lời câu hỏi", 420],
  ],
  intermediate: [
    [10, "speaking_repeat", "audio", 10, "Nghe và nhắc lại", 0],
    [2, "picture_description", "image", 120, "Nhìn tranh và nói", 600],
    [2, "long_response", "text", 120, "Trả lời câu hỏi", 0],
  ],
  advanced: [
    [3, "short_response", "audio", 120, "Nghe và thuật lại", 0],
    [1, "read_aloud", "text", 120, "Đọc thành tiếng", 600],
    [2, "long_response", "text", 150, "Trả lời câu hỏi", 0],
  ],
});
// Templates define structure only. Printed content and source bytes are never invented.
export function importHSKK(
  document,
  {
    code,
    level,
    documentName,
    documentHash,
    audioName,
    audioHash,
    audioSize,
    duration,
    pictures = {},
    actor,
    now,
  },
) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code || "") || !levels[level])
    throw Error("INVALID_SOURCE");
  const parsed = extractHSKKPrintedQuestions(document),
    questions = [],
    sections = [];
  for (const [
    index,
    [count, type, mode, seconds, title, preparation],
  ] of levelStructures[level].entries()) {
    const id = `part${index + 1}`;
    sections.push({
      id,
      title_vi: title,
      preparation_seconds: preparation,
      ...(preparation && level !== "elementary"
        ? { preparation_section_ids: ["part2", "part3"] }
        : {}),
    });
    for (let i = 0; i < count; i++) {
      const number = questions.length + 1,
        original = parsed.questions.filter((q) => q.number === number);
      questions.push({
        id: `q${number}`,
        number,
        version: 1,
        version_id: null,
        section_id: id,
        type,
        prompt_mode: mode,
        prompt: ["audio", "image"].includes(mode)
          ? ""
          : original.length === 1
            ? original[0].prompt
            : "",
        source_page: original.length === 1 ? original[0].sourcePage : null,
        ...(pictures[`q${number}`]
          ? { prompt_image: pictures[`q${number}`] }
          : {}),
        pinyin: null,
        response_seconds: seconds,
        auto_start: true,
        auto_stop: true,
        allow_replay: false,
        allow_rerecord: false,
        allow_navigation: false,
        audio_segment: null,
        answer_key: null,
      });
    }
  }
  return {
    exam_code: code,
    title: code,
    level,
    source_type: "official",
    exam_version: 1,
    status: "draft",
    provenance: {
      document: documentName,
      audio: audioName,
      source_version: code,
      sha256: { [documentName]: documentHash, [audioName]: audioHash },
      imported_by: actor,
      imported_at: now,
      review: "REQUIRED_DOCUMENT_AND_AUDIO_REVIEW",
      timing_review: "REQUIRED_SOURCE_AUDIO_REVIEW",
      recognition: document.recognition || "DOCUMENT_REVIEW_REQUIRED",
      recognition_warnings: parsed.warnings,
    },
    audio: {
      mode: "single",
      url: "",
      duration_seconds: duration,
      byte_size: audioSize,
      segments_status: "unverified",
      source_audio_id: audioHash,
    },
    timing: { countdown_seconds: 3 },
    submission_mode: "end_of_exam",
    scoring_mode: "teacher_review",
    rubric: null,
    sections,
    questions,
  };
}
