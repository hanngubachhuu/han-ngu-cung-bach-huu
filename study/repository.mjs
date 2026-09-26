import { rankEntry, wordId, normalizeLatin } from "./core.mjs";
import { getClient, getSession } from "./auth.mjs";
import { lexiconRequest } from "./lexicon.mjs";
import { enrichCourseEntry, enrichCharacter } from "./lexicon-merge.mjs";
const cache = new Map(),
  accountCache = new Map();
window.addEventListener("study:auth", () => accountCache.clear());
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
function merge(rows) {
  const map = new Map();
  for (const row of rows) {
    const e = row.data || row,
      old = map.get(e.id);
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
}
async function accessibleRows(table) {
  const session = await getSession().catch(() => null);
  if (!session) return [];
  const key = session.user.id + ":" + table;
  if (!accountCache.has(key))
    accountCache.set(
      key,
      (async () => {
        const client = await getClient(),
          result = [];
        // User JWT and RLS decide which course rows are visible; no service key.
        for (let start = 0; ; start += 1000) {
          const { data, error } = await client
            .from(table)
            .select("data")
            .order("record_id")
            .range(start, start + 999);
          if (error) throw error;
          result.push(...data);
          if (data.length < 1000) break;
        }
        return result;
      })().catch((e) => {
        accountCache.delete(key);
        throw e;
      }),
    );
  return accountCache.get(key);
}
async function courseIndex() {
  const index = new Map((await catalog()).entries.map((e) => [e.id, e]));
  for (const e of merge(
    await accessibleRows("study_dictionary").catch(() => []),
  ))
    index.set(e.id, e);
  return index;
}
const fallbackWarning =
  "Kho mở rộng chưa tải được. Đang hiển thị phần giáo trình có sẵn; hãy thử lại khi kết nối ổn định.";
export class DictionaryRepository {
  async entries(ids, index = null) {
    index ||= await courseIndex();
    const imported = new Map(
      (await lexiconRequest("get", { ids }).catch(() => [])).map((e) => [
        e.id,
        e,
      ]),
    );
    return (
      await Promise.all(
        ids.map(async (id) => {
          const summary = index.get(id);
          const course = summary
            ? summary.examples
              ? summary
              : await json("entries/" + id + ".json")
            : null;
          return enrichCourseEntry(course, imported.get(id));
        }),
      )
    ).filter(Boolean);
  }
  async search(
    query,
    { page = 0, limit = 12, savedIds = null, contains = null } = {},
  ) {
    const index = await courseIndex();
    const overlays = [...index.values()]
      .filter(
        (e) =>
          !contains ||
          [e.simplified, e.traditional || ""].some((s) => s.includes(contains)),
      )
      .map((e) => ({
        id: e.id,
        simplified: e.simplified,
        score: query ? rankEntry(e, query) : 1,
      }))
      .filter((e) => e.score > 0 && (!savedIds || savedIds.includes(e.id)));
    let result, warning;
    try {
      result = await lexiconRequest("search", {
        query,
        page,
        limit,
        contains,
        savedIds,
        overlays,
      });
    } catch {
      warning = fallbackWarning;
      overlays.sort(
        (a, b) =>
          b.score - a.score || a.simplified.localeCompare(b.simplified, "zh"),
      );
      result = {
        hits: overlays.slice(page * limit, (page + 1) * limit),
        total: overlays.length,
      };
    }
    return {
      entries: await this.entries(
        result.hits.map((e) => e.id),
        index,
      ),
      total: result.total,
      warning,
    };
  }
  async get(id) {
    if (!/^w-[0-9a-f-]+$/.test(id)) return null;
    return (await this.entries([id]))[0] || null;
  }
  async batch(words) {
    const index = await courseIndex();
    const resolved = await lexiconRequest("resolve", { words }).catch(() => []);
    const direct = words.map(wordId).filter((id) => index.has(id));
    return this.entries([...new Set([...direct, ...resolved])], index);
  }
  async compounds(character, options = {}) {
    return this.search("", { ...options, contains: character });
  }
  async matchingText(text) {
    const index = await courseIndex();
    const imported = await lexiconRequest("matching", { text }).catch(() => []);
    const course = [...index.values()]
      .filter(
        (e) =>
          text.includes(e.simplified) ||
          (e.traditional && text.includes(e.traditional)),
      )
      .map((e) => e.id);
    return this.entries([...new Set([...course, ...imported])], index);
  }
}
export class CharacterRepository {
  async list() {
    const map = new Map(
      (await catalog()).characters.map((e) => [e.character, e]),
    );
    const remote = new Map();
    for (const { data: row } of await accessibleRows("study_characters").catch(
      () => [],
    )) {
      const previous = remote.get(row.character);
      if (previous) previous.curriculumTags.push(...row.curriculumTags);
      else remote.set(row.character, structuredClone(row));
    }
    return [...new Map([...map, ...remote]).values()];
  }
  async search(query, { mode = "all", page = 0, overlays = [] } = {}) {
    try {
      return await lexiconRequest("characters", {
        query,
        mode,
        page,
        overlays,
      });
    } catch {
      const normal = normalizeLatin(query);
      const found = overlays.filter(
        (c) =>
          !query ||
          query.includes(c.character) ||
          normalizeLatin(
            [c.pinyin, c.hanViet, ...(c.meaningsVi || [])].join(" "),
          ).includes(normal),
      );
      return {
        rows: found.slice(page * 72, (page + 1) * 72),
        total: found.length,
        warning: fallbackWarning,
      };
    }
  }
  async get(character, lessonId = null) {
    let course = (await catalog()).characters.find(
      (c) => c.character === character,
    );
    const rows = (
      await accessibleRows("study_characters").catch(() => [])
    ).filter((r) => r.data.character === character);
    if (rows.length) {
      course = structuredClone(
        (rows.find((r) => r.data.lessonId === lessonId) || rows[0]).data,
      );
      course.curriculumTags = rows.flatMap((r) => r.data.curriculumTags || []);
    }
    let imported = await lexiconRequest("character", { character }).catch(
      () => null,
    );
    if (!imported) {
      const unicode = await json("unicode.json");
      imported = {
        character,
        pinyin: null,
        meaningsVi: [],
        curriculumTags: [],
        ...unicode.characters[character],
      };
    }
    return enrichCharacter(course, imported);
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
    const item = (await this.list()).find((r) => r.id === id);
    return item
      ? item.sourceText
        ? item
        : json("readings/" + id + ".json")
      : null;
  }
}
export const dictionary = new DictionaryRepository();
export const characters = new CharacterRepository();
export const readings = new ReadingRepository();
