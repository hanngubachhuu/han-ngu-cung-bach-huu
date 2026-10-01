import fs from "node:fs/promises";
import { HSKKAudioSegmentationEngine } from "../server/hskk-audio-segmentation.mjs";
const [examPath, audioPath] = process.argv.slice(2);
if (!examPath || !audioPath)
  throw Error("Pass draft exam JSON and original audio file.");
const exam = JSON.parse(await fs.readFile(examPath, "utf8"));
const result = await new HSKKAudioSegmentationEngine().segment({
  exam,
  bytes: await fs.readFile(audioPath),
  sourceHash: exam.provenance.sha256[exam.provenance.audio],
});
const output = ".cache/hskk-segmentation/" + result.source_audio_hash;
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  output + "/" + result.run_id + ".json",
  JSON.stringify(result, null, 2),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    run_id: result.run_id,
    matched: result.matched,
    total: result.questions.length,
    needs_review: result.questions.length,
    admin_confirmed: 0,
    openai_used: false,
    output,
  }),
);
