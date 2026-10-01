// Focused Admin generator flow only. Synthetic provider fixtures; no production writes.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext(),
  page = await context.newPage(),
  errors = [],
  writes = [];
const uid = "00000000-0000-4000-8000-000000000001";
const user = {
  id: uid,
  email: "fixture@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
};
const jwt =
  Buffer.from('{"alg":"HS256"}').toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".test";
const questions = [];
const imports = new Map();
let loseImportResponse = true;
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await context.route(
  "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
  async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    const send = (value) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path.endsWith("/token"))
      return send({
        user,
        access_token: jwt,
        refresh_token: "test",
        expires_in: 3600,
        token_type: "bearer",
      });
    if (path.endsWith("/user")) return send(user);
    if (path.endsWith("/profiles"))
      return send(
        u.searchParams.has("role")
          ? []
          : {
              user_id: uid,
              email: user.email,
              full_name: "Admin fixture",
              role: "ADMIN",
              status: "APPROVED",
              version: 1,
            },
      );
    if (path.endsWith("/lesson_content"))
      return send([
        {
          id: "lesson",
          course_id: "hsk1",
          lesson_no: 1,
          title_vi: "Synthetic",
        },
      ]);
    if (path.endsWith("/assignment_command")) return send([]);
    if (path.endsWith("/assignment_authoring")) {
      const { command, payload } = route.request().postDataJSON();
      if (command === "bank")
        return send({
          questions: payload.include_archived
            ? questions
            : questions.filter((q) => !q.archive?.archived),
          definitions: [],
          rubrics: [],
          settings: null,
        });
      if (command === "question_create") {
        writes.push(structuredClone(payload.question));
        const row = {
          ...payload.question,
          id: `q${writes.length}`,
          version: writes.length,
          provenance: {
            source: "admin_manual",
            source_identifier: "fixture:manual",
            source_revision: "1",
            source_item_id: payload.question.question_key,
            ...payload.metadata,
          },
        };
        questions.unshift(row);
        return send(row);
      }
      if (command === "import_preview") {
        imports.set(payload.request_id, { ...payload, state: "preview" });
        return send({
          count: payload.questions.length,
          source: payload.source,
          questions: payload.questions.map((q) => ({ ...q, version: 1 })),
        });
      }
      if (command === "import_commit") {
        const job = imports.get(payload.request_id);
        if (job.state === "committed")
          return send({ ...job.result, already_imported: true });
        const rows = payload.questions.map((q, i) => ({
          ...q,
          id: `import${i}`,
          version: 1,
          provenance: {
            ...payload.source,
            source_item_id: q.source_item_id,
            origin: "import",
            imported_by: uid,
            imported_at: new Date().toISOString(),
          },
        }));
        questions.unshift(...rows);
        job.state = "committed";
        job.result = { count: rows.length, questions: rows };
        if (loseImportResponse) {
          loseImportResponse = false;
          return route.abort("failed");
        }
        return send(job.result);
      }
      if (command === "archive") {
        const q = questions.find((q) => q.id === payload.question_version_id);
        q.archive = {
          revision: payload.revision + 1,
          archived: payload.archived,
          reason: payload.reason,
        };
        return send(q.archive);
      }
      if (command === "imports")
        return send(
          [...imports.values()].map((j) => ({
            ...j,
            created_at: new Date().toISOString(),
            count: j.questions.length,
          })),
        );
      return send([]);
    }
    return send([]);
  },
);
await context.route("**/api/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"configured":false,"connected":false}',
  }),
);
try {
  await page.goto(base + "/tai-khoan.html");
  await page.locator("#authEmail").fill(user.email);
  await page.locator("#authPassword").fill("synthetic password phrase");
  await page.locator("#authSubmit").click();
  await page.getByRole("link", { name: "Quản trị học viên →" }).waitFor();
  await page.goto(base + "/quan-tri.html");
  await page
    .getByText("Bài nộp, chấm điểm và đề HSK / HSKK", { exact: true })
    .click();
  await page.locator("[data-bank]").click();
  await page.getByText("Thêm / sửa câu hỏi", { exact: true }).click();
  const open = async () =>
    page
      .getByText("Tự sinh đáp án nhiễu theo quy tắc tiếng Trung", {
        exact: true,
      })
      .click();
  await open();
  assert.equal(
    await page.locator('[data-question] [name="options"]').isVisible(),
    false,
  );
  assert.equal(
    await page.locator('[data-question] [name="answer"]').isVisible(),
    false,
  );
  await page.locator("[data-generator-target]").fill("17");
  await page.locator("[data-generator-prompt]").click();
  await page.locator("[data-generate]").click();
  assert.equal(await page.locator("[data-generator-preview] p").count(), 3);
  const options1 = await page
    .locator('[data-question] [name="options"]')
    .inputValue();
  await page.locator("[data-generate]").click();
  assert.notEqual(
    await page.locator('[data-question] [name="options"]').inputValue(),
    options1,
  );
  assert.match(
    await page.locator('[data-question] [name="question_key"]').inputValue(),
    /^[0-9a-f-]{36}$/,
  );
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await page.locator('[data-edit-question="q1"]').waitFor();
  assert.equal(writes.length, 1);
  const first = structuredClone(questions[0]);
  await page.locator('[data-edit-question="q1"]').click();
  await open();
  await page.locator("[data-key-choice]").selectOption("A");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await page
    .locator("[data-status]")
    .filter({ hasText: "Sinh lại nhiễu" })
    .waitFor();
  assert.equal(writes.length, 1);
  await page.locator("[data-generator-target]").fill("18");
  await page.locator("[data-generator-prompt]").click();
  await page.locator("[data-generate]").click();
  const valid = await page
    .locator('[data-question] [name="options"]')
    .inputValue();
  const key = await page
    .locator('[data-question] [name="answer"]')
    .inputValue();
  const tampered = valid
    .split("\n")
    .map((s) =>
      s.startsWith(key + " |")
        ? s
        : s.slice(0, s.indexOf("|") + 1) + " ???????",
    )
    .join("\n");
  const wrongChoice = [...tampered.split("\n")].find(
    (line) => !line.startsWith(key + " |"),
  );
  const wrongId = wrongChoice.split("|")[0].trim();
  await page.locator(`[data-option-choice="${wrongId}"]`).fill("???????");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  assert.equal(writes.length, 1);
  await page.locator(`[data-option-choice="${wrongId}"]`).fill(
    valid
      .split("\n")
      .find((line) => line.startsWith(wrongId + " |"))
      .split("|")
      .slice(1)
      .join("|")
      .trim(),
  );
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await page.locator('[data-edit-question="q2"]').waitFor();
  assert.equal(writes.length, 2);
  assert.deepEqual(
    questions.find((q) => q.id === "q1"),
    first,
  );
  assert.equal(writes[1].question_key, first.question_key);
  assert.equal(
    writes[1].options.find((o) => o.id === writes[1].answer_key.value).text,
    "十八",
  );
  await open();
  await page.locator("[data-generator-target]").fill("17");
  await page.locator("[data-generator-correct]").fill("十七");
  await page
    .locator('[data-question] [name="prompt"]')
    .fill("Câu hỏi tùy ý chưa có ngữ cảnh");
  await page.locator("[data-generate]").click();
  await page
    .locator("[data-generator-status]")
    .filter({ hasText: "chưa khớp" })
    .waitFor();
  // The structured developer importer remains hidden in the ordinary Admin UI.
  await page
    .locator("[data-developer-tools]")
    .evaluate((n) => (n.hidden = false));
  await page.getByText("Công cụ nhập có cấu trúc", { exact: true }).click();
  await page.getByText("Nhập câu hỏi có provenance", { exact: true }).click();
  const packet = {
    format: "hnh-question-import-v1",
    lesson_id: "lesson",
    source: {
      source: "Synthetic import",
      source_identifier: "fixture:import",
      source_revision: "r1",
    },
    questions: [
      {
        question_key: "imported",
        source_item_id: "source-q1",
        kind: "mcq",
        prompt: "Chọn lời chào.",
        options: [
          { id: "A", text: "你好" },
          { id: "B", text: "再见" },
        ],
        answer_key: { value: "A" },
      },
    ],
  };
  await page.locator("[data-import-json]").fill(JSON.stringify(packet));
  await page.locator("[data-import-preview]").click();
  await page.locator("[data-import-commit]").waitFor();
  assert.equal(questions.length, 2, "preview cannot add bank questions");
  await page.locator("[data-import-commit]").click();
  await page
    .locator("[data-import-status]")
    .filter({ hasText: "Chưa nhận được xác nhận" })
    .waitFor();
  assert.equal(await page.locator("[data-import-json]").isDisabled(), true);
  assert.equal(questions.length, 3);
  await page.locator("[data-import-commit]").click();
  await page
    .locator("[data-import-result]")
    .filter({ hasText: "không tạo thêm version" })
    .waitFor();
  assert.equal(
    questions.length,
    3,
    "lost response retry cannot duplicate imported questions",
  );
  await page.locator("[data-import-history]").click();
  await page
    .locator("[data-import-history-output]")
    .filter({ hasText: "Đã nhập" })
    .waitFor();
  await page.locator("[data-import-refresh]").click();
  await page.locator('[data-edit-question="import0"]').waitFor();
  await page
    .locator('[data-edit-question="import0"]')
    .locator("..")
    .locator("..")
    .getByText("Nguồn tài liệu", { exact: true })
    .click();
  await page
    .getByText("Synthetic import · Nhập ngày", { exact: false })
    .waitFor();
  await page
    .locator('[data-archive-reason="import0"]')
    .fill("Synthetic retired question");
  await page.locator('[data-archive-question="import0"]').click();
  await page
    .locator('[data-edit-question="import0"]')
    .waitFor({ state: "detached" });
  await page.locator("[data-show-archived]").check();
  await page.locator('[data-edit-question="import0"]').waitFor();
  assert.equal(
    await page.locator('[name="question"][value="import0"]').isDisabled(),
    true,
  );
  await page
    .locator('[data-archive-reason="import0"]')
    .fill("Synthetic restore selection");
  await page.locator('[data-archive-question="import0"]').click();
  await page
    .locator('[data-archive-question="import0"]')
    .filter({ hasText: "Lưu trữ câu" })
    .waitFor();
  assert.equal(
    await page.locator('[name="question"][value="import0"]').isDisabled(),
    false,
  );
  // Presentation regressions: full eight-choice range and matching items stay editable.
  await page.locator('[data-copy-question="import0"]').click();
  const originalCopyKey = await page
    .locator('[data-question] [name="question_key"]')
    .inputValue();
  for (let i = 3; i <= 8; i++) {
    await page.locator("[data-add-choice]").click();
    await page.locator("[data-option-choice]").last().fill(`Phương án ${i}`);
  }
  assert.equal(await page.locator("[data-option-choice]").count(), 8);
  assert.equal(await page.locator("[data-add-choice]").isDisabled(), true);
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await page.locator('[data-edit-question="q3"]').waitFor();
  assert.equal(writes.at(-1).options.length, 8);
  await page.locator('[data-copy-question="import0"]').click();
  assert.notEqual(
    await page.locator('[data-question] [name="question_key"]').inputValue(),
    originalCopyKey,
  );
  await page.locator('[data-question] [name="kind"]').selectOption("matching");
  assert.equal(
    await page.locator('[data-question] [name="options"]').isVisible(),
    true,
  );
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `generator overflow ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Authoring browser PASS: generation/regeneration/final choices/immutable old version/key-change invalidation; import preview/commit/lost-response retry/provenance/history/archive/restore; responsive Admin.",
  );
} finally {
  await browser.close();
}
