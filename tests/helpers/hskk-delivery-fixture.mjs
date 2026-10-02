import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
const admin = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002";
// All data here is synthetic and remains in the in-memory database.
export async function deliveryFixture({
  controlledClock = false,
  bufferedPrompts = true,
} = {}) {
  const db = new PGlite({ extensions: { unaccent, fuzzystrmatch } });
  let controlledNow = Date.now();
  if (controlledClock) {
    // Isolated in-memory test database only. No clock override is deployed.
    await db.exec(`create schema test_only;
      create table test_only.clock(ms bigint not null);
      create function test_only.hskk_now() returns timestamptz language sql security definer set search_path='' as $$select to_timestamp(ms/1000.0) from test_only.clock$$;
      revoke all on schema test_only from public;
      revoke all on function test_only.hskk_now() from public;`);
    await db.query("insert into test_only.clock values($1)", [controlledNow]);
  }
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select current_setting('storage.operation',true)=any(operations)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;
 insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${student}','student@example.invalid');`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !/create_lesson_access_core_schema|create_private_lesson_storage|private_lesson_content_rpc|private_lesson_rpc_to_authenticated|chinese_study_workspace|study_saved_dictionary_snapshots|study_explicit_grants|study_saved_characters_and_quota|study_search_typo_tolerance|learner_accounts_and_access|official_assignment|assignment_authoring_provenance_archive|speaking_private_pipeline|document_exam_import|speaking_submission_boundary|speaking_synthetic_canary|hskk_authoring_drafts|central_admin_exam_workspace|hskk_official_delivery|hskk_official_sessions|hskk_official_publication|hskk_official_history|hskk_preflight_recovery|hskk_buffered_prompts/.test(
        file,
      )
    )
      continue;
    if (!bufferedPrompts && file.includes("hskk_buffered_prompts")) continue;
    if (file.includes("learner_accounts_and_access"))
      await db.exec(
        `insert into public.lesson_content(id,level,lesson_no,title_zh,title_vi,content)values('hsk1_bai1',1,1,'你好','Bài học','{}');insert into public.student_lesson_access(user_id,lesson_id)values('${student}','hsk1_bai1');`,
      );
    let sql = await fs.readFile(new URL(file, dir), "utf8");
    if (
      controlledClock &&
      /hskk_official_sessions|hskk_preflight_recovery|hskk_buffered_prompts/.test(
        file,
      )
    )
      sql = sql.replaceAll("clock_timestamp()", "test_only.hskk_now()");
    await db.exec(sql);
  }
  await db.exec(
    `grant select,insert,update,delete on storage.objects to authenticated;update public.profiles set status='APPROVED';update public.profiles set role='ADMIN' where user_id='${admin}';`,
  );
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec("set role " + role);
  };
  const rpc = async (command, payload = {}) =>
    (
      await db.query("select public.hskk_delivery_admin($1,$2) value", [
        command,
        { exam_code: "H71002", ...payload },
      ])
    ).rows[0].value;
  const config = JSON.parse(
    await fs.readFile(
      new URL("../../server/hskk/H71002.json", import.meta.url),
      "utf8",
    ),
  );
  config.audio.segmentation_runs = [{ run_id: crypto.randomUUID() }];
  config.audio.clip_provenance = [];
  for (const q of config.questions) {
    const segment = {
      verified: true,
      status: "CONFIRMED",
      start_ms: q.number * 10000,
      end_ms: q.number * 10000 + 3000,
      source_sha256: config.audio.source_audio_id,
      run_id: config.audio.segmentation_runs[0].run_id,
      reviewed_by: admin,
      reviewed_at: "2026-10-02T00:00:00Z",
    };
    q.audio_segment = segment;
    config.audio.clip_provenance.push({
      ...segment,
      question_id: q.id,
      question_version: q.version,
      exam_version: config.exam_version,
      exam_code: config.exam_code,
      duration_ms: 3000,
      method: "ffmpeg_atrim_confirmed_ms",
      clip_sha256: q.number.toString(16).padStart(64, "0"),
    });
  }
  await db.query(
    "insert into account_internal.hskk_exam_source_assets(exam_code,sha256,object_path,byte_size,created_by)values('H71002',$1,$2,100,$3)",
    [
      config.audio.source_audio_id,
      "H71002/" + config.audio.source_audio_id + ".mp3",
      admin,
    ],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata)values('hskk-authoring-sources',$1,$2)",
    [
      "H71002/" + config.audio.source_audio_id + ".mp3",
      { size: 100, mimetype: "audio/mpeg" },
    ],
  );
  await as(admin);
  await db.query("select public.hskk_authoring_draft('save',$1)", [
    {
      exam_code: "H71002",
      configuration: config,
      source_sha256: config.audio.source_audio_id,
      request_id: crypto.randomUUID(),
      expected_revision: 0,
    },
  ]);
  const setClock = async (ms) => {
    if (!controlledClock || !Number.isSafeInteger(ms) || ms < controlledNow)
      throw Error("INVALID_TEST_CLOCK");
    await db.exec("reset role");
    await db.query("update test_only.clock set ms=$1", [ms]);
    controlledNow = ms;
  };
  return { db, as, rpc, admin, student, config, setClock };
}
