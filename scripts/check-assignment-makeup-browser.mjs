// Local mocked Auth/API only. This regression is not hosted session evidence.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const uid = "00000000-0000-4000-8000-000000000002",
  attempt = "00000000-0000-4000-8000-000000000071",
  windowId = "00000000-0000-4000-8000-000000000072";
const user = {
  id: uid,
  email: "fixture@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token =
  Buffer.from('{"alg":"HS256"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".localfixture";
const qid = "00000000-0000-4000-8000-000000000026";
try {
  await fs.mkdir("test-results", { recursive: true });
  for (const width of [390, 768, 1366]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
    });
    const page = await context.newPage(),
      errors = [],
      calls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let saved = null,
      firstFailure = true,
      submitted = false,
      admin = false;
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
    await context.route(
      "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        const json = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/profiles"))
          return json({
            user_id: uid,
            email: user.email,
            full_name: "Local fixture",
            role: admin ? "ADMIN" : "STUDENT",
            status: "APPROVED",
          });
        if (path.endsWith("/user")) return json(user);
        if (path.endsWith("/assignment_makeup")) {
          const { command, payload } = route.request().postDataJSON();
          calls.push({ command, payload });
          if (command === "inspect")
            return json({
              attempt_id: attempt,
              version_id: "pinned",
              revision: 25,
              missing: [qid],
              missing_numbers: [26],
              can_open: true,
            });
          if (command === "open")
            return json({
              window_id: windowId,
              attempt_id: attempt,
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            });
          if (command === "load")
            return json({
              attempt_id: attempt,
              assignment_version_id: "pinned",
              window_id: windowId,
              title: "Bài bất kỳ",
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              server_time: new Date().toISOString(),
              submitted,
              expired: false,
              accepted_count: 25,
              answers: [
                {
                  position: 26,
                  answer: saved,
                  question: {
                    id: qid,
                    kind: "writing",
                    prompt: "请介绍你的学习。",
                    options: [],
                  },
                },
              ],
            });
          if (command === "save") {
            assert.equal(payload.window_id, windowId);
            assert.equal(payload.question_version_id, qid);
            if (firstFailure) {
              firstFailure = false;
              return json({ message: "local network failure" }, 503);
            }
            saved = payload.answer;
            return json({ saved: true });
          }
          if (command === "submit") {
            assert.equal(saved, "我每天学习汉语。");
            submitted = true;
            return json({ submitted: true });
          }
        }
        if (path.endsWith("/assignment_command")) return json([]);
        if (path.endsWith("/study_saved_library"))
          return json({ words: [], characters: [], readings: [] });
        return json([]);
      },
    );
    await page.goto(base + "/tai-khoan.html?makeup_attempt=" + attempt);
    await page.getByRole("heading", { name: "Bài bất kỳ · Nộp bù" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Nộp bài sau khi bổ sung" })
        .isEnabled(),
      false,
    );
    await page
      .locator("[data-makeup-question] textarea")
      .fill("我每天学习汉语。");
    const failedResponse = page.waitForResponse(
      (r) => r.url().endsWith("/assignment_makeup") && r.status() === 503,
    );
    await page.getByRole("button", { name: "Gửi câu bổ sung" }).click();
    await failedResponse;
    await page
      .getByText("Bản trả lời được giữ trên máy; đang chờ gửi lại", {
        exact: true,
      })
      .waitFor();
    await page.reload();
    await page.getByText("Đã được máy chủ nhận", { exact: true }).waitFor();
    assert.equal(calls.filter((c) => c.command === "save").length, 2);
    assert.deepEqual(
      calls.filter((c) => c.command === "save")[0].payload,
      calls.filter((c) => c.command === "save")[1].payload,
    );
    assert.equal(
      await page.locator("[data-makeup-question] textarea").isEnabled(),
      false,
    );
    await page.getByRole("button", { name: "Nộp bài sau khi bổ sung" }).click();
    await page
      .getByText(
        "Đã nộp bù thành công. Bài đang chờ Admin chấm và công bố kết quả.",
        { exact: true },
      )
      .waitFor();
    await page.reload();
    await page
      .getByText(
        "Đã nộp bù thành công. Bài đang chờ Admin chấm và công bố kết quả.",
        { exact: true },
      )
      .waitFor();
    assert.equal(calls.filter((c) => c.command === "submit").length, 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: `test-results/assignment-makeup-${width}.png`,
      fullPage: true,
    });
    // Reuse the actual Admin component with a local provider, never production data.
    admin = true;
    await page.goto(base + "/tai-khoan.html");
    await page.evaluate(
      async ({ attempt, uid }) => {
        const { mountAdminMakeup } = await import(
          "./study/assignment-makeup.mjs"
        );
        const root = document.createElement("section");
        document.querySelector("main").prepend(root);
        await mountAdminMakeup(root, { attemptId: attempt, ownerId: uid });
      },
      { attempt, uid },
    );
    await page.getByRole("button", { name: "Mở nộp bù câu chưa nhận" }).click();
    await page
      .getByText(
        "Đã mở nộp bù riêng các câu còn thiếu. Học viên dùng liên kết bên dưới.",
        { exact: true },
      )
      .waitFor();
    assert.match(
      await page.locator("input[readonly]").inputValue(),
      /makeup_attempt=/,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Assignment makeup browser PASS: missing-only recovery, same-request reload/retry, immutable accepted response, single submission and Admin opening at 390/768/1366px. Local mock only.",
  );
} finally {
  await browser.close();
}
