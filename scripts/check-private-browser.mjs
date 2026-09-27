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
page.on("pageerror", (e) => errors.push(e.message));
const { payloads } = JSON.parse(
  await fs.readFile(".cache/private-publication.json", "utf8"),
);
const uid = "00000000-0000-4000-8000-000000000002";
const user = {
  id: uid,
  email: "test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".test";
let deny = false,
  attempts = 0;
// No fixture request reaches production Auth, database or storage.
await context.route(
  "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
  async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname;
    const fulfill = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (p.endsWith("/token"))
      return fulfill({
        access_token: jwt,
        refresh_token: "test",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    if (p.endsWith("/user")) return fulfill(user);
    if (p.endsWith("/profiles"))
      return fulfill({
        user_id: uid,
        full_name: "Test",
        role: "STUDENT",
        status: "APPROVED",
        version: 1,
      });
    if (p.endsWith("/account_save_attempt")) {
      assert.equal(
        route.request().postDataJSON().owner_id,
        uid,
        "queued attempts must retain their original account owner",
      );
      attempts++;
      return fulfill({ version: attempts });
    }
    if (p.endsWith("/lesson_content")) {
      const id = u.searchParams.get("id")?.replace(/^eq\./, "");
      return fulfill(deny ? null : payloads.find((x) => x.id === id) || null);
    }
    if (p.includes("/storage/"))
      return route.fulfill({
        status: 200,
        contentType: "audio/mpeg",
        body: Buffer.from([0, 0, 0, 0]),
      });
    return fulfill([]);
  },
);
try {
  await page.goto(base + "/hsk1_bai4_index.html");
  await page.getByText("Bạn chưa đăng nhập.", { exact: false }).waitFor();
  await page.goto(base + "/tai-khoan.html");
  await page.locator("#authEmail").fill(user.email);
  await page.locator("#authPassword").fill("test password phrase");
  await page.locator("#authSubmit").click();
  await page.locator("#authSignout").waitFor({ state: "visible" });
  for (const row of payloads) {
    const no = Number(row.id.match(/bai(\d+)/)[1]),
      file = row.id.startsWith("hsk1")
        ? `hsk1_bai${no}_index.html`
        : `bai${no}_index.html`;
    await page.goto(base + "/" + file, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".attempt-sync-status");
    await page.waitForSelector("#privateLessonGate", { state: "detached" });
    assert.equal(
      await page.evaluate(() => window.HNH_ACCOUNT_SCOPE),
      "::account:" + uid,
    );
    await page.locator("#btnStart").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          ".q-card,.question-card,#questionCard .q-body",
        ).length > 0,
    );
    assert.deepEqual(errors, [], file);
  }
  await page.evaluate(() =>
    window.HNH_ATTEMPTS.capture({
      attemptId: "browser-attempt",
      totalScore: 2,
      maxScore: 10,
    }),
  );
  await page
    .getByText("Kết quả tự luyện đã đồng bộ với tài khoản.", { exact: true })
    .waitFor();
  assert.equal(attempts, 1);
  deny = true;
  await page.goto(base + "/bai8_index.html");
  await page
    .getByText("Tài khoản này chưa được cấp quyền cho bài học.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.evaluate(() => !!window.HNH_PRIVATE_LEGACY), false);
  for (const path of [
    "data/lessons/hsk1/bai5.js",
    "data/lessons/hsk2/bai8.js",
    "data/lessons/hsk2/exercise-revision-v2.js",
    "audio/hsk1/bai5/dialog-1.mp3",
  ])
    assert.equal((await context.request.get(base + "/" + path)).status(), 404);
  await page.screenshot({
    path: "test-results/private-denied-mobile.png",
    fullPage: true,
  });
  await fs.writeFile(
    "test-results/private-browser.json",
    JSON.stringify(
      {
        status: "PASS",
        engines: payloads.length,
        guestDenial: true,
        revokedDenial: true,
        scoreSync: true,
        privateAssets404: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 23 authenticated lesson engines, guest/revoked denial, account-isolated storage, score sync and private-file exclusion.",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/private-failure.png",
    fullPage: true,
  });
  console.error(
    await page
      .locator("#privateLessonStatus")
      .textContent()
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
}
