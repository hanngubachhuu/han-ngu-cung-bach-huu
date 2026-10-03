// Isolated browser workflow evidence. Synthetic Auth/Storage responses are
// deliberately separate from the required hosted Admin/Student checkpoint.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syntheticDocx } from "../tests/helpers/exam-fixtures.mjs";
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
const uid = "00000000-0000-4000-8000-000000000001";
const user = {
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
const docx = await syntheticDocx([
  "第一部分",
  "第二部分",
  "第三部分",
  "4. 朗读这段文字。",
  "5. 请介绍你的家人。",
  "6. 你喜欢哪种运动？",
  "13. 请介绍你的朋友。",
  "14. 你喜欢哪个季节？",
  "26. 请介绍你的家人。",
  "27. 你喜欢猫还是狗？",
]);
const wave = syntheticWave(2),
  mp3 = (await normalizeRecording(wave, audioHash(wave))).bytes;
const image = await fs.readFile("server/hskk/assets/H80000-q11.jpg");
const picture = {
  page: 1,
  index: 0,
  bytes: image.toString("base64"),
  sha256: audioHash(image),
  byte_size: image.length,
};
const evidence = [];
await fs.mkdir("test-results/hskk-import", { recursive: true });
try {
  for (const [level, count, width, format] of [
    ["elementary", 27, 390, "mp3"],
    ["intermediate", 14, 768, "mp4"],
    ["advanced", 6, 1366, "mp3"],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage();
    const code = "NEW_" + level.toUpperCase();
    let source,
      working = null,
      revision = 0,
      reviewed = false,
      prepared = false,
      stages = 0,
      stored = 0,
      failFirst = true;
    const requests = [],
      assets = new Map(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
    const json = (route, body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      async (route) => {
        const url = new URL(route.request().url()),
          p = url.pathname;
        if (p.endsWith("/user")) return json(route, user);
        if (p.endsWith("/profiles"))
          return json(
            route,
            url.searchParams.get("role")
              ? []
              : {
                  user_id: uid,
                  full_name: "Local Admin",
                  role: "ADMIN",
                  status: "APPROVED",
                },
          );
        if (p.includes("/storage/v1/object/")) return json(route, { Key: p });
        if (p.endsWith("/hskk_publication"))
          return json(route, { ready: false });
        if (p.endsWith("/admin_exam_command")) {
          const { command, payload } = route.request().postDataJSON();
          requests.push(command);
          if (command === "list") return json(route, working ? [working] : []);
          if (command === "get") return json(route, { exam: working });
          if (command === "save_working") {
            working = {
              ...payload.exam,
              revision: payload.expected_revision + 1,
            };
            return json(route, { revision: working.revision });
          }
          return json(route, {});
        }
        if (p.endsWith("/hskk_delivery_admin")) {
          const { command } = route.request().postDataJSON();
          requests.push(command);
          if (command === "review_status") return json(route, { reviewed });
          if (command === "review_content") {
            reviewed = true;
            return json(route, { reviewed: true });
          }
        }
        return json(route, []);
      },
    );
    await context.route("**/api/exam-import", async (route) => {
      const payload = route.request().postDataJSON();
      assert.equal(payload.hskk_level, level);
      const parsed = await parseExamFile(
        Buffer.from(payload.bytes, "base64"),
        payload.filename,
        { hskkLevel: level },
      );
      parsed.sha256 = audioHash(Buffer.from(payload.bytes, "base64"));
      if (level === "intermediate")
        parsed.pictures = [picture, { ...picture, index: 1 }];
      return json(route, parsed);
    });
    await context.route("**/api/hskk-import*", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action"),
        body = route.request().postDataJSON();
      requests.push(action);
      if (action === "reserve") {
        const asset = {
          ...body,
          id: crypto.randomUUID(),
          bucket: "hskk-import-originals",
          path: code + "/" + body.sha256 + "." + body.kind,
        };
        assets.set(asset.id, asset);
        return json(route, asset);
      }
      if (action === "audio")
        return json(route, {
          asset_id: body.id,
          original_id: body.id,
          sha256: audioHash(mp3),
          byte_size: mp3.length,
          duration_seconds: 2,
          method:
            format === "mp4"
              ? "ffmpeg_extract_mp4_audio_128k"
              : "original_mp3_unchanged",
        });
      return json(route, { stored_hash_verified: true });
    });
    await context.route("**/api/hskk-exams*", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      requests.push(action || "source");
      if (action === "catalog")
        return json(
          route,
          source
            ? [
                {
                  id: code,
                  code,
                  type: "HSKK",
                  level,
                  title: code,
                  question_count: count,
                  source_review: true,
                  audio: { total: count, confirmed: 0, needs_review: count },
                },
              ]
            : [],
        );
      if (action === "register") {
        source = route.request().postDataJSON().configuration;
        assert.equal(source.exam_code, code);
        assert.equal(source.questions.length, count);
        assert.equal(Object.keys(source.provenance.original).length, 6);
        return json(route, { registered: true });
      }
      if (action === "audio")
        return route.fulfill({ contentType: "audio/mpeg", body: mp3 });
      if (action === "waveform")
        return json(route, { step_ms: 100, peaks: Array(20).fill(0.4) });
      if (action === "segment") {
        source.audio.segmentation_runs = [{ run_id: "synthetic" }];
        return json(route, source);
      }
      if (action === "finalize") return json(route, { ready: true });
      if (action === "stage_clip") {
        stages++;
        assert.equal(reviewed, true);
        if (failFirst) {
          failFirst = false;
          return json(route, { error: "SOURCE_UPLOAD_FAILED" }, 503);
        }
        revision++;
        return json(route, { staged: true });
      }
      if (!source) return json(route, { error: "EXAM_NOT_FOUND" }, 404);
      return json(route, {
        ...source,
        database_revision: revision,
        draft_storage_available: true,
      });
    });
    await context.route("**/api/hskk-delivery*", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      requests.push(action);
      if (action === "prepare") prepared = true;
      if (action === "store_clip") stored++;
      return json(route, {
        prepared,
        published: false,
        question_count: count,
        verified_clips: stored,
        controlled_students: 0,
      });
    });
    await page.goto(
      base + "/quan-tri.html?section=exams&type=HSKK&level=" + level,
    );
    await page.locator("[data-create-exam]").click();
    await page.locator('input[name="code"]').fill(code);
    await page.locator('input[name="file"]').setInputFiles({
      name: "exam.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    await page.locator('input[name="sourceAudio"]').setInputFiles({
      name: "source." + format,
      mimeType: format === "mp4" ? "video/mp4" : "audio/mpeg",
      buffer: mp3,
    });
    await page.locator('[data-create-form] button[type="submit"]').click();
    await page.locator("[data-question]").first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator("[data-question]").count(), count);
    assert.equal(await page.locator("[data-publish]").isDisabled(), true);
    assert.equal(source.audio.segmentation_runs.length, 1);
    assert.ok(source.questions.every((q) => !q.audio_segment?.verified));
    assert.equal(requests.filter((x) => x === "register").length, 1);
    assert.equal([...assets.values()].length, 2);
    await page.locator('[data-editor-tab="audio"]').click();
    const generate = page.getByRole("button", {
      name: "Tạo và lưu audio các câu đã xác nhận",
      exact: true,
    });
    await generate.click();
    await page
      .getByText(
        "Hãy đối chiếu và xác nhận nội dung, tranh và thời gian trước khi tạo audio câu.",
        { exact: true },
      )
      .waitFor();
    assert.equal(stages, 0);
    await page.locator("[data-content-review]").click();
    await page
      .getByText("Đã ghi nhận lần đối chiếu bằng tài khoản Admin của bạn.", {
        exact: true,
      })
      .waitFor();
    await generate.click();
    await page
      .getByText("Chưa hoàn tất audio câu.", { exact: false })
      .waitFor();
    await generate.click();
    await page
      .getByText(`${count} câu đã gắn phiên bản`, { exact: false })
      .waitFor();
    assert.equal(stored, count);
    assert.equal(stages, count + 1);
    assert.equal(requests.includes("publish"), false);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `test-results/hskk-import/${level}-${width}.png`,
      fullPage: true,
    });
    evidence.push({
      level,
      count,
      width,
      format,
      source: "SYNTHETIC_BROWSER",
      auto_confirmed: 0,
      review_gate: "PASS",
      partial_retry: "PASS",
      published: false,
    });
    await context.close();
  }
  console.log(JSON.stringify(evidence));
  await fs.writeFile(
    "test-results/hskk-import/browser.json",
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}
