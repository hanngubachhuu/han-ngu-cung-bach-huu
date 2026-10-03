import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./helpers/hskk-delivery-fixture.mjs";

test("Missing-only makeup accepts every supported written question type and enforces expiry", async () => {
  const { db, as, admin, student, setClock } = await deliveryFixture({
    controlledClock: true,
  });
  const invoke = async (name, command, payload = {}) =>
    (
      await db.query("select public." + name + "($1,$2) value", [
        command,
        payload,
      ])
    ).rows[0].value;
  const call = (c, p) => invoke("assignment_command", c, p),
    makeup = (c, p) => invoke("assignment_makeup", c, p);
  try {
    const specs = [
      {
        kind: "mcq",
        options: [
          { id: "A", text: "教师" },
          { id: "B", text: "学生" },
        ],
        answer_key: { value: "A" },
        answer: "A",
      },
      { kind: "true_false", answer_key: { value: true }, answer: false },
      {
        kind: "reorder",
        options: ["我", "学习", "汉语"],
        answer_key: { accepted: ["我学习汉语"] },
        answer: ["我", "学习", "汉语"],
      },
      {
        kind: "matching",
        options: ["a: 老师", "b: teacher"],
        answer_key: { pairs: { a: "b" } },
        answer: { a: "b" },
      },
      {
        kind: "multi_fill",
        answer_key: { values: [["你"], ["好"]] },
        answer: ["你", "好"],
      },
      { kind: "text_fill", answer_key: { accepted: ["你好"] }, answer: "你好" },
      { kind: "writing", answer: "我学习汉语。" },
      { kind: "translation", answer: "Tôi học tiếng Trung." },
    ];
    await as(admin);
    const questions = [];
    for (const [i, spec] of specs.entries()) {
      const fields = { ...spec };
      delete fields.answer;
      if (["writing", "translation"].includes(spec.kind))
        fields.rubric_version_id = (
          await call("rubric_create", {
            rubric_key: "recovery-" + spec.kind,
            kind: spec.kind,
            criteria: [{ id: "meaning", label: "Nghĩa", weight: 10 }],
          })
        ).id;
      questions.push(
        await call("question_create", {
          ...fields,
          lesson_id: "hsk1_bai1",
          question_key: "alltypes" + i,
          prompt: "Câu " + i,
        }),
      );
    }
    const v = await call("definition_create", {
      lesson_id: "hsk1_bai1",
      title: "All types",
      time_limit_minutes: 1,
      question_version_ids: questions.map((q) => q.id),
    });
    await call("definition_preview", { version_id: v.id });
    await call("definition_publish", { version_id: v.id });
    await call("enable", { lesson_id: "hsk1_bai1", enabled: true });
    await as(student);
    const start = await call("start", {
      lesson_id: "hsk1_bai1",
      request_id: crypto.randomUUID(),
    });
    await setClock(Date.parse(start.deadline_at) + 1);
    await as(admin);
    const inspect = await makeup("inspect", { attempt_id: start.attempt_id });
    let window = await makeup("open", {
      attempt_id: start.attempt_id,
      request_id: crypto.randomUUID(),
      expected_revision: inspect.revision,
      expected_version_id: inspect.version_id,
      expected_missing: inspect.missing,
    });
    await setClock(Date.parse(window.expires_at) + 1);
    await as(student);
    await assert.rejects(
      makeup("save", {
        attempt_id: start.attempt_id,
        question_version_id: questions[0].id,
        request_id: crypto.randomUUID(),
        answer: "A",
      }),
      /UPLOAD_WINDOW_EXPIRED/,
    );
    await assert.rejects(
      makeup("submit", { attempt_id: start.attempt_id }),
      /UPLOAD_WINDOW_EXPIRED/,
    );
    await as(admin);
    window = await makeup("open", {
      attempt_id: start.attempt_id,
      request_id: crypto.randomUUID(),
      expected_revision: inspect.revision,
      expected_version_id: inspect.version_id,
      expected_missing: inspect.missing,
    });
    await as(student);
    for (const [i, q] of questions.entries())
      await makeup("save", {
        attempt_id: start.attempt_id,
        window_id: window.window_id,
        question_version_id: q.id,
        request_id: crypto.randomUUID(),
        answer: specs[i].answer,
      });
    await makeup("submit", { attempt_id: start.attempt_id });
    await as(admin);
    const read = await call("get", { attempt_id: start.attempt_id });
    assert.equal(read.grading.grades.length, 8);
    assert.equal(read.grading.state, "draft");
    assert.equal(read.answers[1].answer, false);
  } finally {
    await db.close();
  }
});

for (const variant of ["expired-draft", "published", "speaking"])
  test(
    "Admin may open missing-only makeup for any official assignment: " +
      variant,
    async () => {
      const { db, as, admin, student, setClock } = await deliveryFixture({
        controlledClock: true,
      });
      const invoke = async (name, command, payload = {}) =>
        (
          await db.query("select public." + name + "($1,$2) value", [
            command,
            payload,
          ])
        ).rows[0].value;
      const call = (command, payload) =>
        invoke("assignment_command", command, payload);
      const makeup = (command, payload) =>
        invoke("assignment_makeup", command, payload);
      try {
        await as(admin);
        const speaking = variant === "speaking";
        const rubric = speaking
          ? await call("rubric_create", {
              rubric_key: "recovery",
              kind: "speaking",
              criteria: [{ id: "clarity", label: "Rõ ràng", weight: 10 }],
            })
          : null;
        const questions = [];
        for (let i = 1; i <= 3; i++)
          questions.push(
            await call("question_create", {
              lesson_id: "hsk1_bai1",
              question_key: "recovery-" + i,
              kind: speaking ? "speaking" : "mcq",
              prompt: "Câu " + i,
              ...(speaking
                ? { rubric_version_id: rubric.id }
                : {
                    options: [
                      { id: "A", text: "你好" },
                      { id: "B", text: "再见" },
                    ],
                    answer_key: { value: "A" },
                  }),
            }),
          );
        const def = await call("definition_create", {
          lesson_id: "hsk1_bai1",
          title: "Bài bất kỳ",
          time_limit_minutes: 1,
          question_version_ids: questions.map((q) => q.id),
        });
        await call("definition_preview", { version_id: def.id });
        await call("definition_publish", { version_id: def.id });
        if (speaking) {
          await db.exec("reset role");
          await db.exec(
            "update account_internal.speaking_settings set enabled=true,verified_at=now()",
          );
          await as(admin);
        }
        await call("enable", { lesson_id: "hsk1_bai1", enabled: true });
        if (speaking) await as(student);
        else await as(student);
        let attempt = await call("start", {
          lesson_id: "hsk1_bai1",
          request_id: crypto.randomUUID(),
        });
        const id = attempt.attempt_id;
        if (speaking) {
          await db.exec("reset role");
          await db.exec(
            "update account_internal.speaking_settings set enabled=false",
          );
          await as(student);
        }
        if (!speaking)
          attempt = await call("save", {
            attempt_id: id,
            revision: 0,
            answers: { [questions[0].id]: "A" },
          });
        await setClock(Date.parse(attempt.deadline_at) + 1);
        await as(student);
        if (variant === "published") {
          await call("submit", { attempt_id: id, revision: attempt.revision });
          await as(admin);
          let graded = await call("get", { attempt_id: id });
          await call("grade_preview", {
            attempt_id: id,
            grade_revision: graded.grading.revision,
            edit_version: graded.grading.edit_version,
          });
          await call("grade_publish", {
            attempt_id: id,
            grade_revision: graded.grading.revision,
            edit_version: graded.grading.edit_version,
          });
        }
        await db.exec("reset role");
        const snapshot = async () =>
          (
            await db.query(
              `select jsonb_build_object('attempt',(select to_jsonb(a) from public.learning_attempts a where id=$1),'detail',(select to_jsonb(d) from public.submission_details d where attempt_id=$1),'accepted',(select jsonb_agg(to_jsonb(sa) order by position) from public.submission_answers sa where attempt_id=$1 and answer<>'null'::jsonb),'results',(select jsonb_agg(to_jsonb(r) order by revision) from public.submission_results r where attempt_id=$1),'grades',(select jsonb_agg(to_jsonb(g) order by revision,question_version_id) from public.submission_grades g where attempt_id=$1)) value`,
              [id],
            )
          ).rows[0].value;
        const before = await snapshot();
        await as(student);
        await assert.rejects(
          makeup("open", { attempt_id: id }),
          /ADMIN_REQUIRED/,
        );
        await as(null, "anon");
        await assert.rejects(
          makeup("load", { attempt_id: id }),
          /permission denied/,
        );
        await as(admin);
        const inspected = await makeup("inspect", { attempt_id: id });
        assert.deepEqual(
          inspected.missing_numbers,
          speaking ? [1, 2, 3] : [2, 3],
        );
        const open = {
          attempt_id: id,
          request_id: crypto.randomUUID(),
          expected_revision: inspected.revision,
          expected_version_id: inspected.version_id,
          expected_missing: inspected.missing,
        };
        await assert.rejects(
          makeup("open", { ...open, expected_missing: [] }),
          /VERSION_CONFLICT/,
        );
        const window = await makeup("open", open);
        await db.exec("reset role");
        const outsider = crypto.randomUUID();
        await db.query(
          "insert into auth.users(id,email) values($1,'outsider@example.invalid')",
          [outsider],
        );
        await db.query(
          "update public.profiles set status='APPROVED' where user_id=$1",
          [outsider],
        );
        await as(outsider);
        await assert.rejects(
          makeup("load", { attempt_id: id }),
          /ATTEMPT_NOT_FOUND/,
        );
        await assert.rejects(
          makeup("save", {
            window_id: window.window_id,
            question_version_id: inspected.missing[0],
            request_id: crypto.randomUUID(),
            answer: "A",
          }),
          /ATTEMPT_NOT_FOUND/,
        );
        await assert.rejects(
          db.query("select * from account_internal.assignment_makeup_windows"),
          /permission denied/,
        );
        await as(admin);
        assert.equal((await makeup("open", open)).window_id, window.window_id);
        await assert.rejects(
          makeup("open", { ...open, request_id: crypto.randomUUID() }),
          /MAKEUP_ALREADY_OPEN/,
        );
        await as(student);
        const load = await makeup("load", { attempt_id: id });
        assert.equal(
          (await call("mine")).find((a) => a.id === id).makeup_window_id,
          window.window_id,
        );
        assert.equal(load.answers.length, speaking ? 3 : 2);
        assert.equal(JSON.stringify(load).includes("answer_key"), false);
        assert.equal(
          (await call("get", { attempt_id: id })).state,
          before.detail.state,
        );
        await assert.rejects(
          call("save", {
            attempt_id: id,
            revision: inspected.revision,
            answers: { [questions[0].id]: "B" },
          }),
          /MAKEUP_TRANSPORT_REQUIRED/,
        );
        await assert.rejects(
          makeup("submit", { attempt_id: id }),
          /MAKEUP_INCOMPLETE/,
        );
        for (const qid of inspected.missing) {
          let answer = "A";
          if (speaking) {
            const reserve = {
              attempt_id: id,
              question_version_id: qid,
              request_id: crypto.randomUUID(),
              assignment_makeup_window_id: window.window_id,
              sha256: "a".repeat(64),
              size: 100,
              mime: "audio/webm",
            };
            const r = await invoke("recording_command", "reserve", reserve);
            assert.equal(
              (await invoke("recording_command", "reserve", reserve)).id,
              r.id,
            );
            await assert.rejects(
              invoke("recording_command", "confirm", { recording_id: r.id }),
              /UPLOAD_NOT_CONFIRMED/,
            );
            await db.query(
              "insert into storage.objects(bucket_id,name,metadata) values('speaking-private',$1,$2)",
              [r.path, { size: 100, mimetype: "audio/webm" }],
            );
            await invoke("recording_command", "confirm", {
              recording_id: r.id,
            });
            await db.exec(
              "select set_config('storage.operation','object.get_authenticated',false)",
            );
            assert.equal(
              (
                await db.query(
                  "select count(*)::int n from storage.objects where bucket_id='speaking-private'",
                )
              ).rows[0].n,
              0,
            );
            answer = { recording_id: r.id };
          }
          const save = {
            attempt_id: id,
            window_id: window.window_id,
            question_version_id: qid,
            request_id: crypto.randomUUID(),
            answer,
          };
          await makeup("save", save);
          assert.equal((await makeup("save", save)).reused, true);
          await assert.rejects(
            makeup("save", {
              ...save,
              answer: speaking ? { recording_id: crypto.randomUUID() } : "B",
            }),
            /RECORDING_LOCKED/,
          );
        }
        if (!speaking)
          await assert.rejects(
            makeup("save", {
              attempt_id: id,
              question_version_id: questions[0].id,
              request_id: crypto.randomUUID(),
              answer: "B",
            }),
            /RECORDING_LOCKED/,
          );
        assert.equal(
          (await makeup("submit", { attempt_id: id })).submitted,
          true,
        );
        assert.equal(
          (await makeup("submit", { attempt_id: id })).submitted,
          true,
        );
        await db.exec("reset role");
        const after = await snapshot();
        for (const accepted of before.accepted || [])
          assert.deepEqual(
            (
              await db.query(
                "select to_jsonb(sa) value from public.submission_answers sa where attempt_id=$1 and question_version_id=$2",
                [id, accepted.question_version_id],
              )
            ).rows[0].value,
            accepted,
          );
        assert.equal(after.detail.deadline_at, before.detail.deadline_at);
        assert.equal(
          after.detail.assignment_version_id,
          before.detail.assignment_version_id,
        );
        for (const old of before.results || [])
          assert.deepEqual(
            after.results.find((r) => r.revision === old.revision),
            old,
          );
        for (const old of before.grades || [])
          assert.deepEqual(
            after.grades.find(
              (g) =>
                g.revision === old.revision &&
                g.question_version_id === old.question_version_id,
            ),
            old,
          );
        if (variant === "published") {
          assert.deepEqual(after.detail, before.detail);
          assert.deepEqual(after.attempt, before.attempt);
          assert.equal(after.results.at(-1).state, "draft");
        } else
          assert.ok(
            Date.parse(after.attempt.submitted_at) >
              Date.parse(before.detail.deadline_at),
          );
        await as(admin);
        const read = await call("get", { attempt_id: id });
        assert.equal(read.makeup.questions.length, speaking ? 3 : 2);
        assert.equal(read.grading.state, "draft");
        assert.equal(
          (await makeup("inspect", { attempt_id: id })).can_open,
          false,
        );
      } finally {
        await db.close();
      }
    },
  );
