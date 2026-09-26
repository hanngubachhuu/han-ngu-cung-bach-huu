import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkLexicon } from "./check-study-lexicon.mjs";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    await fetch(base + "/tu-dien.html", { signal: AbortSignal.timeout(1000) });
    break;
  } catch (error) {
    if (attempt === 19) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  }),
  page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir(new URL("../test-results/", import.meta.url), {
  recursive: true,
});
const report = [];
const screenshot = async (name, fullPage = true) => {
  if (fullPage)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return page.screenshot({
    path: fileURLToPath(
      new URL("../test-results/" + name + ".png", import.meta.url),
    ),
    fullPage,
  });
};
try {
  if (process.env.STUDY_ACCESS_URL) {
    await page.goto(process.env.STUDY_ACCESS_URL);
    await page.waitForURL((url) => url.origin === new URL(base).origin);
  }
  const apiStatus = await context.request.get(
    base + "/api/study?action=status",
  );
  assert.equal(apiStatus.status(), 200);
  assert.equal((await apiStatus.json()).aiEnabled, false);
  for (const hiddenPath of [
    "/.env.local",
    "/.cache/study-seed.json",
    "/server/study-service.mjs",
  ]) {
    assert.ok(
      [403, 404].includes(
        (await context.request.get(base + hiddenPath)).status(),
      ),
      hiddenPath + " must not be served",
    );
  }
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["chu-han", "tu-dien", "doc-hieu"]) {
      await page.goto(base + "/" + route + ".html");
      await page.waitForSelector(
        route === "chu-han"
          ? "#characterGrid [data-char]"
          : route === "tu-dien"
            ? ".st-word-card"
            : "[data-sample]",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        route + " overflow at " + width,
      );
      report.push({ route, width, overflow: false });
    }
  }
  await page.goto(base + "/tu-dien.html");
  let finishAuth;
  const authPending = new Promise((resolve) => {
    finishAuth = resolve;
  });
  await page.route("**/auth/v1/token?**", async (route) => {
    await authPending;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error_code: "invalid_credentials",
        msg: "Test rejected sign-in",
      }),
    });
  });
  await page.locator("#accountButton").click();
  await page.locator("#authEmail").fill("browser-test@example.invalid");
  await page.locator("#authPassword").fill("test-only-password");
  await page.locator("#authForm button[type=submit]").click();
  assert.equal(
    await page.locator("#authForm button[type=submit]").isDisabled(),
    true,
  );
  finishAuth();
  await page.waitForFunction(() =>
    document
      .querySelector("#authStatus")
      .textContent.startsWith("Chưa đăng nhập"),
  );
  assert.equal(
    await page.locator("#authForm button[type=submit]").isDisabled(),
    false,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      !document.querySelector("#authDialog").open &&
      document.querySelector("#authPassword").value === "",
  );
  await page.unroute("**/auth/v1/token?**");
  for (const query of ["lvyou", "lǚyóu", "lu:3you2", "du lich"]) {
    await page.locator("#dictionarySearch").fill(query);
    await page.locator("#dictionaryForm").evaluate((f) => f.requestSubmit());
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#dictionaryResults")
          .hasAttribute("aria-busy") &&
        document
          .querySelector("#dictionaryCount")
          .textContent.endsWith("kết quả"),
    );
    assert.equal(
      await page.locator(".st-word-title .st-hanzi").first().innerText(),
      "旅游",
    );
  }
  await page.locator("[data-save]").first().click();
  await page.locator("#onlySavedWords").check();
  await page.waitForFunction(() =>
    document.querySelector("#savedWordsCount").textContent.startsWith("1 "),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("#savedWordsCount").textContent.startsWith("1 "),
  );
  await screenshot("dictionary-desktop");
  await page.goto(base + "/doc-hieu.html");
  await page.locator("[data-sample]").first().click();
  await page.waitForSelector("#quizForm");
  const sample = await page.evaluate(async () => {
    const c = await fetch("data/study/catalog.json").then((r) => r.json());
    return fetch("data/study/readings/" + c.readings[0].id + ".json").then(
      (r) => r.json(),
    );
  });
  for (let i = 0; i < sample.questions.length; i++)
    await page
      .locator(`input[name=q${i}][value='${sample.questions[i].correctIndex}']`)
      .check();
  await page.locator("#quizForm button[type=submit]").click();
  assert.match(await page.locator("#quizScore").innerText(), /3 \/ 3/);
  await page.locator("#saveReading").click();
  await page.locator("#newReading").click();
  await page.locator("[data-saved-reading]").first().click();
  await page.waitForSelector("#quizForm");
  assert.match(await page.locator("#quizScore").innerText(), /3 \/ 3/);
  await page.locator("#togglePinyin").click();
  await page.locator("[data-word]").first().click();
  assert.equal(await page.locator("#wordDialog").evaluate((d) => d.open), true);
  await page.keyboard.press("Escape");
  await screenshot("reading-desktop");
  await page.locator("#newReading").click();
  const source = "银行行长去重庆。\n\n我喜欢音乐。";
  await page.locator("#readingText").fill(source);
  await page.locator("#readingSubmit").click();
  await page.waitForSelector("#readingResult:not([hidden])");
  const restored = await page.locator("#readingProse").evaluate((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll("rt,.st-sentence-listen,.st-translation").forEach((e) =>
      e.remove(),
    );
    return c.textContent;
  });
  assert.equal(restored, source);
  assert.ok(
    (await page.locator("#readingProse rt").allTextContents())
      .join(" ")
      .includes("háng zhǎng"),
  );
  await page.goto(base + "/chu-han.html?char=旅");
  await page.locator("#saveCharacter").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#saveCharacter").getAttribute("aria-pressed") ===
      "true",
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector("#saveCharacter")?.getAttribute("aria-pressed") ===
      "true",
  );
  await page.locator("#backToCharacters").click();
  await page.locator('[data-level="saved"]').click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#characterGrid").hasAttribute("aria-busy") &&
      document.querySelectorAll("#characterGrid [data-char]").length === 1,
  );
  await page.locator('#characterGrid [data-char="旅"]').click();
  await page.locator("#copyCharacter").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#studyStatus").textContent ===
      "Đã sao chép chữ 旅.",
  );
  assert.ok((await page.locator("#characterDetail .st-example").count()) > 0);
  await screenshot("hanzi-desktop");
  await page.locator("#practiceCharacter").click();
  await page.waitForSelector("#hanziWriterTarget path", { state: "attached" });
  assert.ok((await page.locator("#hanziWriterTarget path").count()) > 0);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#hanziPracticeOverlay").count(), 0);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "practiceCharacter",
  );
  await page.setViewportSize({ width: 375, height: 850 });
  await page.locator("#practiceCharacter").click();
  await page.locator("[data-mode=quiz]").click();
  await page.waitForSelector("#hanziWriterTarget path", { state: "attached" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await screenshot("hanzi-mobile", false);
  await page.keyboard.press("Escape");
  await page.goto(base + "/chu-han.html");
  await page.locator(".st-ink-details summary").click();
  const canvas = page.locator("#characterInk canvas"),
    box = await canvas.boundingBox();
  for (const dy of [40, 80]) {
    await page.mouse.move(box.x + 40, box.y + dy);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + dy, { steps: 8 });
    await page.mouse.up();
  }
  assert.match(await page.locator("[data-ink-status]").innerText(), /^2 nét/);
  await page.locator("[data-undo]").click();
  assert.match(await page.locator("[data-ink-status]").innerText(), /^1 nét/);
  await page.locator("[data-clear]").click();
  assert.match(
    await page.locator("[data-ink-status]").innerText(),
    /^Viết một chữ/,
  );
  assert.equal(
    await canvas.evaluate((c) => getComputedStyle(c).touchAction),
    "none",
  );
  const lexicon = await checkLexicon(page, base, screenshot);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    new URL("../test-results/study-browser.json", import.meta.url),
    JSON.stringify(
      {
        passed: true,
        baseUrl: base,
        aiEnabled: false,
        privateAssetsBlocked: true,
        lexicon,
        viewports: report,
        flows: [
          "search variants",
          "notebook persistence",
          "quiz grading and restore",
          "inline dictionary",
          "text preservation",
          "context pinyin",
          "local stroke data",
          "keyboard close and focus",
          "canvas undo and clear",
          "pending sign-in remains disabled and clears password (mocked rejection)",
          "saved character persists and filters",
          "copy character and shared examples",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 12 responsive views, 12 study flows and 10 expanded lexicon flows; no browser errors.",
  );
} catch (error) {
  await fs.writeFile(
    new URL("../test-results/study-browser.json", import.meta.url),
    JSON.stringify(
      { passed: false, baseUrl: base, error: error.message, viewports: report },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
