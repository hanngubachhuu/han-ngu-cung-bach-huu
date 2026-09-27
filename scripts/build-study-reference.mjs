import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { wordId } from "../study/core.mjs";
import { readingKey } from "../study/reference-core.mjs";

const root = new URL("../", import.meta.url);
const read = async (file) =>
  JSON.parse(await fs.readFile(new URL(file, root), "utf8"));
const local = await read("sources/study/local-vocabulary.json");
const reference = await read("sources/hsk/hsk20-reference.json");
const words = new Map(
  reference.entries.map((e) => [
    e.simplified,
    {
      id: wordId(e.simplified),
      simplified: e.simplified,
      pinyin: e.pinyin,
      meaningsVi: [],
      examples: [],
      curriculumTags: [],
      hsk: {
        framework: "HSK 2.0",
        level: e.level,
        source: "complete-hsk-vocabulary",
      },
      provenance: { source: "hsk-reference", quality: "community-reference" },
    },
  ]),
);
const conflicts = [],
  readingConflicts = [],
  localOnly = [];
for (const row of local.entries) {
  if (!/^\p{Script=Han}+$/u.test(row.simplified)) continue;
  let entry = words.get(row.simplified);
  if (!entry) {
    entry = {
      id: wordId(row.simplified),
      simplified: row.simplified,
      pinyin: row.pinyin,
      meaningsVi: [],
      examples: [],
      curriculumTags: [],
      hsk: {
        framework: "HSK 2.0",
        level: row.level,
        source: "local-hsk-workbook",
      },
      provenance: {
        source: "local-hsk-workbook",
        quality: "unreviewed-reference",
      },
    };
    words.set(row.simplified, entry);
    localOnly.push(row.simplified);
  }
  if (entry.hsk.level !== row.level)
    conflicts.push({
      word: row.simplified,
      referenceLevel: entry.hsk.level,
      workbookLevel: row.level,
      ...row.reference,
    });
  entry.localReferences ||= [];
  entry.localReferences.push(row.reference);
  if (readingKey(row.pinyin) !== readingKey(entry.pinyin)) {
    readingConflicts.push({
      word: row.simplified,
      referencePinyin: entry.pinyin,
      workbookPinyin: row.pinyin,
      ...row.reference,
    });
    continue;
  }
  if (row.meaning && !entry.meaningsVi.includes(row.meaning))
    entry.meaningsVi.push(row.meaning);
  // Different readings stay in the audit trail, never attach their examples silently.
  if (
    row.example &&
    !entry.examples.some((e) => e.chinese === row.example.chinese)
  ) {
    entry.examples.push({
      ...row.example,
      provenance: { source: "local-hsk-workbook", ...row.reference },
    });
  }
}
const entries = [...words.values()];
const counts = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((level) => [
    level,
    entries.filter((e) => e.hsk.level === level).length,
  ]),
);
const report = {
  counts,
  words: entries.length,
  referenceWords: reference.entries.length,
  workbookWords: new Set(local.entries.map((e) => e.simplified)).size,
  exampleCount: entries.reduce((n, e) => n + e.examples.length, 0),
  conflicts,
  readingConflicts,
  localOnly,
};
const payload = {
  schema: 1,
  framework: "HSK 2.0",
  sources: { reference: reference.source, workbook: local.source },
  counts,
  entries,
};
payload.version = createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex")
  .slice(0, 16);
await fs.writeFile(
  new URL("data/study/reference.json", root),
  JSON.stringify(payload),
);
await fs.copyFile(
  new URL("sources/hsk/LICENSE.txt", root),
  new URL("data/study/HSK-REFERENCE-LICENSE.txt", root),
);
await fs.mkdir(new URL("docs/dictionary/", root), { recursive: true });
await fs.writeFile(
  new URL("docs/dictionary/data-audit.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    ...report,
    conflicts: conflicts.length,
    readingConflicts: readingConflicts.length,
    localOnly: localOnly.length,
  }),
);
