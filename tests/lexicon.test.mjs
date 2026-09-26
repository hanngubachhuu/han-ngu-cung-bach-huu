import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  parseCedict,
  tonePinyin,
  mappedHanViet,
  inflateWord,
  WordIndex,
} from "../study/lexicon-core.mjs";
import { enrichCourseEntry, enrichCharacter } from "../study/lexicon-merge.mjs";
import {
  wordId,
  normalizeLatin,
  rankEntry,
  segmentText,
} from "../study/core.mjs";

test("numbered pinyin keeps ü, tone placement and neutral tones", () => {
  assert.equal(
    tonePinyin("lu:3 you2 nü3 xue2 xiao4 Chong2 qing4 ma5 Liu2"),
    "lǚ yóu nǚ xué xiào Chóng qìng ma Liú",
  );
});
test("CEDICT import preserves pronunciations and variants, merges only identical readings", () => {
  const parsed = parseCedict(
    "行 行 [hang2] /hàng/\n行 行 [xing2] /đi/\n行 行 [hang2] /ngành/\n澳洲廣播電臺 澳洲广播电台 [[Ao4 zhou1 Guang3 bo1 Dian4 tai2] ] /đài ABC/",
  );
  assert.equal(parsed.lines, 4);
  assert.equal(parsed.duplicates, 1);
  assert.equal(parsed.formatCorrections.length, 1);
  assert.equal(parsed.entries[0].readings.length, 2);
  assert.deepEqual(parsed.entries[0].readings[0].meanings, ["hàng", "ngành"]);
  assert.throws(() => parseCedict("broken line"), /Invalid CVDICT line 1/);
});
test("Han Viet mapping respects pinyin and does not invent missing syllables", () => {
  const mapping = {
    中: { zhong1: ["trung"], zhong4: ["trúng"] },
    降: { jiang4: ["giáng"], xiang2: ["hàng"] },
  };
  assert.equal(mappedHanViet("中降", "zhong1 jiang4", mapping), "trung giáng");
  assert.equal(mappedHanViet("中降", "zhong4 xiang2", mapping), "trúng hàng");
  assert.equal(mappedHanViet("中缺", "zhong1 que1", mapping), null);
  assert.equal(mappedHanViet("中", "zhong1 guo2", mapping), null);
});
const fixture = [
  [
    "学校",
    [["學校", "xue2 xiao4", ["trường học", "CL:所[suo3]"], "học hiệu"]],
    "\ntruong hoc\n",
  ],
  [
    "行",
    [
      ["行", "hang2", ["ngành"], "hàng"],
      ["行", "xing2", ["đi"], "hành"],
    ],
    "\nnganh\ndi\n",
  ],
  ["旅行", [["旅行", "lv3 xing2", ["du lịch"], "lữ hành"]], "\ndu lich\n"],
];
test("search resolves traditional/numbered pinyin/meaning and merges course results without hiding open words", () => {
  const index = new WordIndex(fixture);
  for (const query of ["學校", "xue2xiao4", "xuéxiào", "truong hoc"])
    assert.equal(index.search(query).hits[0].id, wordId("学校"));
  for (const query of ["lvxing", "lu:3xing2", "lǚxíng"])
    assert.equal(index.search(query).hits[0].id, wordId("旅行"));
  assert.deepEqual(index.resolve(["學校", "学校"]), [wordId("学校")]);
  const course = { id: wordId("新词"), simplified: "新词", score: 1000 };
  const first = index.search("", { overlays: [course], limit: 2 });
  const second = index.search("", { overlays: [course], limit: 2, page: 1 });
  assert.equal(first.total, 4);
  assert.equal(first.hits[0].id, course.id);
  assert.equal(
    new Set([...first.hits, ...second.hits].map((h) => h.id)).size,
    4,
  );
  assert.equal(index.search("", { contains: "行" }).total, 2);
  assert.equal(index.search("", { savedIds: [wordId("学校")] }).total, 1);
});
test("course examples retain provenance; secondary readings remain searchable after saving", () => {
  const imported = inflateWord(fixture[1], { name: "CVDICT" });
  const course = {
    id: imported.id,
    simplified: "行",
    pinyin: "xíng",
    meaningsVi: ["được"],
    examples: [{ chinese: "这样行吗？" }],
    provenance: { source: "lesson" },
  };
  const merged = enrichCourseEntry(course, imported);
  assert.equal(merged.hanViet, "hành");
  assert.deepEqual(merged.meaningsVi, ["được"]);
  assert.equal(merged.provenance.source, "lesson");
  assert.equal(merged.supplementalReadings.length, 2);
  assert.equal(rankEntry(merged, "hang2"), 900);
  const school = inflateWord(fixture[0], {});
  assert.deepEqual(school.meaningsVi, ["trường học"]);
  assert.equal(school.classifiers.length, 1);
  assert.equal(
    segmentText("我去學校。", [school]).find((token) => token.entry)?.entry.id,
    school.id,
  );
});
test("Unicode Vietnamese readings never fill Sino-Vietnamese field automatically", () => {
  const result = enrichCharacter(
    { character: "中", hanViet: null, meaningsVi: [] },
    {
      character: "中",
      hanViet: null,
      vietnameseReadings: ["trong"],
      meaningsVi: ["giữa"],
    },
  );
  assert.equal(result.hanViet, null);
  assert.deepEqual(result.vietnameseReadings, ["trong"]);
  assert.deepEqual(result.meaningsVi, ["giữa"]);
});
test("equal Vietnamese definitions favor a common two-character word over a rare glyph", () => {
  const index = new WordIndex([
    ["黉", [["黌", "hong2", ["trường học"], "hoành"]], "\ntruong hoc\n", 0],
    ["学校", fixture[0][1], "\ntruong hoc\n", 1],
    ["校", [["校", "xiao4", ["trường học"], "hiệu"]], "\ntruong hoc\n", 1],
  ]);
  assert.equal(index.search("trường học").hits[0].simplified, "学校");
  assert.equal(index.search("黉").hits[0].simplified, "黉");
});
test("worker derives accent-folded meanings and uses supplied word frequency for ties", () => {
  const index = new WordIndex([
    [
      "学堂",
      [["學堂", "xue2 tang2", ["trường học"], "học đường"]],
      null,
      1,
      614,
    ],
    ["学校", fixture[0][1], null, 1, 17020],
  ]);
  assert.equal(index.search("truong hoc").hits[0].simplified, "学校");
  assert.equal(index.search("hoc duong").hits[0].simplified, "学堂");
});
test("pinned CVDICT snapshot imports every source row and keeps multiple readings", async () => {
  const source = gunzipSync(
    await fs.readFile(
      new URL("../sources/dictionaries/cvdict.u8.gz", import.meta.url),
    ),
  ).toString("utf8");
  const data = parseCedict(source);
  assert.equal(data.lines, 122597);
  assert.equal(data.entries.length, 119044);
  assert.equal(
    data.entries.reduce((n, e) => n + e.readings.length, 0),
    122596,
  );
  assert.equal(
    data.entries.find((e) => e.simplified === "重").readings.length >= 2,
    true,
  );
  assert.ok(
    data.entries
      .find((e) => e.simplified === "人工智能")
      .readings.some((r) =>
        r.meanings.some((m) => normalizeLatin(m).includes("tri tue nhan tao")),
      ),
  );
});
