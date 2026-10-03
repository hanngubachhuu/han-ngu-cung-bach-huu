// Central task workflows with real browser/parser and mocked account/API providers.
// Database authorization, atomicity and historic bindings are covered by PGlite tests.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  syntheticDocx,
  tenQuestions,
} from "../tests/helpers/exam-fixtures.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const original = JSON.parse(
  await fs.readFile("server/hskk/H71002.json", "utf8"),
);
const bytes = syntheticWave(9),
  mp3 = (await normalizeRecording(bytes, audioHash(bytes))).bytes;
const docx = await syntheticDocx(tenQuestions());
await fs.mkdir("test-results/admin", { recursive: true });
const evidence = [];
try {
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage(),
      errors = [],
      calls = [],
      models = new Map();
    let role = "ADMIN",
      loseResponse = false,
      sourceCalls = 0,
      hskkPublished = false,
      revision = 0;
    const uid = "00000000-0000-4000-8000-000000000001",
      user = {
        id: uid,
        aud: "authenticated",
        role: "authenticated",
        email: "local@example.invalid",
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
      ".local";
    await context.addInitScript(
      ({ jwt, user }) =>
        localStorage.setItem(
          "sb-dmeqxdznzobbarvkmxyg-auth-token",
          JSON.stringify({
            access_token: jwt,
            refresh_token: "local",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        ),
      { jwt, user },
    );
    const source = structuredClone(original);
    source.draft_storage_available = true;
    source.database_revision = 0;
    source.audio.proposals = source.questions.map((q, i) => ({
      question_id: q.id,
      run_id: "fixture",
      start_ms: 100 + i * 10000,
      end_ms: 700 + i * 10000,
      confidence: 0.7,
      status: "NEEDS_REVIEW",
      detection_method: "structural_timing",
    }));
    source.audio.segmentation_runs = [
      {
        run_id: "fixture",
        exam_code: source.exam_code,
        exam_version: source.exam_version,
        source_audio_hash: source.audio.source_audio_id,
        source_sha256: source.audio.source_audio_id,
        questions: source.audio.proposals,
        non_questions: [],
      },
    ];
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname;
        const fulfill = (body, status = 200, extra = {}) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
            ...extra,
          });
        if (path.endsWith("/user")) return fulfill(user);
        if (path.endsWith("/profiles"))
          return url.searchParams.get("role")
            ? fulfill([], 200, { headers: { "content-range": "0-0/0" } })
            : fulfill({
                user_id: uid,
                full_name: "Bách Hữu",
                role,
                status: "APPROVED",
              });
        if (path.endsWith("/admin_exam_command")) {
          const { command, payload } = route.request().postDataJSON();
          calls.push({ command, payload });
          if (role !== "ADMIN")
            return fulfill({ message: "ADMIN_REQUIRED" }, 403);
          if (command === "summary") return fulfill({ active: models.size });
          if (command === "list")
            return fulfill(
              [...models.values()].map((m) => ({
                ...m,
                question_count: m.questions.length,
                updated_at: new Date().toISOString(),
              })),
            );
          if (command === "get")
            return fulfill({ exam: models.get(payload.id) || null });
          if (command === "publish") {
            const previous = calls.filter(
              (c) =>
                c.command === "publish" &&
                c.payload.request_id === payload.request_id,
            );
            if (previous.length === 1)
              models.set(payload.exam.id, {
                ...payload.exam,
                active: true,
                revision: payload.expected_revision + 1,
              });
            if (loseResponse) {
              loseResponse = false;
              return route.abort("failed");
            }
            return fulfill({
              revision: models.get(payload.exam.id).revision,
              published: true,
              id: payload.exam.id,
            });
          }
          if (command === "save_working") {
            models.set(payload.exam.id, {
              ...payload.exam,
              revision: payload.expected_revision + 1,
            });
            return fulfill({ revision: payload.expected_revision + 1 });
          }
        }
        if (path.endsWith("/assignment_command")) return fulfill([]);
        if (path.endsWith("/hskk_publication"))
          return fulfill({ ready: false });
        return fulfill([]);
      },
    );
    await context.route("**/api/hskk-exams*", async (route) => {
      sourceCalls++;
      const action = new URL(route.request().url()).searchParams.get("action");
      const fulfill = (body) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (action === "catalog")
        return fulfill([
          {
            id: source.exam_code,
            code: source.exam_code,
            type: "HSKK",
            level: source.level,
            title: source.title,
            question_count: 27,
            active: false,
            source_review: true,
            audio_source_name: source.provenance.audio,
            audio: { total: 27, confirmed: 0, needs_review: 27 },
          },
        ]);
      if (action === "audio")
        return route.fulfill({ contentType: "audio/mpeg", body: mp3 });
      if (action === "waveform")
        return fulfill({ step_ms: 100, peaks: Array(11600).fill(0.4) });
      if (action === "save") {
        const payload = route.request().postDataJSON();
        assert.equal(payload.configuration.audio.url, "");
        revision++;
        return fulfill({ revision });
      }
      return fulfill({
        ...source,
        database_revision: revision,
        publish_readiness: {
          ready: false,
          reasons: ["Đề chưa được kết nối với phiên thi chính thức."],
        },
      });
    });
    await context.route("**/api/exam-import", async (route) => {
      const payload = route.request().postDataJSON();
      const data = await parseExamFile(
        Buffer.from(payload.bytes, "base64"),
        payload.filename,
      );
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await context.route("**/api/hskk-delivery*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          prepared: hskkPublished,
          published: hskkPublished,
          version_id: hskkPublished ? "published-fixture" : null,
          question_count: hskkPublished ? 27 : 0,
          verified_clips: hskkPublished ? 27 : 0,
          controlled_students: hskkPublished ? 1 : 0,
        }),
      }),
    );
    await page.goto(base + "/quan-tri.html");
    await page.locator("[data-admin-nav]").first().waitFor();
    assert.deepEqual(await page.locator("[data-admin-nav]").allTextContents(), [
      "Tổng quan",
      "Học viên",
      "Đề thi",
      "Bài nộp",
    ]);
    await page.locator('[data-admin-nav="exams"]').click();
    await page
      .getByText("Chưa có đề thi ở cấp độ này.", { exact: true })
      .waitFor();
    assert.equal(await page.locator("[data-edit-exam]").count(), 0);
    assert.equal(await page.locator("[data-level]").count(), 6);
    await page.locator('[data-exam-type="HSKK"]').click();
    assert.equal(await page.locator("[data-level]").count(), 3);
    await page.locator('[data-edit-exam="H71002"]').click();
    await page.locator("[data-question]").first().waitFor();
    assert.equal(new URL(page.url()).pathname, "/quan-tri.html");
    assert.equal(await page.locator("[data-question]").count(), 27);
    assert.ok(
      (await page.locator("[data-audio-status]").innerText()).includes("0/27"),
    );
    assert.equal(await page.locator("[data-publish]").isDisabled(), true);
    await page.locator('[data-question="4"]').click();
    await page.locator('[data-field="prompt"]').fill("Nội dung đang sửa");
    await page.locator('[data-editor-tab="segments"]').click();
    await page.locator('[data-q="q1"] > summary').click();
    const row = page.locator('[data-q="q1"]');
    await row.locator("[data-editor]").waitFor();
    assert.equal(await row.locator("[data-editor]").count(), 1);
    await row.locator("[data-from]").fill("00:00:01.000");
    await row.locator("[data-to]").fill("00:00:02.500");
    await row.locator("[data-next]").click();
    assert.equal(await row.locator("[data-error]").innerText(), "");
    await page.locator('[data-q="q2"][open]').waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-audio-status]")
        .textContent.includes("1/27"),
    );
    assert.equal(await page.locator("[data-publish]").isDisabled(), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/admin/audio-${width}.png`,
      fullPage: true,
    });
    await page.locator("[data-back-list]").click();
    await page.locator('[data-edit-exam="H71002"]').click();
    assert.equal(await page.locator('[data-q="q2"]').getAttribute("open"), "");
    await page.locator('[data-editor-tab="content"]').click();
    assert.equal(
      await page.locator('[data-field="prompt"]').inputValue(),
      "Nội dung đang sửa",
    );
    assert.equal(
      await page.locator('[data-question="4"]').getAttribute("aria-current"),
      "step",
    );
    await page.locator("[data-back-list]").click();
    await page.locator('[data-exam-type="HSK"]').click();
    await page.locator("[data-create-exam]").click();
    await page.locator('input[name="title"]').fill("HSK 1 · Đề thật");
    await page.locator('input[name="file"]').setInputFiles({
      name: "exam.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    await page.locator('[data-create-form] button[type="submit"]').click();
    await page
      .locator("[data-editors] > section:visible [data-question]")
      .first()
      .waitFor();
    const hsk = page.locator("[data-editors] > section:visible");
    assert.equal(await hsk.locator("[data-question]").count(), 10);
    await hsk.locator('[data-field="prompt"]').fill("你好 — Nội dung mới");
    await hsk.locator('[data-field="pinyin"]').fill("nǐ hǎo");
    await hsk.locator("[data-answer]").selectOption("");
    await hsk.locator("[data-publish]").click();
    assert.ok(
      (await hsk.locator("[data-feedback]").innerText()).includes("Câu 1"),
    );
    assert.equal(calls.filter((c) => c.command === "publish").length, 0);
    await hsk.locator("[data-answer]").selectOption("A");
    loseResponse = true;
    await hsk.locator("[data-publish]").click();
    await hsk
      .getByText("Chưa xác nhận được lần lưu.", { exact: false })
      .waitFor();
    await hsk.locator("[data-publish]").click();
    await hsk.getByText("Đã lưu và xuất bản.", { exact: false }).waitFor();
    const publications = calls.filter((c) => c.command === "publish");
    assert.equal(publications.length, 2);
    assert.deepEqual(publications[0].payload, publications[1].payload);
    await page.screenshot({
      path: `test-results/admin/editor-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `page overflow ${width}`,
    );
    assert.deepEqual(errors, []);
    // Publication changes the registry, while the source stays an authoring draft.
    hskkPublished = true;
    models.set("H71002", {
      id: "H71002",
      code: "H71002",
      type: "HSKK",
      level: "elementary",
      title: "H71002 đã xuất bản",
      active: true,
      revision: 4,
      questions: source.questions,
    });
    await page.goto(
      base + "/quan-tri.html?section=exams&type=HSKK&level=elementary",
    );
    await page.getByText("27 câu · Đang hoạt động", { exact: true }).waitFor();
    assert.equal(await page.getByText("27 câu · Chưa xuất bản").count(), 0);
    await page.locator('[data-edit-exam="H71002"]').click();
    await page
      .getByText("Đề đã xuất bản. Học viên được cấp quyền có thể bắt đầu.", {
        exact: false,
      })
      .waitFor();
    assert.equal(await page.locator("[data-publish]").isDisabled(), true);
    await page.locator('[data-editor-tab="audio"]').click();
    assert.ok(
      (await page.locator("[data-delivery-status]").innerText()).startsWith(
        "Đề đã xuất bản · 27 câu",
      ),
    );
    await page.locator('[data-editor-tab="content"]').click();
    // Exercise real wheel input after publication and editor navigation.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(width - 20, 750);
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => document.scrollingElement.scrollTop > 0);
    await page.locator("[data-title]").fill("Thay đổi chưa xuất bản");
    assert.ok(
      (await page.locator("[data-audio-status]").innerText()).includes(
        "Thay đổi đang sửa cần chuẩn bị và xuất bản lại",
      ),
    );
    assert.equal(await page.locator("[data-publish]").isDisabled(), true);
    assert.deepEqual(errors, []);
    role = "STUDENT";
    const before = sourceCalls;
    await page.goto(
      base +
        "/quan-tri.html?section=exams&type=HSKK&level=elementary&exam=H71002",
    );
    await page
      .getByText("Khu vực này chỉ dành cho tài khoản quản trị.", {
        exact: false,
      })
      .waitFor();
    assert.equal(await page.locator("#adminWorkspace").isVisible(), false);
    assert.equal(sourceCalls, before);
    evidence.push({
      width,
      centralAdmin: true,
      emptyHSK: true,
      createAndEdit: true,
      audioReview: true,
      retainedNavigation: true,
      idempotentPublish: true,
      publishedCatalogAndEditor: true,
      wheelAfterPublication: true,
      nonAdminDenied: true,
      overflow: false,
      provider: "mocked",
      databaseEvidence: "admin-exam-rls.test.mjs",
    });
    await context.close();
  }
  await fs.writeFile(
    "test-results/admin/browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: true,
      widths: evidence.map((e) => e.width),
      cases: evidence.length,
    }),
  );
} finally {
  await browser.close();
}
