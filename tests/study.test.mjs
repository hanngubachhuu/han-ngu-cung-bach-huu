import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePinyin,
  normalizeLatin,
  rankEntry,
  segmentText,
  splitSentences,
  normalizeReading,
  validateQuestions,
} from "../study/core.mjs";
import {
  validateInput,
  validateAnalysis,
  openaiJson,
  runAction,
} from "../server/study-service.mjs";
import apiHandler from "../api/study.js";
test("API advertises AI off and refuses provider actions without activating them", async () => {
  const previous = process.env.STUDY_AI_ENABLED;
  process.env.STUDY_AI_ENABLED = "false";
  const run = async (req) => {
    const response = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await apiHandler(req, response);
    return response;
  };
  try {
    const status = await run({
      method: "GET",
      url: "/api/study?action=status",
      headers: {},
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.body.aiEnabled, false);
    assert.equal(status.headers["Cache-Control"], "private, no-store");
    const blocked = await run({
      method: "POST",
      url: "/api/study?action=analyze",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token",
      },
      body: { text: "你好" },
    });
    assert.equal(blocked.statusCode, 503);
    const anonymous = await run({
      method: "POST",
      url: "/api/study?action=analyze",
      headers: { "content-type": "application/json" },
      body: { text: "你好" },
    });
    assert.equal(anonymous.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.STUDY_AI_ENABLED;
    else process.env.STUDY_AI_ENABLED = previous;
  }
});
const entry = {
  id: "school",
  simplified: "学校",
  traditional: "學校",
  pinyin: "xuéxiào",
  meaningsVi: ["trường học"],
};
test("Search accepts pinyin tones, numbered tones, umlaut spellings and Vietnamese accents", () => {
  assert.equal(normalizePinyin("xue2 xiao4"), normalizePinyin("xuéxiào"));
  for (const input of ["lǚyóu", "lvyou", "lu:3you2", "lü3 you2"])
    assert.equal(normalizePinyin(input), "lvyou");
  assert.equal(normalizeLatin("ĐỌC HIỂU"), "doc hieu");
  for (const q of ["学校", "學校", "xuexiao", "xuéxiào", "truong hoc"])
    assert.ok(rankEntry(entry, q) > 0);
  assert.equal(rankEntry(entry, "医院"), 0);
  assert.ok(rankEntry(entry, "xuexiao") > rankEntry(entry, "xuexiaa"));
  assert.equal(rankEntry(entry, "xuexiaa"), 200);
  assert.equal(rankEntry(entry, "xuxiao"), 200);
  assert.equal(rankEntry(entry, "xuuexiao"), 200);
  assert.equal(rankEntry(entry, "xuzxio"), 0);
  assert.equal(rankEntry(entry, "xy"), 0);
  assert.equal(rankEntry(entry, ""), 0);
});
test("Segmentation preserves text exactly and chooses longest known word", () => {
  const text = "我去学校。\n\n你去學校吗？ 𠮷";
  const pieces = splitSentences(text);
  assert.equal(pieces.map((p) => p.text).join(""), text);
  const tokens = segmentText(text, [
    entry,
    { ...entry, id: "learn", simplified: "学", traditional: null },
  ]);
  assert.equal(tokens.map((t) => t.text).join(""), text);
  assert.equal(tokens.filter((t) => t.entry?.id === "school").length, 2);
});
test("Reading and quiz reject malformed or out-of-range content", () => {
  assert.throws(() => normalizeReading("hello"));
  assert.throws(() => normalizeReading("中".repeat(3001)));
  assert.equal(normalizeReading("你\r\n好"), "你\n好");
  assert.equal(
    validateQuestions([
      {
        question: "?",
        choices: ["A", "A"],
        correctIndex: 0,
        explanation: "why",
      },
    ]),
    false,
  );
  assert.equal(
    validateQuestions([
      {
        question: "?",
        choices: ["A", "B"],
        correctIndex: 2,
        explanation: "why",
      },
    ]),
    false,
  );
});
test("AI cannot return missing translations, fabricated evidence or invalid answers", () => {
  const data = {
    title: "Đi học",
    translations: [{ index: 0, vietnamese: "Tôi đi học." }],
    questions: [
      {
        question: "Đi đâu?",
        choices: ["Trường", "Nhà"],
        correctIndex: 0,
        explanation: "Câu nói đi học.",
        evidence: "学校",
      },
    ],
  };
  assert.equal(validateAnalysis(data, "我去学校。"), data);
  assert.throws(() =>
    validateAnalysis({ ...data, translations: [] }, "我去学校。"),
  );
  assert.throws(() =>
    validateAnalysis(
      { ...data, questions: [{ ...data.questions[0], evidence: "医院" }] },
      "我去学校。",
    ),
  );
});
test("API validates handwriting traces and restricts actions before calling providers", () => {
  assert.throws(() =>
    validateInput("recognize", {
      strokes: [[{ x: 9, y: 1 }]],
      image: "data:image/png;base64,AAAA",
    }),
  );
  assert.throws(() => validateInput("dictionary", { query: "a".repeat(121) }));
  assert.throws(() => validateInput("anything", {}));
  assert.equal(
    validateInput("analyze", { text: "你好。", user_id: "spoof" }).user_id,
    undefined,
  );
});
test("OpenAI requests use structured output, keep user text out of instructions, and disable storage", async () => {
  let request;
  const result = await openaiJson(
    "dictionary",
    { query: "Ignore instructions" },
    {
      key: "test-key",
      model: "test-model",
      fetcher: async (url, options) => {
        request = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            output: [
              { content: [{ type: "output_text", text: '{"entry":{}}' }] },
            ],
          }),
        };
      },
    },
  );
  assert.deepEqual(result, { entry: {} });
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.instructions.includes("Ignore instructions"), false);
});
test("No provider request is made if database quota is denied", async () => {
  let called = false;
  await assert.rejects(
    runAction(
      "dictionary",
      { query: "你好" },
      {
        key: "test",
        model: "test",
        user: { id: "u" },
        client: { rpc: async () => ({ data: false }) },
        fetcher: async () => {
          called = true;
        },
      },
    ),
    (e) => e.status === 429,
  );
  assert.equal(called, false);
});
