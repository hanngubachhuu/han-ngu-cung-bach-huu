import { normalizeLatin } from "./core.mjs";

// Tone marks matter when attaching definitions/examples; search normalization
// intentionally discards them and must not be used for this decision.
export const readingKey = (value = "") =>
  value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s'’·-]/g, "");

export function matchesLevel(entry, level, cumulative = false) {
  if (!level) return true;
  return (
    entry.hsk?.framework === "HSK 2.0" &&
    (cumulative
      ? entry.hsk.level <= Number(level)
      : entry.hsk.level === Number(level))
  );
}

export function enrichReferenceEntry(entry, reference) {
  if (!reference) return entry;
  if (!entry) return structuredClone(reference);
  if (entry.provenance?.source === "cvdict" && entry.readings?.length > 1) {
    const reading = entry.readings.find(
      (r) => readingKey(r.pinyin) === readingKey(reference.pinyin),
    );
    if (reading)
      entry = {
        ...entry,
        ...reading,
        readings: [reading, ...entry.readings.filter((r) => r !== reading)],
      };
  }
  return {
    ...entry,
    hsk: reference.hsk,
    localReferences: reference.localReferences || [],
    examples: [
      ...(entry.examples || []),
      ...reference.examples.filter(
        (x) => !(entry.examples || []).some((y) => y.chinese === x.chinese),
      ),
    ],
  };
}

export function searchGrammar(rows, query) {
  const key = normalizeLatin(query);
  return rows.filter(
    (row) =>
      !key ||
      normalizeLatin(
        [row.title, row.pattern, row.explanation, ...row.examples].join(" "),
      ).includes(key),
  );
}

export function readHistory(storage) {
  try {
    const value = JSON.parse(storage.getItem("hnh_dictionary_history") || "[]");
    return Array.isArray(value)
      ? value
          .filter((x) => typeof x === "string" && x.length <= 120)
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function rememberQuery(storage, query) {
  const value = query.trim().slice(0, 120);
  const history = readHistory(storage);
  if (!value) return history;
  const next = [value, ...history.filter((x) => x !== value)].slice(0, 12);
  try {
    storage.setItem("hnh_dictionary_history", JSON.stringify(next));
  } catch {
    /* Search still works when storage is unavailable. */
  }
  return next;
}
