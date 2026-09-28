// Operator-only verification; reads the ignored targeted backup, never prints learner data.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";

const file = process.argv[2] || ".cache/backups/account-before-20260927.json";
const bytes = await fs.readFile(file);
const backup = JSON.parse(bytes);
assert.equal(backup.format, "hnh-account-release-backup-1");
assert.equal(backup.project, "dmeqxdznzobbarvkmxyg");
const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function public.import_study_lexicon_words() returns void language sql security definer as $$select$$;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const migrations = (await fs.readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    if (
      /create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|restrict_lexicon_import_execution/.test(
        migration,
      )
    ) {
      await db.exec(await fs.readFile(new URL(migration, directory), "utf8"));
    }
  }
  const tables = {
    auth_users: "auth.users",
    storage_buckets: "storage.buckets",
    storage_objects: "storage.objects",
    lesson_content: "public.lesson_content",
    student_lesson_access: "public.student_lesson_access",
    lesson_assets: "public.lesson_assets",
    study_readings: "public.study_readings",
  };
  for (const [key, table] of Object.entries(tables)) {
    await db.query(
      `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb) on conflict do nothing`,
      [JSON.stringify(backup.tables[key])],
    );
    const count = Number(
      (await db.query(`select count(*) from ${table}`)).rows[0].count,
    );
    assert.equal(count, backup.tables[key].length, `Restore count: ${key}`);
  }
  for (const table of [
    "lesson_content",
    "student_lesson_access",
    "lesson_assets",
    "study_readings",
  ]) {
    const result = await db.query(
      `select not exists(
      (select to_jsonb(t) as row from public.${table} t except select to_jsonb(expected) from jsonb_populate_recordset(null::public.${table},$1::jsonb) expected)
      union all
      (select to_jsonb(expected) from jsonb_populate_recordset(null::public.${table},$1::jsonb) expected except select to_jsonb(t) from public.${table} t)) as identical`,
      [JSON.stringify(backup.tables[table])],
    );
    assert.equal(
      result.rows[0].identical,
      true,
      `Restored rows must match: ${table}`,
    );
  }
  const before = (
    await db.query(
      "select id,md5(content::text) as hash from public.lesson_content order by id",
    )
  ).rows;
  for (const migration of migrations.filter((f) =>
    /learner_accounts_and_access|managed_document_sync/.test(f),
  )) {
    await db.exec(await fs.readFile(new URL(migration, directory), "utf8"));
  }
  // Verify access as the existing STUDENT, before promoting the sole owner.
  for (const user of backup.tables.auth_users) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user.id,
    ]);
    await db.exec("set role authenticated");
    const actual = (
      await db.query("select id from public.lesson_content order by id")
    ).rows.map((r) => r.id);
    const expected = backup.tables.student_lesson_access
      .filter((r) => r.user_id === user.id && r.active)
      .map((r) => r.lesson_id)
      .sort();
    assert.deepEqual(
      actual,
      expected,
      "Existing account must retain exactly its prior lessons",
    );
    await db.exec("reset role");
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role anon");
  assert.equal(
    (
      await db.query(
        "select id from public.lesson_content where visibility='student'",
      )
    ).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.exec(
    await fs.readFile("supabase/operations/bootstrap_owner.sql", "utf8"),
  );
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) from public.profiles where role='ADMIN' and status='APPROVED'",
        )
      ).rows[0].count,
    ),
    1,
  );
  assert.deepEqual(
    (
      await db.query(
        "select id,md5(content::text) as hash from public.lesson_content order by id",
      )
    ).rows,
    before,
  );
  const result = {
    checkedAt: new Date().toISOString(),
    project: backup.project,
    backupSha256: createHash("sha256").update(bytes).digest("hex"),
    restoredTables: Object.keys(tables).length,
    existingUsers: backup.tables.auth_users.length,
    preservedLessonGrants: backup.tables.student_lesson_access.filter(
      (r) => r.active,
    ).length,
    unchangedLessons: before.length,
    ownerBootstrap: "passed",
    anonymousPrivateReads: 0,
    environment: "local PostgreSQL WASM; not a hosted Supabase staging project",
  };
  await fs.writeFile(
    ".cache/backups/account-restore-report.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await db.close();
}
