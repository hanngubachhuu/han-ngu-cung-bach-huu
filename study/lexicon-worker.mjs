import { tonePinyin } from "./lexicon-core.mjs";
import { normalizeLatin, normalizePinyin } from "./core.mjs";

const storageBase =
  "https://dmeqxdznzobbarvkmxyg.supabase.co/storage/v1/object/public/study-lexicon/sources/";
let unicodePromise;
let hanvietPromise;
let characterPromise;

async function gzipJson(path) {
  const response = await fetch(storageBase + path);
  if (!response.ok) throw Error("Không tải được dữ liệu Hán tự từ Supabase.");
  if (typeof DecompressionStream !== "function")
    throw Error("Trình duyệt này chưa hỗ trợ giải nén kho Hán tự.");
  if (!response.body)
    throw Error("Không đọc được dữ liệu Hán tự từ Supabase.");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

const unicode = () =>
  (unicodePromise ||= gzipJson("unihan.json.gz").catch((error) => {
    unicodePromise = null;
    throw error;
  }));

const hanviet = () =>
  (hanvietPromise ||= gzipJson("hanviet.json.gz").catch((error) => {
    hanvietPromise = null;
    throw error;
  }));

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

function characterSourceRows() {
  return (characterPromise ||= Promise.all([unicode(), hanviet()])
    .then(([source, mapping]) => {
      const rows = [];
      for (const [character, u] of Object.entries(source.characters || {})) {
        if (!/^\p{Script=Han}$/u.test(character)) continue;
        const traditional = variants(u.kTraditionalVariant);
        const simplified = variants(u.kSimplifiedVariant);
        const hvForms = mapping[character]
          ? [character]
          : traditional.filter((c) => mapping[c]);
        const hanVietReadings = hvForms.flatMap((form) =>
          Object.entries(mapping[form] || {})
            .filter(([, values]) => values?.length)
            .map(([numbered, values]) => [form, numbered, values]),
        );
        const pinyins = [
          ...(u.kMandarin?.split(" ") || []),
          ...(u.kHanyuPinyin
            ?.split(" ")
            .flatMap(
              (value) => value.split(":")[1]?.split(",") || [],
            ) || []),
        ];
        if (!pinyins.length)
          pinyins.push(
            ...hanVietReadings
              .filter((reading) => reading[1] !== "*")
              .map((reading) => tonePinyin(reading[1])),
          );
        const radicalKey = u.kRSUnicode?.split(" ")[0]?.split(".")[0];
        const radical = source.radicals?.[radicalKey] || "";
        rows.push({
          character,
          pinyin: pinyins.join(" · "),
          strokeCount: Number(u.kTotalStrokes?.split(" ")[0]) || null,
          radical,
          radicalNumber: Number(radicalKey?.replaceAll("'", "")) || null,
          traditional,
          simplified,
          vietnameseReadings: u.kVietnamese?.split(" ") || [],
          definitionEn: u.kDefinition || "",
          commonRank: Number(u.kTGH?.split(":")[1]) || null,
          hanVietReadings,
          hanViet: [
            ...new Set(hanVietReadings.flatMap((reading) => reading[2])),
          ].join(" / ") || null,
        });
      }
      return {
        rows,
        byChar: new Map(rows.map((row) => [row.character, row])),
      };
    })
    .catch((error) => {
      characterPromise = null;
      throw error;
    }));
}

function characterData(row) {
  if (!row) return null;
  return {
    character: row.character,
    pinyin: row.pinyin,
    strokeCount: row.strokeCount,
    radical: row.radical || null,
    radicalNumber: row.radicalNumber,
    traditional: row.traditional,
    simplified: row.simplified,
    vietnameseReadings: row.vietnameseReadings,
    definitionEn: row.definitionEn,
    commonRank: row.commonRank,
    hanViet: row.hanViet,
    hanVietReadings: row.hanVietReadings.map(([form, numbered, values]) => ({
      character: form,
      numbered,
      pinyin: numbered === "*" ? null : tonePinyin(numbered),
      values,
    })),
    meaningsVi: [],
    curriculumTags: [],
    source: "open-lexicon",
  };
}

function searchable(row) {
  return {
    ...row,
    normal: normalizeLatin(
      [
        row.character,
        row.pinyin,
        row.hanViet,
        ...(row.vietnameseReadings || []),
        row.definitionEn,
        ...(row.traditional || []),
        ...(row.simplified || []),
      ].join(" "),
    ),
    pinyins: (row.pinyin || "")
      .split(" · ")
      .map(normalizePinyin)
      .filter(Boolean),
  };
}

async function execute(method, args) {
  if (method === "character")
    return characterData(
      (await characterSourceRows()).byChar.get(args.character),
    );

  if (method === "characters") {
    const { rows: sourceRows, byChar } = await characterSourceRows();
    const normal = normalizeLatin(args.query || "");
    const pinyin = normalizePinyin(args.query || "");
    const seen = new Set();
    const hits = [];
    const matches = (candidate) =>
      !args.query ||
      args.query.includes(candidate.character) ||
      candidate.normal.includes(normal) ||
      (pinyin && candidate.pinyins.some((value) => value.includes(pinyin)));

    for (const row of args.overlays || []) {
      const imported = byChar.get(row.character);
      const base = imported
        ? searchable(imported)
        : searchable({
            character: row.character,
            pinyin: row.pinyin || "",
            hanViet: row.hanViet || "",
            vietnameseReadings: [],
            definitionEn: "",
            traditional: [],
            simplified: [],
          });
      const candidate = {
        ...base,
        pinyin: row.pinyin || base.pinyin,
        common: imported?.commonRank || null,
      };
      if (row.meaningsVi?.length)
        candidate.normal += " " + normalizeLatin(row.meaningsVi.join(" "));
      if (
        (args.mode !== "common" || candidate.common) &&
        matches(candidate)
      ) {
        hits.push(candidate);
        seen.add(row.character);
      }
    }

    for (const raw of sourceRows) {
      if (
        seen.has(raw.character) ||
        (args.mode === "common" && !raw.commonRank) ||
        !matches(searchable(raw))
      )
        continue;
      hits.push(raw);
    }

    const offset = Math.max(0, args.page || 0) * 72;
    return {
      total: hits.length,
      rows: hits
        .slice(offset, offset + 72)
        .map((row) => ({ character: row.character, pinyin: row.pinyin })),
    };
  }

  throw Error("Unknown Hán tự request: " + method);
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
