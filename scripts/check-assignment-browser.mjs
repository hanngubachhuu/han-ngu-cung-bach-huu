// UI integration with mocked providers. Database authority is tested separately in assignment-rls.test.mjs.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext(),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const uid = "00000000-0000-4000-8000-000000000002";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const jwt =
  Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".test";
let admin = false,
  work,
  grade,
  calls = [],
  failSave = false;
const rubric = {
  criteria: [
    { id: "content", label: "Nội dung", weight: 6 },
    { id: "grammar", label: "Ngữ pháp", weight: 4 },
  ],
};
const questions = [
  {
    id: "q1",
    question_key: "q1",
    version: 1,
    kind: "mcq",
    prompt: "Chọn lời chào 你好 <script>bad()</script>",
    options: [
      { id: "A", text: "你好" },
      { id: "B", text: "再见" },
    ],
    max_score: 10,
  },
  {
    id: "q2",
    question_key: "q2",
    version: 1,
    kind: "writing",
    prompt: "Viết lời chào bằng tiếng Trung.",
    options: [],
    max_score: 10,
  },
];
const bankQuestions = Array.from({ length: 24 }, (_, i) => ({
  id: `bank${i}`,
  lesson_id: "hsk1_bai4",
  question_key: i === 23 ? "bank0" : `bank${i}`,
  version: i === 23 ? 2 : 1,
  kind: "mcq",
  prompt: `Câu ngân hàng ${i} 你好`,
  options: [
    { id: "A", text: "你好" },
    { id: "B", text: "再见" },
  ],
  answer_key: { value: "A" },
  explanation: "Private explanation",
  tip: "Private tip",
  published_at: null,
  rubric_version_id: null,
}));
const oldDefinition = {
  id: "old_definition",
  lesson_id: "hsk1_bai4",
  version: 1,
  status: "published",
  title: "Đề trước",
  time_limit_minutes: 30,
  questions: [
    structuredClone(bankQuestions[0]),
    structuredClone(bankQuestions[20]),
  ],
};
function view() {
  const data = structuredClone(work);
  data.server_time = new Date().toISOString();
  if (admin) {
    data.answers.forEach((a) => {
      a.private_question = {
        ...a.question,
        answer_key: a.question.id === "q1" ? { value: "A" } : null,
      };
    });
    data.grading = structuredClone(grade);
  }
  return data;
}
await context.route(
  "https://dmeqxdznzobbarvkmxyg.supabase.co/**",
  async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname;
    const fulfill = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (p.endsWith("/token"))
      return fulfill({
        access_token: jwt,
        refresh_token: "test",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    if (p.endsWith("/user")) return fulfill(user);
    if (p.endsWith("/profiles") && url.searchParams.has("role"))
      return fulfill([]);
    if (p.endsWith("/profiles"))
      return fulfill({
        user_id: uid,
        email: user.email,
        full_name: "Học viên thử",
        phone: "",
        learning_goal: "",
        role: admin ? "ADMIN" : "STUDENT",
        status: "APPROVED",
        version: admin ? 2 : 1,
      });
    if (p.endsWith("/assignment_command")) {
      const { command, payload } = route.request().postDataJSON();
      calls.push({ command, payload });
      if (command === "catalog")
        return fulfill([
          { id: "hsk1_bai4", title_vi: "Bài thử", course_title: "HSK 1" },
        ]);
      if (command === "mine" || command === "queue")
        return fulfill(
          work
            ? [
                {
                  id: work.attempt_id,
                  title_vi: "Bài thử",
                  full_name: "Học viên thử",
                  course_title: "HSK 1",
                  state: work.state,
                  started_at: work.started_at,
                  published_revision: work.result?.revision,
                },
              ]
            : [],
        );
      if (command === "start") {
        work = {
          attempt_id: "attempt1",
          lesson_id: "hsk1_bai4",
          user_id: uid,
          title: "Bài thử",
          state: "draft",
          revision: 0,
          started_at: new Date().toISOString(),
          deadline_at: null,
          answers: questions.map((question, i) => ({
            question,
            position: i + 1,
            answer: null,
          })),
          result: null,
        };
        return fulfill(view());
      }
      if (command === "save") {
        if (failSave)
          return fulfill({ message: "offline fixture", code: "08006" }, 503);
        if (payload.revision !== work.revision)
          return fulfill({ message: "VERSION_CONFLICT", code: "40001" }, 409);
        for (const [id, value] of Object.entries(payload.answers))
          work.answers.find((a) => a.question.id === id).answer = value;
        work.revision++;
        return fulfill(view());
      }
      if (command === "submit") {
        assert.equal(payload.revision, work.revision);
        work.state = "submitted";
        work.submitted_at = new Date().toISOString();
        work.revision++;
        grade = {
          state: "draft",
          revision: 1,
          edit_version: 0,
          preview_version: null,
          grades: questions.map((q) => ({
            question_version_id: q.id,
            score: q.id === "q1" ? 10 : null,
            feedback: "",
            rubric: q.id === "q2" ? rubric : null,
          })),
        };
        return fulfill(view());
      }
      if (command === "get") return fulfill(view());
      if (command === "grade") {
        assert.equal(payload.edit_version, grade.edit_version);
        const g = grade.grades.find(
          (g) => g.question_version_id === payload.question_version_id,
        );
        g.score = Object.values(payload.criteria_scores).reduce(
          (a, b) => a + b,
          0,
        );
        g.criteria_scores = payload.criteria_scores;
        g.feedback = payload.feedback;
        grade.edit_version++;
        grade.preview_version = null;
        return fulfill(view());
      }
      if (command === "grade_preview") {
        assert.equal(payload.edit_version, grade.edit_version);
        grade.preview_version = grade.edit_version;
        return fulfill({
          ...view(),
          preview: { raw_score: 18, raw_max_score: 20, normalized_score: 90 },
        });
      }
      if (command === "grade_publish") {
        assert.equal(grade.preview_version, grade.edit_version);
        grade.state = "published";
        work.result = {
          revision: 1,
          raw_score: 18,
          raw_max_score: 20,
          normalized_score: 90,
          published_at: new Date().toISOString(),
          questions: grade.grades,
        };
        return fulfill(view());
      }
      if (command === "bank")
        return fulfill({
          questions: bankQuestions.slice(
            (payload.page || 0) * 20,
            (payload.page || 0) * 20 + 20,
          ),
          rubrics: [],
          definitions: [oldDefinition],
          settings: null,
        });
      if (command === "definition_preview") return fulfill(oldDefinition);
      if (command === "definition_create")
        return fulfill({ id: "new_definition", ...payload });
      if (command === "question_create") {
        assert.equal(
          bankQuestions.find((q) => q.id === "bank20").prompt,
          "Câu ngân hàng 20 你好",
        );
        const versions = bankQuestions.filter(
          (q) => q.question_key === payload.question_key,
        );
        const row = {
          ...payload,
          id: `new${bankQuestions.length}`,
          version: Math.max(0, ...versions.map((q) => q.version)) + 1,
        };
        bankQuestions.unshift(row);
        return fulfill(row);
      }
      if (command === "regrade") {
        assert.equal(payload.reason, "Kiểm tra lại theo rubric");
        grade.state = "draft";
        grade.revision++;
        grade.edit_version = 0;
        grade.preview_version = null;
        return fulfill(view());
      }
      return fulfill([]);
    }
    if (p.endsWith("/get_private_lesson_content"))
      return fulfill([
        {
          id: "hsk1_bai4",
          content: { officialAssignment: true, lessonId: "hsk1_bai4" },
        },
      ]);
    if (p.endsWith("/lesson_content"))
      return fulfill([
        {
          id: "hsk1_bai4",
          course_id: "hsk1",
          level: 1,
          lesson_no: 4,
          title_vi: "Bài thử",
          title_zh: "你好",
        },
      ]);
    if (p.includes("/rest/v1/")) return fulfill([]);
    return fulfill({});
  },
);
await context.route("**/api/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"configured":false,"connected":false,"aiEnabled":false}',
  }),
);
try {
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/tai-khoan.html");
  await page.locator("#authEmail").fill(user.email);
  await page.locator("#authPassword").fill("test password phrase");
  await page.locator("#authSubmit").click();
  await page.locator("[data-start]").click();
  await page.locator('[name="q1"][value="A"]').check();
  await page.locator('[name="q2"]').fill("你好！");
  await page.locator("[data-save]").click();
  await page
    .getByText("Đã lưu bản nháp trên tài khoản.", { exact: true })
    .waitFor();
  assert.equal(work.answers[1].answer, "你好！");
  assert.equal(await page.locator("[data-answers] script").count(), 0);
  failSave = true;
  await page.locator('[name="q2"]').fill("你好，老师！");
  await page.locator("[data-save]").click();
  await page.getByText("Chưa hoàn tất thao tác.", { exact: false }).waitFor();
  await page.reload();
  await page.locator("[data-open]").click();
  assert.equal(await page.locator('[name="q2"]').inputValue(), "你好，老师！");
  failSave = false;
  await page.locator("[data-save]").click();
  await page
    .getByText("Đã lưu bản nháp trên tài khoản.", { exact: true })
    .waitFor();
  work.revision++;
  work.answers[1].answer = "您好，老师。";
  await page.locator('[name="q2"]').fill("Bản sửa trong tab cũ");
  await page.locator("[data-save]").click();
  await page.locator("[data-conflict-remote]").waitFor();
  assert.equal(
    await page.locator('[name="q2"]').inputValue(),
    "Bản sửa trong tab cũ",
  );
  await page.locator("[data-conflict-remote]").click();
  await page.waitForFunction(
    () => document.querySelector('[name="q2"]')?.value === "您好，老师。",
  );
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByText("Đang chờ công bố kết quả.", { exact: false }).waitFor();
  assert.equal(await page.getByText("Tổng điểm:", { exact: false }).count(), 0);
  assert.equal(await page.locator("fieldset:not([disabled])").count(), 0);
  admin = true;
  await page.goto(base + "/quan-tri.html");
  await page
    .getByText("Bài nộp, chấm điểm và đề HSK / HSKK", { exact: true })
    .click();
  await page.locator("[data-attempt]").click();
  await page.locator('[data-criterion="content"]').fill("5");
  await page.locator('[data-criterion="grammar"]').fill("3");
  await page
    .locator('[data-id="q2"] [data-feedback]')
    .fill("Lời chào phù hợp.");
  assert.equal(await page.locator("[data-preview]").isDisabled(), true);
  await page
    .getByRole("button", { name: "Lưu chấm điểm", exact: true })
    .click();
  await page
    .getByText("Đã lưu. Học viên chưa thấy bản chấm này.", { exact: true })
    .waitFor();
  await page.locator("[data-preview]").click();
  await page.getByText("Học viên sẽ thấy", { exact: true }).waitFor();
  await page.locator("[data-publish]").click();
  await page.locator("[data-regrade]").waitFor();
  await page.locator("[data-reason]").fill("Kiểm tra lại theo rubric");
  await page.locator("[data-regrade]").click();
  await page.locator("[data-preview]").waitFor();
  await page.locator("[data-bank]").click();
  await page.locator('[name="question"][value="bank0"]').check();
  await page
    .locator('[data-definition] [name="title"]')
    .fill("Đề qua nhiều trang");
  await page
    .locator('[data-definition] [name="time_limit_minutes"]')
    .fill("25");
  await page.locator("[data-bank-next]").click();
  await page.locator('[name="question"][value="bank20"]').check();
  await page.locator('[name="question"][value="bank23"]').check();
  assert.equal(
    await page.locator("[data-selection] [data-remove-question]").count(),
    2,
  );
  await page.locator('[data-move-up="bank20"]').click();
  await page.getByRole("button", { name: "Lưu đề nháp", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-definition] [name="title"]')?.value === "",
  );
  assert.deepEqual(
    calls.findLast((c) => c.command === "definition_create").payload,
    {
      lesson_id: "hsk1_bai4",
      title: "Đề qua nhiều trang",
      time_limit_minutes: 25,
      question_version_ids: ["bank20", "bank23"],
    },
  );
  await page.locator('[data-edit-question="bank20"]').click();
  assert.equal(
    await page.locator('[data-question] [name="question_key"]').inputValue(),
    "bank20",
  );
  await page
    .locator('[data-question] [name="prompt"]')
    .fill("Câu phiên bản mới 您好");
  await page
    .getByRole("button", { name: "Lưu phiên bản câu hỏi mới", exact: true })
    .click();
  await page.locator('[data-question] [name="prompt"]').waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-question] [name="prompt"]')?.value === "",
  );
  assert.equal(
    calls.findLast((c) => c.command === "question_create").payload.question_key,
    "bank20",
  );
  await page.locator('[data-copy-question="bank21"]').click();
  assert.equal(
    await page.locator('[data-question] [name="question_key"]').inputValue(),
    "bank21_copy",
  );
  await page.locator('[data-definition-preview="old_definition"]').click();
  await page.locator("[data-reuse-definition]").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-definition] [name="title"]')?.value ===
      "Đề trước (từ v1)",
  );
  await page.getByRole("button", { name: "Lưu đề nháp", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-definition] [name="title"]')?.value === "",
  );
  assert.deepEqual(
    calls.findLast((c) => c.command === "definition_create").payload,
    {
      lesson_id: "hsk1_bai4",
      title: "Đề trước (từ v1)",
      time_limit_minutes: 30,
      question_version_ids: ["bank0", "bank20"],
    },
  );
  admin = false;
  await page.goto(base + "/tai-khoan.html");
  await page.locator("[data-open]").click();
  await page.getByText("Tổng điểm: 90/100", { exact: true }).waitFor();
  await page
    .getByText("Nhận xét: Lời chào phù hợp.", { exact: true })
    .waitFor();
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `overflow ${width}`,
    );
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: `test-results/assignment-student-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(base + "/hsk1_bai4_index.html");
  await page
    .getByText("Bài này sử dụng quy trình nộp bài chính thức.", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".attempt-sync-status").count(), 0);
  assert.equal(await page.locator("[data-private-lesson-engine]").count(), 0);
  assert(calls.some((c) => c.command === "regrade"));
  assert.deepEqual(errors, []);
  console.log(
    "Assignment browser passed: autosave/reload, unpublished privacy, rubric/preview/publish/regrade, cross-page ordering/version edit/copy/restore, 390/768/1366px and official legacy gate.",
  );
} finally {
  await browser.close();
}
