import { WordIndex, inflateWord, tonePinyin } from "./lexicon-core.mjs";
import { normalizeLatin, normalizePinyin } from "./core.mjs";

const base = new URL("../data/study/lexicon/", import.meta.url);
let manifestPromise, wordPromise, characterPromise;
const manifest = () =>
  (manifestPromise ||= fetch(new URL("manifest.json", base))
    .then((r) => {
      if (!r.ok) throw Error("Không tải được danh mục từ điển mở rộng.");
      return r.json();
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    }));
async function dataset(name) {
  const file = (await manifest()).files[name];
  const compressed = typeof DecompressionStream === "function" && file.gzip;
  const response = await fetch(new URL(compressed || file.path, base));
  if (!response.ok)
    throw Error("Không tải được kho từ điển mở rộng. Hãy thử lại.");
  if (!compressed) return response.json();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).json();
}
const words = () =>
  (wordPromise ||= dataset("words")
    .then((rows) => new WordIndex(rows))
    .catch((e) => {
      wordPromise = null;
      throw e;
    }));
const characters = () =>
  (characterPromise ||= dataset("characters")
    .then((rows) => ({
      rows: rows.map((row) => ({
        row,
        character: row[0],
        common: row[9],
        normal: normalizeLatin(
          [row[1], ...row[10].flatMap((r) => r[2]), ...row[11], ...row[7]].join(
            " ",
          ),
        ),
        pinyins: row[1].split(" · ").map(normalizePinyin),
      })),
      byChar: new Map(rows.map((row) => [row[0], row])),
    }))
    .catch((e) => {
      characterPromise = null;
      throw e;
    }));
function characterData(row) {
  if (!row) return null;
  return {
    character: row[0],
    pinyin: row[1],
    strokeCount: row[2] || null,
    radical: row[3] || null,
    radicalNumber: row[4] || null,
    traditional: row[5],
    simplified: row[6],
    vietnameseReadings: row[7],
    definitionEn: row[8],
    commonRank: row[9] || null,
    hanViet: [...new Set(row[10].flatMap((r) => r[2]))].join(" / ") || null,
    hanVietReadings: row[10].map(([form, numbered, values]) => ({
      character: form,
      numbered,
      pinyin: numbered === "*" ? null : tonePinyin(numbered),
      values,
    })),
    meaningsVi: row[11],
    curriculumTags: [],
    source: "open-lexicon",
  };
}
async function execute(method, args) {
  if (method === "manifest") return manifest();
  if (method === "character")
    return characterData((await characters()).byChar.get(args.character));
  if (method === "characters") {
    const { rows, byChar } = await characters(),
      normal = normalizeLatin(args.query || ""),
      pinyin = normalizePinyin(args.query || "");
    const seen = new Set(),
      hits = [];
    const matches = (c) =>
      !args.query ||
      args.query.includes(c.character) ||
      (normal && c.normal.includes(normal)) ||
      (pinyin && c.pinyins.some((p) => p.includes(pinyin)));
    for (const row of args.overlays || []) {
      const imported = byChar.get(row.character);
      const candidate = {
        character: row.character,
        pinyin: row.pinyin,
        common: imported?.[9],
        normal: normalizeLatin(
          [row.pinyin, row.hanViet, ...(row.meaningsVi || [])].join(" "),
        ),
        pinyins: [normalizePinyin(row.pinyin)],
      };
      if (imported) {
        candidate.normal +=
          " " +
          normalizeLatin(
            imported[10].flatMap((r) => r[2]).join(" ") +
              " " +
              imported[11].join(" "),
          );
        if (!candidate.pinyin) candidate.pinyin = imported[1];
        candidate.pinyins.push(
          ...imported[1].split(" · ").map(normalizePinyin),
        );
      }
      if ((args.mode !== "common" || candidate.common) && matches(candidate)) {
        hits.push(candidate);
        seen.add(row.character);
      }
    }
    for (const candidate of rows) {
      if (
        seen.has(candidate.character) ||
        (args.mode === "common" && !candidate.common) ||
        !matches(candidate)
      )
        continue;
      hits.push({ character: candidate.character, pinyin: candidate.row[1] });
    }
    const offset = Math.max(0, args.page || 0) * 72;
    return {
      total: hits.length,
      rows: hits
        .slice(offset, offset + 72)
        .map(({ character, pinyin }) => ({ character, pinyin })),
    };
  }
  const index = await words();
  if (method === "search") return index.search(args.query, args);
  if (method === "get") {
    const source = (await manifest()).sources.cvdict;
    return args.ids
      .map((id) => index.byId.get(id))
      .filter(Boolean)
      .map((row) => inflateWord(row, source));
  }
  if (method === "resolve") return index.resolve(args.words);
  if (method === "matching") return index.matching(args.text);
  throw Error("Unknown dictionary request");
}
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      result: await execute(data.method, data.args || {}),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
