import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  validateSourceReview,
  saveDraftRevision,
} from "../server/hskk-authoring.mjs";
test("additive HSKK draft RPC denies anon/student, persists immutable audited versions and idempotent requests", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001",
    student = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create schema account_internal;create table public.profiles(user_id uuid primary key,role text,status text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function account_internal.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$select exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN' and status='APPROVED')$$;insert into public.profiles values('${admin}','ADMIN','APPROVED'),('${student}','STUDENT','APPROVED');`,
    );
    await db.exec(
      "create schema storage;grant usage on schema storage,account_internal to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;",
    );
    await db.exec(
      await fs.readFile(
        "supabase/migrations/20261001100121_hskk_authoring_drafts.sql",
        "utf8",
      ),
    );
    const identity = async (id, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id || "",
      ]);
      await db.exec("set role " + role);
    };
    const call = async (command, payload) =>
      (
        await db.query("select public.hskk_authoring_draft($1,$2) as value", [
          command,
          payload,
        ])
      ).rows[0].value;
    await identity(null, "anon");
    await assert.rejects(
      () => call("get", { exam_code: "TEST" }),
      /permission denied/,
    );
    await identity(student);
    await assert.rejects(
      () => call("get", { exam_code: "TEST" }),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(
      () =>
        db.query("select * from account_internal.hskk_exam_draft_revisions"),
      /permission denied/,
    );
    await identity(admin);
    const source = await call("reserve_source", {
      exam_code: "TEST",
      source_sha256: "a".repeat(64),
      byte_size: 128,
    });
    assert.equal(source.bucket, "hskk-authoring-sources");
    await db.query("insert into storage.objects(bucket_id,name)values($1,$2)", [
      source.bucket,
      source.path,
    ]);
    assert.equal(
      (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
      1,
    );
    await db.exec("update storage.objects set name='changed'");
    assert.equal(
      (await db.query("select name from storage.objects")).rows[0].name,
      source.path,
    );
    await db.exec("delete from storage.objects");
    assert.equal(
      (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
      1,
    );
    await identity(student);
    assert.equal(
      (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
      0,
    );
    await assert.rejects(
      () =>
        call("get_source", {
          exam_code: "TEST",
          source_sha256: "a".repeat(64),
        }),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(
      () =>
        db.query("insert into storage.objects(bucket_id,name)values($1,$2)", [
          source.bucket,
          source.path,
        ]),
      /row-level security/,
    );
    await identity(null, "anon");
    assert.equal(
      (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
      0,
    );
    await identity(admin);
    assert.equal(await call("get", { exam_code: "TEST" }), null);
    const payload = {
      exam_code: "TEST",
      expected_revision: 0,
      configuration: {
        exam_code: "TEST",
        status: "draft",
        audio: { proposals: [] },
      },
      source_sha256: "a".repeat(64),
      request_id: "00000000-0000-4000-8000-000000000011",
      event: "ai_proposal_saved",
    };
    const first = await call("save", payload);
    assert.equal(first.revision, 1);
    assert.deepEqual(await call("save", payload), first);
    await assert.rejects(
      () =>
        call("save", {
          ...payload,
          configuration: { ...payload.configuration, title: "changed" },
        }),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      () =>
        call("save", {
          ...payload,
          request_id: "00000000-0000-4000-8000-000000000012",
        }),
      /VERSION_CONFLICT/,
    );
    const second = await call("save", {
      ...payload,
      expected_revision: 1,
      request_id: "00000000-0000-4000-8000-000000000013",
      configuration: {
        ...payload.configuration,
        audio: { proposals: [{ start_ms: 1000, end_ms: 2000 }] },
      },
      event: "segment_review_saved",
    });
    assert.equal(second.revision, 2);
    assert.equal((await call("get", { exam_code: "TEST" })).revision, 2);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_exam_draft_audit",
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_exam_draft_revisions",
        )
      ).rows[0].n,
      2,
    );
    await assert.rejects(
      () => db.exec("delete from account_internal.hskk_exam_draft_revisions"),
      /HSKK_DRAFT_HISTORY_IMMUTABLE/,
    );
    await assert.rejects(
      () =>
        db.exec(
          "update account_internal.hskk_exam_draft_audit set event='draft_saved'",
        ),
      /HSKK_DRAFT_HISTORY_IMMUTABLE/,
    );
    const fn = (
      await db.query(
        "select prosecdef,proconfig from pg_proc where proname='hskk_authoring_draft'",
      )
    ).rows[0];
    assert.equal(fn.prosecdef, true);
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
    await db.exec(
      `update public.profiles set status='SUSPENDED' where user_id='${admin}'`,
    );
    await identity(admin);
    await assert.rejects(
      () => call("get", { exam_code: "TEST" }),
      /ADMIN_REQUIRED/,
    );
  } finally {
    await db.close();
  }
});
test("server save locks official content/timing and strips preview blob paths while preserving review history", async () => {
  const source = JSON.parse(
      await fs.readFile("server/hskk/H71002.json", "utf8"),
    ),
    edited = structuredClone(source);
  edited.audio.url = "blob:local-preview";
  edited.preview_actor_id = "client-field";
  edited.audio.proposals = [
    { question_id: "q1", start_ms: 2000, end_ms: 3000, status: "NEEDS_REVIEW" },
  ];
  edited.questions[0].audio_segment = {
    start_ms: 2000,
    end_ms: 3000,
    start_seconds: 2,
    end_seconds: 3,
    verified: true,
  };
  const value = validateSourceReview(source, edited);
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, reorder(value[k])]),
          )
        : value;
  assert.doesNotThrow(
    () => validateSourceReview(source, reorder(edited)),
    "PostgreSQL JSONB property ordering must not invalidate an unchanged source",
  );
  assert.equal(value.audio.url, "");
  assert.equal(value.preview_actor_id, undefined);
  assert.equal(value.audio.proposals.length, 1);
  const changed = structuredClone(edited);
  changed.questions[0].response_seconds = 99;
  assert.throws(
    () => validateSourceReview(source, changed),
    /SOURCE_DEFINITION_LOCKED/,
  );
  changed.questions[0].response_seconds = 7;
  changed.questions[0].prompt = "changed";
  assert.throws(
    () => validateSourceReview(source, changed),
    /SOURCE_DEFINITION_LOCKED/,
  );
  let writes = 0;
  const c = {
    rpc: async (name, args) => {
      writes++;
      assert.equal(name, "hskk_authoring_draft");
      assert.equal(args.payload.configuration.audio.url, "");
      assert.equal(args.payload.event, "segment_review_saved");
      return { data: { revision: 1 } };
    },
  };
  await saveDraftRevision(c, source, {
    configuration: edited,
    expected_revision: 0,
    request_id: "00000000-0000-4000-8000-000000000014",
  });
  assert.equal(writes, 1);
  await assert.rejects(
    () =>
      saveDraftRevision(c, source, {
        configuration: changed,
        expected_revision: 0,
        request_id: "00000000-0000-4000-8000-000000000014",
      }),
    /SOURCE_DEFINITION_LOCKED/,
  );
  assert.equal(writes, 1);
});
