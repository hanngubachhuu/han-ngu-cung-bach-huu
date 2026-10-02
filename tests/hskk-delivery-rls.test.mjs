import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";
test("HSKK official binding uses immutable existing versions, private clips and a selected approved learner", async (t) => {
  const { db, as, rpc, admin, student } = await deliveryFixture();
  try {
    await as(student);
    await assert.rejects(
      rpc("prepare", { expected_revision: 1 }),
      /ADMIN_REQUIRED/,
    );
    await as(null, "anon");
    await assert.rejects(rpc("get"), /permission denied/);
    await as(admin);
    const prepared = await rpc("prepare", { expected_revision: 1 });
    const replay = await rpc("prepare", { expected_revision: 1 });
    assert.equal(prepared.version_id, replay.version_id);
    const binding = await rpc("get");
    assert.equal(binding.question_count, 27);
    assert.equal(binding.verified_clips, 0);
    assert.equal(
      new Set(binding.clips.map((q) => q.question_version_id)).size,
      27,
    );
    assert.equal(binding.published, false);
    await assert.rejects(
      rpc("prepare", { expected_revision: 0 }),
      /VERSION_CONFLICT/,
    );
    await rpc("grant_access", { student_id: student });
    await rpc("grant_access", { student_id: student });
    await as(student);
    await assert.rejects(rpc("get"), /ADMIN_REQUIRED/);
    await assert.rejects(
      db.query("select public.hskk_prompt_verified($1)", [
        { sha256: binding.clips[0].sha256, byte_size: 100, actor: admin },
      ]),
      /permission denied/,
    );
    await db.query(
      "select set_config('storage.operation','object.list',false)",
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='hskk-prompt-clips'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('hskk-prompt-clips',$1)",
        [binding.clips[0].path],
      ),
      /row-level security/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.assignment_versions where status='published'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.learning_attempts"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from account_internal.hskk_exam_draft_revisions",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.enrollments where course_id='hskk-elementary' and access_mode='SELECTED'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "update account_internal.hskk_delivery_questions set response_seconds=99",
      ),
      /AUTHORING_HISTORY_IMMUTABLE/,
    );
    await t.test(
      "published definition cannot bypass the unfinished transport via the legacy Admin publish",
      async () => {
        await as(admin);
        await assert.rejects(
          db.query("select public.admin_exam_command('publish',$1)", [
            {
              request_id: crypto.randomUUID(),
              expected_revision: 0,
              exam: {
                id: "H71002",
                type: "HSKK",
                level: "elementary",
                title: "HSKK",
                questions: [{ id: "q1", prompt: "你好" }],
              },
            },
          ]),
          /HSKK_OFFICIAL_BINDING_REQUIRED/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
