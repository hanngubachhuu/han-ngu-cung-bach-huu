// Explicit local source import; no DB, Auth, publication or recording writes.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateExam } from "../study/hskk-exam-core.mjs";
const source = process.argv[2];
if (!source)
  throw Error("Pass the directory containing the three original H71002 files.");
const files = ["H71002.pdf", "H71002.mp3", "H71002_đáp án.pdf"];
const bytes = await Promise.all(
  files.map((f) => fs.readFile(path.join(source, f))),
);
const hashes = Object.fromEntries(
  files.map((f, i) => [f, createHash("sha256").update(bytes[i]).digest("hex")]),
);
const repeat = [
  "太好了！",
  "他没去医院。",
  "电影院在前面。",
  "她喜欢读书。",
  "我们都看见那个人了。",
  "昨天天气很冷。",
  "现在是下午三点十分。",
  "我的手机没电了。",
  "欢迎你们到我家玩儿。",
  "服务员，我要一杯咖啡。",
  "希望明天别下雨。",
  "这儿的东西真便宜。",
  "谢谢您的介绍！",
  "他觉得非常快乐。",
  "你早点儿休息吧。",
];
const answer = [
  "你爱不爱喝茶？",
  "你们家谁会开车？",
  "今天是几月几日？",
  "你在哪儿买水果？",
  "你的身体怎么样？",
  "你去过北京吗？",
  "一天有多少个小时？",
  "我跑得很快，你呢？",
  "你为什么要学习汉语？",
  "我说的话你听懂了吗？",
];
const long = ["请介绍一下你的家人。", "猫和狗，你喜欢哪个？为什么？"];
const exam = {
  exam_code: "H71002",
  title: "Thi thử HSKK Sơ cấp",
  level: "elementary",
  source_type: "official",
  exam_version: 1,
  status: "draft",
  provenance: {
    document: files[0],
    audio: files[1],
    answer_document: files[2],
    source_version: "H71002",
    sha256: hashes,
    imported_at: new Date().toISOString(),
    imported_by: "repository-source-import",
    review:
      "PDF pages visually checked against original; answer file is an audio transcript, no scoring rubric",
  },
  audio: {
    mode: "single",
    url: "",
    duration_seconds: 1151.085688,
    byte_size: 18417371,
    segments_status: "unverified",
    source_audio_id: hashes[files[1]],
  },
  timing: { approximate_total_minutes: 17, countdown_seconds: 3 },
  submission_mode: "end_of_exam",
  scoring_mode: "teacher_review",
  rubric: null,
  sections: [
    {
      id: "part1",
      title_zh: "第一部分 · 听后重复",
      title_vi: "Nghe và nhắc lại",
      preparation_seconds: 0,
      duration_minutes: 4,
    },
    {
      id: "part2",
      title_zh: "第二部分 · 听后回答",
      title_vi: "Nghe và trả lời",
      preparation_seconds: 0,
      duration_minutes: 3,
    },
    {
      id: "part3",
      title_zh: "第三部分 · 回答问题",
      title_vi: "Trả lời câu hỏi",
      preparation_seconds: 420,
      preparation_warning_seconds: 60,
      duration_minutes: 3,
    },
  ],
  questions: [...repeat, ...answer, ...long].map((prompt, i) => ({
    id: "q" + (i + 1),
    number: i + 1,
    version: 1,
    version_id: null,
    section_id: i < 15 ? "part1" : i < 25 ? "part2" : "part3",
    type:
      i < 15
        ? "speaking_repeat"
        : i < 25
          ? "speaking_answer"
          : "speaking_long_answer",
    prompt,
    prompt_mode: i < 25 ? "audio" : "text",
    pinyin:
      i === 25
        ? "Qǐng jièshào yíxià nǐ de jiārén."
        : i === 26
          ? "Māo hé gǒu, nǐ xǐhuan nǎge? Wèishénme?"
          : null,
    response_seconds: i < 15 ? 7 : i < 25 ? 10 : 90,
    response_warning_seconds: i >= 25 ? 10 : 0,
    auto_start: true,
    auto_stop: true,
    allow_replay: false,
    allow_rerecord: false,
    allow_navigation: false,
    audio_segment: null,
    answer_key: null,
    ...(i === 25
      ? { audio_cues: ["好，现在开始第26题。"] }
      : i === 26
        ? { audio_cues: ["好，现在开始第27题。"] }
        : {}),
  })),
};
validateExam(exam);
await fs.mkdir("server/hskk", { recursive: true });
await fs.mkdir("media/hskk", { recursive: true });
await fs.writeFile(
  "server/hskk/H71002.json",
  JSON.stringify(exam, null, 2) + "\n",
  { flag: "wx" },
);
await fs.mkdir(".cache/hskk-sources", { recursive: true });
await fs.writeFile(".cache/hskk-sources/H71002.mp3", bytes[1], { flag: "wx" });
await fs.writeFile("media/hskk/H71002.pdf", bytes[0], { flag: "wx" });
console.log(
  "Imported 27 questions as a private draft; copied unchanged original exam PDF and MP3. No answer document published.",
);
