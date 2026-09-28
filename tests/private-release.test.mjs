import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  generateRelease,
  generateStagedRelease,
  generateSectionRepair,
} from "../scripts/prepare-private-release.mjs";
import { preparePrivateLesson } from "../study/private-lesson-data.mjs";
test("private release is atomic, version guarded, preserves canonical data and supports rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema account_internal;create schema storage;
  create table public.lesson_content(id text primary key,content jsonb,updated_at timestamptz);
  create table public.lesson_assets(lesson_id text,bucket_id text,object_path text,unique(bucket_id,object_path));
  create table storage.objects(bucket_id text,name text);
  insert into public.lesson_content values('lesson','{"trusted":"unchanged"}',now());`);
    const baseline = (
      await db.query(
        "select id,md5(content::text) content_hash from public.lesson_content",
      )
    ).rows;
    const source = {
      payloads: [
        {
          id: "lesson",
          content: { client_view: { text: "It's $release$ safe" } },
        },
      ],
      assets: [
        { lesson_id: "lesson", bucket: "lesson-private", object_path: "a.mp3" },
      ],
    };
    const { sql, rollback } = generateRelease(source, baseline);
    await assert.rejects(db.exec(sql), /PRIVATE_ASSET_NOT_UPLOADED/);
    await db.exec("rollback");
    assert.deepEqual(
      (await db.query("select content from public.lesson_content")).rows[0]
        .content,
      { trusted: "unchanged" },
    );
    await db.exec(
      "insert into storage.objects values('lesson-private','a.mp3')",
    );
    await assert.rejects(
      db.exec(
        generateRelease(source, [{ id: "lesson", content_hash: "stale" }]).sql,
      ),
      /CONTENT_CHANGED/,
    );
    await db.exec("rollback");
    await db.exec(sql);
    assert.deepEqual(
      (await db.query("select content from public.lesson_content")).rows[0]
        .content,
      { trusted: "unchanged", client_view: { text: "It's $release$ safe" } },
    );
    await db.exec(rollback);
    assert.deepEqual(
      (await db.query("select content from public.lesson_content")).rows[0]
        .content,
      { trusted: "unchanged" },
    );
  } finally {
    await db.close();
  }
});

test("native publication and section repair preserve canonical DB content and expose every exercise", async () => {
  const db = new PGlite();
  const canonical = {
    trusted: "unchanged",
    exercises: { all: [{ id: "q1", section: "listening" }] },
    audio: "audio/hsk1/bai5/dialog-1.mp3",
  };
  const source = {
    payloads: [
      {
        id: "hsk1_bai5",
        content: {
          content: canonical,
          exerciseSections: [{ id: "listening", title: "Nghe", skill: "nghe" }],
        },
      },
    ],
    assets: [],
  };
  try {
    await db.exec(`create role anon;create role authenticated;create schema account_internal;
      create table public.lesson_content(id text primary key,content jsonb,updated_at timestamptz);`);
    await db.query("insert into public.lesson_content values ($1,$2,now())", [
      "hsk1_bai5",
      JSON.stringify(canonical),
    ]);
    const baseline = (
      await db.query(
        "select id,md5(content::text) as content_hash from public.lesson_content",
      )
    ).rows;
    const release = generateRelease(source, baseline);
    await db.exec(release.sql);
    const published = (
      await db.query("select id,content from public.lesson_content")
    ).rows[0];
    const lesson = preparePrivateLesson(published);
    assert.equal(lesson.exerciseSections.length, 1);
    assert.deepEqual(lesson.content.exercises, canonical.exercises);
    assert.equal(
      lesson.content.audio,
      "supabase://lesson-private/hsk1/bai5/dialog-1.mp3",
    );
    await db.exec(release.rollback);
    const repair = generateSectionRepair(source, baseline);
    await db.exec(repair.sql);
    const fixed = (
      await db.query("select id,content from public.lesson_content")
    ).rows[0];
    assert.equal(
      preparePrivateLesson(fixed).exerciseSections[0].id,
      "listening",
    );
    const { exerciseSections, ...rest } = fixed.content;
    assert.equal(exerciseSections.length, 1);
    assert.deepEqual(rest, canonical);
    await db.exec(repair.rollback);
    assert.deepEqual(
      (await db.query("select content from public.lesson_content")).rows[0]
        .content,
      canonical,
    );
    await db.exec(
      "drop table account_internal.publication_sections_backup_20260928",
    );
    const mismapped = structuredClone(source);
    mismapped.payloads[0].content.exerciseSections[0].id = "different";
    mismapped.payloads[0].content.content.exercises.all[0].section =
      "different";
    await assert.rejects(
      db.exec(generateSectionRepair(mismapped, baseline).sql),
      /UNMAPPED_QUESTION/,
    );
    await db.exec("rollback");
    assert.deepEqual(
      (await db.query("select content from public.lesson_content")).rows[0]
        .content,
      canonical,
    );
  } finally {
    await db.close();
  }
});

test("staged publication rejects incomplete or altered payloads and commits intact content atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema account_internal;create schema storage;
      create table public.lesson_content(id text primary key,content jsonb,updated_at timestamptz);
      create table public.lesson_assets(lesson_id text,bucket_id text,object_path text,unique(bucket_id,object_path));
      create table storage.objects(bucket_id text,name text);
      insert into public.lesson_content values('first','{"trusted":"一"}',now()),('second','{"trusted":"二"}',now());`);
    const baseline = (
      await db.query(
        "select id,md5(content::text) content_hash from public.lesson_content",
      )
    ).rows;
    const source = {
      payloads: [
        {
          id: "first",
          content: { client_view: { text: "汉语 It's $release$" } },
        },
        { id: "second", content: { client_view: { text: "Next" } } },
      ],
      assets: [],
    };
    const release = generateStagedRelease(source, baseline);
    await db.exec(release.setup);
    await db.exec(release.uploads[0].sql);
    await assert.rejects(db.exec(release.sql), /STAGED_CONTENT_MISMATCH/);
    await db.exec("rollback");
    assert.deepEqual(
      (
        await db.query("select content from public.lesson_content order by id")
      ).rows.map((r) => r.content),
      [{ trusted: "一" }, { trusted: "二" }],
    );
    await db.exec(release.uploads[1].sql);
    await db.exec(
      "update account_internal.publication_stage_20260928 set payload='{}' where id='second'",
    );
    await assert.rejects(db.exec(release.sql), /STAGED_CONTENT_MISMATCH/);
    await db.exec("rollback");
    await db.exec(release.uploads[1].sql);
    await db.exec(release.sql);
    assert.deepEqual(
      (
        await db.query(
          "select content from public.lesson_content where id='first'",
        )
      ).rows[0].content,
      { trusted: "一", client_view: { text: "汉语 It's $release$" } },
    );
    await db.exec(release.rollback);
    assert.deepEqual(
      (
        await db.query("select content from public.lesson_content order by id")
      ).rows.map((r) => r.content),
      [{ trusted: "一" }, { trusted: "二" }],
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','account_internal.publication_stage_20260928','SELECT') as readable",
        )
      ).rows[0].readable,
      false,
    );
  } finally {
    await db.close();
  }
});
