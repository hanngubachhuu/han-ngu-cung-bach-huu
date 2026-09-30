// Extraction preserves supplied text. Unknown structure never becomes an invented answer.
const questionStart =
  /^(?:Câu\s+|Question\s+|第\s*)?(\d{1,3})\s*(?:[.．、):：]|题[:：]?)\s*(.*)$/iu;
const answerHeading =
  /^(?:đáp án(?:\s+đúng)?|答案|参考答案|answer\s*key)\s*[:：]?\s*$/iu;
const passageHeading =
  /^(?:đoạn (?:văn|đọc)|bài đọc|passage|阅读材料|材料)\s*[:：]/iu;
export function extractExamQuestions(document) {
  const lines = document.pages.flatMap((p) =>
    p.text.split(/\r?\n/u).map((text) => ({ text, page: p.number })),
  );
  const repeated = new Map();
  for (const page of document.pages) {
    const edge = page.text.split(/\r?\n/).filter((x) => x.trim());
    for (const text of [...edge.slice(0, 2), ...edge.slice(-2)]) {
      const key = text.trim();
      if (
        !questionStart.test(key) &&
        !answerHeading.test(key) &&
        !/^[A-H][.．、):：]/u.test(key)
      )
        repeated.set(key, (repeated.get(key) || 0) + 1);
    }
  }
  const questions = [],
    contexts = [],
    instructions = [],
    answerLines = [];
  let current = null,
    keySection = false,
    context = null;
  for (const source of lines) {
    const line = source.text.trim();
    if (!line) continue;
    if (
      /^(?:Trang|Page)\s+\d+\s*(?:\/|of)\s*\d+$/iu.test(line) ||
      (document.pages.length > 1 &&
        (repeated.get(line) || 0) >= document.pages.length &&
        line.length < 160)
    )
      continue;
    if (answerHeading.test(line)) {
      keySection = true;
      current = null;
      continue;
    }
    if (keySection) {
      answerLines.push(line);
      continue;
    }
    if (passageHeading.test(line)) {
      context = {
        localId: "context_" + contexts.length,
        title: "Đoạn đọc chung",
        text: source.text,
        sourcePage: source.page,
      };
      contexts.push(context);
      current = null;
      continue;
    }
    const match = questionStart.exec(line);
    if (match) {
      current = {
        localId: crypto.randomUUID(),
        number: Number(match[1]),
        sourcePage: source.page,
        prompt: match[2],
        original: source.text,
        options: [],
        kind: "",
        correctAnswer: "",
        needsReview: [],
        contextId: context?.localId || null,
      };
      questions.push(current);
      const inlineOptions = [
        ...match[2].matchAll(/(?:^|\s+)([A-H])[.．、):：]\s*/gu),
      ];
      if (inlineOptions.length >= 2) {
        current.prompt = match[2].slice(0, inlineOptions[0].index).trim();
        current.options = inlineOptions.map((label, i) => ({
          id: label[1],
          text: match[2]
            .slice(
              label.index + label[0].length,
              inlineOptions[i + 1]?.index ?? match[2].length,
            )
            .trim(),
        }));
      }
      continue;
    }
    if (!current) {
      if (context) context.text += "\n" + source.text;
      else instructions.push(source.text);
      continue;
    }
    current.original += "\n" + source.text;
    // Split explicit A/B/C/D labels only; Chinese/pinyin/Vietnamese content is unchanged.
    const labels = [...line.matchAll(/(?:^|\s+)([A-H])[.．、):：]\s*/gu)];
    if (labels.length) {
      for (let i = 0; i < labels.length; i++) {
        const start = labels[i].index + labels[i][0].length,
          end = i + 1 < labels.length ? labels[i + 1].index : line.length;
        current.options.push({
          id: labels[i][1],
          text: line.slice(start, end).trim(),
        });
      }
      continue;
    }
    const inline = /^(?:đáp án|答案|answer)\s*[:：]\s*(.+)$/iu.exec(line);
    if (inline) {
      current.correctAnswer = inline[1];
      continue;
    }
    if (current.options.length)
      current.options.at(-1).text += "\n" + source.text;
    else current.prompt += "\n" + source.text;
  }
  const answers = new Map(),
    ambiguous = new Set();
  for (const line of answerLines) {
    const entries = [
      ...line.matchAll(
        /(?:^|[\s,;，；]+)(\d{1,3})\s*[.．、):：-]?\s*([A-H]|对|错|Đúng|Sai|True|False)(?=$|[\s,;，；])/giu,
      ),
    ];
    for (const match of entries) {
      const n = Number(match[1]);
      if (answers.has(n) && answers.get(n) !== match[2]) ambiguous.add(n);
      answers.set(n, match[2]);
    }
    if (!entries.length) {
      const textKey = questionStart.exec(line);
      if (textKey && textKey[2].trim()) {
        const n = Number(textKey[1]);
        if (answers.has(n) && answers.get(n) !== textKey[2]) ambiguous.add(n);
        answers.set(n, textKey[2]);
      }
    }
  }
  const counts = new Map();
  for (const q of questions)
    counts.set(q.number, (counts.get(q.number) || 0) + 1);
  for (const q of questions) {
    if (
      q.correctAnswer &&
      answers.has(q.number) &&
      q.correctAnswer !== answers.get(q.number)
    )
      ambiguous.add(q.number);
    if (q.options.length >= 2) {
      q.kind = "mcq";
      q.correctAnswer = q.correctAnswer || answers.get(q.number) || "";
      if (!q.options.some((o) => o.id === q.correctAnswer))
        q.needsReview.push("Chưa xác định đáp án đúng.");
      if (
        new Set(q.options.map((o) => o.id)).size !== q.options.length ||
        q.options.some((o) => !o.text.trim())
      )
        q.needsReview.push("Lựa chọn thiếu hoặc bị lặp.");
    } else if (
      /(?:đúng\s*[/–-]\s*sai|true\s*[/–-]\s*false|判断对错|对错)/iu.test(
        q.prompt,
      )
    ) {
      q.kind = "true_false";
      const key = q.correctAnswer || answers.get(q.number) || "";
      q.correctAnswer = /^(对|Đúng|True)$/iu.test(key)
        ? "true"
        : /^(错|Sai|False)$/iu.test(key)
          ? "false"
          : "";
      if (!q.correctAnswer) q.needsReview.push("Chưa xác định đáp án đúng.");
    } else if (
      /(?:_{2,}|＿{2,}|填空|điền\s+(?:từ|chỗ|vào)|fill\s+(?:in|the))/iu.test(
        q.prompt,
      )
    ) {
      q.kind = "text_fill";
      q.correctAnswer = q.correctAnswer || answers.get(q.number) || "";
      if (!q.correctAnswer) q.needsReview.push("Chưa xác định đáp án đúng.");
    } else if (
      /(?:作文|请写|tự\s+luận|viết\s+(?:câu|đoạn|bài)|write\s+(?:a|an|the))/iu.test(
        q.prompt,
      )
    ) {
      q.kind = "writing";
      q.correctAnswer = q.correctAnswer || answers.get(q.number) || "";
    } else {
      q.kind = "";
      q.correctAnswer = q.correctAnswer || answers.get(q.number) || "";
      q.needsReview.push("Chọn dạng câu hỏi và kiểm tra đáp án.");
    }
    if (counts.get(q.number) > 1 || ambiguous.has(q.number)) {
      q.correctAnswer = "";
      q.needsReview.push("Số câu hoặc đáp án bị lặp; cần đối chiếu.");
    }
    if (!q.prompt.trim()) q.needsReview.push("Thiếu nội dung câu.");
    if (document.warnings?.length)
      q.needsReview.push("Đối chiếu nội dung với file gốc.");
    if (/\[Hình ảnh|(?:hình|ảnh|audio|nghe|听录音|看图)/iu.test(q.original))
      q.needsReview.push("Có hình hoặc phần nghe cần bổ sung trước khi lưu.");
  }
  return {
    questions,
    contexts,
    instructions: instructions.join("\n"),
    warnings: document.warnings || [],
    pages: document.pages.length,
    answerKeyFound: answerLines.length > 0,
  };
}
export function validateExamPreview(draft) {
  if (!draft.title?.trim()) throw Error("EXAM_TITLE_REQUIRED");
  if (
    !Array.isArray(draft.questions) ||
    !draft.questions.length ||
    draft.questions.length > 200
  )
    throw Error("EXAM_INVALID_COUNT");
  for (const q of draft.questions) {
    if (!q.prompt?.trim() || q.prompt.length > 12000)
      throw Error("EXAM_QUESTION_REQUIRED");
    if (!["mcq", "true_false", "text_fill", "writing"].includes(q.kind))
      throw Error("EXAM_TYPE_REQUIRED");
    if (
      q.kind === "mcq" &&
      (q.options.length < 2 ||
        q.options.length > 8 ||
        q.options.some((o) => !o.text?.trim()) ||
        new Set(q.options.map((o) => o.text.trim())).size !==
          q.options.length ||
        !q.options.some((o) => o.id === q.correctAnswer))
    )
      throw Error("EXAM_ANSWER_REQUIRED");
    if (q.kind === "true_false" && !["true", "false"].includes(q.correctAnswer))
      throw Error("EXAM_ANSWER_REQUIRED");
    if (q.kind === "text_fill" && !q.correctAnswer?.trim())
      throw Error("EXAM_ANSWER_REQUIRED");
    if (q.needsReview?.length && !q.reviewed)
      throw Error("EXAM_REVIEW_REQUIRED");
  }
  return draft;
}
export function examCommitPayload(draft) {
  validateExamPreview(draft);
  return {
    request_id: draft.requestId,
    lesson_id: draft.lessonId,
    title: draft.title.trim(),
    filename: draft.filename,
    file_sha256: draft.fileHash,
    source_kind: draft.sourceKind || "document",
    contexts: draft.contexts.map((c) => ({
      key: c.localId,
      title: c.title,
      text: c.text,
    })),
    instructions: draft.instructions,
    questions: draft.questions.map((q) => ({
      item_id: q.localId,
      kind: q.kind,
      prompt: q.prompt,
      options: q.kind === "mcq" ? q.options : [],
      answer_key:
        q.kind === "mcq"
          ? { value: q.correctAnswer }
          : q.kind === "true_false"
            ? { value: q.correctAnswer === "true" }
            : q.kind === "text_fill"
              ? { accepted: q.correctAnswer.split("\n").filter(Boolean) }
              : null,
      explanation:
        q.kind === "writing" && q.correctAnswer
          ? "Đáp án mẫu: " + q.correctAnswer
          : "",
      context_key: q.contextId,
      source_item_id: "question:" + q.localId,
    })),
  };
}
