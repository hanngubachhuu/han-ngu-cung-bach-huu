// Product UI integration: real browser MediaRecorder and SDK, synthetic provider responses.
// This is local UI evidence. Hosted JWT/RLS verification is a separate checkpoint.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
const sample = syntheticWave();
const mp3 = (await normalizeRecording(sample, audioHash(sample))).bytes;
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
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
await fs.mkdir("test-results", { recursive: true });
const evidence = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      permissions: ["microphone"],
    });
    const page = await context.newPage();
    const errors = [],
      calls = [],
      reservations = new Map(),
      objects = new Set();
    page.on("pageerror", (e) => errors.push(e.message));
    const uid = "00000000-0000-4000-8000-000000000002";
    const user = {
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const jwt =
      Buffer.from('{"alg":"HS256"}').toString("base64url") +
      "." +
      Buffer.from(
        JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url") +
      ".test";
    let admin = false,
      work,
      grade;
    const questions = ["请读：你好。", "请介绍一下你的老师。"].map(
      (prompt, i) => ({
        id: "question-" + i,
        question_key: "internal-key-" + i,
        kind: "speaking",
        version: 1,
        prompt,
        options: [],
        max_score: 10,
      }),
    );
    function view() {
      const d = structuredClone(work);
      d.server_time = new Date().toISOString();
      if (admin) {
        d.grading = structuredClone(grade);
        d.answers.forEach(
          (a) => (a.private_question = { answer_key: null, explanation: "" }),
        );
      }
      return d;
    }
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      async (route) => {
        const url = new URL(route.request().url()),
          p = url.pathname;
        const send = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (p.endsWith("/token"))
          return send({
            access_token: jwt,
            refresh_token: "test",
            expires_in: 3600,
            token_type: "bearer",
            user,
          });
        if (p.endsWith("/user")) return send(user);
        if (p.endsWith("/profiles") && url.searchParams.has("role"))
          return send([]);
        if (p.endsWith("/profiles"))
          return send({
            user_id: uid,
            email: user.email,
            full_name: "Mai Anh",
            role: admin ? "ADMIN" : "STUDENT",
            status: "APPROVED",
            version: 1,
          });
        if (
          p.includes("/storage/v1/object/") &&
          route.request().method() === "POST"
        ) {
          const body = route.request().postDataBuffer();
          assert(body?.length > 0, "Browser must upload real audio bytes");
          objects.add(p.split("speaking-private/")[1]);
          return send({ Key: p });
        }
        if (
          p.includes("/storage/v1/object/") &&
          route.request().method() === "GET"
        )
          return route.fulfill({
            status: 200,
            contentType: "audio/mpeg",
            body: mp3,
          });
        if (p.endsWith("/recording_command")) {
          const { command, payload } = route.request().postDataJSON();
          calls.push({ command: "recording:" + command, payload });
          if (command === "reserve") {
            assert.equal(payload.attempt_id, work.attempt_id);
            assert(questions.some((q) => q.id === payload.question_version_id));
            assert.match(payload.sha256, /^[0-9a-f]{64}$/);
            if (!reservations.has(payload.request_id))
              reservations.set(payload.request_id, {
                id: "recording-" + reservations.size,
                bucket: "speaking-private",
                path:
                  uid +
                  "/" +
                  payload.attempt_id +
                  "/" +
                  payload.question_version_id +
                  "/" +
                  payload.request_id +
                  ".webm",
                raw_uploaded_at: null,
              });
            return send(reservations.get(payload.request_id));
          }
          if (command === "confirm") {
            const r = [...reservations.values()].find(
              (r) => r.id === payload.recording_id,
            );
            assert(r && objects.has(r.path), "Confirm follows Storage upload");
            r.raw_uploaded_at = new Date().toISOString();
            return send(r);
          }
          if (command === "get")
            return send({
              playback_path: "normalized/" + payload.recording_id + ".mp3",
              expires_at: null,
              cleanup_status: "pending",
            });
        }
        if (
          p.endsWith("/assignment_command") ||
          p.endsWith("/assignment_authoring")
        ) {
          const { command, payload } = route.request().postDataJSON();
          calls.push({ command, payload });
          if (command === "catalog")
            return send([
              {
                id: "lesson",
                title_vi: "HSKK · Bài luyện nói",
                course_title: "HSKK sơ cấp",
              },
            ]);
          if (command === "mine" || command === "queue")
            return send(
              work
                ? [
                    {
                      id: work.attempt_id,
                      title_vi: work.title,
                      course_title: "HSKK sơ cấp",
                      full_name: "Mai Anh",
                      state: work.state,
                      started_at: work.started_at,
                      published_revision: work.result?.revision,
                    },
                  ]
                : [],
            );
          if (command === "start") {
            work = {
              attempt_id: "private-attempt",
              lesson_id: "lesson",
              title: "HSKK · Chào hỏi và giới thiệu",
              state: "draft",
              revision: 0,
              started_at: new Date().toISOString(),
              deadline_at: null,
              result: null,
              answers: questions.map((question, i) => ({
                question,
                position: i + 1,
                answer: null,
              })),
            };
            return send(view());
          }
          if (command === "get") return send(view());
          if (command === "save") {
            assert.equal(payload.revision, work.revision);
            for (const [id, value] of Object.entries(payload.answers)) {
              const q = work.answers.find((a) => a.question.id === id);
              assert(q);
              q.answer = value;
            }
            work.revision++;
            return send(view());
          }
          if (command === "submit") {
            assert.equal(payload.revision, work.revision);
            assert(work.answers.every((a) => a.answer?.recording_id));
            work.state = "submitted";
            work.submitted_at = new Date().toISOString();
            grade = {
              state: "draft",
              revision: 1,
              edit_version: 0,
              preview_version: null,
              grades: questions.map((q) => ({
                question_version_id: q.id,
                score: null,
                feedback: "",
                rubric: null,
              })),
            };
            return send(view());
          }
          if (command === "grade") {
            assert(admin);
            assert.equal(payload.edit_version, grade.edit_version);
            Object.assign(
              grade.grades.find(
                (g) => g.question_version_id === payload.question_version_id,
              ),
              { score: payload.score, feedback: payload.feedback },
            );
            grade.edit_version++;
            return send(view());
          }
          if (command === "grade_preview") {
            grade.preview_version = grade.edit_version;
            return send({
              ...view(),
              preview: {
                normalized_score: 90,
                raw_score: 18,
                raw_max_score: 20,
              },
            });
          }
          if (command === "grade_publish") {
            assert(admin);
            assert.equal(grade.preview_version, grade.edit_version);
            grade.state = "published";
            work.result = {
              normalized_score: 90,
              raw_score: 18,
              raw_max_score: 20,
              revision: 1,
              published_at: new Date().toISOString(),
              questions: grade.grades,
            };
            return send(view());
          }
          if (command === "bank")
            return send({
              questions: [],
              rubrics: [],
              definitions: [],
              settings: null,
            });
          return send([]);
        }
        if (p.includes("/rest/v1/")) return send([]);
        return send({});
      },
    );
    await context.route("**/api/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"configured":false,"connected":false}',
      }),
    );
    async function screenshot(name) {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        name + " overflow",
      );
      const visible = await page
        .locator("[data-assignments],[data-assignment-admin]")
        .innerText();
      assert.doesNotMatch(
        visible,
        /synthetic|fixture|UUID|JWT|RLS|Storage|private-attempt|internal-key|recording-\d/i,
      );
      await page.screenshot({
        path: `test-results/assignment-ui-${name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto(base + "/tai-khoan.html");
    await page.locator("#authEmail").fill(user.email);
    await page.locator("#authPassword").fill("synthetic password phrase");
    await page.locator("#authSubmit").click();
    await page.locator("[data-start]").waitFor();
    await page.goto(base + "/speaking-browser-student.html");
    await page.locator("[data-start]").click();
    await screenshot("student-idle");
    assert.equal(await page.locator("button.primary:visible").count(), 1);
    for (let i = 0; i < 2; i++) {
      const current = page.locator(`[data-question-page="${i}"]`);
      await current.locator("[data-record]").click();
      await current.locator("[data-stop]").waitFor({ state: "visible" });
      await page.locator("[data-question-next]").click();
      assert.equal(
        await current.isVisible(),
        true,
        "Navigation cannot abandon an active recording",
      );
      await page.waitForTimeout(1200);
      await current.locator("[data-stop]").click();
      await current.locator('[data-state="saved"]').waitFor();
      await current.locator("[data-replay]").click();
      await page.waitForFunction((index) => {
        const a = document.querySelector(
          `[data-question-page="${index}"] audio`,
        );
        return a.readyState >= 2 && !a.paused;
      }, i);
      await screenshot("student-saved-" + (i + 1));
      await page.locator("[data-question-next]").click();
    }
    await page
      .getByText("Bạn đã hoàn thành 2 / 2 câu.", { exact: true })
      .waitFor();
    await page.locator('[data-review-question="0"]').click();
    await page.locator("[data-question-next]").click();
    await page.locator("[data-question-next]").click();
    await screenshot("student-review");
    await page.locator("[data-confirm-submit]").click();
    await page.keyboard.press("Escape");
    assert.equal(calls.filter((c) => c.command === "submit").length, 0);
    await page.locator("[data-confirm-submit]").click();
    await page.locator("dialog button[value=confirm]").click();
    await page
      .getByText("✓ Đã nộp bài thành công.", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByText("Tổng điểm:", { exact: false }).count(),
      0,
    );
    assert.equal(
      calls.filter((c) => c.command === "recording:reserve").length,
      2,
    );
    assert.equal(
      calls.filter((c) => c.command === "recording:confirm").length,
      2,
    );
    assert.equal(objects.size, 2);
    admin = true;
    await page.goto(base + "/quan-tri.html");
    await page
      .getByText("Bài nộp, chấm điểm và đề HSK / HSKK", { exact: true })
      .click();
    await screenshot("admin-queue");
    await page.locator("[data-search]").fill("không có");
    assert.equal(await page.locator("[data-attempt]").count(), 0);
    await page.locator("[data-search]").fill("Mai Anh");
    await page.locator("[data-attempt]").click();
    await page.locator("[data-play]").first().click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-recording-playback] audio")?.readyState >=
        2,
    );
    const duration = await page
      .locator("[data-recording-playback] audio")
      .first()
      .evaluate((a) => a.duration);
    assert(duration > 0 && Number.isFinite(duration));
    await page.locator("[data-score]").nth(0).fill("9");
    await page.locator("[data-score]").nth(1).fill("9");
    await page
      .locator("[data-feedback]")
      .nth(0)
      .fill("Phát âm rõ. Tiếp tục luyện thanh điệu nhé.");
    await page.getByRole("button", { name: "Lưu điểm", exact: true }).click();
    await page
      .getByText("Đã lưu. Học viên chưa thấy bản chấm này.", { exact: true })
      .waitFor();
    await screenshot("admin-scoring");
    await page.locator("button[data-preview]").click();
    await page.locator("[data-publish]").click();
    await page.locator("dialog button[value=cancel]").click();
    assert.equal(calls.filter((c) => c.command === "grade_publish").length, 0);
    await page.locator("[data-publish]").click();
    await page.locator("dialog button[value=confirm]").click();
    await page.locator("[data-regrade]").waitFor();
    admin = false;
    await page.goto(base + "/speaking-browser-student.html");
    await page.locator("[data-open]").click();
    await page.getByText("Tổng điểm: 90/100", { exact: true }).waitFor();
    await screenshot("student-result");
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      student: "passed",
      realRecorderBytes: "passed",
      uploadConfirmBinding: "passed",
      replay: "passed",
      navigation: "passed",
      reviewConfirmation: "passed",
      unpublishedResultHidden: "passed",
      adminPlayback: "passed",
      gradingPublish: "passed",
      keyboardEscape: "passed",
      overflow: false,
      provider: "synthetic-local",
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  "test-results/assignment-ui-browser.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
