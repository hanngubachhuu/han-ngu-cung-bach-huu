import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HAN,
  wordId,
  normalizePinyin,
  validateQuestions,
  splitSentences,
} from "../study/core.mjs";
const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL(path, root), "utf8");
const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data/lesson-registry.js",
  "data/lesson-manifest.js",
  "data/lessons/hsk2/exercise-revision-v2.js",
])
  vm.runInContext(await read(file), context);
const registry = context.window.HAN_NGU_DATA;
let unicode = { characters: {}, radicals: [], provenance: {} };
try {
  unicode = JSON.parse(await read("data/study/unicode.json"));
} catch {}
const allEntries = [],
  allReadings = [],
  allCharacters = [];
for (const meta of registry.manifest) {
  if (!meta.data || meta.private || meta.access === "private") continue;
  try {
    vm.runInContext(await read(meta.data), context);
  } catch (e) {
    if (e.code === "ENOENT") continue;
    throw e;
  }
  const lesson = registry.lessons[meta.id];
  if (!lesson) continue;
  const c = lesson.content,
    visibility = meta.lessonNo <= 3 ? "public" : "student";
  const provenance = {
    source: meta.data,
    sourceVersion: c.meta?.version || 1,
    license: "project-content",
    sourceRefs: [],
    lessonId: meta.id,
  };
  const curriculum = {
    id: meta.id,
    level: String(meta.level),
    lessonNo: meta.lessonNo,
    title: meta.titleZh,
    href: meta.href,
    standardVersion: c.course.framework || "HSK 2.0",
  };
  const sourceHash = crypto
    .createHash("sha256")
    .update((await read(meta.data)).replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 16);
  provenance.sourceVersion = sourceHash;
  for (const v of c.vocabulary || []) {
    if (!v.han || !v.pinyin) continue;
    const examples = (c.exampleSentences || [])
      .filter((s) => s.zh?.includes(v.han))
      .map((s) => ({
        chinese: s.zh,
        pinyin: s.pinyin || null,
        vietnamese: s.vi || null,
        provenance: { ...provenance, sourceRefs: s.sourceRefs || [] },
      }));
    allEntries.push({
      id: wordId(v.han),
      recordId: wordId(v.han) + "--" + meta.id,
      simplified: v.han,
      traditional: v.traditional || null,
      pinyin: v.pinyin,
      pinyinNormalized: normalizePinyin(v.pinyin),
      hanViet: v.hanViet || null,
      meaningsVi: [v.meaning || v.nghia].filter(Boolean),
      partOfSpeech: [v.partOfSpeech].filter(Boolean),
      classifiers: v.classifiers || [],
      hskLevel: null,
      curriculumTags: [curriculum],
      examples,
      detail: v.detail || {},
      provenance: { ...provenance, sourceRefs: v.sourceRefs || [] },
      visibility,
      lessonId: meta.id,
    });
  }
  const words = (c.vocabulary || []).map((v) => v.han).join("");
  const seenChars = [...new Set([...words].filter((ch) => HAN.test(ch)))];
  for (const ch of seenChars) {
    const h = (c.hanzi || []).find((x) => x.char === ch) || {},
      single = (c.vocabulary || []).find((x) => x.han === ch);
    const u = unicode.characters[ch] || {};
    allCharacters.push({
      character: ch,
      pinyin: h.pinyin || single?.pinyin || u.pinyin || null,
      hanViet: h.hanViet || null,
      meaningsVi: [h.meaning || single?.meaning || single?.nghia].filter(
        Boolean,
      ),
      strokeCount: h.strokes || u.strokeCount || null,
      radical: h.radical || u.radical || null,
      radicalNumber: u.radicalNumber || null,
      structure: h.structure || null,
      traditional: u.traditional || [],
      simplified: u.simplified || [],
      readingProfile: h.readingProfile || null,
      deepProfile: h.deepProfile || null,
      curriculumTags: [curriculum],
      hskLevel: null,
      provenance: [
        { ...provenance, sourceRefs: h.sourceRefs || [] },
        ...(Object.keys(u).length ? [unicode.provenance] : []),
      ],
      visibility,
      lessonId: meta.id,
    });
  }
  const passages = new Map();
  for (const p of Array.isArray(c.passages)
    ? c.passages
    : Object.values(c.passages || {}))
    if (p.text) passages.set(p.id, { ...p, questions: [] });
  for (const q of c.exercises?.all || []) {
    let p;
    if (q.readingText) {
      const id = crypto
        .createHash("sha256")
        .update(q.readingText)
        .digest("hex")
        .slice(0, 12);
      if (!passages.has(id))
        passages.set(id, { id, text: q.readingText, questions: [] });
      p = passages.get(id);
    } else p = passages.get(q.passageId || q.passage || q.reading);
    if (p && q.type === "mcq" && Array.isArray(q.options)) {
      const question = {
        question: q.prompt,
        choices: q.options.map((o) => o.t || o),
        correctIndex: q.options.findIndex((o) => o.k === q.answer),
        explanation: q.explain || "",
        sourceId: q.id,
      };
      if (validateQuestions([question])) p.questions.push(question);
    }
  }
  for (const p of passages.values()) {
    const translations = splitSentences(p.text)
      .filter((s) => s.type === "sentence")
      .map((s, index) => {
        const chinese = s.text.trim().replace(/^[A-Z]：/, "");
        const example = (c.exampleSentences || []).find(
          (e) => e.zh?.trim() === chinese && e.vi,
        );
        return example
          ? {
              index,
              chinese: s.text,
              vietnamese: example.vi,
              provenance: {
                ...provenance,
                sourceRefs: example.sourceRefs || [],
              },
            }
          : null;
      })
      .filter(Boolean);
    allReadings.push({
      id: meta.id + "-" + p.id,
      title: p.title || meta.titleZh,
      titleVi: meta.titleVi,
      sourceText: p.text,
      questions: p.questions.slice(0, 5),
      translations,
      curriculum,
      provenance,
      visibility,
      lessonId: meta.id,
    });
  }
}
function mergeEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const old = map.get(e.id);
    if (!old) {
      map.set(e.id, structuredClone(e));
      continue;
    }
    old.curriculumTags.push(...e.curriculumTags);
    old.examples.push(
      ...e.examples.filter(
        (x) => !old.examples.some((y) => y.chinese === x.chinese),
      ),
    );
    old.meaningsVi = [...new Set([...old.meaningsVi, ...e.meaningsVi])];
  }
  return [...map.values()];
}
function mergeChars(chars) {
  const map = new Map();
  for (const ch of chars) {
    const old = map.get(ch.character);
    if (!old) {
      map.set(ch.character, structuredClone(ch));
      continue;
    }
    old.curriculumTags.push(...ch.curriculumTags);
    for (const k of [
      "pinyin",
      "radical",
      "strokeCount",
      "structure",
      "readingProfile",
      "deepProfile",
    ])
      if (!old[k] && ch[k]) old[k] = ch[k];
    old.meaningsVi = [...new Set([...old.meaningsVi, ...ch.meaningsVi])];
  }
  return [...map.values()];
}
const entries = mergeEntries(
  allEntries.filter((e) => e.visibility === "public"),
);
const characters = mergeChars(
  allCharacters.filter((e) => e.visibility === "public"),
);
const readings = allReadings.filter((e) => e.visibility === "public");
const base = new URL("data/study/", root);
await fs.mkdir(base, { recursive: true });
// Recreate only generated collections so a removed/public-to-private item cannot survive a rebuild.
for (const collection of ["entries", "readings"]) {
  const output = fileURLToPath(new URL(collection, base));
  if (path.dirname(output) !== path.resolve(fileURLToPath(base)))
    throw Error("Unsafe generated-data path");
  await fs.rm(output, { recursive: true, force: true });
}
const version = crypto
  .createHash("sha256")
  .update(JSON.stringify({ entries, characters, readings, unicode }))
  .digest("hex")
  .slice(0, 16);
const index = {
  version,
  entries: entries.map((e) => ({
    id: e.id,
    simplified: e.simplified,
    traditional: e.traditional,
    pinyin: e.pinyin,
    meaningsVi: e.meaningsVi,
    hanViet: e.hanViet,
    levels: e.curriculumTags.map((t) => t.level),
  })),
  characters,
  radicals: unicode.radicals,
  readings: readings.map((r) => ({
    id: r.id,
    title: r.title,
    titleVi: r.titleVi,
    curriculum: r.curriculum,
    provenance: r.provenance,
    visibility: r.visibility,
    lessonId: r.lessonId,
    length: [...r.sourceText].length,
    questionCount: r.questions.length,
  })),
};
await fs.writeFile(new URL("catalog.json", base), JSON.stringify(index));
await fs.mkdir(new URL("entries/", base), { recursive: true });
await fs.mkdir(new URL("readings/", base), { recursive: true });
for (const e of entries)
  await fs.writeFile(
    new URL("entries/" + e.id + ".json", base),
    JSON.stringify(e),
  );
for (const r of readings)
  await fs.writeFile(
    new URL("readings/" + r.id + ".json", base),
    JSON.stringify(r),
  );
await fs.mkdir(new URL(".cache/", root), { recursive: true });
await fs.writeFile(
  new URL(".cache/study-seed.json", root),
  JSON.stringify({
    version,
    entries: allEntries,
    characters: allCharacters,
    readings: allReadings,
  }),
);
console.log(
  JSON.stringify({
    version,
    publicWords: entries.length,
    publicCharacters: characters.length,
    publicReadings: readings.length,
    privateWordRecords: allEntries.filter((e) => e.visibility !== "public")
      .length,
  }),
);
