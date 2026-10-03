import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

for (const [examCode, count, numericLevel] of [
  ["H71002", 27, 1],
  ["H80000", 14, 2],
  ["H91002", 6, 3],
]) {
  test(`Shared ${examCode}: pinned ${count} questions, level content, role gates and submission count`, async () => {
    const { db, as, rpc, admin, student, config, setClock } =
      await deliveryFixture({ examCode, controlledClock: true });
    try {
      if (examCode !== "H71002") {
        await assert.rejects(
          rpc("prepare", { expected_revision: 1 }),
          /CONTENT_REVIEW_REQUIRED/,
        );
        const working = {
          id: examCode,
          code: examCode,
          type: "HSKK",
          level: config.level,
          title: examCode,
          sections: config.sections,
          questions: config.questions.map((q) => ({
            ...q,
            kind: q.type,
            question_key: q.id,
          })),
        };
        await db.query("select public.admin_exam_command('save_working',$1)", [
          {
            exam: working,
            request_id: crypto.randomUUID(),
            expected_revision: 0,
          },
        ]);
        await rpc("review_content", { expected_revision: 1 });
      }
      const version = await rpc("prepare", { expected_revision: 1 });
      const binding = await rpc("get");
      assert.equal(binding.question_count, count);
      await db.exec("reset role");
      assert.equal(
        (
          await db.query("select level from public.courses where id=$1", [
            `hskk-${config.level}`,
          ])
        ).rows[0].level,
        numericLevel,
      );
      const projected = (
        await db.query("select account_internal.hskk_delivery_config($1) c", [
          version.version_id,
        ])
      ).rows[0].c;
      assert.equal(projected.questions.length, count);
      assert.deepEqual(projected.sections, config.sections);
      assert.ok(
        projected.questions
          .filter((q) => q.prompt_mode === "audio")
          .every((q) => q.prompt === ""),
      );
      if (examCode === "H80000") {
        assert.deepEqual(
          projected.questions
            .filter((q) => q.prompt_mode === "image")
            .map((q) => q.number),
          [11, 12],
        );
        assert.deepEqual(projected.sections[1].preparation_section_ids, [
          "part2",
          "part3",
        ]);
      }
      if (examCode === "H91002")
        assert.equal(projected.questions[3].prompt, config.questions[3].prompt);
      await as(student);
      await assert.rejects(
        rpc("prepare", { expected_revision: 1 }),
        /ADMIN_REQUIRED/,
      );
      await assert.rejects(
        db.query("select public.hskk_canonical_source('catalog')"),
        /ADMIN_REQUIRED/,
      );
      await assert.rejects(
        db.query("select public.hskk_current_picture($1)", [
          { owner_id: student },
        ]),
        /permission denied/,
      );
      await as(admin);
      // Independent synthetic receipt bytes in an isolated database only.
      await db.exec("reset role");
      for (const clip of binding.clips) {
        await db.query(
          "insert into storage.objects(bucket_id,name,metadata) values('hskk-prompt-clips',$1,$2)",
          [clip.path, { size: 100 }],
        );
        await as(admin, "service_role");
        await db.query("select public.hskk_prompt_verified($1)", [
          { sha256: clip.sha256, byte_size: 100, actor: admin },
        ]);
        await db.exec("reset role");
      }
      await as(admin, "service_role");
      await db.query("select public.hskk_runtime_verified($1)", [
        {
          actor: admin,
          exam_code: examCode,
          runtime_version: "hskk-official-v1",
        },
      ]);
      await as(admin);
      await rpc("grant_access", { student_id: student });
      const gate = (
        await db.query("select public.hskk_publication('readiness',$1) r", [
          { exam_code: examCode, version_id: version.version_id },
        ])
      ).rows[0].r;
      assert.equal(gate.ready, true);
      await db.query("select public.hskk_publication('publish',$1)", [
        { exam_code: examCode, version_id: version.version_id },
      ]);
      await as(student);
      const boot = (
        await db.query("select public.hskk_session_command('load',$1) r", [
          { exam_code: examCode },
        ])
      ).rows[0].r;
      assert.equal(boot.exam.questions.length, count);
      assert.equal(boot.session.candidate_id, student);
      const catalog = (
        await db.query("select public.hskk_session_command('catalog') r")
      ).rows[0].r;
      assert.equal(catalog[0].exam_code, examCode);
      const session = async (command, payload = {}) =>
        (
          await db.query("select public.hskk_session_command($1,$2) r", [
            command,
            payload,
          ])
        ).rows[0].r;
      const recording = async (command, payload = {}) =>
        (
          await db.query("select public.recording_command($1,$2) r", [
            command,
            payload,
          ])
        ).rows[0].r;
      const attempt = boot.session.attempt_id;
      for (const state of [
        "CANDIDATE_VERIFIED",
        "DEVICE_CHECK",
        "MIC_CHECK",
        "READY",
        "STRUCTURE",
        "COUNTDOWN",
      ])
        await session("transition", {
          attempt_id: attempt,
          state,
          runtime_version: "hskk-buffered-v2",
        });
      const live = await session("get", { attempt_id: attempt });
      if (examCode === "H80000") {
        const q = boot.exam.questions[10],
          payload = {
            owner_id: student,
            attempt_id: attempt,
            question_version_id: q.version_id,
          };
        await as(admin, "service_role");
        await assert.rejects(
          db.query("select public.hskk_current_picture($1)", [payload]),
          /PROMPT_DENIED/,
        );
        await db.exec("reset role");
        const s = (
          await db.query(
            "select started_at,timeline from account_internal.hskk_sessions where attempt_id=$1",
            [attempt],
          )
        ).rows[0];
        const prep = s.timeline.find(
          (f) => f.state === "PREPARATION" && f.section_id === "part2",
        );
        await setClock(new Date(s.started_at).getTime() + prep.start + 1);
        await as(admin, "service_role");
        const image = (
          await db.query("select public.hskk_current_picture($1) r", [payload])
        ).rows[0].r;
        assert.equal(image.question_id, "q11");
        await assert.rejects(
          db.query("select public.hskk_current_picture($1)", [
            { ...payload, owner_id: admin },
          ]),
          /PROMPT_DENIED/,
        );
      }
      await setClock(live.server_deadline + 1);
      await as(student);
      for (const [i, q] of boot.exam.questions.entries()) {
        if (i === count - 1)
          await assert.rejects(
            session("submit", { attempt_id: attempt }),
            /RECORDING_REQUIRED/,
          );
        const payload = {
          attempt_id: attempt,
          question_version_id: q.version_id,
          request_id: crypto.randomUUID(),
          sha256: q.number.toString(16).padStart(64, "0"),
          size: 100,
          mime: "audio/webm",
        };
        const asset = await recording("reserve", payload);
        await db.query(
          "insert into storage.objects(bucket_id,name,metadata)values('speaking-private',$1,$2)",
          [asset.path, { size: 100, mimetype: "audio/webm" }],
        );
        await recording("confirm", { recording_id: asset.id });
        await session("bind_recording", {
          attempt_id: attempt,
          recording_id: asset.id,
        });
      }
      assert.equal(
        (await session("submit", { attempt_id: attempt })).state,
        "SUBMITTED",
      );
      assert.equal(
        (await session("submit", { attempt_id: attempt })).state,
        "SUBMITTED",
      );
      await assert.rejects(
        db.query("select public.hskk_publication('process_list',$1)", [
          { exam_code: examCode, attempt_id: attempt },
        ]),
        /ADMIN_REQUIRED/,
      );
      await as(admin);
      assert.equal(
        (
          await db.query(
            "select public.hskk_publication('process_list',$1) r",
            [{ exam_code: examCode, attempt_id: attempt }],
          )
        ).rows[0].r.recording_ids.length,
        count,
      );
    } finally {
      await db.close();
    }
  });
}

test("future unseen intermediate code uses the same private registry, reviewed timing and version contract", async () => {
  const examCode = "FUTURE_80001";
  const { db, as, rpc, admin, student, config } = await deliveryFixture({
    examCode,
    sourceCode: "H80000",
  });
  try {
    const working = {
      id: examCode,
      code: examCode,
      type: "HSKK",
      level: config.level,
      title: examCode,
      sections: structuredClone(config.sections),
      questions: config.questions.map((q) => ({
        ...q,
        kind: q.type,
        question_key: q.id,
      })),
    };
    await assert.rejects(
      rpc("prepare", { expected_revision: 1 }),
      /CONTENT_REVIEW_REQUIRED/,
    );
    await db.query("select public.admin_exam_command('save_working',$1)", [
      { exam: working, request_id: crypto.randomUUID(), expected_revision: 0 },
    ]);
    await rpc("review_content", { expected_revision: 1 });
    assert.equal((await rpc("review_status")).reviewed, true);
    working.questions[0].response_seconds = 12;
    working.sections[1].preparation_seconds = 540;
    await db.query("select public.admin_exam_command('save_working',$1)", [
      { exam: working, request_id: crypto.randomUUID(), expected_revision: 1 },
    ]);
    await assert.rejects(
      rpc("prepare", { expected_revision: 1 }),
      /CONTENT_REVIEW_REQUIRED/,
    );
    assert.equal((await rpc("review_status")).reviewed, false);
    await rpc("review_content", { expected_revision: 2 });
    const prepared = await rpc("prepare", { expected_revision: 1 });
    await db.exec("reset role");
    const projected = (
      await db.query("select account_internal.hskk_delivery_config($1) r", [
        prepared.version_id,
      ])
    ).rows[0].r;
    assert.equal(projected.questions.length, 14);
    assert.equal(projected.questions[0].response_seconds, 12);
    assert.equal(projected.sections[1].preparation_seconds, 540);
    assert.equal(projected.exam_code, examCode);
    await as(admin);
    const assetPayload = {
      exam_code: examCode,
      kind: "mp4",
      sha256: "a".repeat(64),
      byte_size: 40000000,
      chunks: [
        { sha256: "b".repeat(64), byte_size: 33554432 },
        { sha256: "c".repeat(64), byte_size: 6445568 },
      ],
    };
    const reserve = async (payload) =>
      (
        await db.query("select public.hskk_import_asset('reserve',$1) r", [
          payload,
        ])
      ).rows[0].r;
    const asset = await reserve(assetPayload);
    assert.equal((await reserve(assetPayload)).id, asset.id);
    assert.equal(asset.chunks.length, 2);
    await assert.rejects(
      reserve({
        ...assetPayload,
        chunks: [
          { sha256: "d".repeat(64), byte_size: 33554432 },
          assetPayload.chunks[1],
        ],
      }),
      /SOURCE_DEFINITION_LOCKED/,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata)values('hskk-import-originals',$1,$2)",
      [asset.chunks[0].path, { size: 33554432 }],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name)values('hskk-import-originals','unregistered.mp4')",
      ),
      /row-level security/,
    );
    await as(student);
    await assert.rejects(reserve(assetPayload), /ADMIN_REQUIRED/);
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='hskk-import-originals'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select * from account_internal.hskk_import_asset_chunks"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
