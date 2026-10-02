// Explicit local import only. Original archives/audio stay unchanged and ignored.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateExam } from "../study/hskk-exam-core.mjs";
const base = process.argv[2];
if (!base)
  throw Error(
    "Pass the private source directory containing H91002 and H80000.",
  );
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const definitions = [
  {
    code: "H91002",
    level: "advanced",
    duration: 1501.714286,
    minutes: 24,
    source_audio_sha256:
      "97c22584156721b01276fa5a7c406c30fbab1d6b0dffbed158b26d50c0ac4b48",
    sections: [
      {
        id: "part1",
        title_vi: "Nghe và thuật lại",
        title_zh: "第一部分 · 听后复述",
        preparation_seconds: 0,
      },
      {
        id: "part2",
        title_vi: "Đọc thành tiếng",
        title_zh: "第二部分 · 朗读",
        preparation_seconds: 600,
        preparation_section_ids: ["part2", "part3"],
      },
      {
        id: "part3",
        title_vi: "Trả lời câu hỏi",
        title_zh: "第三部分 · 回答问题",
        preparation_seconds: 0,
      },
    ],
    prompts: [
      "有个国王没有儿子，他打算从全国选一个男孩做王子。于是给每个男孩一棵种子，看谁种的花最漂亮就选谁做王子。到了选王子的那天，几乎所有的小孩都捧着鲜艳、漂亮的花来了，只有一个小孩捧着一个空花盆伤心落泪，他没有种出花来。但是，他被选中了。原来，所有的种子都是被煮过的。",
      "孤独是每个人都曾经有过的心理体验，它并不可怕，重要的是你用什么方式去对待它。要战胜孤独，就要学会为别人着想，只要花一些时间和精力去关心、关注别人，相信你会在良好的人际关系中体验到一种自我价值感，而不是孤独感。“去点燃温暖别人的火，它也会温暖你自己。”",
      "虽然我们知道一些优秀的电视节目对人有教育指导作用，但是在对人智力发展的贡献上，看电视是无论如何也不能取代阅读的。因为人在看电视和读书时，参与活动的心理机制是不同的。电视画面给人提供了丰富多彩的形象，但留给人想象的空间就小了，人只能被动接受信息。读书则相反。",
      "小张在公司做白领，觉得自己的能力没有得到上级的认可，他经常想：如果有一天能见到老总，有机会展示一下自己的才干就好了。小张的同事小刘，也有同样的想法。但他更进了一步，去打听老总上下班的时间，算好老总大概在何时进电梯，他也在这个时候去坐电梯，希望能遇到老总，有机会可以打个招呼。他们的同事小李更进一步，他详细了解老总的奋斗经历、毕业院校、人际风格、关心的问题等，精心设计了几句简单却有分量的开场白，在算好的时间去坐电梯，跟老总打过几次招呼后，终于有一天跟老总长谈了一次，不久就争取到了更好的职位。愚者错失机会，智者善抓机会，成功者创造机会。机会只会准备好的人，这准备二字，并非说说而已。",
      "你对自己的哪些方面感到满意？请简单介绍一下。",
      "中国有句话叫“知足常乐”，你怎么看？为什么？",
    ],
  },
  {
    code: "H80000",
    level: "intermediate",
    duration: 1348.68898,
    minutes: 21,
    source_audio_sha256:
      "312e6118cf94621cb77faa1036bfd3656b86a001a9e49c188b10aa4bddaf703c",
    sections: [
      {
        id: "part1",
        title_vi: "Nghe và nhắc lại",
        title_zh: "第一部分 · 听后重复",
        preparation_seconds: 0,
      },
      {
        id: "part2",
        title_vi: "Nhìn tranh và nói",
        title_zh: "第二部分 · 看图说话",
        preparation_seconds: 600,
        preparation_section_ids: ["part2", "part3"],
      },
      {
        id: "part3",
        title_vi: "Trả lời câu hỏi",
        title_zh: "第三部分 · 回答问题",
        preparation_seconds: 0,
      },
    ],
    prompts: [
      ...Array(10).fill(""),
      "",
      "",
      "周末你一般是怎么安排的？",
      "父亲或母亲过生日时，你想送他（她）什么礼物？",
    ],
  },
];
for (const definition of definitions) {
  const { code, level, prompts, sections } = definition,
    files = [`${code}.pdf`, `${code}.mp3`];
  const bytes = await Promise.all(
    files.map((name) => fs.readFile(path.join(base, code, name))),
  );
  if (hash(bytes[1]) !== definition.source_audio_sha256)
    throw Error("SOURCE_HASH_MISMATCH");
  const sha256 = Object.fromEntries(
    files.map((name, i) => [name, hash(bytes[i])]),
  );
  const questions = prompts.map((prompt, i) => {
    const n = i + 1,
      audio = level === "advanced" ? n <= 3 : n <= 10,
      picture = level === "intermediate" && [11, 12].includes(n);
    return {
      id: `q${n}`,
      number: n,
      version: 1,
      version_id: null,
      section_id: audio
        ? "part1"
        : level === "advanced"
          ? n === 4
            ? "part2"
            : "part3"
          : picture
            ? "part2"
            : "part3",
      type: audio
        ? level === "advanced"
          ? "short_response"
          : "speaking_repeat"
        : picture
          ? "picture_description"
          : level === "advanced" && n === 4
            ? "read_aloud"
            : "long_response",
      prompt,
      prompt_mode: audio ? "audio" : picture ? "image" : "text",
      pinyin:
        level === "intermediate" && n === 13
          ? "Zhōumò nǐ yìbān shì zěnme ānpái de?"
          : level === "intermediate" && n === 14
            ? "Fùqīn huò mǔqīn guò shēngrì shí, nǐ xiǎng sòng tā shénme lǐwù?"
            : null,
      response_seconds:
        audio && level === "intermediate"
          ? 10
          : level === "advanced" && n >= 5
            ? 150
            : 120,
      response_warning_seconds: 10,
      auto_start: true,
      auto_stop: true,
      allow_replay: false,
      allow_rerecord: false,
      allow_navigation: false,
      audio_segment: null,
      answer_key: null,
    };
  });
  if (level === "intermediate") {
    await fs.mkdir("server/hskk/assets", { recursive: true });
    for (const n of [11, 12]) {
      const image = await fs.readFile(
        path.join(base, code, `${code}-q${n}.jpg`),
      );
      const file_name = `${code}-q${n}.jpg`;
      questions[n - 1].prompt_image = {
        file_name,
        sha256: hash(image),
        byte_size: image.length,
        source_document: `${code}.pdf`,
        source_page: 2,
      };
      await fs.writeFile(`server/hskk/assets/${file_name}`, image, {
        flag: "wx",
      });
    }
  }
  const exam = {
    exam_code: code,
    title: code,
    level,
    source_type: "official",
    exam_version: 1,
    status: "draft",
    provenance: {
      document: files[0],
      audio: files[1],
      source_version: code,
      sha256,
      imported_at: new Date().toISOString(),
      imported_by: "repository-source-import",
      review:
        "Exam PDF pages visually checked. Original source files unchanged. Audio boundaries require Admin review; no answer key or rubric inferred.",
      timing_review: "REQUIRED_SOURCE_AUDIO_REVIEW",
    },
    audio: {
      mode: "single",
      url: "",
      duration_seconds: definition.duration,
      byte_size: bytes[1].length,
      segments_status: "unverified",
      source_audio_id: sha256[files[1]],
    },
    timing: {
      approximate_total_minutes: definition.minutes,
      countdown_seconds: 3,
    },
    submission_mode: "end_of_exam",
    scoring_mode: "teacher_review",
    rubric: null,
    sections,
    questions,
  };
  validateExam(exam);
  await fs.writeFile(
    `server/hskk/${code}.json`,
    JSON.stringify(exam, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    `${code}: ${questions.length} private draft questions; source unchanged; no upload or publication.`,
  );
}
