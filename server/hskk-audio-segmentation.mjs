// Server-only authoring analysis. No network, ASR provider, or student runtime dependency.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ffmpeg, ffprobe, decoderEnvironment } from "./recording-runtime.mjs";
const execute = promisify(execFile);
export const engineVersion = "local-energy-1";
export async function analyzeSource(bytes, expectedHash) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expectedHash) throw Error("SOURCE_HASH_MISMATCH");
  if (!bytes.length || bytes.length > 32 * 1024 * 1024)
    throw Error("AUDIO_INVALID_SIZE");
  const directory = await mkdtemp(path.join(tmpdir(), "hskk-analysis-"));
  const run = async (binary, args) => {
    try {
      return await execute(binary, args, {
        timeout: 90000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: decoderEnvironment,
      });
    } catch (e) {
      throw Error(
        e.code === "ENOENT"
          ? "AUDIO_RUNTIME_UNAVAILABLE"
          : "AUDIO_DECODE_FAILED",
      );
    }
  };
  try {
    const input = path.join(directory, "source.mp3"),
      output = path.join(directory, "analysis.pcm");
    await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
    const source = JSON.parse(
      (
        await run(ffprobe, [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-format_whitelist",
          "mp3",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          input,
        ])
      ).stdout,
    );
    const stream = source.streams?.[0],
      duration = Number(source.format?.duration);
    if (
      source.streams?.length !== 1 ||
      stream.codec_name !== "mp3" ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 3600 ||
      ![1, 2].includes(stream.channels) ||
      Number(stream.sample_rate) < 8000
    )
      throw Error("AUDIO_INVALID_METADATA");
    await run(ffmpeg, [
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-threads",
      "1",
      "-protocol_whitelist",
      "file",
      "-format_whitelist",
      "mp3",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-t",
      "3601",
      "-f",
      "s16le",
      "-n",
      output,
    ]);
    const pcm = await readFile(output),
      seconds = pcm.length / 16000;
    if (Math.abs(seconds - duration) > 0.25)
      throw Error("AUDIO_INVALID_DURATION");
    return {
      ...analyzePCM(pcm),
      sha256,
      duration_ms: Math.round(seconds * 1000),
      source_duration_ms: Math.round(duration * 1000),
      source_duration_seconds: duration,
      sample_rate: Number(stream.sample_rate),
      channels: stream.channels,
      analysis_sample_rate: 8000,
      decode_success: true,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
// 20ms RMS frames. A 450ms internal pause joins syllables; longer measured gaps remain boundaries.
// Energy regions are speech candidates, never proof of words or even speech (music can trigger them).
export function analyzePCM(pcm) {
  const frames = [];
  for (let offset = 0; offset + 320 <= pcm.length; offset += 320) {
    let sum = 0;
    for (let i = offset; i < offset + 320; i += 2)
      sum += (pcm.readInt16LE(i) / 32768) ** 2;
    frames.push(Math.sqrt(sum / 160));
  }
  const sorted = [...frames].sort((a, b) => a - b),
    noise = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const threshold = Math.max(0.006, Math.min(0.04, noise * 4));
  const regions = [];
  let start = null,
    last = null;
  frames.forEach((rms, i) => {
    if (rms >= threshold) {
      if (start === null) start = i;
      last = i;
    }
    if (start !== null && (i - last) * 20 > 450) {
      regions.push({ start_ms: start * 20, end_ms: (last + 1) * 20 });
      start = null;
    }
  });
  if (start !== null)
    regions.push({ start_ms: start * 20, end_ms: (last + 1) * 20 });
  const speech_regions = regions.filter((r) => r.end_ms - r.start_ms >= 180);
  const silence = [];
  let cursor = 0;
  for (const r of speech_regions) {
    if (r.start_ms > cursor)
      silence.push({ start_ms: cursor, end_ms: r.start_ms });
    cursor = r.end_ms;
  }
  if (cursor < frames.length * 20)
    silence.push({ start_ms: cursor, end_ms: frames.length * 20 });
  const peaks = [];
  for (let i = 0; i < frames.length; i += 5)
    peaks.push(
      Math.round(Math.min(1, Math.max(...frames.slice(i, i + 5)) * 4) * 1000) /
        1000,
    );
  return {
    speech_regions,
    silence,
    rms_threshold: threshold,
    frame_ms: 20,
    waveform: { step_ms: 100, peaks },
  };
}
export class HSKKAudioSegmentationEngine {
  async segment({ bytes, exam, sourceHash }) {
    const analysis = await analyzeSource(bytes, sourceHash);
    if (
      Math.abs(
        analysis.source_duration_ms - exam.audio.duration_seconds * 1000,
      ) > 500
    )
      throw Error("AUDIO_INVALID_DURATION");
    return proposeSegments(exam, analysis);
  }
}
export function proposeSegments(exam, analysis) {
  const run_id = randomUUID(),
    created_at = new Date().toISOString();
  const regions = [];
  for (const r of analysis.speech_regions) {
    const previous = regions.at(-1);
    if (previous && r.start_ms - previous.end_ms <= 1800)
      previous.end_ms = r.end_ms;
    else regions.push({ ...r });
  }
  const proposals = [],
    used = new Set();
  let cursor = 0;
  for (const section of exam.sections) {
    const questions = exam.questions.filter((q) => q.section_id === section.id);
    // Find a complete consecutive run supported by measured response gaps. A structural match
    // cannot distinguish repeated examples or spoken words, so ties remain unresolved.
    const chains = [];
    for (let start = cursor; start < regions.length; start++) {
      let error = 0,
        count = 0;
      for (let j = 0; j < questions.length; j++) {
        const r = regions[start + j],
          next = regions[start + j + 1];
        const expected = questions[j].response_seconds * 1000;
        if (!next || expected <= 0) {
          break;
        }
        const gap = next.start_ms - r.end_ms,
          deviation = Math.abs(gap - expected);
        if (
          deviation > Math.max(1800, expected * 0.2) &&
          !(
            j === questions.length - 1 &&
            gap >= expected &&
            gap <= expected + 8000
          )
        ) {
          break;
        }
        error += deviation / Math.max(1, expected);
        count++;
      }
      if (count >= Math.min(2, questions.length))
        chains.push({ start, count, score: 1 - error / count });
    }
    chains.sort((a, b) => b.count - a.count || b.score - a.score);
    const best = chains[0],
      ambiguous =
        chains[1] &&
        best.count === chains[1].count &&
        best.score - chains[1].score < 0.025;
    for (let j = 0; j < questions.length; j++) {
      const q = questions[j],
        r =
          best && !ambiguous && j < best.count ? regions[best.start + j] : null;
      if (r) used.add(best.start + j);
      proposals.push({
        question_id: q.id,
        question_version: q.version,
        question_version_id: q.version_id,
        run_id,
        segment_type: "QUESTION",
        start_ms: r?.start_ms ?? null,
        end_ms: r?.end_ms ?? null,
        confidence: r
          ? Math.max(0, Math.min(0.79, Math.round(best.score * 790) / 1000))
          : 0,
        confidence_basis:
          "measured_response_gap_fit_not_speech_recognition_probability",
        detection_method: "structural_timing",
        status: "NEEDS_REVIEW",
        admin_confirmed: false,
        match_kind:
          q.prompt_mode === "audio"
            ? "unverified_speech_region"
            : "unverified_cue",
        reason: r
          ? "Measured energy region in an ordered response-gap chain; words unverified."
          : "Không xác định chắc chắn đoạn âm thanh cho câu này.",
      });
    }
    if (best && !ambiguous) cursor = best.start + best.count;
  }
  const non_questions = regions
    .filter((_, i) => !used.has(i))
    .map((r) => ({
      ...r,
      segment_type: "UNKNOWN",
      status: "NEEDS_REVIEW",
      detection_method: "voice_activity_boundary",
      run_id,
      reason:
        "Energy region: announcement, candidate information, music or other speech; no textual claim.",
    }));
  for (const gap of analysis.silence) {
    const duration = gap.end_ms - gap.start_ms;
    if (duration < 1500) continue;
    const prep = exam.sections.some(
      (s) =>
        s.preparation_seconds > 0 &&
        duration >= s.preparation_seconds * 1000 * 0.6,
    );
    non_questions.push({
      ...gap,
      segment_type: prep ? "PREPARATION" : "UNKNOWN",
      status: "NEEDS_REVIEW",
      detection_method: "silence_boundary",
      run_id,
      reason: prep
        ? "Long measured silence consistent with preparation; may be interrupted by warnings."
        : "Measured non-speech gap; response/preparation role requires review.",
    });
  }
  return {
    run_id,
    job_id: run_id,
    source_audio_hash: analysis.sha256,
    source_audio_id: analysis.sha256,
    source_sha256: analysis.sha256,
    exam_code: exam.exam_code,
    exam_version: exam.exam_version,
    created_at,
    detection_method: "structural_timing",
    engine_version: engineVersion,
    analysis,
    questions: proposals,
    non_questions,
    matched: proposals.filter((p) => p.start_ms !== null).length,
    ready: false,
  };
}
