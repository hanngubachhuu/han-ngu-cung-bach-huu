import test from "node:test";
import assert from "node:assert/strict";
import {
  syntheticPdf,
  syntheticDocx,
  tenQuestions,
} from "./helpers/exam-fixtures.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import {
  extractExamQuestions,
  validateExamPreview,
  examCommitPayload,
} from "../study/exam-extraction.mjs";
test("real PDF extraction: ten Chinese/pinyin/Vietnamese MCQs and final answer key", async () => {
  const parsed = await parseExamFile(
    syntheticPdf([tenQuestions()]),
    "fixture.pdf",
  );
  const extracted = extractExamQuestions(parsed);
  assert.equal(extracted.questions.length, 10);
  assert.equal(extracted.questions[0].prompt, "你好 nǐ hǎo — Chọn lời chào 1?");
  assert.equal(extracted.questions[9].correctAnswer, "A");
  assert.equal(extracted.questions[0].options[0].text, "你好");
});
test("real DOCX extraction: ten MCQs and preserved multilingual content", async () => {
  const parsed = await parseExamFile(
    await syntheticDocx(tenQuestions()),
    "fixture.docx",
  );
  const result = extractExamQuestions(parsed);
  assert.equal(result.questions.length, 10);
  assert.equal(result.questions[0].prompt, "你好 nǐ hǎo — Chọn lời chào 1?");
  assert.equal(result.questions[0].correctAnswer, "A");
});
test("missing key is never invented; preview requires explicit review and answer", async () => {
  const parsed = await parseExamFile(
    await syntheticDocx(tenQuestions(false)),
    "fixture.docx",
  );
  const result = extractExamQuestions(parsed);
  assert.equal(result.questions[0].correctAnswer, "");
  assert(result.questions[0].needsReview.length);
  assert.throws(
    () => validateExamPreview({ ...result, title: "Draft" }),
    /EXAM_ANSWER_REQUIRED/,
  );
});
test("multi-page PDF headers/page numbers do not become questions", async () => {
  const lines = tenQuestions();
  const parsed = await parseExamFile(
    syntheticPdf([
      ["Synthetic HSK", ...lines.slice(0, 25), "Trang 1 / 2"],
      ["Synthetic HSK", ...lines.slice(25), "Trang 2 / 2"],
    ]),
    "multi.pdf",
  );
  const result = extractExamQuestions(parsed);
  assert.equal(result.questions.length, 10);
  assert.equal(parsed.pages.length, 2);
  assert.equal(result.questions[9].correctAnswer, "A");
});
test("scan PDF is reported; unsupported, corrupt and oversized files are rejected", async () => {
  await assert.rejects(
    parseExamFile(syntheticPdf([[]]), "scan.pdf"),
    /DOCUMENT_SCAN_UNSUPPORTED/,
  );
  await assert.rejects(
    parseExamFile(Buffer.from("%PDF-broken"), "broken.pdf"),
    /DOCUMENT_UNREADABLE/,
  );
  await assert.rejects(
    parseExamFile(Buffer.from("arbitrary"), "x.docx"),
    /DOCUMENT_UNSUPPORTED/,
  );
  await assert.rejects(
    parseExamFile(Buffer.alloc(3 * 1024 * 1024 + 1), "big.pdf"),
    /DOCUMENT_TOO_LARGE/,
  );
});
test("shared passage remains separate and both questions reference it", () => {
  const result = extractExamQuestions({
    pages: [
      {
        number: 1,
        text: "Đoạn văn: 小王每天七点起床。\n21. 他几点起床？\nA. 七点\nB. 八点\n22. 谁七点起床？\nA. 小王\nB. 小李\nĐáp án:\n21.A\n22.A",
      },
    ],
    warnings: [],
  });
  assert.equal(result.contexts.length, 1);
  assert.equal(result.questions[0].contextId, result.questions[1].contextId);
  assert(!result.questions[0].prompt.includes("小王每天"));
  assert.equal(result.questions[0].correctAnswer, "A");
});
test("duplicate number or conflicting key requires review rather than guessing", () => {
  const result = extractExamQuestions({
    pages: [
      {
        number: 1,
        text: "1. 一？\nA. 一\nB. 二\n1. 二？\nA. 二\nB. 一\nĐáp án:\n1.A\n1.B",
      },
    ],
    warnings: [],
  });
  assert(
    result.questions.every(
      (q) => q.correctAnswer === "" && q.needsReview.length,
    ),
  );
});
test("reviewed edits, removal and order map into existing versioned import schema", () => {
  const result = extractExamQuestions({
    pages: [{ number: 1, text: tenQuestions().join("\n") }],
    warnings: [],
  });
  result.questions[0].prompt = "Admin edited";
  result.questions.splice(1, 1);
  result.questions.reverse();
  const payload = examCommitPayload({
    ...result,
    title: "Đề thử",
    filename: "fixture.pdf",
    fileHash: "a".repeat(64),
    requestId: crypto.randomUUID(),
    lessonId: "lesson",
  });
  assert.equal(payload.questions.length, 9);
  assert.equal(payload.questions.at(-1).prompt, "Admin edited");
  assert.deepEqual(payload.questions[0].answer_key, { value: "A" });
});
test("inline choices and explicit fill/writing keys preserve supplied text", () => {
  const result = extractExamQuestions({
    pages: [
      {
        number: 1,
        text: "1. 你是哪国人？ A. 中国 B. 越南\n2. Điền từ: 我是____人。\n3. 请写一句话。\nĐáp án:\n1.B\n2. 越南\n3. 我是越南人。",
      },
    ],
    warnings: [],
  });
  assert.deepEqual(
    result.questions.map((q) => q.kind),
    ["mcq", "text_fill", "writing"],
  );
  assert.deepEqual(
    result.questions.map((q) => q.correctAnswer),
    ["B", "越南", "我是越南人。"],
  );
  assert.equal(result.questions[0].prompt, "你是哪国人？");
});
test("repeated choices at page edges are not mistaken for headers", () => {
  const result = extractExamQuestions({
    pages: [
      { number: 1, text: "Header\n1. 一？\nA. 一\nB. 二" },
      { number: 2, text: "Header\n2. 二？\nA. 一\nB. 二\nĐáp án:\n1.A 2.B" },
    ],
    warnings: [],
  });
  assert.deepEqual(
    result.questions.map((q) => q.options.length),
    [2, 2],
  );
});
