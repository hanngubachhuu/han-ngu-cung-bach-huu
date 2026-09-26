import { tonePinyin } from "./lexicon-core.mjs";
import {
  normalizeLatin,
  normalizePinyin,
  wordId,
} from "./core.mjs";

const SUPABASE_URL = "https://dmeqxdznzobbarvkmxyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_Eu3OomqNNfurPdMtKDYBqw_HCRby2U_";
const REST_BASE = SUPABASE_URL + "/rest/v1/";
const RPC_BASE = REST_BASE + "rpc/";
const STORAGE_BASE =
  SUPABASE_URL + "/storage/v1/object/public/study-lexicon/sources/";

const sourceMeta = {
  cvdict: {
    id: "cvdict",
    name: "CVDICT",
    author: "Phong Phan; CC-CEDICT contributors",
    url: "https://github.com/ph0ngp/CVDICT",
    version: "c379d909e308343a247e51619f7839a206a271c",
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  hanviet: {
    id: "hanviet",
    name: "Hán Việt Pinyin",
    author: "Phong Phan",
    url: "https://github.com/ph0ngp/hanviet-pinyin-wordlist",
    version: "a1292b0fdfbfeed41e08ae53e8bc4e01167bed28",
    license: "MIT",
    licenseUrl:
      "https://github.com/ph0ngp/hanviet-pinyin-words/blob/a1292b0fdfbfeed41e08ae53e8bc4e01167bed28/LICENSE",
  },
  unihan: {
    id: "unihan",
    name: "Unicode Unihan 17.0",
    author: "Unicode, Inc.",
    url: "https://www.unicode.org/reports/tr38/",
    version: "17.0.0",
    license: "Unicode-3.0",
    licenseUrl: "https://www.unicode.org/license.txt",
  },
  jieba: {
    id: "jieba",
    name: "Jieba word frequencies",
    author: "Sun Junyi and contributors",
    url: "https://github.com/fxsjy/jieba",
    version: "67fa2e36e72f69d9134b8a1037b83fbb070b9775",
    license: "MIT",
    licenseUrl:
      "https://github.com/fxsjy/jieba/blob/67fa2e36e72f69d9134b8a1037b83fbb070b9775/LICENSE",
  },
};

let manifestPromise;
let hanvietPromise;
let charactersPromise;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    Accept: "application/json",
  };
}

async function parseResponse(response, fallback) {
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.parse(text).message || JSON.parse(text).error || "";
    } catch {}
    throw Error(detail || fallback);
  }
  return text ? JSON.parse(text) : null;
}

async function rpc(name, body = {}) {
  const response = await fetch(RPC_BASE + name, {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parseResponse(response, "Kho từ điển mở rộng chưa sẵn sàng.");
}

async function tableSelect(path) {
  const response = await fetch(REST_BASE + path, {
    headers: headers(),
    cache: "no-store",
  });
  return parseResponse(response, "Không tải được dữ liệu từ điển.");
}

async function gzipJson(url, message) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw Error(message);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== "function")
      throw Error("Trình duyệt chưa hỗ trợ giải nén kho từ điển.");
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function manifest() {
  return (manifestPromise ||= rpc("get_study_lexicon_meta").catch((error) => {
    manifestPromise = null;
    throw error;
  }));
}

async function hanviet() {
  return (hanvietPromise ||= gzipJson(
    STORAGE_BASE + "hanviet.json.gz",
    "Không tải được dữ liệu âm Hán Việt.",
  ).catch((error) => {
    hanvietPromise = null;
    throw error;
  }));
}

function normalizeToneKey(value) {
  return normalizePinyin(String(value || ""));
}

function mappedHanViet(traditional, numbered, mapping) {
  const chars = [...String(traditional || "")];
  const syllables = String(numbered || "").trim().split(/\s+/).filter(Boolean);
  if (!chars.length || chars.length !== syllables.length) return null;
  const parts = chars.map((character, index) => {
    const table = mapping[character];
    const raw = syllables[index].toLowerCase();
    const key = raw.replace(/u:|ü/g, "v");
    const values =
      table?.[raw] ||
      table?.[key] ||
      table?.["*"];
    return Array.isArray(values) && values.length ? values.join("/") : null;
  });
  return parts.every(Boolean) ? parts.join(" ") : null;
}

function classifiersAndMeanings(meanings) {
  const list = Array.isArray(meanings) ? meanings : [];
  return {
    meaningsVi: list.filter(
      (m) => !/^(?:CL|LT|lượng từ)\s*:/i.test(m),
    ),
    classifiers: list
      .filter((m) => /^(?:CL|LT|lượng từ)\s*:/i.test(m))
      .map((m) => m.replace(/^[^:]+:\s*/, "")),
  };
}

function inflateRemoteWord(row, mapping) {
  const readings = (row.readings || []).map((reading) => {
    const info = classifiersAndMeanings(reading.meaningsVi);
    return {
      traditional: reading.traditional,
      numbered: reading.numbered,
      pinyin: tonePinyin(reading.numbered),
      hanViet: mappedHanViet(
        reading.traditional,
        reading.numbered,
        mapping,
      ),
      meaningsVi: info.meaningsVi,
      classifiers: info.classifiers,
    };
  });
  const first = readings[0] || {
    traditional: row.traditional,
    pinyin: tonePinyin(row.pinyin),
    hanViet: null,
    meaningsVi: row.meanings_vi || [],
    classifiers: [],
  };
  return {
    id: wordId(row.simplified),
    simplified: row.simplified,
    traditional: first.traditional || row.traditional,
    pinyin: first.pinyin || tonePinyin(row.pinyin),
    hanViet: first.hanViet,
    meaningsVi: first.meaningsVi,
    readings,
    classifiers: first.classifiers,
    partOfSpeech: [],
    examples: [],
    curriculumTags: [],
    visibility: "public",
    provenance: {
      source: "cvdict",
      name: sourceMeta.cvdict.name,
      version: sourceMeta.cvdict.version,
      license: sourceMeta.cvdict.license,
    },
    hanVietSource: "hanviet-pinyin-wordlist",
    quality: "community-reference",
    frequency: row.frequency || 0,
    common: !!row.common,
  };
}

async function remoteEntries(ids) {
  if (!ids.length) return [];
  const simplified = [];
  for (const id of ids) {
    if (!/^w-(?:[0-9a-f]+-?)+$/i.test(id)) continue;
    try {
      const word = id
        .slice(2)
        .split("-")
        .filter(Boolean)
        .map((value) => String.fromCodePoint(parseInt(value, 16)))
        .join("");
      if (word) simplified.push(word);
    } catch {}
  }
  if (!simplified.length) return [];
  const rows = await rpc("get_study_lexicon_words", {
    word_list: simplified,
  });
  const mapping = await hanviet();
  return rows.map((row) => inflateRemoteWord(row, mapping));
}

function decodeIds(ids) {
  return (ids || []).flatMap((id) => {
    if (!/^w-(?:[0-9a-f]+-?)+$/i.test(id)) return [];
    try {
      const word = id
        .slice(2)
        .split("-")
        .filter(Boolean)
        .map((value) => String.fromCodePoint(parseInt(value, 16)))
        .join("");
      return word ? [word] : [];
    } catch {
      return [];
    }
  });
}

function compareHits(a, b) {
  return (
    (b.score || 0) - (a.score || 0) ||
    Number(!!b.course) - Number(!!a.course) ||
    (b.frequency || 0) - (a.frequency || 0) ||
    Number(!!b.common) - Number(!!a.common) ||
    a.simplified.localeCompare(b.simplified, "zh")
  );
}

async function searchWords(args) {
  const page = Math.max(0, Number(args.page) || 0);
  const limit = Math.max(1, Math.min(Number(args.limit) || 12, 100));
  const raw = String(args.query || "").trim().normalize("NFC").slice(0, 120);
  const savedSimplified = args.savedIds?.length
    ? decodeIds(args.savedIds)
    : null;
  const overlays = (args.overlays || [])
    .filter(
      (entry) =>
        !savedSimplified || savedSimplified.includes(entry.simplified),
    )
    .filter(
      (entry) =>
        !args.contains ||
        entry.simplified.includes(args.contains) ||
        String(entry.traditional || "").includes(args.contains),
    )
    .filter((entry) => entry.score > 0 || !raw)
    .map((entry) => ({
      id: entry.id,
      simplified: entry.simplified,
      frequency: 0,
      common: false,
      score: raw ? entry.score : 1,
      course: true,
    }))
    .sort(compareHits);

  const exclude = overlays.map((entry) => entry.simplified);
  const start = page * limit;
  const overlayPage = overlays.slice(start, start + limit);
  const remoteOffset = Math.max(0, start - overlays.length);
  const remoteLimit = Math.max(0, limit - overlayPage.length);

  let remote = [];
  let remoteTotal = 0;
  if (remoteLimit) {
    const rows = await rpc("search_study_lexicon", {
      query_text: raw,
      offset_rows: remoteOffset,
      result_limit: remoteLimit,
      contains_text: args.contains || null,
      saved_simplified: savedSimplified,
      exclude_simplified: exclude.length ? exclude : null,
    });
    remote = rows.map((row) => ({
      id: wordId(row.simplified),
      simplified: row.simplified,
      frequency: Number(row.frequency) || 0,
      common: !!row.common,
      score: Number(row.match_score) || 0,
    }));
    remoteTotal = Number(rows[0]?.total_count) || 0;
  } else {
    const rows = await rpc("search_study_lexicon", {
      query_text: raw,
      offset_rows: 0,
      result_limit: 1,
      contains_text: args.contains || null,
      saved_simplified: savedSimplified,
      exclude_simplified: exclude.length ? exclude : null,
    });
    remoteTotal = Number(rows[0]?.total_count) || 0;
  }

  const hits = [...overlayPage, ...remote];
  return {
    hits: hits.map((hit) => ({ ...hit })),
    total: overlays.length + remoteTotal,
  };
}

async function loadCharacters() {
  return (charactersPromise ||= Promise.all([
    gzipJson(
      STORAGE_BASE + "unihan.json.gz",
      "Không tải được dữ liệu Hán tự Unicode.",
    ),
    hanviet(),
    rpc("list_study_lexicon_single_characters"),
  ])
    .then(([unicode, mapping, singles]) => {
      const singleMeanings = new Map();
      for (const word of singles) {
        const meanings = Array.isArray(word.meanings_vi)
          ? word.meanings_vi.filter(
              (m) => !/^(?:CL|LT|lượng từ)\s*:/i.test(m),
            )
          : [];
        for (const character of new Set([
          ...String(word.simplified || ""),
          ...String(word.traditional || ""),
        ])) {
          if ([...character].length !== 1) continue;
          const prior = singleMeanings.get(character) || [];
          singleMeanings.set(
            character,
            [...new Set([...prior, ...meanings])],
          );
        }
      }

      const variants = (raw) =>
        raw
          ? [
              ...new Set(
                String(raw)
                  .split(" ")
                  .map((cp) =>
                    String.fromCodePoint(
                      parseInt(cp.split("<")[0].slice(2), 16),
                    ),
                  ),
              ),
            ]
          : [];

      const chars = new Set([
        ...Object.keys(unicode.characters || {}),
        ...Object.keys(mapping || {}),
        ...singleMeanings.keys(),
      ]);
      const rows = [];

      for (const character of chars) {
        if (!/^\p{Script=Han}$/u.test(character)) continue;
        const u = unicode.characters?.[character] || {};
        const traditional = variants(u.kTraditionalVariant);
        const simplified = variants(u.kSimplifiedVariant);
        const hvForms = mapping[character]
          ? [character]
          : traditional.filter((form) => mapping[form]);
        const hanVietReadings = hvForms.flatMap((form) =>
          Object.entries(mapping[form] || {})
            .filter(([, values]) => values.length)
            .map(([numbered, values]) => [form, numbered, values]),
        );
        const pinyins = [
          ...new Set([
            ...(u.kMandarin?.split(" ") || []),
            ...(u.kHanyuPinyin
              ?.split(" ")
              .flatMap(
                (value) =>
                  value.split(":")[1]?.split(",") || [],
              ) || []),
          ]),
        ];
        if (!pinyins.length) {
          pinyins.push(
            ...hanVietReadings
              .filter((reading) => reading[1] !== "*")
              .map((reading) => tonePinyin(reading[1])),
          );
        }
        const radicalKey = u.kRSUnicode?.split(" ")[0]?.split(".")[0];
        rows.push([
          character,
          pinyins.join(" · "),
          Number(u.kTotalStrokes?.split(" ")[0]) || 0,
          unicode.radicals?.[radicalKey] || "",
          Number(radicalKey?.replaceAll("'", "")) || 0,
          traditional,
          simplified,
          u.kVietnamese?.split(" ") || [],
          u.kDefinition || "",
          Number(u.kTGH?.split(":")[1]) || 0,
          hanVietReadings,
          singleMeanings.get(character) || [],
        ]);
      }

      rows.sort(
        (a, b) =>
          (a[9] || 1e6) - (b[9] || 1e6) ||
          a[0].codePointAt(0) - b[0].codePointAt(0),
      );

      const prepared = rows.map((row) => ({
        row,
        character: row[0],
        common: !!row[9],
        normal: normalizeLatin(
          [
            row[1],
            ...row[10].flatMap((reading) => reading[2]),
            ...row[11],
            ...row[7],
            row[8],
          ].join(" "),
        ),
        pinyins: row[1]
          ? row[1].split(" · ").map(normalizePinyin)
          : [],
      }));

      return {
        rows: prepared,
        byChar: new Map(rows.map((row) => [row[0], row])),
      };
    })
    .catch((error) => {
      charactersPromise = null;
      throw error;
    }));
}

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
    hanViet: [...new Set(row[10].flatMap((reading) => reading[2]))].join(
      " / ",
    ) || null,
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

async function searchCharacters(args) {
  const { rows } = await loadCharacters();
  const normal = normalizeLatin(args.query || "");
  const pinyin = normalizePinyin(args.query || "");
  const seen = new Set();
  const hits = [];

  const matches = (candidate) =>
    !args.query ||
    String(args.query).includes(candidate.character) ||
    candidate.character.includes(String(args.query)) ||
    (normal && candidate.normal.includes(normal)) ||
    (pinyin && candidate.pinyins.some((value) => value.includes(pinyin)));

  for (const row of args.overlays || []) {
    const imported = (await loadCharacters()).byChar.get(row.character);
    const candidate = {
      character: row.character,
      pinyin: row.pinyin || imported?.[1] || "",
      common: !!imported?.[9],
      normal: normalizeLatin(
        [
          row.pinyin,
          row.hanViet,
          ...(row.meaningsVi || []),
        ].join(" "),
      ),
      pinyins: [normalizePinyin(row.pinyin || "")],
    };
    if (imported) {
      candidate.normal +=
        " " +
        normalizeLatin(
          [
            ...imported[10].flatMap((reading) => reading[2]),
            ...imported[11],
          ].join(" "),
        );
      candidate.pinyins.push(
        ...imported[1].split(" · ").map(normalizePinyin),
      );
    }
    if (
      (args.mode !== "common" || candidate.common) &&
      matches(candidate)
    ) {
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
    hits.push({
      character: candidate.character,
      pinyin: candidate.row[1],
    });
  }

  const page = Math.max(0, Number(args.page) || 0);
  const offset = page * 72;
  return {
    total: hits.length,
    rows: hits
      .slice(offset, offset + 72)
      .map(({ character, pinyin }) => ({ character, pinyin })),
  };
}

async function execute(method, args) {
  if (method === "manifest") return await manifest();
  if (method === "character") {
    return characterData(
      (await loadCharacters()).byChar.get(args.character),
    );
  }
  if (method === "characters") return searchCharacters(args);
  if (method === "search")
    return searchWords({
      ...args,
      query: String(args.query || ""),
    });
  if (method === "get") {
    const rows = await remoteEntries(args.ids || []);
    return rows.map((row) => ({
      ...row,
      score: 0,
    }));
  }
  if (method === "resolve") {
    const rows = await rpc("resolve_study_lexicon_words", {
      words: args.words || [],
    });
    return rows.map((row) => wordId(row.simplified));
  }
  if (method === "matching") {
    const rows = await rpc("match_study_lexicon", {
      text_input: String(args.text || ""),
    });
    return rows.map((row) => wordId(row.simplified));
  }
  throw Error("Unknown dictionary request");
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      result: await execute(data.method, data.args || {}),
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
