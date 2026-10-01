import fs from "node:fs/promises";
import { appendSegmentationRun } from "../study/hskk-segment-review-state.mjs";
import { sourceHash, validBounds } from "../study/hskk-review-validation.mjs";

// Reopen a previously computed local proposal. It never confirms a segment.
// Hosted deployments use only the private persisted review or a fresh engine run.
export async function readCachedReview(exam) {
  if (process.env.VERCEL) return exam;
  const hash = sourceHash(exam);
  if (!/^[a-f0-9]{64}$/.test(hash)) return exam;
  const directory = new URL(
    `../.cache/hskk-segmentation/${hash}/`,
    import.meta.url,
  );
  let files;
  try {
    files = await fs.readdir(directory);
  } catch {
    return exam;
  }
  const runs = await Promise.all(
    files
      .filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))
      .map(async (f) => {
        try {
          const run = JSON.parse(
            await fs.readFile(new URL(f, directory), "utf8"),
          );
          if (
            run.exam_code !== exam.exam_code ||
            run.exam_version !== exam.exam_version ||
            run.source_audio_hash !== exam.audio.source_audio_id ||
            run.source_sha256 !== hash ||
            run.questions?.length !== exam.questions.length ||
            run.questions.some(
              (p, i) =>
                p.question_id !== exam.questions[i].id ||
                p.question_version !== exam.questions[i].version ||
                (p.question_version_id ?? null) !==
                  (exam.questions[i].version_id ?? null) ||
                !validBounds(p.start_ms, p.end_ms, exam.audio.duration_seconds),
            )
          )
            return null;
          return run;
        } catch {
          return null;
        }
      }),
  );
  const latest = runs
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!latest) return exam;
  const review = structuredClone(exam);
  try {
    appendSegmentationRun(review, latest);
  } catch {
    return exam;
  }
  return review;
}
