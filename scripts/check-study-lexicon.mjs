import assert from "node:assert/strict";

export async function checkLexicon(page, base, screenshot) {
  const started = Date.now();
  await page.goto(base + "/tu-dien.html?word=學校");
  const settled = async () =>
    page.waitForFunction(
      () =>
        !document
          .querySelector("#dictionaryResults")
          .hasAttribute("aria-busy") && document.querySelector(".st-word-card"),
    );
  await settled();
  const firstLookupMs = Date.now() - started;
  const search = async (query) => {
    await page.locator("#dictionarySearch").fill(query);
    await page.locator("#dictionaryForm").evaluate((f) => f.requestSubmit());
    await settled();
  };
  assert.equal(
    await page.locator(".st-word-title .st-hanzi").first().innerText(),
    "学校",
  );
  assert.match(
    await page.locator(".st-word-card").first().innerText(),
    /trường học/,
  );
  assert.match(
    await page.locator("#dictionaryCoverage").innerText(),
    /119.044/,
  );
  assert.equal(
    await page
      .locator(".st-word-card")
      .first()
      .locator('a[href*="hanzii.net/search/word/"]')
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(".st-word-card")
      .first()
      .locator('a[href*="hvdic.thivien.net/whv/"]')
      .count(),
    1,
  );
  for (const query of ["xue2xiao4", "truong hoc"]) {
    await search(query);
    assert.equal(
      await page.locator(".st-word-title .st-hanzi").first().innerText(),
      "学校",
    );
  }
  await search("人工智能");
  assert.equal(
    await page.locator(".st-word-title .st-hanzi").first().innerText(),
    "人工智能",
  );
  assert.match(
    await page.locator(".st-word-card").first().innerText(),
    /trí tuệ nhân tạo/,
  );
  await page.locator("[data-save]").first().click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-save]").getAttribute("aria-pressed") ===
      "true",
  );
  await page.reload();
  await settled();
  assert.equal(
    await page.locator("[data-save]").first().getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#onlySavedWords").check();
  await settled();
  assert.equal(await page.locator(".st-word-card").count(), 1);
  await page.locator("#onlySavedWords").uncheck();
  await search("行");
  assert.ok(
    (await page
      .locator(".st-word-card")
      .first()
      .locator(".st-reading-group")
      .count()) >= 2,
  );
  assert.match(await page.locator(".st-word-card").first().innerText(), /háng/);
  assert.match(await page.locator(".st-word-card").first().innerText(), /xíng/);
  const before = await page
    .locator(".st-word-card")
    .first()
    .getAttribute("data-entry");
  await page.locator('#dictionaryPagination [data-page="1"]').click();
  await settled();
  assert.notEqual(
    await page.locator(".st-word-card").first().getAttribute("data-entry"),
    before,
  );
  await search("学校");
  await screenshot("dictionary-expanded-mobile");
  await page.goto(base + "/chu-han.html");
  await page.waitForFunction(
    () =>
      document.querySelector("#characterCount").textContent === "103013 chữ",
  );
  await page.locator('[data-level="common"]').click();
  await page.waitForFunction(
    () => document.querySelector("#characterCount").textContent === "8105 chữ",
  );
  await page.locator('[data-level="radicals"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#characterCount").textContent === "214 bộ thủ",
  );
  await page.goto(base + "/chu-han.html?char=星");
  await page.waitForSelector("#saveCharacter");
  assert.match(
    await page.locator("#characterDetail").innerText(),
    /Hán Việt: tinh/,
  );
  assert.match(
    await page.locator("#characterDetail .st-facts").innerText(),
    /9/,
  );
  const compound = await page
    .locator("#characterCompounds .st-word-card")
    .first()
    .getAttribute("data-entry");
  await page.locator('#compoundPagination [data-compound-page="1"]').click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#characterCompounds").hasAttribute("aria-busy"),
  );
  assert.notEqual(
    await page
      .locator("#characterCompounds .st-word-card")
      .first()
      .getAttribute("data-entry"),
    compound,
  );
  await page.locator("#saveCharacter").click();
  await page.locator("#backToCharacters").click();
  await page.locator('[data-level="saved"]').click();
  await page.waitForSelector('#characterGrid [data-char="星"]');
  await page.goto(base + "/chu-han.html?char=𠀀");
  await page.waitForSelector("#saveCharacter");
  assert.match(await page.locator(".st-detail-title").innerText(), /𠀀/);
  await page.goto(base + "/doc-hieu.html");
  await page
    .locator("#readingText")
    .fill("我在學校学习人工智能。图书馆里有很多书。");
  await page.locator("#readingSubmit").click();
  await page.waitForSelector("#readingResult:not([hidden])");
  await page
    .locator("#readingProse [data-word]")
    .filter({ hasText: "人工智能" })
    .click();
  await page.waitForSelector("#wordDialog .st-word-card");
  assert.match(
    await page.locator("#wordDialog").innerText(),
    /trí tuệ nhân tạo/,
  );
  await page.keyboard.press("Escape");
  await page.goto(base + "/nguon-tu-dien.html");
  await page.waitForSelector("#lexiconSources #cvdict");
  assert.match(await page.locator("#lexiconStatistics").innerText(), /119.044/);
  for (const link of await page
    .locator('#lexiconSources a[href*="/storage/v1/object/public/study-lexicon/"]')
    .all()) {
    const response = await page.request.get(
      new URL(await link.getAttribute("href"), base).href,
    );
    assert.equal(response.status(), 200);
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await screenshot("dictionary-sources-mobile");
  await page.context().route("**/rest/v1/rpc/search_study_lexicon_v2", (route) => route.abort());
  await page.goto(base + "/tu-dien.html?word=旅游");
  await settled();
  assert.match(await page.locator("#dictionaryWarning").innerText(), /Kho mở rộng chưa tải được/);
  assert.equal(await page.locator(".st-word-title .st-hanzi").first().innerText(), "旅游");
  await page.context().unroute("**/rest/v1/rpc/search_study_lexicon_v2");
  return {
    firstLookupMs,
    flows: [
      "expanded simplified and traditional lookup",
      "numbered pinyin and Vietnamese search",
      "new word notebook persistence",
      "polyphonic definitions grouped",
      "dictionary and compound pagination",
      "103013 character and 8105 common filters",
      "new character save and non-BMP lookup",
      "expanded inline reading lookup",
      "source attribution and license downloads",
      "course fallback with a visible warning when expanded download fails",
    ],
  };
}
