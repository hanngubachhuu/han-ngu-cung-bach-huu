import test from "node:test";
import assert from "node:assert/strict";
import {
  importedExam,
  examValidation,
  ExamEditSession,
  safeMedia,
  mergeExamCatalog,
} from "../study/admin-exam-core.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import {
  syntheticDocx,
  syntheticPdf,
  tenQuestions,
} from "./helpers/exam-fixtures.mjs";
test("published registry state survives merging an unchanged authoring draft", () => {
  const saved = {
    id: "H71002",
    title: "Tên đề đã lưu",
    active: true,
    revision: 4,
    updated_at: "2026-10-02T12:44:15Z",
    question_count: 27,
  };
  const source = {
    id: "H71002",
    title: "Tên nguồn",
    active: false,
    updated_at: "2026-10-02T07:23:54Z",
    source_review: true,
    audio_source_name: "H71002.mp3",
    audio: { total: 27, confirmed: 27, needs_review: 0 },
  };
  const [exam] = mergeExamCatalog([saved], [source]);
  assert.equal(exam.active, true);
  assert.equal(exam.title, saved.title);
  assert.equal(exam.updated_at, saved.updated_at);
  assert.equal(exam.revision, 4);
  assert.equal(exam.source_review, true);
  assert.deepEqual(exam.audio, source.audio);
  assert.equal(saved.audio, undefined);
  assert.equal(source.active, false);
  assert.deepEqual(mergeExamCatalog([], [source]), [source]);
  assert.deepEqual(mergeExamCatalog([saved], []), [saved]);
});

test("PDF and Word create real exams independently of any lesson selection", async () => {
  for (const [bytes, filename] of [
    [syntheticPdf([tenQuestions()]), "exam.pdf"],
    [await syntheticDocx(tenQuestions()), "exam.docx"],
  ]) {
    const model = importedExam(await parseExamFile(bytes, filename), {
      type: "HSK",
      level: "1",
      title: "Đề mới",
      filename,
      sha256: "a".repeat(64),
    });
    assert.equal(model.questions.length, 10);
    assert.equal(model.questions[0].answer_key.value, "A");
    assert.deepEqual(examValidation(model), []);
    assert.equal(model.lesson_id, undefined);
    assert.equal(model.revision, 0);
  }
});
test("question edits and ordering survive navigation and uncertain publication retries preserve exact identity", () => {
  const model = {
    id: "sample",
    type: "HSK",
    level: "1",
    title: "Đề",
    revision: 4,
    questions: [
      {
        id: "a",
        question_key: "a",
        kind: "mcq",
        prompt: "你好",
        options: [
          { id: "A", text: "你好" },
          { id: "B", text: "再见" },
        ],
        answer_key: { value: "A" },
      },
      {
        id: "b",
        question_key: "b",
        kind: "text_fill",
        prompt: "请回答",
        options: [],
        answer_key: { accepted: ["好"] },
      },
    ],
  };
  const editor = new ExamEditSession(model);
  editor.model.questions[0].prompt = "修改";
  editor.move(1);
  assert.equal(editor.model.questions[1].prompt, "修改");
  const request = editor.publication();
  assert.equal(editor.publication(), request);
  assert.equal(request.expected_revision, 4);
  assert.equal(model.questions[0].prompt, "你好");
  editor.published({ revision: 5 });
  assert.equal(editor.model.revision, 5);
  assert.equal(editor.pending, null);
});
test("publish validation rejects ambiguity, missing answer and unsafe media in normal question terms", () => {
  const q = {
    question_key: "one",
    kind: "mcq",
    prompt: "你好吗",
    options: [
      { id: "A", text: "好" },
      { id: "B", text: "好" },
    ],
    answer_key: { value: "Z" },
    audio: "javascript:alert(1)",
  };
  const issues = examValidation({
    title: "题",
    type: "HSK",
    level: "1",
    questions: [q],
  });
  assert.ok(issues.some((s) => s.includes("Câu 1: kiểm tra lựa chọn")));
  assert.ok(issues.some((s) => s.includes("đường dẫn")));
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.invalid/a",
    "blob:private",
    "file:///private",
  ])
    assert.equal(safeMedia(url), false);
  assert.equal(safeMedia("https://example.invalid/audio.mp3"), true);
});
