import { rankEntry, HAN, wordId } from "./core.mjs";
import { getClient, getSession } from "./auth.mjs";
const cache = new Map();
async function accountClient() {
  if (!(await getSession())) throw Error("Public catalog mode");
  return getClient();
}
async function json(path) {
  if (!cache.has(path))
    cache.set(
      path,
      fetch(new URL("../data/study/" + path, import.meta.url))
        .then((r) => {
          if (!r.ok) throw Error("Không tải được học liệu. Hãy thử lại.");
          return r.json();
        })
        .catch((e) => {
          cache.delete(path);
          throw e;
        }),
    );
  return cache.get(path);
}
export const catalog = () => json("catalog.json");
const merge = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const e = row.data || row;
    const old = map.get(e.id);
    if (!old) map.set(e.id, structuredClone(e));
    else {
      old.curriculumTags.push(...(e.curriculumTags || []));
      old.meaningsVi = [...new Set([...old.meaningsVi, ...e.meaningsVi])];
      old.examples.push(
        ...(e.examples || []).filter(
          (x) => !old.examples.some((y) => y.chinese === x.chinese),
        ),
      );
    }
  }
  return [...map.values()];
};
export class DictionaryRepository {
  async search(query, { page = 0, limit = 12, savedIds = null } = {}) {
    const data = await catalog();
    // The static index covers public course data only. Private rows stay behind RLS.
    let results = data.entries
      .map((e) => ({ ...e, score: query ? rankEntry(e, query) : 1 }))
      .filter((e) => e.score > 0);
    let remote = false;
    try {
      const c = await accountClient();
      const { data: rows, error } = await c.rpc("study_search_dictionary", {
        query_text: query,
        offset_count: page * limit,
        result_limit: limit,
      });
      if (error) throw error;
      if (rows?.length && !savedIds)
        return {
          entries: merge(rows),
          total: rows[0].total_count,
          remote: true,
        };
      remote = true;
    } catch {
      /* Public course lookup remains available if the database is temporarily offline. */
    }
    if (savedIds) results = results.filter((e) => savedIds.includes(e.id));
    results.sort(
      (a, b) =>
        b.score - a.score || a.simplified.localeCompare(b.simplified, "zh"),
    );
    const entries = await Promise.all(
      results
        .slice(page * limit, (page + 1) * limit)
        .map((e) => this.get(e.id)),
    );
    return { entries: entries.filter(Boolean), total: results.length, remote };
  }
  async get(id) {
    if (!/^w-[0-9a-f-]+$/.test(id)) return null;
    try {
      const c = await accountClient();
      const { data, error } = await c
        .from("study_dictionary")
        .select("data")
        .eq("entry_id", id);
      if (!error && data?.length) return merge(data)[0];
    } catch {}
    const index = await catalog();
    if (!index.entries.some((e) => e.id === id)) return null;
    return json("entries/" + id + ".json");
  }
  async batch(words) {
    const ids = [...new Set(words.map(wordId))];
    if (!ids.length) return [];
    try {
      const c = await accountClient();
      const { data, error } = await c
        .from("study_dictionary")
        .select("data")
        .in("entry_id", ids);
      if (!error && data?.length) return merge(data);
    } catch {}
    const index = await catalog();
    return Promise.all(
      index.entries
        .filter((e) => ids.includes(e.id))
        .map((e) => json("entries/" + e.id + ".json")),
    );
  }
  async compounds(character) {
    try {
      const c = await accountClient();
      const { data, error } = await c
        .from("study_dictionary")
        .select("data")
        .like("simplified", "%" + character + "%")
        .limit(80);
      if (!error && data?.length) return merge(data);
    } catch {}
    const data = await catalog();
    return Promise.all(
      data.entries
        .filter((e) => e.simplified.includes(character))
        .map((e) => json("entries/" + e.id + ".json")),
    );
  }
  async matchingText(text) {
    const index = await catalog();
    let candidates = index.entries.filter(
      (e) =>
        text.includes(e.simplified) ||
        (e.traditional && text.includes(e.traditional)),
    );
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    const words = [
      ...new Set(
        [...segmenter.segment(text)]
          .map((s) => s.segment)
          .filter((s) => HAN.test(s)),
      ),
    ];
    const fetched = await this.batch([
      ...words,
      ...candidates.map((e) => e.simplified),
    ]);
    return fetched;
  }
}
export class CharacterRepository {
  async list() {
    const local = (await catalog()).characters;
    try {
      const c = await accountClient();
      const { data, error } = await c
        .from("study_characters")
        .select("data")
        .limit(5000);
      if (!error && data?.length) {
        const map = new Map();
        for (const { data: row } of data) {
          const previous = map.get(row.character);
          if (previous) previous.curriculumTags.push(...row.curriculumTags);
          else map.set(row.character, structuredClone(row));
        }
        return [...map.values()];
      }
    } catch {}
    return local;
  }
  async get(character, lessonId = null) {
    let local = (await catalog()).characters.find(
      (c) => c.character === character,
    );
    try {
      const client = await accountClient();
      const { data, error } = await client
        .from("study_characters")
        .select("data")
        .eq("character", character);
      if (!error && data?.length) {
        const preferred =
          data.find((r) => r.data.lessonId === lessonId) || data[0];
        local = structuredClone(preferred.data);
        local.curriculumTags = data.flatMap((r) => r.data.curriculumTags || []);
      }
    } catch {}
    if (local) return local;
    const unicode = await json("unicode.json");
    const u = unicode.characters[character];
    return {
      character,
      pinyin: u?.pinyin || null,
      meaningsVi: [],
      curriculumTags: [],
      ...u,
      provenance: u ? [unicode.provenance] : [],
    };
  }
}
export class ReadingRepository {
  async list() {
    try {
      const c = await accountClient();
      const { data, error } = await c.from("study_library").select("data");
      if (!error && data?.length) return data.map((r) => r.data);
    } catch {}
    return (await catalog()).readings;
  }
  async get(id) {
    const list = await this.list();
    const item = list.find((r) => r.id === id);
    if (!item) return null;
    return item.sourceText ? item : json("readings/" + id + ".json");
  }
}
export const dictionary = new DictionaryRepository();
export const characters = new CharacterRepository();
export const readings = new ReadingRepository();
