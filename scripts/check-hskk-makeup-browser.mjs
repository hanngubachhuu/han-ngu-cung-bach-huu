// LOCAL mock Auth/API/Storage and fake microphone only. Not hosted E2E evidence.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { syntheticWave } from "../server/recording-audio.mjs";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
await fs.mkdir("test-results/hskk", { recursive: true });
const microphoneFixture = path.resolve(
  "test-results/hskk/makeup-microphone.wav",
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
const user = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "local@example.invalid",
  role: "authenticated",
  aud: "authenticated",
};
const token =
  Buffer.from('{"alg":"HS256"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".localfixture";
const attempt = "00000000-0000-4000-8000-000000000071",
  windowId = "00000000-0000-4000-8000-000000000072";
const questions = [26, 27].map((number) => ({
  id: "q" + number,
  version: 1,
  version_id: "00000000-0000-4000-8000-" + String(number).padStart(12, "0"),
  number,
  prompt: "请介绍你的学习。",
  prompt_mode: "text",
  response_seconds: 0.5,
}));
try {
  for (const width of [390, 768, 1366]) {
    const caseQuestions = structuredClone(questions);
    const code =
      width === 768 ? "H80000" : width === 1366 ? "H91002" : "H71002";
    let pictureCalls = 0;
    if (width === 768) {
      caseQuestions.forEach((q, i) => {
        q.number = 11 + i;
        q.prompt_mode = "image";
        q.prompt = "";
        q.prompt_image = { available: true };
      });
    }
    if (width === 1366) {
      caseQuestions[0].number = 1;
      caseQuestions[1].number = 5;
      caseQuestions[0].prompt_mode = "audio";
      caseQuestions[0].prompt = "";
      caseQuestions[0].prompt_audio = { duration_ms: 150 };
    }
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      permissions: ["microphone"],
    });
    await context.addInitScript(
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
      { user, token },
    );
    const saved = new Set(),
      reservations = new Map(),
      reserveCalls = [],
      uploadCalls = [],
      timing = {};
    let uploadFailure = false,
      submitted = 0;
    const json = (route, data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      async (route) => {
        const url = new URL(route.request().url()),
          p = route.request().postDataJSON?.bind(route.request());
        if (url.pathname.includes("/rpc/recording_command")) {
          const { command, payload } = p();
          if (command === "reserve") {
            reserveCalls.push(payload);
            assert.equal(payload.makeup_window_id, windowId);
            assert.ok(
              questions.some(
                (q) => q.version_id === payload.question_version_id,
              ),
            );
            assert.equal(payload.attempt_id, attempt);
            if (!reservations.has(payload.request_id))
              reservations.set(payload.request_id, {
                id: crypto.randomUUID(),
                path: payload.request_id + "/raw",
                bucket: "speaking-private",
                raw_uploaded_at: null,
              });
            return json(route, reservations.get(payload.request_id));
          }
          if (command === "confirm") {
            const r = [...reservations.values()].find(
              (r) => r.id === payload.recording_id,
            );
            r.raw_uploaded_at = new Date().toISOString();
            return json(route, { id: r.id });
          }
        }
        if (url.pathname.includes("/storage/v1/object/")) {
          uploadCalls.push({
            path: url.pathname,
            bytes: route.request().postDataBuffer()?.length || 0,
          });
          if (!uploadFailure) {
            uploadFailure = true;
            return json(
              route,
              {
                statusCode: "503",
                error: "Temporary",
                message: "local network failure",
              },
              503,
            );
          }
          return json(route, { Key: url.pathname, Id: crypto.randomUUID() });
        }
        return json(
          route,
          url.pathname.includes("profiles")
            ? {
                user_id: user.id,
                full_name: "Local fixture",
                role: "STUDENT",
                status: "APPROVED",
              }
            : user,
        );
      },
    );
    await context.route("**/api/hskk-session?**", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action"),
        p = route.request().postData()
          ? route.request().postDataJSON()
          : Object.fromEntries(new URL(route.request().url()).searchParams);
      if (action === "catalog") return json(route, []);
      if (action === "makeup_load")
        return json(route, {
          window_id: windowId,
          attempt_id: attempt,
          version_id: "local-pinned-version",
          expires_at: Date.now() + 3600000,
          server_time: Date.now(),
          submitted: !!submitted,
          expired: false,
          questions: caseQuestions,
          saved: [...saved],
          timing,
        });
      if (action === "makeup_start") {
        assert.ok(!saved.has(p.question_version_id));
        const audio =
          p.question_version_id === caseQuestions[0].version_id &&
          width === 1366;
        const t = {
          server_time: Date.now(),
          record_start: Date.now() + (audio ? 5150 : 200),
          record_end: Date.now() + (audio ? 5650 : 700),
        };
        timing[p.question_version_id] = t;
        return json(route, t);
      }
      if (action === "makeup_prompt") {
        assert.ok(timing[p.question_version_id]);
        return route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: syntheticWave(0.15),
        });
      }
      if (action === "makeup_picture") {
        assert.ok(timing[p.question_version_id]);
        pictureCalls++;
        return route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body: await fs.readFile("server/hskk/assets/H80000-q11.jpg"),
        });
      }
      if (action === "makeup_bind") {
        const entry = reserveCalls.find(
          (x) => reservations.get(x.request_id).id === p.recording_id,
        );
        assert.ok(entry);
        saved.add(entry.question_version_id);
        return json(route, { confirmed: true, recording_id: p.recording_id });
      }
      if (action === "makeup_submit") {
        assert.equal(saved.size, 2);
        submitted++;
        return json(route, { submitted: true, attempt_id: attempt });
      }
      throw Error("Unexpected local action " + action);
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      base +
        "/hskk-de-thi.html?exam=" +
        code +
        "&attempt=" +
        attempt +
        "&makeup=1",
    );
    await page.getByRole("heading", { name: code + " · Nộp bù" }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Câu 2", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Kiểm tra microphone" }).click();
    await page
      .getByRole("button", { name: "Microphone đã sẵn sàng" })
      .waitFor();
    for (const q of questions) {
      await page.locator('[data-question="' + q.version_id + '"]').click();
      await page
        .locator('[data-state="' + q.version_id + '"]')
        .filter({ hasText: "Đã nhận" })
        .waitFor({ timeout: 30000 });
      assert.equal(
        await page
          .locator('[data-question="' + q.version_id + '"]')
          .isEnabled(),
        false,
      );
    }
    await page.getByRole("button", { name: "Nộp bài sau khi bổ sung" }).click();
    await page
      .getByText("Đã nhận đủ bản ghi và nộp bài sau khi bổ sung.", {
        exact: false,
      })
      .waitFor();
    assert.equal(submitted, 1);
    assert.equal(reservations.size, 2);
    assert.equal(pictureCalls, width === 768 ? 2 : 0);
    assert.ok(uploadCalls.every((x) => x.bytes > 0));
    assert.ok(reserveCalls.length >= 3);
    assert.equal(
      new Set(
        reserveCalls
          .filter((x) => x.question_version_id === questions[0].version_id)
          .map((x) => x.request_id),
      ).size,
      1,
    );
    assert.deepEqual(errors, []);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/hskk/makeup-" + width + ".png",
      fullPage: true,
    });
    await context.close();
  }
  console.log(
    JSON.stringify({
      pass: true,
      widths: [390, 768, 1366],
      missingOnly: [26, 27],
      levels: 3,
      intermediatePrivatePictures: 2,
      realMediaRecorder: true,
      retryIdentity: true,
      hosted: false,
    }),
  );
} finally {
  await browser.close();
}
