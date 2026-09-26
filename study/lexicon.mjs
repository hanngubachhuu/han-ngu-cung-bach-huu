import { getClient } from "./auth.mjs";
import { wordFromId, wordId } from "./core.mjs";
import { tonePinyin } from "./lexicon-core.mjs";

let worker;
let next = 0;
const pending = new Map();
const CHARACTER_METHODS = new Set(["characters", "character"]);

function resetWorker(message) {
  worker?.terminate();
  worker = null;
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(Error(message));
  }
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./lexicon-worker.mjs", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    data.error
      ? request.reject(Error(data.error))
      : request.resolve(data.result);
  };
  worker.onerror = () =>
    resetWorker("Kho Hán tự mở rộng chưa tải được. Hãy thử tải lại trang.");
  return worker;
}

function workerRequest(method, args = {}) {
  const currentWorker = ensureWorker();
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(
      () =>
        resetWorker(
          "Tải kho Hán tự mở rộng mất quá lâu. Kiểm tra kết nối rồi thử lại.",
        ),
      60000,
    );
    pending.set(id, { resolve, reject, timer });
    currentWorker.postMessage({ id, method, args });
  });
}

async function rpc(name, args = {}) {
  const client = await getClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

function inflateRemoteWord(row) {
  const readings = (row.readings || []).map((reading) => ({
    traditional: reading.traditional,
    numbered: reading.numbered,
    pinyin: tonePinyin(reading.numbered),
    hanViet: null,
    meaningsVi: (reading.meaningsVi || []).filter(
      (meaning) => !/^(?:CL|LT|lượng từ)\s*:/i.test(meaning),
    ),
    classifiers: (reading.meaningsVi || [])
      .filter((meaning) => /^(?:CL|LT|lượng từ)\s*:/i.test(meaning))
      .map((meaning) => meaning.replace(/^[^:]+:\s*/, "")),
  }));
  const first = readings[0] || {
    traditional: row.traditional,
    pinyin: tonePinyin(row.pinyin || ""),
    meaningsVi: [],
    classifiers: [],
  };
  return {
    id: wordId(row.simplified),
    simplified: row.simplified,
    traditional: row.traditional || first.traditional,
    pinyin: first.pinyin || tonePinyin(row.pinyin || ""),
    hanViet: row.han_viet || null,
    meaningsVi: first.meaningsVi || [],
    readings,
    classifiers: first.classifiers || [],
    partOfSpeech: [],
    examples: [],
    curriculumTags: [],
    visibility: "public",
    provenance: {
      source: "cvdict",
      name: "CVDICT",
      author: "Phong Phan; CC-CEDICT contributors",
      version: "c379d909e308343a247e51619f7839a2060a271c",
      license: "CC-BY-SA-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    hanVietSource: "hanviet-pinyin-wordlist",
    quality: "community-reference",
    frequency: Number(row.frequency || 0),
    common: row.common === true,
  };
}

async function remoteWords(words) {
  if (!words.length) return [];
  return (
    await rpc("get_study_lexicon_words_v2", {
      word_list: [...new Set(words)],
    })
  ).map(inflateRemoteWord);
}

async function remoteSearch(
  query,
  { page = 0, limit = 12, savedIds = null, contains = null, overlays = [] } = {},
) {
  const savedSimplified = savedIds?.map(wordFromId).filter(Boolean) || null;
  const offset = Math.max(0, page) * limit;
  const candidates = (overlays || [])
    .filter((entry) => entry.score > 0)
    .filter(
      (entry) =>
        !savedSimplified || savedSimplified.includes(entry.simplified),
    )
    .filter(
      (entry) =>
        !contains ||
        entry.simplified.includes(contains) ||
        (entry.traditional || "").includes(contains),
    );

  let courseOnly = [];
  if (candidates.length) {
    const existing = new Set(
      (await remoteWords(candidates.map((entry) => entry.simplified))).map(
        (entry) => entry.simplified,
      ),
    );
    courseOnly = candidates
      .filter((entry) => !existing.has(entry.simplified))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.simplified.localeCompare(b.simplified, "zh"),
      );
  }

  let remoteOffset = offset;
  let remoteLimit = limit;
  let prefix = [];
  if (offset < courseOnly.length) {
    prefix = courseOnly.slice(offset, offset + limit);
    remoteOffset = 0;
    remoteLimit = Math.max(0, limit - prefix.length);
  } else {
    remoteOffset = offset - courseOnly.length;
  }

  const rows =
    remoteLimit > 0
      ? await rpc("search_study_lexicon_v2", {
          query_text: query,
          offset_rows: remoteOffset,
          result_limit: remoteLimit,
          contains_text: contains,
          saved_simplified: savedSimplified,
          exclude_simplified: null,
        })
      : [];

  const remoteTotal = rows.length ? Number(rows[0].total_count || 0) : 0;
  return {
    hits: [
      ...prefix.map((entry) => ({
        id: entry.id,
        simplified: entry.simplified,
        score: entry.score,
        course: true,
        frequency: 0,
        common: false,
      })),
      ...rows.map((row) => ({
        id: wordId(row.simplified),
        simplified: row.simplified,
        score: Number(row.match_score || 0),
        frequency: Number(row.frequency || 0),
        common: row.common === true,
      })),
    ],
    total: remoteTotal + courseOnly.length,
  };
}

async function remoteCharacter(character) {
  const open = await workerRequest("character", { character });
  if (!open) return null;
  try {
    const rows = await remoteWords([character]);
    const word = rows[0];
    if (word) {
      open.meaningsVi = word.meaningsVi || [];
      open.hanViet = word.hanViet || open.hanViet || null;
    }
  } catch {
    // Unihan/Hán Việt remains usable if the word RPC is unavailable.
  }
  return open;
}

export async function lexiconRequest(method, args = {}) {
  if (CHARACTER_METHODS.has(method)) {
    if (method === "character") return remoteCharacter(args.character);
    return workerRequest(method, args);
  }
  if (method === "manifest") return rpc("get_study_lexicon_meta");
  if (method === "search") return remoteSearch(args.query || "", args);
  if (method === "get") {
    const words = (args.ids || []).map(wordFromId).filter(Boolean);
    return remoteWords(words);
  }
  if (method === "resolve") {
    const rows = await rpc("resolve_study_lexicon_words", {
      words: args.words || [],
    });
    return (rows || []).map((row) => wordId(row.simplified));
  }
  if (method === "matching") {
    const rows = await rpc("match_study_lexicon", {
      text_input: args.text || "",
    });
    return (rows || []).map((row) => wordId(row.simplified));
  }
  throw Error("Unknown lexicon request: " + method);
}

export const lexiconManifest = () => lexiconRequest("manifest");
