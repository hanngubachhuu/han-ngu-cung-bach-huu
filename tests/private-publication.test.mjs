import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { extractLegacy } from "../scripts/private-publication.mjs";

test("all private HSK 2 pages retain their engine but exclude embedded lesson objects", async () => {
  for (let no = 4; no <= 15; no++) {
    const original = await fs.readFile(
      new URL(`../bai${no}_index.html`, import.meta.url),
      "utf8",
    );
    const { page, engine, legacy } = extractLegacy(original);
    assert.ok(legacy.sections.length > 0);
    assert.ok(page.includes("private-lesson-loader.js"));
    assert.ok(!page.includes("const LESSON ="));
    assert.ok(engine.includes("window.HNH_PRIVATE_LEGACY"));
    assert.ok(engine.includes("window.HNH_ACCOUNT_SCOPE"));
    assert.ok(engine.includes("window.HNH_ATTEMPTS?.capture("));
    assert.ok(
      !engine.includes(
        JSON.stringify(legacy.questions || legacy.sections[0].questions),
      ),
    );
  }
});
