import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syntheticPdf, syntheticDocx } from "./helpers/exam-fixtures.mjs";
import { parseExamFile } from "../server/exam-parser.mjs";
import {
  importHSKK,
  extractHSKKPrintedQuestions,
} from "../study/hskk-import-core.mjs";
import {
  extractImportAudio,
  mediaHash,
  verifiedImportBytes,
  immutableImportUpload,
} from "../server/hskk-import-media.mjs";
import {
  normalizeRecording,
  syntheticWave,
  audioHash,
} from "../server/recording-audio.mjs";
import { ffmpeg, decoderEnvironment } from "../server/recording-runtime.mjs";
import { createImportHandler } from "../api/hskk-import.js";
import { createExamHandler } from "../api/hskk-exams.js";
import { parseHSKKDocument } from "../server/hskk-document-parser.mjs";
const text = [
  "第一部分",
  "第1-3题: 听后复述",
  "第二部分",
  "第4题: 朗读",
  "小张每天学习汉语。",
  "他喜欢阅读。 (2 分钟)",
  "第三部分",
  "第5-6题: 回答问题",
  "5. 请介绍你的家人。(2.5 分钟)",
  "6，中国有句话叫“知足常乐”，你怎么看？",
  "UNRELATED BRAND FOOTER",
];
test("an approved Admin can distinguish a new source code from registry outages before import", async () => {
  for (const missing of [true, false]) {
    const handler = createExamHandler({
      authorize: async () => ({ rpc: async () => ({ data: null }) }),
      readDraft: async () => {
        throw Error(missing ? "EXAM_NOT_FOUND" : "SOURCE_REGISTRY_UNAVAILABLE");
      },
    });
    const res = {
      setHeader() {},
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await handler(
      {
        method: "GET",
        url: "/api/hskk-exams?exam=UNSEEN_CODE",
        headers: { authorization: "Bearer synthetic.test.token" },
      },
      res,
    );
    assert.equal(res.statusCode, missing ? 404 : 503);
    assert.equal(
      res.body.error,
      missing ? "EXAM_NOT_FOUND" : "EXAM_UNAVAILABLE",
    );
  }
});
test("HSKK native PDF and Word use the same numbered/heading extraction without invented words or branding", async () => {
  for (const [name, bytes] of [
    ["source.docx", await syntheticDocx(text)],
    ["source.pdf", syntheticPdf([text])],
  ]) {
    const parsed = await parseExamFile(bytes, name, { hskkLevel: "advanced" });
    const extracted = extractHSKKPrintedQuestions(parsed);
    assert.equal(
      extracted.questions.find((q) => q.number === 4).prompt,
      "小张每天学习汉语。\n他喜欢阅读。",
    );
    assert.ok(
      extracted.questions
        .find((q) => q.number === 6)
        .prompt.includes("知足常乐"),
    );
    assert.ok(
      extracted.questions.every(
        (q) => !q.prompt.includes("FOOTER") && !q.prompt.includes("分钟"),
      ),
    );
    const config = importHSKK(parsed, {
      code: "FUTURE_90001",
      level: "advanced",
      documentName: name,
      documentHash: "a".repeat(64),
      audioName: "source.mp3",
      audioHash: "b".repeat(64),
      audioSize: 100,
      duration: 1500,
      actor: "synthetic-admin",
      now: "2026-10-04T00:00:00Z",
    });
    assert.equal(config.questions.length, 6);
    assert.ok(
      config.questions
        .slice(0, 3)
        .every((q) => q.prompt === "" && q.audio_segment === null),
    );
    assert.equal(
      config.questions[3].prompt,
      extracted.questions.find((q) => q.number === 4).prompt,
    );
    assert.equal(
      config.provenance.timing_review,
      "REQUIRED_SOURCE_AUDIO_REVIEW",
    );
  }
});
test("uncertain OCR and duplicate numbers remain review-required rather than silently corrected", () => {
  const parsed = extractHSKKPrintedQuestions({
    pages: [{ number: 1, text: "5. 错字保留？\n5. 另一个问题？" }],
    warnings: ["OCR_REVIEW_PAGE_1"],
  });
  assert.equal(parsed.questions.length, 2);
  assert.ok(parsed.warnings.includes("AMBIGUOUS_QUESTION_5"));
});
test("MP3 source is byte-identical; MP4 extraction retains original hash and creates separately verified MP3", async () => {
  const wave = syntheticWave(2),
    mp3 = (await normalizeRecording(wave, audioHash(wave))).bytes;
  const untouched = Buffer.from(mp3),
    direct = await extractImportAudio(mp3, "mp3");
  assert.deepEqual(direct.bytes, untouched);
  assert.equal(direct.method, "original_mp3_unchanged");
  const directory = await fs.mkdtemp(path.join(tmpdir(), "hskk-media-test-"));
  try {
    const input = path.join(directory, "source.wav"),
      output = path.join(directory, "source.mp4");
    await fs.writeFile(input, wave);
    await promisify(execFile)(
      ffmpeg,
      [
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-i",
        input,
        "-c:a",
        "aac",
        "-n",
        output,
      ],
      { env: decoderEnvironment, windowsHide: true, timeout: 30000 },
    );
    const video = await fs.readFile(output),
      hash = mediaHash(video),
      derived = await extractImportAudio(video, "mp4");
    assert.equal(derived.original_sha256, hash);
    assert.equal(mediaHash(video), hash);
    assert.equal(derived.method, "ffmpeg_extract_mp4_audio_128k");
    assert.ok(Math.abs(derived.duration - 2) < 0.2);
    const checked = await extractImportAudio(derived.bytes, "mp3");
    assert.equal(mediaHash(checked.bytes), mediaHash(derived.bytes));
    await assert.rejects(
      extractImportAudio(Buffer.from("broken"), "mp4"),
      /DECODE/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("private chunked original verifies each ordered part and whole-file hash", async () => {
  const chunks = [Buffer.from("first"), Buffer.from("second")],
    bytes = Buffer.concat(chunks);
  const asset = {
    id: "synthetic",
    bucket: "hskk-import-originals",
    kind: "mp4",
    sha256: mediaHash(bytes),
    byte_size: bytes.length,
    chunks: chunks.map((b, i) => ({
      position: i,
      path: "private-part-" + i,
      sha256: mediaHash(b),
      byte_size: b.length,
    })),
  };
  const client = {
    storage: {
      from: () => ({
        download: async (name) => ({
          data: new Blob([chunks[Number(name.slice(-1))]]),
        }),
      }),
    },
  };
  assert.deepEqual(await verifiedImportBytes(client, asset), bytes);
  await assert.rejects(
    verifiedImportBytes(client, { ...asset, sha256: "0".repeat(64) }),
    /HASH_MISMATCH/,
  );
  await assert.rejects(
    verifiedImportBytes(client, {
      ...asset,
      chunks: [...asset.chunks].reverse(),
    }),
    /INVALID_SOURCE/,
  );
});
test("lost upload replies and HTTP 400 duplicates require verified stored bytes, never an overwrite", async () => {
  const bytes = Buffer.from("original source"),
    asset = {
      id: "synthetic",
      bucket: "hskk-import-originals",
      path: "registered.mp3",
      kind: "mp3",
      sha256: mediaHash(bytes),
      byte_size: bytes.length,
    };
  for (const error of [
    { statusCode: "400", message: "Asset Already Exists" },
    { message: "Lost response" },
    null,
  ]) {
    let stored = bytes;
    const client = {
      storage: {
        from: () => ({
          upload: async (_path, value, options) => {
            assert.equal(options.upsert, false);
            assert.deepEqual(value, bytes);
            return { error };
          },
          download: async () => ({ data: new Blob([stored]) }),
        }),
      },
    };
    await immutableImportUpload(client, asset, bytes, "audio/mpeg");
    stored = Buffer.from("tampered");
    await assert.rejects(
      immutableImportUpload(client, asset, bytes, "audio/mpeg"),
      /HASH_MISMATCH/,
    );
  }
});
test("all new import actions require approved Admin before reading or mutating private assets", async () => {
  let accessed = 0;
  const handler = createImportHandler({
    authorize: async () => {
      throw Error("ADMIN_REQUIRED");
    },
    assetCommand: async () => {
      accessed++;
    },
  });
  for (const action of ["reserve", "audio", "attach", "verify"])
    for (const authenticated of [false, true]) {
      const response = {
        setHeader() {},
        end(body) {
          this.body = body;
        },
      };
      await handler(
        {
          method: "POST",
          url: "/api/hskk-import?action=" + action,
          headers: authenticated
            ? {
                authorization: "Bearer synthetic.test.token",
                "content-type": "application/json",
              }
            : {},
          body: {},
        },
        response,
      );
      assert.equal(response.statusCode, authenticated ? 403 : 401);
      assert.equal(accessed, 0);
      assert.ok(!response.body.includes("token"));
    }
});
for (const [code, level, printed, pictureCount] of [
  ["H80000", "intermediate", [13, 14], 2],
  ["H91002", "advanced", [4, 5, 6], 0],
]) {
  const file = `.cache/hskk-sources/${code}/${code}.pdf`;
  let exists = true;
  try {
    await fs.access(file);
  } catch {
    exists = false;
  }
  test(
    `REAL private ${code} scanned document: local OCR and original pictures remain review-required`,
    { skip: !exists },
    async () => {
      const bytes = await fs.readFile(file),
        hash = mediaHash(bytes);
      const parsed = await parseHSKKDocument(bytes, `${code}.pdf`, { level });
      assert.equal(parsed.pictures.length, pictureCount);
      assert.equal(parsed.recognition, "OCR_REVIEW_REQUIRED");
      const { questions } = extractHSKKPrintedQuestions(parsed);
      for (const number of printed)
        assert.ok(questions.find((q) => q.number === number)?.prompt.trim());
      for (const picture of parsed.pictures) {
        assert.equal(
          mediaHash(Buffer.from(picture.bytes, "base64")),
          picture.sha256,
        );
        assert.ok(picture.byte_size > 1000);
      }
      assert.equal(mediaHash(await fs.readFile(file)), hash);
    },
  );
}
