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
const context = await browser.newContext(),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await fs.mkdir("test-results", { recursive: true });
const uid = "00000000-0000-4000-8000-000000000002";
let profile = {
    user_id: uid,
    email: "test@example.invalid",
    full_name: "Học viên thử nghiệm",
    phone: "",
    learning_goal: "",
    role: "STUDENT",
    status: "PENDING",
    version: 1,
  },
  rejectLogin = false,
  unconfirmedLogin = false,
  resendRequests = 0;
const managed = {
    ...profile,
    user_id: "00000000-0000-4000-8000-000000000003",
    full_name: "Học viên được quản lý",
  },
  actions = [];
let enrolled = false,
  granted = false;
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: { role: "ADMIN" },
  created_at: new Date().toISOString(),
};
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: uid,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url") +
  ".test";
await context.route(
  "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
  async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname;
    const fulfill = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (p.endsWith("/token"))
      return unconfirmedLogin
        ? fulfill(
            {
              code: "email_not_confirmed",
              error_code: "email_not_confirmed",
              msg: "Email not confirmed",
            },
            400,
          )
        : rejectLogin
          ? fulfill(
              {
                code: "invalid_credentials",
                error_code: "invalid_credentials",
                msg: "Invalid login",
              },
              400,
            )
          : fulfill({
              access_token: jwt,
              refresh_token: "test-refresh",
              expires_in: 3600,
              token_type: "bearer",
              user,
            });
    if (p.endsWith("/signup"))
      return fulfill({ id: uid, identities: [], user });
    if (p.endsWith("/resend")) {
      resendRequests++;
      assert.equal(route.request().postDataJSON().type, "signup");
      return fulfill({});
    }
    if (
      p.endsWith("/recover") ||
      p.endsWith("/resend") ||
      p.endsWith("/logout")
    )
      return fulfill({});
    if (p.endsWith("/user")) return fulfill(user);
    if (p.endsWith("/profiles"))
      return url.searchParams.get("role")
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "content-range": "0-0/1" },
            body: JSON.stringify([managed]),
          })
        : fulfill(profile);
    if (p.endsWith("/account_admin_action")) {
      const body = route.request().postDataJSON();
      actions.push(body);
      if (["APPROVED", "REJECTED", "SUSPENDED"].includes(body.action))
        managed.status = body.action;
      if (body.action === "course") enrolled = body.enabled;
      if (body.action === "lesson") granted = body.enabled;
      return fulfill(null);
    }
    if (p.endsWith("/courses"))
      return fulfill([{ id: "hsk1", level: 1, title: "HSK 1" }]);
    if (p.endsWith("/enrollments"))
      return fulfill(
        enrolled
          ? [{ course_id: "hsk1", active: true, access_mode: "SELECTED" }]
          : [],
      );
    if (p.endsWith("/student_lesson_access"))
      return fulfill(granted ? [{ lesson_id: "hsk1_bai4", active: true }] : []);
    if (p.endsWith("/account_save_profile")) {
      const body = route.request().postDataJSON();
      assert.equal(
        body.owner_id,
        uid,
        "profile writes must pin the signed-in owner",
      );
      assert.equal(body.expected_version, profile.version);
      profile = {
        ...profile,
        full_name: body.display_name,
        phone: body.contact_phone,
        learning_goal: body.goal,
        version: profile.version + 1,
      };
      return fulfill(profile);
    }
    if (p.endsWith("/lesson_content"))
      return fulfill(
        profile.status === "APPROVED"
          ? [
              {
                id: "hsk1_bai4",
                level: 1,
                lesson_no: 4,
                title_vi: "Giáo viên tiếng Trung",
                title_zh: "他是我的汉语老师",
                course_id: "hsk1",
              },
            ]
          : [],
      );
    if (p.includes("/rest/v1/")) return fulfill([]);
    return fulfill({});
  },
);
let googleStatus = { configured: false, connected: false };
await context.route("**/api/account?**", (route) =>
  route.fulfill({
    status: googleStatus.error ? 503 : 200,
    contentType: "application/json",
    body: JSON.stringify(googleStatus),
  }),
);
try {
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(base + "/tai-khoan.html");
    await page.waitForSelector("#authEmail");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `overflow ${width}`,
    );
    await page
      .getByRole("button", { name: "Đăng ký học viên", exact: true })
      .click();
    assert.equal(await page.locator("#authName").isVisible(), true);
    assert.equal(await page.locator("#authApprovalNote").isVisible(), true);
    await page.screenshot({
      path: `test-results/account-register-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator("#authName").fill("Học viên thử nghiệm");
  await page.locator("#authEmail").fill("test@example.invalid");
  await page.locator("#authPassword").fill("a long phrase test");
  await page.locator("#authConfirm").fill("different phrase");
  await page.locator("#authSubmit").click();
  await page.getByText("Hai lần nhập mật khẩu chưa khớp.").waitFor();
  await page.locator("#authConfirm").fill("a long phrase test");
  await page.locator("#authSubmit").click();
  await page.getByText("Kiểm tra email xác nhận.", { exact: false }).waitFor();
  assert.equal(await page.locator("#authConfirmation").isVisible(), true);
  assert.equal(await page.locator("#authConfirmResend").isDisabled(), true);
  await page.reload();
  await page.waitForSelector("#authEmail");
  assert.equal(await page.locator("#authResend").isDisabled(), true);
  await page.evaluate(() =>
    sessionStorage.removeItem("hnh.auth.confirmationRetryAt"),
  );
  await page.reload();
  unconfirmedLogin = true;
  await page.locator("#authEmail").fill("test@example.invalid");
  await page.locator("#authPassword").fill("a long phrase test");
  await page.locator("#authSubmit").click();
  await page.locator("#authConfirmation").waitFor({ state: "visible" });
  await page.locator("#authConfirmResend").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#authConfirmResend")
      .textContent.includes("Gửi lại sau"),
  );
  assert.equal(resendRequests, 1);
  assert.equal(await page.locator("#authResend").isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await page.screenshot({
    path: "test-results/account-confirmation-mobile.png",
    fullPage: true,
  });
  await page.goto("about:blank");
  await page.goto(
    base +
      "/tai-khoan.html#error=access_denied&error_code=otp_expired&error_description=UNTRUSTED",
  );
  await page
    .getByText("Liên kết xác nhận không còn hợp lệ", { exact: false })
    .waitFor();
  assert.equal(await page.locator("#authConfirmation").isVisible(), true);
  assert.doesNotMatch(
    await page.locator("#authStatus").textContent(),
    /UNTRUSTED/,
  );
  await page.goto(
    base +
      "/tai-khoan.html?mode=reset#error=access_denied&error_code=otp_expired",
  );
  await page
    .getByText("Liên kết đặt lại mật khẩu không còn hợp lệ", { exact: false })
    .waitFor();
  assert.equal(await page.locator("#authConfirmation").isVisible(), false);
  unconfirmedLogin = false;
  await page.goto(base + "/tai-khoan.html");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator("#authEmail").fill("test@example.invalid");
  await page.getByRole("button", { name: "Quên mật khẩu?" }).click();
  await page.locator("#authSubmit").click();
  await page.getByText("Nếu email này đã đăng ký", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .first()
    .click();
  rejectLogin = true;
  await page.locator("#authPassword").fill("a long phrase test");
  await page.locator("#authSubmit").click();
  await page.getByText("Chưa đăng nhập được.", { exact: false }).waitFor();
  rejectLogin = false;
  await page.locator("#authSubmit").click();
  await page.getByText("Chờ duyệt", { exact: true }).waitFor();
  await page.waitForSelector("#accountDashboard:not([hidden])");
  assert.equal(
    await page.locator('a[href="quan-tri.html"]').count(),
    0,
    "client metadata cannot show admin",
  );
  await page
    .locator("#accountLessons")
    .getByText("Chưa có bài học được cấp.", { exact: false })
    .waitFor();
  profile = { ...profile, status: "APPROVED", version: 2 };
  await page.locator("#authRefresh").click();
  await page.locator("#accountLessons a").waitFor();
  assert.match(
    await page.locator("#accountLessons a").getAttribute("href"),
    /hsk1_bai4/,
  );
  await page
    .locator('#profileForm [name="learning_goal"]')
    .fill("Ôn HSK 1 mỗi ngày");
  await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).click();
  await page.locator("#profileStatus").filter({ hasText: "Đã lưu" }).waitFor();
  assert.equal(profile.learning_goal, "Ôn HSK 1 mỗi ngày");
  await page.screenshot({
    path: "test-results/account-dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/account-dashboard-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/quan-tri.html");
  await page
    .getByText("Khu vực này chỉ dành cho tài khoản quản trị.", { exact: false })
    .waitFor();
  assert.equal(await page.locator("#adminWorkspace").isVisible(), false);
  profile = { ...profile, role: "ADMIN", version: 3 };
  await page.reload();
  await page.locator('[data-admin-nav="students"]').click();
  await page.locator("[data-documents] > summary").click();
  await page
    .getByText("Chưa có kết nối Google hoạt động.", { exact: false })
    .waitFor();
  googleStatus = { error: "GOOGLE_AUTH_FAILED" };
  await page.getByRole("button", { name: "Kiểm tra lại kết nối" }).click();
  await page
    .getByText("Kết nối Google đã hết hạn hoặc bị thu hồi.", { exact: false })
    .waitFor();
  googleStatus = { configured: true, connected: true };
  await page.getByRole("button", { name: "Kiểm tra lại kết nối" }).click();
  await page
    .getByText("Đã xác minh kết nối với bachhuu1809@gmail.com.", {
      exact: false,
    })
    .waitFor();
  await page.locator("[data-owner-documents] [data-doc-create]").waitFor();
  await page.locator("[data-documents] > summary").click();
  googleStatus = { configured: false, connected: false };
  await page.locator("[data-student]").click();
  await page
    .getByText("Chưa kết nối Google Docs cho website.", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Duyệt / kích hoạt" }).click();
  await page
    .getByText("Đã cập nhật và ghi nhật ký.", { exact: true })
    .waitFor();
  await page.locator('[data-course="hsk1"]').check();
  await page.locator('[data-lesson="hsk1_bai4"]').waitFor();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/account_admin_action") &&
        r.request().postDataJSON()?.action === "lesson",
    ),
    page.locator('[data-lesson="hsk1_bai4"]').check(),
  ]);
  await page
    .getByText("Đã cập nhật và ghi nhật ký.", { exact: true })
    .waitFor();
  assert.ok(
    actions.some(
      (a) => a.action === "APPROVED" && a.target === managed.user_id,
    ),
  );
  assert.ok(actions.some((a) => a.action === "lesson" && a.enabled === true));
  await page.screenshot({
    path: "test-results/account-admin-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "admin mobile overflow",
  );
  await page.goto(base + "/tai-khoan.html");
  await page.locator("#authSignout").click();
  await page.locator("#authForm").waitFor({ state: "visible" });
  assert.equal(await page.locator("#accountDashboard").isVisible(), false);
  await page.goto(base + "/tai-khoan.html?mode=reset");
  assert.equal(
    await page.locator("#authSubmit").textContent(),
    "Gửi liên kết khôi phục",
  );
  await page.goto("about:blank");
  await page.goto(
    base +
      "/tai-khoan.html?mode=reset#access_token=" +
      jwt +
      "&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery",
  );
  await page
    .getByRole("button", { name: "Lưu mật khẩu mới", exact: true })
    .waitFor();
  await page.locator("#authPassword").fill("new secure phrase");
  await page.locator("#authConfirm").fill("new secure phrase");
  await page.locator("#authSubmit").click();
  await page.getByText("Đã đổi mật khẩu.", { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "test-results/account-browser.json",
    JSON.stringify(
      {
        status: "PASS",
        viewports: [375, 390, 768, 1024, 1440],
        scenarios: [
          "registration validation",
          "confirmation guidance",
          "password recovery request",
          "invalid login",
          "pending login",
          "approved lesson visibility",
          "metadata cannot grant admin",
          "admin denial",
          "approve and assign course/lesson",
          "Google unavailable guidance",
          "logout cleanup",
          "reset requires provider event",
          "recovery callback and password update",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: account browser flows and responsive layouts (isolated mocked provider; no real email sent).",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/account-failure.png",
    fullPage: true,
  });
  console.error(
    await page
      .locator("#authStatus")
      .textContent()
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
}
