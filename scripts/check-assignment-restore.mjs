// Operator-only restore rehearsal. Reads an explicitly approved ignored backup; never prints its rows.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
const path =
  process.argv[2] || ".cache/backups/assignment-before-20260930.json";
const bytes = await fs.readFile(path),
  backup = JSON.parse(bytes);
assert.equal(backup.format, "hnh-assignment-release-backup-1");
assert.equal(backup.project, "dmeqxdznzobbarvkmxyg");
const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
const directory = new URL("../supabase/migrations/", import.meta.url);
const migrations = (await fs.readdir(directory))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const keys = {
  profiles: ["user_id"],
  courses: ["id"],
  lesson_content: ["id"],
  enrollments: ["user_id", "course_id"],
  student_lesson_access: ["user_id", "lesson_id"],
  learning_attempts: ["id"],
  lesson_assets: ["bucket_id", "object_path"],
  audit_logs: ["id"],
};
async function restore(name, update = false) {
  assert(keys[name]);
  const table = "public." + name;
  const columns = (
    await db.query(
      "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum",
      [table],
    )
  ).rows.map((r) => r.attname);
  const suffix = update
    ? "(" +
      keys[name].join(",") +
      ") do update set " +
      columns
        .filter((c) => !keys[name].includes(c))
        .map((c) => c + "=excluded." + c)
        .join(",")
    : "do nothing";
  await db.query(
    `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb) on conflict ${suffix}`,
    [JSON.stringify(backup.tables[name])],
  );
}
async function check(name, excluded = "") {
  const actual = (
    await db.query(`select to_jsonb(t)${excluded} value from public.${name} t`)
  ).rows
    .map((r) => JSON.stringify(r.value))
    .sort();
  const expected = (
    await db.query(
      `select to_jsonb(t) value from jsonb_populate_recordset(null::public.${name},$1::jsonb) t`,
      [JSON.stringify(backup.tables[name])],
    )
  ).rows
    .map((r) => {
      const v = r.value;
      if (name === "courses" && excluded) delete v.program;
      return JSON.stringify(v);
    })
    .sort();
  assert.deepEqual(actual, expected, "Restored rows changed: " + name);
}
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;`);
  for (const p of backup.tables.profiles)
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      p.user_id,
      p.email,
    ]);
  for (const file of migrations.filter(
    (f) => !f.includes("official_assignment"),
  )) {
    if (
      !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|managed_document_sync/.test(
        file,
      )
    )
      continue;
    if (file.includes("learner_accounts_and_access")) {
      await restore("lesson_content");
      await restore("student_lesson_access");
      await restore("lesson_assets");
    }
    await db.exec(await fs.readFile(new URL(file, directory), "utf8"));
  }
  for (const name of [
    "profiles",
    "courses",
    "lesson_content",
    "enrollments",
    "student_lesson_access",
    "learning_attempts",
    "lesson_assets",
    "audit_logs",
  ])
    await restore(name, true);
  for (const name of Object.keys(keys)) await check(name);
  const scopes = new Map();
  for (const profile of backup.tables.profiles) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      profile.user_id,
    ]);
    await db.exec("set role authenticated");
    scopes.set(
      profile.user_id,
      (await db.query("select id from public.lesson_content order by id")).rows,
    );
    await db.exec("reset role");
  }
  for (const file of migrations.filter((f) =>
    f.includes("official_assignment"),
  ))
    await db.exec(await fs.readFile(new URL(file, directory), "utf8"));
  for (const name of Object.keys(keys))
    await check(name, name === "courses" ? "-'program'" : "");
  assert.equal(
    Number(
      (await db.query("select count(*) from public.lesson_assignments")).rows[0]
        .count,
    ),
    0,
  );
  assert.equal(
    Number(
      (await db.query("select count(*) from public.official_learning_results"))
        .rows[0].count,
    ),
    0,
  );
  for (const profile of backup.tables.profiles) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      profile.user_id,
    ]);
    await db.exec("set role authenticated");
    assert.deepEqual(
      (await db.query("select id from public.lesson_content order by id")).rows,
      scopes.get(profile.user_id),
    );
    await assert.rejects(
      db.query("select content from public.lesson_content"),
      /permission denied/,
    );
    for (const { id } of scopes.get(profile.user_id)) {
      const content = (
        await db.query(
          "select content from public.get_private_lesson_content($1)",
          [id],
        )
      ).rows[0]?.content;
      const expected = backup.tables.lesson_content.find((l) => l.id === id);
      if (expected.visibility === "student")
        assert.deepEqual(content, expected.content);
    }
    await db.exec("reset role");
  }
  const report = {
    checkedAt: new Date().toISOString(),
    backupSha256: createHash("sha256").update(bytes).digest("hex"),
    restoredCounts: Object.fromEntries(
      Object.entries(backup.tables).map(([k, v]) => [k, v.length]),
    ),
    rowsPreservedAfterMigrations: true,
    enrollmentScopePreserved: true,
    directContentDenied: true,
    officialActivationCount: 0,
    environment:
      "Local PostgreSQL WASM; not hosted staging; no Auth credentials or media files restored",
  };
  await fs.writeFile(
    ".cache/backups/assignment-restore-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
