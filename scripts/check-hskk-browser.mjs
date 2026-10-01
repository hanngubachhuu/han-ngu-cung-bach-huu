// Local browser evidence only: real MediaRecorder, fake device and provider/session responses.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const raw = syntheticWave(9),
  mp3 = (await normalizeRecording(raw, audioHash(raw))).bytes;
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
await fs.mkdir("test-results/hskk", { recursive: true });
const fixture = {
  exam_code: "CONFIG_B",
  title: "Thi thử HSKK",
  level: "advanced",
  exam_version: 2,
  source_type: "mock",
  audio: { url: "/test-audio.mp3", duration_seconds: 9 },
  timing: { countdown_seconds: 0.2 },
  sections: [
    { id: "one", title_vi: "Đọc câu", preparation_seconds: 0 },
    { id: "two", title_vi: "Trả lời", preparation_seconds: 0.3 },
  ],
  questions: [
    {
      id: "a",
      version_id: "pa",
      number: 1,
      version: 1,
      section_id: "one",
      type: "speaking_repeat",
      prompt: "你好。",
      prompt_mode: "audio",
      audio_segment: { start_seconds: 0, end_seconds: 0.3, verified: true },
      response_seconds: 0.6,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
    },
    {
      id: "b",
      version_id: "pb",
      number: 2,
      version: 1,
      section_id: "two",
      type: "speaking_long_answer",
      prompt: "请介绍你的学校。",
      pinyin: null,
      prompt_mode: "text",
      response_seconds: 0.8,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
    },
  ],
};
const evidence = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      permissions: ["microphone"],
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "hskk.html",
      "hskk-so-cap.html",
      "hskk-trung-cap.html",
      "hskk-cao-cap.html",
      "hskk-de-thi.html?exam=H71002",
    ]) {
      await page.goto(base + "/" + route);
      await page.locator("#hskkContent h1").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `test-results/hskk/${route.split(".")[0]}-${width}.png`,
        fullPage: true,
      });
    }
    assert.equal(
      await page.locator("button:disabled").textContent(),
      "Bắt đầu thi thử",
    );
    assert.equal(
      (await page.request.get(base + "/server/hskk/H71002.mp3")).status(),
      404,
    );
    assert.equal(
      (await page.request.get(base + "/media/hskk/H71002.mp3")).status(),
      404,
    );
    await context.route("**/test-audio.mp3", (route) =>
      route.fulfill({ contentType: "audio/mpeg", body: mp3 }),
    );
    await context.route("**/local-engine-check", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/study/study.css"><link rel="stylesheet" href="/study/account.css"><link rel="stylesheet" href="/study/hskk.css"><body class="study-page"><main class="hskk-main"><section id="check"></section></main><script type="module">import {mountExamExperience} from '/study/hskk-experience.mjs';import {previewTransport} from '/study/hskk-preview-transport.mjs';const exam=${JSON.stringify(fixture)};const transport=previewTransport(exam,'local-preview');globalThis.captureBytes=[];const original=transport.saveRecording;transport.saveRecording=entry=>{globalThis.captureBytes.push({bytes:entry.blob.size,type:entry.blob.type,question:entry.questionId});return original(entry);};globalThis.dispose=await mountExamExperience(document.querySelector('#check'),{exam,candidate:{id:'local-preview',name:'Xem trước',email:'local@example.invalid'},transport,preview:true});</script></body></html>`,
      }),
    );
    await page.goto(base + "/local-engine-check");
    await page
      .getByRole("button", { name: "Xác nhận thông tin", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Phát âm kiểm tra tai nghe", exact: true })
      .click();
    assert.equal(await page.locator("[data-body] audio").count(), 0);
    await page.locator("[data-heard]").check();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("button", { name: "Cho phép microphone" }).click();
    await page.getByRole("button", { name: "Bắt đầu ghi thử" }).click();
    await page.waitForTimeout(400);
    await page
      .getByRole("button", { name: /Dừng (và nghe lại|ghi thử)/ })
      .click();
    if (await page.locator("[data-replay] audio").count()) {
      await page.locator("[data-replay] audio").evaluate((a) => a.play());
      await page.getByText("Đã nghe lại bản ghi.", { exact: false }).waitFor();
    } else assert.equal(await page.locator("[data-body] audio").count(), 0);
    await page
      .getByRole("button", {
        name: /Tôi nghe rõ bản ghi — Tiếp tục|Microphone hoạt động — Tiếp tục/,
      })
      .click();
    await page.getByRole("button", { name: "Tôi đã sẵn sàng" }).click();
    await page.screenshot({
      path: `test-results/hskk/pre-exam-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await page
      .getByText("Bài thi thử đã hoàn thành.", { exact: true })
      .waitFor({ timeout: 15000 });
    const captured = await page.evaluate(() => globalThis.captureBytes);
    assert.equal(captured.length, 2);
    assert.ok(
      captured.every((r) => r.bytes > 0 && r.type.startsWith("audio/")),
    );
    assert.deepEqual(
      captured.map((r) => r.question),
      ["pa", "pb"],
    );
    assert.equal(
      await page.getByRole("button", { name: "Kết thúc xem trước" }).count(),
      1,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `test-results/hskk/completion-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Kết thúc xem trước" }).click();
    await page.getByText("Đã kết thúc xem trước.", { exact: false }).waitFor();
    await page.evaluate(() => globalThis.dispose());
    const adminId = "00000000-0000-4000-8000-000000000001",
      adminUser = {
        id: adminId,
        aud: "authenticated",
        role: "authenticated",
        email: "admin-local@example.invalid",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
    const jwt =
      Buffer.from('{"alg":"HS256"}').toString("base64url") +
      "." +
      Buffer.from(
        JSON.stringify({
          sub: adminId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url") +
      ".local";
    await context.addInitScript(
      ({ jwt, adminUser }) => {
        localStorage.setItem(
          "sb-dmeqxdznzobbarvkmxyg-auth-token",
          JSON.stringify({
            access_token: jwt,
            refresh_token: "local-test",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user: adminUser,
          }),
        );
      },
      { jwt, adminUser },
    );
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      (route) => {
        const url = new URL(route.request().url());
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            url.pathname.endsWith("/user")
              ? adminUser
              : url.pathname.endsWith("/profiles")
                ? {
                    user_id: adminId,
                    full_name: "Admin cục bộ",
                    role: "ADMIN",
                    status: "APPROVED",
                  }
                : url.pathname.endsWith("/admin_exam_command")
                  ? route.request().postDataJSON().command === "summary"
                    ? { active: 0 }
                    : route.request().postDataJSON().command === "get"
                      ? { exam: null }
                      : []
                  : [],
          ),
        });
      },
    );
    let revision = 0,
      saveCalls = 0,
      segmentCalls = 0;
    const adminDraft = {
      ...structuredClone(fixture),
      status: "draft",
      rubric: null,
      provenance: {
        document: "test-source.pdf",
        audio: "test-source.mp3",
        source_version: "test-config-2",
        sha256: { "test-source.mp3": "a".repeat(64) },
      },
      database_revision: revision,
      draft_storage_available: true,
    };
    adminDraft.audio.source_audio_id = "a".repeat(64);
    adminDraft.questions.forEach((q) => {
      q.audio_segment = null;
    });
    await context.route("**/api/hskk-exams*", (route) => {
      const url = new URL(route.request().url()),
        action = url.searchParams.get("action");
      if (action === "catalog")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: adminDraft.exam_code,
              code: adminDraft.exam_code,
              title: adminDraft.title,
              type: "HSKK",
              level: adminDraft.level,
              question_count: 2,
              source_review: true,
              active: false,
            },
          ]),
        });
      if (action === "waveform")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ step_ms: 100, peaks: Array(100).fill(0.4) }),
        });
      if (action === "audio")
        return route.fulfill({ contentType: "audio/mpeg", body: mp3 });
      if (action === "segment") {
        segmentCalls++;
        if (segmentCalls === 1)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":"AUDIO_RUNTIME_UNAVAILABLE"}',
          });
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            run_id: "local-" + segmentCalls,
            exam_code: adminDraft.exam_code,
            exam_version: adminDraft.exam_version,
            source_audio_hash: adminDraft.audio.source_audio_id,
            source_sha256: adminDraft.audio.source_audio_id,
            matched: 2,
            non_questions: [
              {
                start_ms: 10,
                end_ms: 90,
                segment_type: "UNKNOWN",
                run_id: "local-" + segmentCalls,
              },
            ],
            questions: adminDraft.questions.map((q) => ({
              question_id: q.id,
              run_id: "local-" + segmentCalls,
              start_ms: 100,
              end_ms: 700,
              confidence: 0.72,
              detection_method: "structural_timing",
              status: "NEEDS_REVIEW",
              match_kind:
                q.id === "b" ? "unverified_cue" : "unverified_speech_region",
            })),
          }),
        });
      }
      if (action === "save") {
        const body = route.request().postDataJSON();
        assert.equal(body.configuration.audio.url, "");
        assert.equal(body.expected_revision, revision);
        revision++;
        saveCalls++;
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ revision, configuration: body.configuration }),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...adminDraft, database_revision: revision }),
      });
    });
    await page.goto(base + "/hskk-quan-tri.html?exam=CONFIG_B");
    await page
      .getByRole("heading", { name: "CONFIG_B", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/quan-tri.html");
    await page.locator('[data-editor-tab="segments"]').click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page
      .getByRole("button", { name: "Tự phân đoạn audio", exact: true })
      .click();
    await page
      .getByText("Không thể tự phân đoạn audio.", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Tự phân đoạn audio", exact: true })
      .click();
    await page.getByText("Đã đề xuất 2/2", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Chỉnh thủ công", exact: true })
      .click();
    const qrow = page.locator('[data-q="a"]');
    const bounds = await qrow.locator("[data-editor]").boundingBox();
    await page.mouse.move(
      bounds.x + Math.max(2, (bounds.width * 0.1) / 3.7),
      bounds.y + 40,
    );
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + 40);
    await page.mouse.up();
    await qrow.locator("[data-from]").fill("-1");
    await qrow.locator("[data-to]").focus();
    await qrow.getByText("Thời gian không hợp lệ:", { exact: false }).waitFor();
    await qrow.locator("[data-from]").fill("1");
    await qrow.locator("[data-to]").fill("2");
    await qrow.getByRole("button", { name: "Nghe đoạn", exact: true }).click();
    await qrow
      .getByRole("button", { name: "Xác nhận đoạn", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await qrow
      .getByRole("button", { name: "Khôi phục đề xuất", exact: true })
      .click();
    assert.ok(
      (await qrow.locator("summary").textContent()).includes("Đã xác nhận"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await qrow
      .getByRole("button", { name: "Khôi phục đề xuất", exact: true })
      .click();
    assert.equal(
      await qrow.locator("[data-from]").inputValue(),
      "00:00:00.100",
    );
    await qrow.locator("[data-from]").fill("00:00:01.000");
    await qrow.locator("[data-to]").fill("00:00:02.000");
    await qrow
      .getByRole("button", { name: "Xác nhận & sang câu tiếp", exact: true })
      .click();
    await page
      .locator('[data-q="b"][open]')
      .waitFor({ timeout: 3000 })
      .catch(async (e) => {
        console.log(await page.locator("[data-segments]").innerText());
        throw e;
      });
    await page
      .getByText("Đoạn này chỉ là đề xuất vùng lời dẫn/chuyển tiếp.", {
        exact: false,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Kiểm tra audio", exact: true })
      .click();
    await page.getByText("Q2 chưa xác nhận", { exact: false }).waitFor();
    await page
      .getByText("Đoạn ngoài câu hỏi · cần nghe để phân loại", { exact: true })
      .click();
    await page.locator("[data-nfrom]").fill("00:00:00.010");
    await page.locator("[data-nto]").fill("00:00:00.080");
    await page.getByLabel("Loại đoạn ngoài câu hỏi").selectOption("INTRO");
    await page
      .getByRole("button", { name: "Lưu phân loại và ranh giới", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tự phân đoạn lại", exact: true })
      .click();
    await page.getByText("Đã đề xuất 2/2", { exact: false }).waitFor();
    await page
      .getByText("Đã tự động lưu kiểm tra audio.", { exact: false })
      .waitFor();
    assert.ok(saveCalls >= 1);
    assert.equal(
      await page
        .getByRole("button", { name: "LƯU & XUẤT BẢN", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: `test-results/hskk/admin-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      captured,
      scope: "local preview, fake microphone, no official submission",
    });
    await context.close();
  }
  await fs.writeFile(
    "test-results/hskk/browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      pass: true,
      widths: evidence.map((e) => e.width),
      actualMediaRecorder: true,
      hostedRLS: false,
      officialSubmission: false,
    }),
  );
} finally {
  await browser.close();
}
