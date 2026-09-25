import fs from "node:fs/promises";
import { normalizeLatin } from "../study/core.mjs";
const seed = JSON.parse(
  await fs.readFile(
    new URL("../.cache/study-seed.json", import.meta.url),
    "utf8",
  ),
);
const table = process.argv[2] || "entries",
  offset = Number(process.argv[3] || 0),
  size = Number(process.argv[4] || 20);
if (!["entries", "characters", "readings"].includes(table))
  throw Error("Unknown collection");
const rows = seed[table].slice(offset, offset + size);
const literal = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
let sql;
if (table === "entries") {
  const payload = rows.map((e) => ({
    record_id: e.recordId,
    entry_id: e.id,
    simplified: e.simplified,
    traditional: e.traditional,
    pinyin_normalized: e.pinyinNormalized,
    search_normalized: normalizeLatin(
      [...(e.meaningsVi || []), e.hanViet || ""].join(" "),
    ),
    visibility: e.visibility,
    lesson_id: e.lessonId,
    data: e,
  }));
  sql = `insert into public.study_dictionary select * from jsonb_populate_recordset(null::public.study_dictionary,${literal(payload)}) on conflict(record_id) do update set data=excluded.data,search_normalized=excluded.search_normalized,pinyin_normalized=excluded.pinyin_normalized,visibility=excluded.visibility;`;
} else if (table === "characters") {
  const payload = rows.map((e) => ({
    record_id: e.character + "--" + e.lessonId,
    character: e.character,
    visibility: e.visibility,
    lesson_id: e.lessonId,
    data: e,
  }));
  sql = `insert into public.study_characters select * from jsonb_populate_recordset(null::public.study_characters,${literal(payload)}) on conflict(record_id) do update set data=excluded.data,visibility=excluded.visibility;`;
} else {
  const payload = rows.map((e) => ({
    id: e.id,
    visibility: e.visibility,
    lesson_id: e.lessonId,
    data: e,
  }));
  sql = `insert into public.study_library select * from jsonb_populate_recordset(null::public.study_library,${literal(payload)}) on conflict(id) do update set data=excluded.data,visibility=excluded.visibility;`;
}
console.log(
  JSON.stringify({ count: rows.length, total: seed[table].length, sql }),
);
