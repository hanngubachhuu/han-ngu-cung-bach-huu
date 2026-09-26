import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  parseCedict,
  mappedHanViet,
  tonePinyin,
} from "../study/lexicon-core.mjs";
import { wordId } from "../study/core.mjs";

const root = new URL("../", import.meta.url);
const sourceBase = new URL("sources/dictionaries/", root);
const output = new URL("data/study/lexicon/", root);
const manifest = JSON.parse(
  await fs.readFile(new URL("manifest.json", sourceBase), "utf8"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const blobs = {};
for (const source of manifest.sources) {
  const bytes = gunzipSync(await fs.readFile(new URL(source.file, sourceBase)));
  if (hash(bytes) !== source.sha256)
    throw Error("Dictionary source hash mismatch: " + source.id);
  blobs[source.id] = bytes.toString("utf8");
}
const parsed = parseCedict(blobs.cvdict);
const frequencies = new Map(
  blobs.jieba
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [word, frequency] = line.split(" ");
      if (!word || !/^\d+$/.test(frequency))
        throw Error("Invalid Jieba frequency row");
      return [word, Number(frequency)];
    }),
);
const hanviet = JSON.parse(blobs.hanviet),
  unicode = JSON.parse(blobs.unihan);
const words = parsed.entries.map((entry) => {
  const readings = entry.readings.map((r) => [
    r.traditional,
    r.numbered,
    r.meanings,
    mappedHanViet(r.traditional, r.numbered, hanviet),
  ]);
  // Build the accent-folded search text in the worker instead of downloading
  // a second copy of every definition. This keeps the first download smaller.
  return [entry.simplified, readings, null];
});
const singles = new Map();
for (const row of words)
  for (const reading of row[1])
    for (const char of new Set([row[0], reading[0]]))
      if ([...char].length === 1) {
        const meanings = singles.get(char) || [];
        singles.set(char, [
          ...new Set([
            ...meanings,
            ...reading[2].filter((m) => !/^(?:CL|LT|lượng từ)\s*:/i.test(m)),
          ]),
        ]);
      }
const variants = (raw) =>
  raw
    ? [
        ...new Set(
          raw
            .split(" ")
            .map((cp) =>
              String.fromCodePoint(parseInt(cp.split("<")[0].slice(2), 16)),
            ),
        ),
      ]
    : [];
const chars = new Set([
  ...Object.keys(unicode.characters),
  ...Object.keys(hanviet),
  ...singles.keys(),
]);
const characters = [];
for (const char of chars) {
  if (!/^\p{Script=Han}$/u.test(char)) continue;
  const u = unicode.characters[char] || {};
  const traditional = variants(u.kTraditionalVariant),
    simplified = variants(u.kSimplifiedVariant);
  const hvForms = hanviet[char]
    ? [char]
    : traditional.filter((c) => hanviet[c]);
  const hvReadings = hvForms.flatMap((form) =>
    Object.entries(hanviet[form])
      .filter(([, values]) => values.length)
      .map(([numbered, values]) => [form, numbered, values]),
  );
  const pinyins = [
    ...new Set([
      ...(u.kMandarin?.split(" ") || []),
      ...(u.kHanyuPinyin
        ?.split(" ")
        .flatMap((v) => v.split(":")[1]?.split(",") || []) || []),
    ]),
  ];
  if (!pinyins.length)
    pinyins.push(
      ...hvReadings.filter((r) => r[1] !== "*").map((r) => tonePinyin(r[1])),
    );
  const radicalKey = u.kRSUnicode?.split(" ")[0].split(".")[0];
  characters.push([
    char,
    pinyins.join(" · "),
    Number(u.kTotalStrokes?.split(" ")[0]) || 0,
    unicode.radicals[radicalKey] || "",
    Number(radicalKey?.replaceAll("'", "")) || 0,
    traditional,
    simplified,
    u.kVietnamese?.split(" ") || [],
    u.kDefinition || "",
    Number(u.kTGH?.split(":")[1]) || 0,
    hvReadings,
    singles.get(char) || [],
  ]);
}
characters.sort(
  (a, b) =>
    (a[9] || 1e6) - (b[9] || 1e6) || a[0].codePointAt(0) - b[0].codePointAt(0),
);
const commonCharacters = new Set(
  characters.filter((row) => row[9]).map((row) => row[0]),
);
for (const row of words) {
  row.push([...row[0]].every((char) => commonCharacters.has(char)) ? 1 : 0);
  row.push(frequencies.get(row[0]) || 0);
}
const sourceById = Object.fromEntries(manifest.sources.map((s) => [s.id, s]));
const compiled = {
  schema: 1,
  version: hash(JSON.stringify(manifest)).slice(0, 16),
  counts: {
    sourceRows: parsed.lines,
    mergedRows: parsed.duplicates,
    words: words.length,
    readings: words.reduce((n, r) => n + r[1].length, 0),
    characters: characters.length,
    commonCharacters: characters.filter((r) => r[9]).length,
    hanVietCharacters: characters.filter((r) => r[10].length).length,
    directHanVietCharacters: Object.keys(hanviet).length,
    wordsWithHanViet: words.filter((r) => r[1].some((s) => s[3])).length,
  },
  sources: sourceById,
  formatCorrections: parsed.formatCorrections,
  files: {},
};
const dir = fileURLToPath(output);
if (
  path.basename(dir.replace(/[\\/]$/, "")) !== "lexicon" ||
  path.dirname(path.resolve(dir)) !==
    path.resolve(fileURLToPath(new URL("data/study/", root)))
)
  throw Error("Unsafe lexicon path");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const [name, value] of Object.entries({ words, characters })) {
  const text = JSON.stringify(value),
    sha256 = hash(text),
    filename = `${name}.${sha256.slice(0, 12)}.json`;
  await fs.writeFile(new URL(filename, output), text);
  const gzip = gzipSync(text, { level: 9 });
  await fs.writeFile(new URL(filename + ".gz", output), gzip);
  compiled.files[name] = {
    path: filename,
    gzip: filename + ".gz",
    gzipBytes: gzip.length,
    sha256,
    bytes: Buffer.byteLength(text),
  };
}
for (const file of [
  "CC-BY-SA-4.0.txt",
  "HANVIET-LICENSE",
  "UNICODE-LICENSE.txt",
  "CVDICT-README.md",
  "JIEBA-LICENSE.txt",
  "HANVIET-README.md",
])
  await fs.copyFile(new URL(file, sourceBase), new URL(file, output));
await fs.writeFile(
  new URL("manifest.json", output),
  JSON.stringify(compiled, null, 2) + "\n",
);
const longest = words.reduce(
  (max, row) => Math.max(max, wordId(row[0]).length),
  0,
);
console.log(
  JSON.stringify({
    ...compiled.counts,
    longestEntryId: longest,
    assets: compiled.files,
  }),
);
