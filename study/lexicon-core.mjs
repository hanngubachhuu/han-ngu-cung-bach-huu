import {
  normalizeLatin,
  normalizePinyin,
  wordId,
  withinOneEdit,
} from "./core.mjs";

// Convert the source's numbered pinyin, preserving its syllable boundaries.
export function tonePinyin(value) {
  return value.replace(/([a-zA-ZüÜ:]+)([0-5])/g, (_match, raw, digit) => {
    let syllable = raw
      .replace(/u:/gi, "ü")
      .replace(/v/g, "ü")
      .replace(/V/g, "Ü");
    const tone = Number(digit);
    if (!tone || tone === 5) return syllable;
    const lower = syllable.toLowerCase();
    let position = lower.indexOf("a");
    if (position < 0) position = lower.indexOf("e");
    if (position < 0 && lower.includes("ou")) position = lower.indexOf("o");
    if (position < 0)
      position = [...lower].findLastIndex((c) => "iouü".includes(c));
    if (position < 0) return syllable;
    const marks = {
      a: "āáǎà",
      e: "ēéěè",
      i: "īíǐì",
      o: "ōóǒò",
      u: "ūúǔù",
      ü: "ǖǘǚǜ",
    };
    let marked = marks[lower[position]][tone - 1];
    if (syllable[position] !== lower[position]) marked = marked.toUpperCase();
    return syllable.slice(0, position) + marked + syllable.slice(position + 1);
  });
}

export function parseCedict(text) {
  const grouped = new Map();
  const formatCorrections = [];
  let lines = 0,
    duplicates = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const corrected = line.replace(/\[\[([^\]]+)\]\s*\]/, "[$1]");
    if (corrected !== line)
      formatCorrections.push({
        line: index + 1,
        change: "Removed duplicate pinyin brackets; definition unchanged",
      });
    line = corrected;
    const match = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/$/u);
    if (!match) throw Error(`Invalid CVDICT line ${index + 1}`);
    const [, traditional, simplified, numbered, definitions] = match;
    const meanings = definitions
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!meanings.length) throw Error(`Empty definition at line ${index + 1}`);
    lines++;
    const entry = grouped.get(simplified) || { simplified, readings: [] };
    const previous = entry.readings.find(
      (r) => r.traditional === traditional && r.numbered === numbered,
    );
    if (previous) {
      duplicates++;
      previous.meanings = [...new Set([...previous.meanings, ...meanings])];
    } else entry.readings.push({ traditional, numbered, meanings });
    grouped.set(simplified, entry);
  }
  return {
    entries: [...grouped.values()],
    lines,
    duplicates,
    formatCorrections,
  };
}

export function mappedHanViet(traditional, numbered, mapping) {
  const chars = [...traditional],
    syllables = numbered.trim().split(/\s+/);
  if (chars.length !== syllables.length) return null;
  const parts = chars.map((char, i) => {
    const table = mapping[char];
    const key = syllables[i].toLowerCase().replace(/u:|ü/g, "v");
    const entry =
      table?.[key] || table?.[syllables[i].toLowerCase()] || table?.["*"];
    return entry?.length ? entry.join("/") : null;
  });
  // Never invent a missing reading or choose one arbitrary traditional variant.
  return parts.every(Boolean) ? parts.join(" ") : null;
}

export function inflateWord(row, source) {
  const readings = row[1].map(([traditional, numbered, meanings, hanViet]) => ({
    traditional,
    numbered,
    pinyin: tonePinyin(numbered),
    hanViet,
    meaningsVi: meanings.filter((m) => !/^(?:CL|LT|lượng từ)\s*:/i.test(m)),
    classifiers: meanings
      .filter((m) => /^(?:CL|LT|lượng từ)\s*:/i.test(m))
      .map((m) => m.replace(/^[^:]+:\s*/, "")),
  }));
  const first = readings[0];
  return {
    id: wordId(row[0]),
    simplified: row[0],
    traditional: first.traditional,
    pinyin: first.pinyin,
    hanViet: first.hanViet,
    meaningsVi: first.meaningsVi,
    readings,
    classifiers: first.classifiers,
    partOfSpeech: [],
    examples: [],
    curriculumTags: [],
    visibility: "public",
    provenance: { ...source, source: "cvdict" },
    hanVietSource: "hanviet-pinyin-wordlist",
    quality: "community-reference",
  };
}

function compareHits(a, b) {
  return (
    b.score - a.score ||
    Number(!!b.course) - Number(!!a.course) ||
    (b.frequency || 0) - (a.frequency || 0) ||
    Number(!!b.common) - Number(!!a.common) ||
    // For equal Vietnamese-meaning matches, everyday two-character words are
    // usually a better starting point than isolated character definitions.
    (a.score === 800
      ? (a.simplified.length === 1 ? 5 : a.simplified.length) -
        (b.simplified.length === 1 ? 5 : b.simplified.length)
      : 0) ||
    [...a.simplified].length - [...b.simplified].length ||
    a.simplified.localeCompare(b.simplified, "zh")
  );
}

export class WordIndex {
  constructor(rows) {
    this.rows = rows;
    this.byId = new Map();
    this.aliases = new Map();
    this.prepared = rows.map((row) => {
      const id = wordId(row[0]);
      this.byId.set(id, row);
      const variants = [...new Set([row[0], ...row[1].map((r) => r[0])])];
      for (const form of variants) {
        const ids = this.aliases.get(form) || [];
        if (!ids.includes(id)) ids.push(id);
        this.aliases.set(form, ids);
      }
      return {
        id,
        simplified: row[0],
        common: row[3] === 1,
        frequency: row[4] || 0,
        variants,
        pinyins: [...new Set(row[1].map((r) => normalizePinyin(r[1])))],
        meanings:
          row[2] ||
          "\n" +
            [
              ...new Set(
                row[1]
                  .flatMap((r) => [...r[2], r[3] || ""])
                  .filter(Boolean)
                  .map(normalizeLatin),
              ),
            ].join("\n") +
            "\n",
      };
    });
    this.last = null;
  }
  score(entry, query) {
    const { raw, normal, pinyin, han } = query;
    if (!raw) return 1;
    if (entry.variants.includes(raw)) return 1000;
    if (!han && pinyin && entry.pinyins.includes(pinyin)) return 900;
    if (normal && entry.meanings.includes("\n" + normal + "\n")) return 800;
    if (
      entry.variants.some((v) => v.startsWith(raw)) ||
      (!han && pinyin && entry.pinyins.some((p) => p.startsWith(pinyin)))
    )
      return 600;
    if (
      normal &&
      (entry.meanings.includes(" " + normal + " ") ||
        entry.meanings.includes("\n" + normal + " "))
    )
      return 500;
    if (
      entry.variants.some((v) => v.includes(raw)) ||
      (normal && entry.meanings.includes(normal)) ||
      (!han && pinyin && entry.pinyins.some((p) => p.includes(pinyin)))
    )
      return 400;
    if (
      !han &&
      /^[a-z]{4,80}$/.test(pinyin) &&
      entry.pinyins.some((p) => withinOneEdit(pinyin, p))
    )
      return 200;
    return 0;
  }
  search(
    raw,
    {
      overlays = [],
      page = 0,
      limit = 12,
      contains = null,
      savedIds = null,
    } = {},
  ) {
    raw = String(raw).trim().normalize("NFC").slice(0, 120);
    const query = {
      raw,
      normal: normalizeLatin(raw),
      pinyin: normalizePinyin(raw),
      han: /\p{Script=Han}/u.test(raw),
    };
    const key = JSON.stringify([raw, contains, savedIds, overlays]);
    let hits;
    if (this.last?.key === key) hits = this.last.hits;
    else {
      const found = new Map();
      const saved = savedIds && new Set(savedIds);
      for (const entry of this.prepared) {
        if (saved && !saved.has(entry.id)) continue;
        if (contains && !entry.variants.some((v) => v.includes(contains)))
          continue;
        const score = this.score(entry, query);
        if (score)
          found.set(entry.id, {
            id: entry.id,
            simplified: entry.simplified,
            common: entry.common,
            frequency: entry.frequency,
            score,
          });
      }
      for (const entry of overlays) {
        if (saved && !saved.has(entry.id)) continue;
        const previous = found.get(entry.id);
        found.set(entry.id, {
          ...entry,
          score: Math.max(entry.score, previous?.score || 0),
          course: true,
        });
      }
      hits = [...found.values()].sort(compareHits);
      this.last = { key, hits };
    }
    const size = Math.max(1, Math.min(limit, 100));
    const offset = Math.max(0, page) * size;
    return { hits: hits.slice(offset, offset + size), total: hits.length };
  }
  resolve(words) {
    return [...new Set(words.flatMap((w) => this.aliases.get(w) || []))];
  }
  matching(text) {
    return this.prepared
      .filter((e) => e.variants.some((v) => text.includes(v)))
      .map((e) => e.id);
  }
}
