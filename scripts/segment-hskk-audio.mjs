// Local authoring worker using the shared adapter. Writes ignored evidence, never publishes.
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { openAITranscriber } from "../server/audio-transcriber.mjs";
import { alignQuestions } from "../server/audio-segmentation.mjs";
const examPath = process.argv[2],
  audioPath = process.argv[3];
if (!examPath || !audioPath)
  throw Error("Pass draft exam JSON and original audio file.");
const exam = JSON.parse(await fs.readFile(examPath, "utf8")),
  bytes = await fs.readFile(audioPath),
  hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== exam.provenance.sha256[exam.provenance.audio])
  throw Error("SOURCE_HASH_MISMATCH");
const output = ".cache/hskk-segmentation/" + hash;
await fs.mkdir(output, { recursive: true });
let transcript;
try {
  transcript = JSON.parse(
    await fs.readFile(output + "/transcript.json", "utf8"),
  );
} catch {
  console.log(
    "Transcribing original source audio with timestamp ASR; draft only.",
  );
  try {
    transcript = await openAITranscriber().transcribe({
      bytes,
      filename: exam.provenance.audio,
    });
  } catch (e) {
    console.error(
      [
        "TRANSCRIBER_NOT_CONFIGURED",
        "TRANSCRIBER_RATE_LIMIT",
        "TRANSCRIBER_QUOTA_EXHAUSTED",
        "TRANSCRIPTION_FAILED",
      ].includes(e.message)
        ? e.message
        : "TRANSCRIPTION_UNAVAILABLE",
    );
    process.exitCode = 1;
  }
  if (transcript)
    await fs.writeFile(
      output + "/transcript.json",
      JSON.stringify(transcript, null, 2),
    );
}
if (transcript) {
  const proposal = alignQuestions({
    exam,
    transcript,
    sourceHash: hash,
    jobId: randomUUID(),
  });
  await fs.writeFile(
    output + "/proposal.json",
    JSON.stringify(proposal, null, 2),
  );
  console.log(
    JSON.stringify({
      matched: proposal.matched,
      total: exam.questions.length,
      needs_review: proposal.questions.filter((q) => q.status !== "AI_DETECTED")
        .length,
      admin_confirmed: 0,
      output,
    }),
  );
}
