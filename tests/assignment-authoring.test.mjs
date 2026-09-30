import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import {
  generateDistractors,
  generatorPrompt,
  generatorAnswer,
} from "../study/distractor-generator.mjs";
const admin = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002";
const rid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const simple = (key) => ({
  question_key: key,
  kind: "mcq",
  prompt: "Synthetic greeting",
  options: [
    { id: "A", text: "你好" },
    { id: "B", text: "再见" },
  ],
  answer_key: { value: "A" },
});
test("private authoring metadata, generated final options, atomic import and archive preserve existing versions", async (t) => {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = async (uid, role = "authenticated") => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [
      uid || "",
    ]);
    await db.exec("set role " + role);
  };
  const base = async (command, payload) =>
    (
      await rows("select public.assignment_command($1,$2) value", [
        command,
        payload,
      ])
    )[0].value;
  const call = async (command, payload) =>
    (
      await rows("select public.assignment_authoring($1,$2) value", [
        command,
        payload,
      ])
    )[0].value;
  const count = async (table) =>
    (await rows("select count(*)::int n from " + table))[0].n;
  let legacy, generated, imported, definition, attempt;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${student}','student@example.invalid');`);
    const dir = new URL("../supabase/migrations/", import.meta.url),
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (
        !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|official_assignment/.test(
          file,
        )
      )
        continue;
      if (file.includes("learner_accounts_and_access"))
        await db.exec(
          `insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,content) values('lesson',1,1,'测试','Synthetic','{}');insert into public.student_lesson_access(user_id,lesson_id) values('${student}','lesson');`,
        );
      await db.exec(await fs.readFile(new URL(file, dir), "utf8"));
    }
    await db.exec(
      `update public.profiles set role='ADMIN',status='APPROVED' where user_id='${admin}';update public.profiles set status='APPROVED' where user_id='${student}';`,
    );
    await as(admin);
    legacy = await base("question_create", {
      ...simple("legacy"),
      lesson_id: "lesson",
    });
    await db.exec("reset role");
    await db.exec(
      await fs.readFile(
        new URL(
          "20260930133835_assignment_authoring_provenance_archive.sql",
          dir,
        ),
        "utf8",
      ),
    );
    await t.test(
      "existing question content stays unchanged; unknown historic source is labelled, not fabricated",
      async () => {
        const actual = (
          await rows(
            "select to_jsonb(q) value from public.assignment_question_versions q where id=$1",
            [legacy.id],
          )
        )[0].value;
        assert.deepEqual(actual, legacy);
        const s = (
          await rows(
            "select * from account_internal.assignment_question_sources where question_version_id=$1",
            [legacy.id],
          )
        )[0];
        assert.equal(s.origin, "legacy_unknown");
        assert.equal(s.imported_by, null);
        assert.equal(s.imported_at, null);
      },
    );
    await t.test(
      "anonymous/student cannot use authoring RPC or read its private metadata/jobs",
      async () => {
        await as(null, "anon");
        await assert.rejects(
          call("bank", { lesson_id: "lesson" }),
          /permission denied/,
        );
        await as(student);
        await assert.rejects(
          call("bank", { lesson_id: "lesson" }),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(call("archive", {}), /ADMIN_REQUIRED/);
        await assert.rejects(
          rows("select * from account_internal.assignment_question_sources"),
          /permission denied/,
        );
        await assert.rejects(
          rows("select account_internal.assignment_check_generator('{}','{}')"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "DB rule checker agrees with generator for every supported target and rejects semantic alternatives",
      async () => {
        await db.exec("reset role");
        const cases = [
          ...Array.from({ length: 100 }, (_, i) => ["number", String(i)]),
          ...Array.from({ length: 7 }, (_, i) => ["weekday", String(i)]),
          ...["female", "male", "object", "first"].map((s) => ["pronoun", s]),
          ...["我", "你", "他", "她", "我们", "你们", "他们", "她们"].flatMap(
            (s) =>
              ["老师", "学生", "医生"].map((r) => [
                "negate_shi",
                `${s}是${r}。`,
              ]),
          ),
        ];
        for (const [rule, target] of cases) {
          const q = generateDistractors({
            rule,
            target,
            correct: generatorAnswer(rule, target),
            prompt: generatorPrompt(rule, target),
            seed: 1,
          });
          await rows(
            "select account_internal.assignment_check_generator($1,$2)",
            [q, { rule, target, rule_version: q.rule_version }],
          );
          const inferred = (
            await rows(
              "select account_internal.assignment_infer_generator($1) value",
              [q.prompt],
            )
          )[0].value;
          assert.equal(inferred.rule, rule);
          await rows(
            "select account_internal.assignment_check_generator($1,$2)",
            [q, inferred],
          );
        }
        const q = generateDistractors({
          rule: "weekday",
          target: "0",
          correct: "星期日",
          prompt: generatorPrompt("weekday", "0"),
        });
        q.options.find((o) => o.id !== q.answer_key.value).text = "星期天";
        await assert.rejects(
          rows("select account_internal.assignment_check_generator($1,$2)", [
            q,
            { rule: "weekday", target: "0", rule_version: q.rule_version },
          ]),
          /GENERATOR_INVALID_DISTRACTOR|GENERATOR_KEY_CHANGED/,
        );
      },
    );
    await t.test(
      "generated final set is persisted with provenance; retries cannot add another version",
      async () => {
        await as(admin);
        const g = generateDistractors({
          rule: "number",
          target: "17",
          correct: "十七",
          prompt: generatorPrompt("number", "17"),
        });
        const body = {
          request_id: rid(1),
          question: {
            ...simple("generated"),
            lesson_id: "lesson",
            prompt: g.prompt,
            options: g.options,
            answer_key: g.answer_key,
          },
          metadata: {
            generator: {
              rule: g.rule,
              target: g.target,
              rule_version: g.rule_version,
            },
          },
        };
        generated = await call("question_create", body);
        assert.deepEqual(generated.options, g.options);
        assert.deepEqual(await call("question_create", body), generated);
        await assert.rejects(
          call("question_create", { ...body, metadata: {} }),
          /IDEMPOTENCY_CONFLICT/,
        );
        await assert.rejects(
          call("question_create", {
            ...body,
            request_id: rid(2),
            question: { ...body.question, answer_key: { value: "B" } },
          }),
          /GENERATOR_KEY_CHANGED/,
        );
        const bank = await call("bank", { lesson_id: "lesson" });
        const q = bank.questions.find((q) => q.id === generated.id);
        assert.equal(q.provenance.origin, "generated");
        assert.equal(q.provenance.recorded_by, admin);
        assert.equal(q.provenance.generator.rule_version, "zh-closed-1");
        await assert.rejects(
          base("question_create", {
            ...body.question,
            answer_key: { value: "B" },
          }),
          /GENERATOR_KEY_CHANGED/,
        );
      },
    );
    const body = {
      request_id: rid(10),
      lesson_id: "lesson",
      source: {
        source: "synthetic_fixture",
        source_identifier: "fixture:bank",
        source_revision: "r1",
      },
      questions: [
        { ...simple("legacy"), source_item_id: "old-id" },
        { ...simple("imported"), source_item_id: "new-id" },
      ],
    };
    await t.test(
      "import preview validates and rolls back temp questions/audits, then commit is atomic and idempotent",
      async () => {
        await db.exec("reset role");
        const before = await count("public.assignment_question_versions"),
          audit = await count("public.audit_logs");
        await as(admin);
        const p = await call("import_preview", body);
        assert.equal(p.count, 2);
        assert.deepEqual(p.expected_versions, { legacy: 1, imported: 0 });
        await db.exec("reset role");
        assert.equal(
          await count("public.assignment_question_versions"),
          before,
        );
        assert.equal(await count("public.audit_logs"), audit);
        await as(admin);
        imported = await call("import_commit", body);
        assert.equal(imported.count, 2);
        assert.equal(imported.questions[0].version, 2);
        assert.deepEqual(await call("import_commit", body), {
          ...imported,
          already_imported: true,
        });
        const bank = await call("bank", { lesson_id: "lesson" });
        for (const v of imported.questions) {
          const s = bank.questions.find((q) => q.id === v.id).provenance;
          assert.equal(s.source_identifier, "fixture:bank");
          assert.equal(s.source_revision, "r1");
          assert.equal(s.imported_by, admin);
          assert(s.imported_at);
        }
        await db.exec("reset role");
        assert.deepEqual(
          (
            await rows(
              "select to_jsonb(q) value from public.assignment_question_versions q where id=$1",
              [legacy.id],
            )
          )[0].value,
          legacy,
        );
      },
    );
    await t.test(
      "invalid or stale import never leaves a partial batch",
      async () => {
        await as(admin);
        const invalid = {
          ...body,
          request_id: rid(11),
          questions: [
            { ...simple("partial"), source_item_id: "one" },
            {
              ...simple("bad"),
              answer_key: { value: "Z" },
              source_item_id: "two",
            },
          ],
        };
        await assert.rejects(
          call("import_preview", invalid),
          /INVALID_OPTIONS/,
        );
        const stale = {
          ...body,
          request_id: rid(12),
          questions: [
            { ...simple("stale"), source_item_id: "one" },
            { ...simple("should_not_commit"), source_item_id: "two" },
          ],
        };
        await call("import_preview", stale);
        await base("question_create", {
          ...simple("stale"),
          lesson_id: "lesson",
        });
        await assert.rejects(call("import_commit", stale), /VERSION_CONFLICT/);
        const bank = await call("bank", { lesson_id: "lesson" });
        assert(
          !bank.questions.some((q) =>
            ["partial", "bad", "should_not_commit"].includes(q.question_key),
          ),
        );
      },
    );
    await t.test(
      "archive is append-only/version-specific, blocks new membership, preserves existing published definitions and ownership projections",
      async () => {
        definition = await base("definition_create", {
          lesson_id: "lesson",
          title: "Synthetic",
          question_version_ids: [generated.id],
        });
        await base("definition_preview", { version_id: definition.id });
        await base("definition_publish", { version_id: definition.id });
        await base("enable", { lesson_id: "lesson", enabled: true });
        const archive = {
          request_id: rid(20),
          question_version_id: generated.id,
          archived: true,
          revision: 0,
          reason: "Synthetic archive",
        };
        const r = await call("archive", archive);
        assert.equal(r.revision, 1);
        assert.deepEqual(await call("archive", archive), r);
        assert(
          !(await call("bank", { lesson_id: "lesson" })).questions.some(
            (q) => q.id === generated.id,
          ),
        );
        assert(
          (
            await call("bank", { lesson_id: "lesson", include_archived: true })
          ).questions.some((q) => q.id === generated.id && q.archive.archived),
        );
        await assert.rejects(
          base("definition_create", {
            lesson_id: "lesson",
            title: "Blocked",
            question_version_ids: [generated.id],
          }),
          /QUESTION_ARCHIVED/,
        );
        await as(student);
        attempt = await base("start", {
          lesson_id: "lesson",
          request_id: rid(21),
        });
        assert.equal(attempt.answers[0].question.id, generated.id);
        assert(!JSON.stringify(attempt).includes("provenance"));
        assert(!JSON.stringify(attempt).includes("generator"));
        await as(admin);
        await assert.rejects(
          call("archive", { ...archive, request_id: rid(22), archived: false }),
          /VERSION_CONFLICT/,
        );
        await call("archive", {
          ...archive,
          request_id: rid(23),
          archived: false,
          revision: 1,
          reason: "Restore selection",
        });
        assert(
          (await call("bank", { lesson_id: "lesson" })).questions.some(
            (q) => q.id === generated.id,
          ),
        );
        await db.exec("reset role");
        await assert.rejects(
          rows(
            "update account_internal.assignment_question_archive_events set archived=false",
          ),
          /AUTHORING_HISTORY_IMMUTABLE/,
        );
        await assert.rejects(
          rows(
            "update account_internal.assignment_question_sources set source='forged'",
          ),
          /AUTHORING_HISTORY_IMMUTABLE/,
        );
      },
    );
    await t.test(
      "derived versions keep parent/source lineage and never change the parent's source",
      async () => {
        await as(admin);
        const parent = imported.questions[0];
        const copy = await call("question_create", {
          request_id: rid(30),
          question: { ...simple("copy"), lesson_id: "lesson" },
          metadata: { parent_version_id: parent.id },
        });
        const q = (await call("bank", { lesson_id: "lesson" })).questions.find(
          (q) => q.id === copy.id,
        );
        assert.equal(q.provenance.parent_version_id, parent.id);
        assert.equal(q.provenance.source_identifier, "fixture:bank");
        assert.equal(q.provenance.origin, "derived");
        assert.equal(q.provenance.imported_by, null);
      },
    );
    await t.test(
      "the exact focused production smoke rolls back every synthetic version and audit",
      async () => {
        await db.exec("reset role");
        const before = await count("public.assignment_question_versions"),
          audits = await count("public.audit_logs");
        await db.exec(
          await fs.readFile(
            new URL(
              "../supabase/operations/assignment_authoring_smoke.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          await count("public.assignment_question_versions"),
          before,
        );
        assert.equal(await count("public.audit_logs"), audits);
        assert.equal(
          (
            await rows(
              "select count(*)::int n from public.courses where id='__authoring_smoke_course'",
            )
          )[0].n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
