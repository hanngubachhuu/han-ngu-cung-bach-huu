import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { wordId } from "../study/core.mjs";
import { WordIndex, inflateWord } from "../study/lexicon-core.mjs";
import {
  matchesLevel,
  enrichReferenceEntry,
  readHistory,
  rememberQuery,
  searchGrammar,
  readingKey,
} from "../study/reference-core.mjs";

test("reading selection keeps tones and places common meanings before proper names", () => {
  assert.notEqual(readingKey("cháng"), readingKey("chǎng"));
  assert.equal(readingKey("Xué xí"), readingKey("xuéxí"));
  const e = inflateWord([
    "大学",
    [
      ["大學", "Da4 xue2", ["tên sách Đại học"], "ĐẠI HỌC"],
      ["大學", "da4 xue2", ["trường đại học"], "ĐẠI HỌC"],
    ],
  ]);
  assert.equal(e.meaningsVi[0], "trường đại học");
  assert.equal(e.readings.length, 2);
  const polyphone = inflateWord([
    "长",
    [
      ["長", "zhang3", ["lớn lên"], "TRƯỞNG"],
      ["長", "chang2", ["dài"], "TRƯỜNG"],
    ],
  ]);
  const result = enrichReferenceEntry(polyphone, {
    pinyin: "cháng",
    examples: [],
  });
  assert.equal(result.meaningsVi[0], "dài");
  assert.equal(result.readings[1].pinyin, "zhǎng");
});

test("HSK filter precedes paging, intersects saved words, and preserves unfiltered search", () => {
  const index = new WordIndex([
    ["我", [["我", "wo3", ["tôi"], "ngã"]]],
    ["你", [["你", "ni3", ["bạn"], "nhĩ"]]],
    ["学习", [["學習", "xue2 xi2", ["học tập"], "học tập"]]],
  ]);
  const allowedIds = [wordId("我"), wordId("学习")];
  assert.equal(index.search("", { allowedIds, limit: 1 }).total, 2);
  assert.equal(
    index.search("", { allowedIds, limit: 1, page: 1 }).hits.length,
    1,
  );
  assert.equal(
    index.search("", { allowedIds, savedIds: [wordId("你")] }).total,
    0,
  );
  assert.equal(index.search("", { allowedIds: [] }).total, 0);
  assert.equal(index.search("學習", { allowedIds }).hits[0].id, wordId("学习"));
  assert.equal(index.search("", {}).total, 3);
});
test("word levels are separate from course tags and framework boundaries", () => {
  const e = {
    curriculumTags: [{ level: "1" }],
    hsk: { framework: "HSK 2.0", level: 3 },
  };
  assert.equal(matchesLevel(e, "1"), false);
  assert.equal(matchesLevel(e, "4", true), true);
  assert.equal(
    matchesLevel({ ...e, hsk: { framework: "HSK 3.0", level: 3 } }, "4", true),
    false,
  );
});
test("reference examples retain provenance without replacing teaching definitions", () => {
  const course = {
    meaningsVi: ["nghĩa giáo trình"],
    examples: [{ chinese: "你好。", provenance: { source: "course" } }],
  };
  const ref = {
    meaningsVi: ["nghĩa khác"],
    hsk: { level: 1, framework: "HSK 2.0" },
    examples: [
      { chinese: "你好。" },
      { chinese: "我很好。", quality: "unreviewed-reference" },
    ],
  };
  const result = enrichReferenceEntry(course, ref);
  assert.deepEqual(result.meaningsVi, course.meaningsVi);
  assert.equal(result.examples.length, 2);
  assert.equal(result.examples[0].provenance.source, "course");
  assert.equal(result.examples[1].quality, "unreviewed-reference");
  assert.equal(course.hsk, undefined);
});
test("history is bounded, deduplicated and tolerates unavailable storage", () => {
  let value = "{}";
  const storage = {
    getItem: () => value,
    setItem: (_, v) => {
      value = v;
    },
  };
  assert.deepEqual(readHistory(storage), []);
  for (let i = 0; i < 20; i++) rememberQuery(storage, String(i));
  assert.equal(readHistory(storage).length, 12);
  rememberQuery(storage, "18");
  assert.equal(readHistory(storage)[0], "18");
  assert.equal(readHistory(storage).filter((x) => x === "18").length, 1);
  const blocked = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.deepEqual(rememberQuery(blocked, "学习"), ["学习"]);
});
test("generated reference accounts for every accepted unique local headword and source", async () => {
  const read = async (f) =>
    JSON.parse(await fs.readFile(new URL("../" + f, import.meta.url), "utf8"));
  const data = await read("data/study/reference.json"),
    local = await read("sources/study/local-vocabulary.json"),
    grammar = await read("data/study/grammar.json");
  const byWord = new Map(data.entries.map((e) => [e.simplified, e]));
  assert.equal(byWord.size, data.entries.length);
  for (const e of local.entries)
    if (/^\p{Script=Han}+$/u.test(e.simplified))
      assert.ok(byWord.has(e.simplified));
  for (const e of data.entries) {
    assert.equal(e.hsk.framework, "HSK 2.0");
    assert.ok(e.hsk.level >= 1 && e.hsk.level <= 6);
    for (const x of e.examples) {
      assert.ok(x.chinese.includes(e.simplified));
      assert.equal(x.quality, "unreviewed-reference");
      assert.ok(x.provenance.sheet && x.provenance.row);
    }
  }
  assert.ok(grammar.length > 0);
  assert.ok(grammar.every((g) => g.curriculum.lessonNo <= 3));
  assert.ok(searchGrammar(grammar, "是不是").length > 0);
});
