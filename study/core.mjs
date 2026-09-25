// Shared, DOM-free contracts used by importers, the browser and server tests.
export const HAN = /\p{Script=Han}/u;
export const LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"];
export const MAX_READING = 3000;
export function normalizeLatin(value = "") {
  return String(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/u:|ü|ǖ|ǘ|ǚ|ǜ/g, "v")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[1-5]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export const normalizePinyin = (value) =>
  normalizeLatin(value).replace(/\s/g, "");
export const wordId = (word) =>
  "w-" +
  Array.from(word)
    .map((c) => c.codePointAt(0).toString(16))
    .join("-");
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function rankEntry(entry, query) {
  const q = query.trim().normalize("NFC"),
    n = normalizeLatin(q),
    p = normalizePinyin(q);
  if (!q) return 0;
  if ([entry.simplified, entry.traditional].includes(q)) return 1000;
  if (p && normalizePinyin(entry.pinyin) === p) return 900;
  const meanings = [...(entry.meaningsVi || []), entry.hanViet || ""]
    .map(normalizeLatin)
    .filter(Boolean);
  if (meanings.includes(n)) return 800;
  const values = [
    entry.simplified,
    entry.traditional || "",
    normalizePinyin(entry.pinyin),
    ...meanings,
  ];
  if (
    values.some(
      (v) =>
        v &&
        (v.startsWith(q) || (n && v.startsWith(n)) || (p && v.startsWith(p))),
    )
  )
    return 600;
  if (meanings.some((v) => (" " + v + " ").includes(" " + n + " "))) return 500;
  if (
    values.some(
      (v) =>
        v && (v.includes(q) || (n && v.includes(n)) || (p && v.includes(p))),
    )
  )
    return 400;
  if (
    /^[a-z]{4,80}$/.test(p) &&
    withinOneEdit(p, normalizePinyin(entry.pinyin))
  )
    return 200;
  return 0;
}
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
export function splitSentences(text) {
  let offset = 0;
  return text.split(/(\n+)/).flatMap((part) => {
    if (/^\n+$/.test(part)) {
      offset += part.length;
      return [{ type: "break", text: part }];
    }
    return (
      part.match(/[^。！？!?\n]+[。！？!?]*[”’」』]?|[。！？!?]+/gu) || []
    ).map((t) => {
      const result = { type: "sentence", text: t, offset };
      offset += t.length;
      return result;
    });
  });
}
export function segmentText(text, entries) {
  // Longest dictionary match wins; unknown spans use locale-aware segmentation.
  const byFirst = new Map();
  for (const e of entries)
    for (const word of new Set([e.simplified, e.traditional].filter(Boolean))) {
      const group = byFirst.get(word[0]) || [];
      group.push({ word, entry: e });
      byFirst.set(word[0], group);
    }
  byFirst.forEach((g) => g.sort((a, b) => b.word.length - a.word.length));
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter("zh", { granularity: "word" })
      : null;
  const out = [];
  let i = 0;
  while (i < text.length) {
    const hit = (byFirst.get(text[i]) || []).find((x) =>
      text.startsWith(x.word, i),
    );
    if (hit) {
      out.push({ text: hit.word, entry: hit.entry, pinyin: hit.entry.pinyin });
      i += hit.word.length;
      continue;
    }
    let end = i + (text.codePointAt(i) > 0xffff ? 2 : 1);
    while (
      end < text.length &&
      !(byFirst.get(text[end]) || []).some((x) => text.startsWith(x.word, end))
    )
      end += text.codePointAt(end) > 0xffff ? 2 : 1;
    const span = text.slice(i, end);
    out.push(
      ...(segmenter
        ? [...segmenter.segment(span)].map((x) => ({ text: x.segment }))
        : [{ text: span }]),
    );
    i = end;
  }
  return out;
}
export function validateQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5)
    return false;
  return value.every(
    (q) =>
      typeof q.question === "string" &&
      q.question.length > 0 &&
      q.question.length <= 800 &&
      Array.isArray(q.choices) &&
      q.choices.length >= 2 &&
      q.choices.length <= 5 &&
      q.choices.every(
        (c) => typeof c === "string" && c.trim() && c.length <= 600,
      ) &&
      new Set(q.choices.map((c) => c.trim())).size === q.choices.length &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.choices.length &&
      typeof q.explanation === "string" &&
      q.explanation.trim() &&
      q.explanation.length <= 2400,
  );
}
export function normalizeReading(text) {
  if (typeof text !== "string") throw Error("Văn bản không hợp lệ.");
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized || !HAN.test(normalized))
    throw Error("Hãy nhập một đoạn có chữ Hán.");
  if ([...normalized].length > MAX_READING)
    throw Error("Bài đọc tối đa 3.000 ký tự.");
  return normalized;
}
