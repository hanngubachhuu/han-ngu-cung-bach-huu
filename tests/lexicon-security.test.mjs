import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
test("fixed empty search paths preserve all nine lexicon read functions", async () => {
  const db = new PGlite({ extensions: { unaccent } });
  try {
    await db.exec(`create schema extensions;create extension unaccent with schema extensions;
 create table public.study_lexicon_words(simplified text,traditional text,pinyin text,pinyin_normalized text,readings jsonb,meanings_vi text[],frequency bigint,common boolean,han_viet text,search_text text);
 create table public.study_lexicon_hanviet_map(character text,pinyin text,pinyin_normalized text,values text[]);
 create table public.study_lexicon_meta(id int,schema_version int,cvdict_version text,hanviet_version text,unihan_version text,jieba_version text,source_rows int,merged_rows int,words int,readings int,characters int,common_characters int,han_viet_characters int,direct_han_viet_characters int);
 insert into public.study_lexicon_words values('学','學','xué','xue','[]',array['học'],10,true,'học','xue hoc');
 insert into public.study_lexicon_hanviet_map values('學','*','xue',array['học']);insert into public.study_lexicon_meta(id) values(1);`);
    await db.exec(
      await fs.readFile(
        new URL("fixtures/lexicon-functions.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await fs.readFile(
        new URL(
          "../supabase/migrations/20260927082833_fix_lexicon_function_search_paths.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const expr of [
      "get_study_lexicon_meta()",
      "get_study_lexicon_words(array['学'])",
      "get_study_lexicon_words_v2(array['学'])",
      "list_study_lexicon_single_characters()",
      "map_study_hanviet('學','xue2')",
      "match_study_lexicon('学习')",
      "resolve_study_lexicon_words(array['學'])",
      "search_study_lexicon('học')",
      "search_study_lexicon_v2('xue2')",
    ])
      assert.equal(
        (await db.query("select * from public." + expr)).rows.length,
        1,
        expr,
      );
  } finally {
    await db.close();
  }
});
