// Local synthetic transport/fake microphone. Never evidence of hosted learner E2E.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { syntheticWave } from "../server/recording-audio.mjs";
await fs.mkdir("test-results/hskk", { recursive: true });
const microphoneFixture = path.resolve(
  "test-results/hskk/microphone-fixture.wav",
);
await fs.writeFile(microphoneFixture, syntheticWave(10));
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=" + microphoneFixture,
  ],
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const audio = syntheticWave(0.15).toString("base64"),
  evidence = [];
try {
  // Real page bootstrap and authenticated production adapter, with local-only
  // mocked provider/API responses. Missing public auth configuration must fail.
  const entryContext = await browser.newContext();
  const fixtureUser = {
    id: "00000000-0000-4000-8000-000000000099",
    email: "fixture@example.invalid",
    aud: "authenticated",
    role: "authenticated",
  };
  const fixtureToken =
    Buffer.from('{"alg":"HS256"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: fixtureUser.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".localfixture";
  await entryContext.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        "sb-dmeqxdznzobbarvkmxyg-auth-token",
        JSON.stringify({
          user,
          access_token: token,
          refresh_token: "localfixture",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
        }),
      ),
    { user: fixtureUser, token: fixtureToken },
  );
  await entryContext.route(
    "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          new URL(route.request().url()).pathname.includes("profiles")
            ? {
                user_id: fixtureUser.id,
                full_name: "Fixture",
                role: "STUDENT",
                status: "APPROVED",
              }
            : fixtureUser,
        ),
      }),
  );
  let catalogOpen = false;
  const entryCalls = [];
  await entryContext.route("**/api/hskk-session?**", (route) => {
    const action = new URL(route.request().url()).searchParams.get("action");
    assert.equal(
      route.request().headers().authorization,
      "Bearer " + fixtureToken,
    );
    entryCalls.push(action);
    return route.fulfill({
      status: action === "catalog" ? 200 : 403,
      contentType: "application/json",
      body: JSON.stringify(
        action === "catalog"
          ? catalogOpen
            ? [{ exam_code: "H71002" }]
            : []
          : { error: "EXAM_ACCESS_REQUIRED" },
      ),
    });
  });
  const entryPage = await entryContext.newPage();
  await entryPage.goto(base + "/hskk-de-thi.html?exam=H71002");
  await entryPage.waitForFunction(() =>
    document.querySelector('script[src^="data/supabase-public.js"]'),
  );
  await entryPage.waitForTimeout(500);
  assert.equal(
    await entryPage
      .getByRole("button", { name: "Bắt đầu thi thử", exact: true })
      .isEnabled(),
    false,
  );
  assert.ok(entryCalls.includes("catalog"));
  catalogOpen = true;
  await entryPage.reload();
  await entryPage
    .getByText("Đề đã được mở cho tài khoản của bạn.", { exact: false })
    .waitFor();
  assert.equal(
    await entryPage
      .getByRole("button", { name: "Bắt đầu thi thử", exact: true })
      .isEnabled(),
    true,
  );
  await entryPage
    .getByRole("button", { name: "Bắt đầu thi thử", exact: true })
    .click();
  await entryPage
    .getByText("Chưa mở được bài thi.", { exact: false })
    .waitFor();
  assert.ok(entryCalls.includes("load"));
  await entryContext.close();
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
        viewport: { width, height: 850 },
        permissions: ["microphone"],
      }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/hskk-de-thi.html?exam=H71002");
    await page.evaluate(async (audio) => {
      const { mountExamExperience } = await import(
          "/study/hskk-experience.mjs"
        ),
        { ExamSessionJournal } = await import(
          "/study/hskk-session-journal.mjs"
        );
      const id = "00000000-0000-4000-8000-000000000001",
        owner = "synthetic-browser-owner";
      const exam = {
        exam_code: "SYNTHETIC_DELIVERY",
        exam_version: 1,
        title: "HSKK kiểm thử tại máy",
        level: "elementary",
        source_type: "official",
        delivery_mode: "private_clips",
        timing: { countdown_seconds: 0.1 },
        sections: [
          { id: "one", title_vi: "Phần kiểm thử", preparation_seconds: 0 },
        ],
        questions: Array.from({ length: 27 }, (_, n) => ({
          id: "q" + (n + 1),
          version: 1,
          version_id:
            "00000000-0000-4000-8000-" + String(n + 1).padStart(12, "0"),
          number: n + 1,
          section_id: "one",
          type: "speaking_repeat",
          prompt: "",
          prompt_mode: "audio",
          prompt_audio: { duration_ms: 150 },
          response_seconds: 0.25,
          auto_start: true,
          auto_stop: true,
          allow_replay: false,
          allow_rerecord: false,
          allow_navigation: false,
        })),
      };
      let session = {
        attempt_id: id,
        candidate_id: owner,
        exam_code: exam.exam_code,
        exam_version: 1,
        state: "CREATED",
        server_time: Date.now() + 900000,
        server_started_at: null,
        server_deadline: null,
        question_versions: Object.fromEntries(
          exam.questions.map((q) => [q.id, 1]),
        ),
        question_version_ids: Object.fromEntries(
          exam.questions.map((q) => [q.id, q.version_id]),
        ),
      };
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      const stored = new Map();
      window.deliveryEvidence = { saved: 0, submissions: 0, replays: 0 };
      const transport = {
        production: true,
        loadSession: async () => ({
          ...session,
          server_time: Date.now() + 900000,
        }),
        refreshSession: async () => ({
          ...session,
          server_time: Date.now() + 900000,
        }),
        transition: async (_, state) => {
          session.state = state;
          session.server_time = Date.now() + 900000;
          if (state === "COUNTDOWN") {
            session.server_started_at = session.server_time;
            session.server_deadline = session.server_time + 10900;
          }
          return { ...session };
        },
        prompt: async () => new Blob([bytes], { type: "audio/wav" }),
        saveRecording: async (entry) => {
          if (
            !entry.blob.size ||
            entry.ownerId !== owner ||
            entry.attemptId !== id
          )
            throw Error("Wrong identity");
          await new Promise((r) => setTimeout(r, 500));
          if (
            stored.has(entry.questionId) &&
            stored.get(entry.questionId) !== entry.requestId
          )
            throw Error("Duplicate");
          stored.set(entry.questionId, entry.requestId);
          window.deliveryEvidence.saved = stored.size;
          return {
            owner_id: owner,
            attempt_id: id,
            question_version_id: entry.questionId,
            confirmed: true,
          };
        },
        submit: async () => {
          if (stored.size !== 27) throw Error("Incomplete");
          window.deliveryEvidence.submissions++;
          session.state = "SUBMITTED";
          return { ...session, server_time: Date.now() + 900000 };
        },
        result: async () => ({ source: "official" }),
      };
      window.deliveryDispose = await mountExamExperience(
        document.querySelector("#hskkContent"),
        {
          exam,
          candidate: {
            id: owner,
            name: "Học viên kiểm thử",
            email: "synthetic@example.invalid",
          },
          transport,
          journal: new ExamSessionJournal(owner, id),
        },
      );
    }, audio);
    await page
      .getByRole("button", { name: "Xác nhận thông tin", exact: true })
      .click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    assert.equal(
      await page
        .getByRole("heading", { name: "Kiểm tra thiết bị", exact: true })
        .count(),
      1,
    );
    await page.getByLabel("Tôi nghe rõ âm thanh").check();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page
      .getByRole("button", { name: "Cho phép microphone", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu ghi thử", exact: true })
      .click();
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: "Dừng ghi thử", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Microphone hoạt động — Tiếp tục",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Tôi đã sẵn sàng", exact: true })
      .click();
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    try {
      await page
        .getByText("Đã nộp bài", { exact: true })
        .waitFor({ timeout: 30000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        evidence: window.deliveryEvidence,
        state: document.querySelector("#hskkContent")?.dataset.state,
        question: document.querySelector("#hskkContent")?.dataset.question,
        text: document.querySelector("#hskkContent")?.innerText,
      }));
      await fs.mkdir("test-results/hskk", { recursive: true });
      await page.screenshot({
        path: `test-results/hskk/delivery-failed-${width}.png`,
        fullPage: true,
      });
      console.error(JSON.stringify({ width, ...diagnostic, errors }));
      throw error;
    }
    await page.getByText("Chưa công bố kết quả.", { exact: true }).waitFor();
    const result = await page.evaluate(() => ({
      evidence: window.deliveryEvidence,
      audioControls: document.querySelectorAll(
        "audio[controls],video[controls]",
      ).length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    assert.equal(result.evidence.saved, 27);
    assert.equal(result.evidence.submissions, 1);
    assert.equal(result.audioControls, 0);
    assert.equal(result.overflow, false);
    assert.deepEqual(errors, []);
    await fs.mkdir("test-results/hskk", { recursive: true });
    await page.screenshot({
      path: `test-results/hskk/delivery-${width}.png`,
      fullPage: true,
    });
    evidence.push({
      width,
      ...result,
      scope:
        "LOCAL SYNTHETIC, actual renderer/MediaRecorder/IndexedDB; not hosted E2E",
    });
    await context.close();
  }
  await fs.writeFile(
    "test-results/hskk/delivery-browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      pass: true,
      widths: evidence.map((e) => e.width),
      recordings: 27,
      autoSubmitted: true,
      hosted: false,
    }),
  );
} finally {
  await browser.close();
}
