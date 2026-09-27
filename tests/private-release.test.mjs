import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { generateRelease } from "../scripts/prepare-private-release.mjs";
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
