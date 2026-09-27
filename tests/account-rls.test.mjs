import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
const owner = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";

test("account migration and PostgreSQL RLS enforce approval, access and ownership", async (t) => {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema extensions;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
  create table storage.buckets(id text primary key,name text,public boolean);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  create function public.import_study_lexicon_words() returns void language sql security definer as $$select$$;
  insert into auth.users(id,email) values('${owner}','owner@example.invalid');`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = (await fs.readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (file.includes("learner_accounts_and_access")) {
        await db.exec(`insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi) values('hsk1_bai4',1,4,'他是我的汉语老师','Giáo viên tiếng Trung'),('hsk1_bai5',1,5,'她女儿今年二十岁','Tuổi');
    insert into public.student_lesson_access(user_id,lesson_id) values('${owner}','hsk1_bai4');
    insert into public.lesson_assets(lesson_id,bucket_id,object_path) values('hsk1_bai4','lesson-private','test.mp3');
    insert into storage.objects(bucket_id,name) values('lesson-private','test.mp3');`);
      }
      // Historical remote lexicon imports are tested separately; this fixture is the account boundary.
      if (
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|restrict_lexicon_import_execution|learner_accounts_and_access|managed_document_sync/.test(
          file,
        )
      )
        continue;
      await db.exec(await fs.readFile(new URL(file, directory), "utf8"));
    }
    const as = async (id, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id || "",
      ]);
      await db.exec("set role " + role);
    };
    const rows = async (sql) => (await db.query(sql)).rows;
    await t.test(
      "existing grants survive; metadata cannot create administrator",
      async () => {
        assert.equal(
          (
            await rows(
              `select status from public.profiles where user_id='${owner}'`,
            )
          )[0].status,
          "APPROVED",
        );
        await db.exec(
          `insert into auth.users(id,email,raw_user_meta_data) values('${student}','student@example.invalid','{"role":"ADMIN","status":"APPROVED","full_name":"Student"}'),('${other}','other@example.invalid','{}');`,
        );
        assert.deepEqual(
          (
            await rows(
              `select role,status from public.profiles where user_id='${student}'`,
            )
          )[0],
          { role: "STUDENT", status: "PENDING" },
        );
        await as(owner);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          1,
        );
        await db.exec("reset role");
        await db.exec(
          `update public.profiles set role='ADMIN',status='APPROVED' where user_id='${owner}';`,
        );
      },
    );
    await t.test(
      "pending and anonymous users cannot read protected content or call admin actions",
      async () => {
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        assert.equal(
          (await rows("select user_id from public.profiles")).length,
          1,
        );
        await assert.rejects(
          db.exec(
            `update public.profiles set role='ADMIN' where user_id='${student}'`,
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.exec(
            `select public.account_admin_action('${student}','APPROVED')`,
          ),
          /ADMIN_REQUIRED/,
        );
        await as(null, "anon");
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        await assert.rejects(
          db.exec(
            `select public.account_admin_action('${student}','APPROVED')`,
          ),
          /permission denied/,
        );
        assert.equal(
          (
            await rows(
              "select has_function_privilege('anon','public.import_study_lexicon_words()','EXECUTE') allowed",
            )
          )[0].allowed,
          false,
        );
      },
    );
    await t.test(
      "approval alone and enrollment alone do not grant selected lessons",
      async () => {
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','APPROVED');`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','course','hsk1',true);`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','lesson','hsk1_bai4',true);`,
        );
        await as(student);
        assert.deepEqual(await rows("select id from public.lesson_content"), [
          { id: "hsk1_bai4" },
        ]);
        assert.equal((await rows("select id from storage.objects")).length, 1);
      },
    );
    await t.test(
      "revoke, suspension and course revoke take effect without refreshing JWT",
      async () => {
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','lesson','hsk1_bai4',false);`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        assert.equal((await rows("select id from storage.objects")).length, 0);
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','course_mode','hsk1',true);`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          2,
        );
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','SUSPENDED');`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','APPROVED');select public.account_admin_action('${student}','course','hsk1',false);`,
        );
        await as(student);
        assert.equal(
          (await rows("select id from public.lesson_content")).length,
          0,
        );
      },
    );
    await t.test(
      "attempt retries are idempotent, self-mark edits use versions, and revoked access denies submissions",
      async () => {
        await as(student);
        await assert.rejects(
          db.exec(
            "select public.account_save_attempt('hsk1_bai4','attempt-1',4,10,0,auth.uid())",
          ),
          /LESSON_ACCESS_REQUIRED/,
        );
        await as(owner);
        await db.exec(
          `select public.account_admin_action('${student}','course','hsk1',true)`,
        );
        await as(student);
        await db.exec(
          "select public.account_save_attempt('hsk1_bai4','attempt-1',4,10,0,auth.uid())",
        );
        await db.exec(
          "select public.account_save_attempt('hsk1_bai4','attempt-1',4,10,0,auth.uid())",
        );
        assert.equal(
          (await rows("select id from public.learning_attempts")).length,
          1,
        );
        await db.exec(
          "select public.account_save_attempt('hsk1_bai4','attempt-1',6,10,1,auth.uid())",
        );
        await assert.rejects(
          db.exec(
            "select public.account_save_attempt('hsk1_bai4','attempt-1',2,10,1,auth.uid())",
          ),
          /VERSION_CONFLICT/,
        );
        await as(other);
        assert.equal(
          (await rows("select id from public.learning_attempts")).length,
          0,
        );
      },
    );
    await t.test(
      "profile edits use versions, cannot modify authority, and audit is private",
      async () => {
        await as(student);
        const version = (await rows("select version from public.profiles"))[0]
          .version;
        await assert.rejects(
          db.query(
            "select public.account_save_profile($1,'Wrong owner','','',$2)",
            [version, other],
          ),
          /ACCOUNT_CHANGED/,
        );
        await assert.rejects(
          db.query(
            "select public.account_save_attempt('hsk1_bai4','switched',1,10,0,$1)",
            [other],
          ),
          /ACCOUNT_CHANGED/,
        );
        await db.query(
          "select public.account_save_profile($1,'Student edited','','Study',auth.uid())",
          [version],
        );
        await assert.rejects(
          db.query(
            "select public.account_save_profile($1,'Old tab','','Stale',auth.uid())",
            [version],
          ),
          /VERSION_CONFLICT/,
        );
        assert.equal((await rows("select * from public.audit_logs")).length, 0);
        await as(owner);
        assert.ok((await rows("select * from public.audit_logs")).length >= 8);
        await assert.rejects(
          db.exec(`select public.account_admin_action('${owner}','SUSPENDED')`),
          /ADMIN_ACCOUNT_PROTECTED/,
        );
      },
    );
    await t.test(
      "personal data never crosses accounts; concurrent updates preserve the newer version",
      async () => {
        const id = "00000000-0000-4000-8000-000000000010";
        await as(student);
        await db.exec(
          `insert into public.study_readings(id,user_id,title,source_text) values('${id}','${student}','Personal','你好');`,
        );
        await db.exec(
          `update public.study_readings set title='Second device' where id='${id}' and version=1;`,
        );
        assert.equal(
          (
            await db.query(
              `update public.study_readings set title='Stale' where id='${id}' and version=1 returning id`,
            )
          ).rows.length,
          0,
        );
        await as(other);
        assert.equal(
          (await rows("select id from public.study_readings")).length,
          0,
        );
        await assert.rejects(
          db.exec(
            `insert into public.study_saved_words(user_id,entry_id) values('${student}','spoof')`,
          ),
          /row-level security/,
        );
        await as(student);
        await assert.rejects(
          db.exec(
            `update public.study_readings set user_id='${other}' where id='${id}'`,
          ),
          /row-level security/,
        );
      },
    );
    await t.test(
      "Google mapping and sync commands remain private and reject stale or missing versions",
      async () => {
        await as(student);
        assert.equal((await rows("select * from public.documents")).length, 0);
        await assert.rejects(
          db.query("select public.account_document_command('bind',$1)", [{}]),
          /ADMIN_REQUIRED/,
        );
        await as(owner);
        const version = (
          await rows(
            `select version from public.profiles where user_id='${student}'`,
          )
        )[0].version;
        const binding = (
          await db.query(
            "select public.account_document_command('bind',$1) as doc",
            [
              {
                student_id: student,
                profile_version: version,
                google_document_id: "test_document_123",
                google_revision: "1",
              },
            ],
          )
        ).rows[0].doc;
        await assert.rejects(
          db.query("select public.account_document_command('start',$1)", [
            { document_id: binding.id, sync_version: 1 },
          ]),
          /VERSION_CONFLICT/,
        );
        const operation = (
          await db.query(
            "select public.account_document_command('start',$1) as operation",
            [
              {
                document_id: binding.id,
                sync_version: 1,
                profile_version: version,
              },
            ],
          )
        ).rows[0].operation;
        await assert.rejects(
          db.query("select public.account_document_command('complete',$1)", [
            {
              document_id: binding.id,
              operation_id: operation.operation_id,
              profile_version: version,
              fields: {
                full_name: "Test",
                phone: "",
                learning_goal: "",
                role: "ADMIN",
              },
            },
          ]),
          /INVALID_FIELDS/,
        );
        await db.query(
          "select public.account_document_command('complete',$1)",
          [
            {
              document_id: binding.id,
              operation_id: operation.operation_id,
              profile_version: version,
              google_revision: "2",
              fields: { full_name: "Synced", phone: "", learning_goal: "New" },
            },
          ],
        );
        assert.equal(
          (
            await rows(
              `select role,full_name from public.profiles where user_id='${student}'`,
            )
          )[0].role,
          "STUDENT",
        );
        await as(student);
        assert.equal((await rows("select * from public.sync_logs")).length, 0);
        assert.equal((await rows("select * from public.documents")).length, 0);
      },
    );
  } finally {
    await db.close();
  }
});
