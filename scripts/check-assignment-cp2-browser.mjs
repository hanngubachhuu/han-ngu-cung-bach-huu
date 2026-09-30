import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  syntheticPdf,
  syntheticDocx,
  tenQuestions,
} from "../tests/helpers/exam-fixtures.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
const sample = syntheticWave();
const syntheticMp3 = (
  await normalizeRecording(sample, audioHash(sample))
).bytes.toString("base64");
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
await fs.mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const evidence = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        permissions: ["microphone"],
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.exposeFunction("parseSyntheticDocument", async (name, bytes) => {
      const parsed = await parseExamFile(Buffer.from(bytes), name);
      return { ...parsed, sha256: "a".repeat(64) };
    });
    await page.goto(base + "/trang-chu.html");
    async function mount() {
      await page.evaluate(async () => {
        document.body.innerHTML =
          '<link rel="stylesheet" href="./study/study.css"><main class="account-shell"><section class="account-card account-form"><div id="exam"></div><div id="recorder"></div></section></main>';
        const { mountDocumentExamImport } = await import(
          "./study/exam-import-ui.mjs"
        );
        globalThis.imported = [];
        mountDocumentExamImport(document.querySelector("#exam"), {
          lessonId: "synthetic",
          ownerId: "synthetic-admin",
          readFile: async (file) =>
            globalThis.parseSyntheticDocument(file.name, [
              ...new Uint8Array(await file.arrayBuffer()),
            ]),
          commit: async (draft) => {
            globalThis.imported.push(structuredClone(draft));
            return {
              count: draft.questions.length,
              title: draft.title,
              definition_id: "synthetic-definition",
            };
          },
        });
      });
    }
    await mount();
    await page.locator("[data-file-mode]").click();
    await page.locator("[data-file]").setInputFiles({
      name: width === 768 ? "fixture.docx" : "fixture.pdf",
      mimeType:
        width === 768
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      buffer:
        width === 768
          ? await syntheticDocx(tenQuestions())
          : syntheticPdf([tenQuestions()]),
    });
    await page.locator("[data-analyze]").click();
    await page.locator("[data-import-question]").first().waitFor();
    assert.equal(await page.locator("[data-import-question]").count(), 10);
    await page
      .locator("[data-prompt]")
      .first()
      .fill("Câu được Admin sửa — 你好 nǐ hǎo");
    await page.locator("[data-remove]").nth(1).click();
    assert.equal(await page.locator("[data-import-question]").count(), 9);
    await page.locator("[data-down]").first().click();
    assert.equal(
      await page.locator("[data-prompt]").nth(1).inputValue(),
      "Câu được Admin sửa — 你好 nǐ hǎo",
    );
    await page.reload();
    await mount();
    assert.equal(await page.locator("[data-import-question]").count(), 9);
    assert.equal(
      await page.locator("[data-prompt]").nth(1).inputValue(),
      "Câu được Admin sửa — 你好 nǐ hǎo",
    );
    await page.locator("[data-add]").click();
    assert.equal(await page.locator("[data-import-question]").count(), 10);
    await page.locator("[data-prompt]").last().fill("Câu thêm thủ công");
    await page
      .locator("[data-import-question]")
      .last()
      .locator("[data-option]")
      .nth(0)
      .fill("Đúng");
    await page
      .locator("[data-import-question]")
      .last()
      .locator("[data-option]")
      .nth(1)
      .fill("Sai");
    await page.locator("[data-answer]").last().selectOption("A");
    assert.equal(
      await page
        .locator(
          "input[name=question_key],textarea[name=import_json],select[name=rubric_version_id]",
        )
        .count(),
      0,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false);
    await page.locator("[data-commit]").click();
    await page.locator("[data-open-exam]").waitFor();
    assert.equal(
      await page.evaluate(() => globalThis.imported[0].questions.length),
      10,
    );
    await page.evaluate(async () => {
      const { mountRecorder } = await import("./study/recording-ui.mjs");
      globalThis.answers = [];
      globalThis.uploads = [];
      globalThis.audioWidget = mountRecorder(
        document.querySelector("#recorder"),
        {
          attemptId: "synthetic-attempt",
          questionId: "synthetic-version",
          ownerId: "synthetic-student",
          upload: async (input) => {
            globalThis.uploads.push({
              attemptId: input.attemptId,
              questionId: input.questionId,
              size: input.blob.size,
              mime: input.blob.type,
            });
            return { recording_id: "synthetic-recording" };
          },
          onAnswer: async (value) => globalThis.answers.push(value),
          download: async () => ({
            blob: new Blob([], { type: "audio/mpeg" }),
            meta: {},
          }),
        },
      );
    });
    await page.locator("[data-record]").click();
    await page.locator("[data-stop]").waitFor({ state: "visible" });
    await page.waitForTimeout(1400);
    await page.locator("[data-stop]").click();
    await page.locator("[data-upload]").waitFor();
    await page.waitForFunction(
      () => !document.querySelector("[data-upload]").disabled,
    );
    assert.equal(await page.locator("[data-preview]").isVisible(), true);
    await page.locator("[data-upload]").click();
    await page.waitForFunction(() => globalThis.answers.length === 1);
    const upload = await page.evaluate(() => globalThis.uploads[0]);
    assert.equal(upload.attemptId, "synthetic-attempt");
    assert.equal(upload.questionId, "synthetic-version");
    assert(upload.size > 0);
    assert(upload.mime.startsWith("audio/"));
    await page.locator("[data-record]").click();
    await page.waitForTimeout(1200);
    await page.locator("[data-stop]").click();
    await page.waitForFunction(
      () => !document.querySelector("[data-upload]").disabled,
    );
    assert.equal(await page.evaluate(() => globalThis.audioWidget.busy), true);
    await page.screenshot({
      path: `test-results/cp2-import-${width}.png`,
      fullPage: true,
    });
    await page.evaluate(() => globalThis.audioWidget.dispose());
    await page.evaluate(async (mp3) => {
      const { mountRecorder } = await import("./study/recording-ui.mjs");
      globalThis.audioWidget = mountRecorder(
        document.querySelector("#recorder"),
        {
          locked: true,
          ownerId: "synthetic-admin",
          answer: { recording_id: "synthetic-recording" },
          download: async () => ({
            blob: new Blob(
              [Uint8Array.from(atob(mp3), (c) => c.charCodeAt(0))],
              { type: "audio/mpeg" },
            ),
            meta: {},
          }),
        },
      );
    }, syntheticMp3);
    assert.equal(await page.locator("[data-record]").count(), 0);
    await page.locator("[data-play]").click();
    await page.waitForFunction(
      () => document.querySelector("#recorder audio").readyState >= 2,
    );
    await page.evaluate(() => globalThis.audioWidget.dispose());
    await page.evaluate(async () => {
      const { mountRecorder } = await import("./study/recording-ui.mjs");
      globalThis.audioWidget = mountRecorder(
        document.querySelector("#recorder"),
        {
          media: {
            getUserMedia: async () => {
              throw new DOMException("denied", "NotAllowedError");
            },
          },
        },
      );
    });
    await page.locator("[data-record]").click();
    await page
      .getByText("Chưa được cấp quyền micro. Cho phép micro rồi thử lại.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator("[data-upload]").isDisabled(), true);
    await page.evaluate(async () => {
      globalThis.audioWidget.dispose();
      const { mountRecorder } = await import("./study/recording-ui.mjs");
      globalThis.audioWidget = mountRecorder(
        document.querySelector("#recorder"),
        { media: null, Recorder: null },
      );
    });
    await page.locator("[data-record]").click();
    await page
      .getByText(
        "Trình duyệt chưa hỗ trợ ghi âm. Dùng Chrome, Edge hoặc Safari mới qua HTTPS.",
        { exact: true },
      )
      .waitFor();
    await page.evaluate(() => globalThis.audioWidget.dispose());
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      document: "passed",
      draftReload: "passed",
      editRemoveReorderManual: "passed",
      recorder: "passed",
      lockedPlayback: "passed",
      microphoneDenial: "passed",
      unsupportedRecorder: "passed",
      overflow: false,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.mkdir("test-results", { recursive: true });
await fs.writeFile(
  "test-results/cp2-import-browser.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
