// Provider-independent transcript alignment. Silence alone never identifies a question.
import { createHash } from "node:crypto";
export const segmentTypes = Object.freeze([
  "INTRO",
  "CANDIDATE_INFO",
  "SECTION_INTRO",
  "QUESTION",
  "PREPARATION",
  "TIME_WARNING",
  "TRANSITION",
  "OUTRO",
]);
export function normalizeSpeech(text) {
  const digits = "零一二三四五六七八九";
  return String(text)
    .normalize("NFKC")
    .replace(/\d+/g, (n) => {
      const v = Number(n);
      if (v < 10) return digits[v];
      if (v < 100)
        return (
          (v < 20 ? "" : digits[Math.floor(v / 10)]) +
          "十" +
          (v % 10 ? digits[v % 10] : "")
        );
      return n;
    })
    .replace(/[\p{P}\p{Z}\p{S}]/gu, "")
    .toLowerCase();
}
export function phraseSimilarity(a, b) {
  a = normalizeSpeech(a);
  b = normalizeSpeech(b);
  if (!a || !b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
export function validateTranscript(transcript, duration) {
  if (!Array.isArray(transcript.segments) || transcript.segments.length > 10000)
    throw Error("INVALID_TRANSCRIPT");
  for (const s of transcript.segments)
    if (
      typeof s.text !== "string" ||
      s.text.length > 2000 ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < 0 ||
      s.end <= s.start ||
      s.end > duration + 0.5
    )
      throw Error("INVALID_TRANSCRIPT");
  return transcript;
}
function classify(text) {
  const s = normalizeSpeech(text);
  if (/考试.*结束|谢谢你/.test(s)) return "OUTRO";
  if (/准备时间|开始准备/.test(s)) return "PREPARATION";
  if (/还有.*分钟|剩.*分钟|剩.*秒/.test(s)) return "TIME_WARNING";
  if (/叫什么名字|哪国人|序号/.test(s)) return "CANDIDATE_INFO";
  if (/现在开始第.*到.*题|请听后/.test(s)) return "SECTION_INTRO";
  if (/现在开始第.*题/.test(s)) return "TRANSITION";
  return "INTRO";
}
export function alignQuestions({ exam, transcript, sourceHash, jobId }) {
  validateTranscript(transcript, exam.audio.duration_seconds);
  const speech = [...transcript.segments].sort((a, b) => a.start - b.start);
  const proposals = [],
    used = new Set();
  let cursor = 0;
  for (const q of exam.questions) {
    // Long answers may not be read aloud in the original recording. Only an explicit source cue is allowed as fallback.
    const phrases = [q.prompt, ...(q.audio_cues || [])];
    let candidates = [];
    for (let i = cursor; i < speech.length; i++) {
      let text = "";
      for (let j = i; j < Math.min(speech.length, i + 20); j++) {
        if (j > i && speech[j].start - speech[j - 1].end > 2) break;
        text += speech[j].text;
        const scores = phrases.map((p) => phraseSimilarity(p, text));
        const confidence = Math.max(...scores);
        if (confidence >= 0.65)
          candidates.push({
            i,
            j,
            confidence,
            start: speech[i].start,
            end: speech[j].end,
            matched_text: text,
            match_kind:
              scores.indexOf(confidence) === 0 ? "question_text" : "source_cue",
          });
        if (
          normalizeSpeech(text).length >
          Math.max(...phrases.map((p) => normalizeSpeech(p).length)) * 1.7
        )
          break;
      }
    }
    candidates.sort((a, b) => b.confidence - a.confidence || a.start - b.start);
    const match = candidates[0],
      ambiguous =
        match &&
        candidates.some(
          (c) =>
            Math.abs(c.confidence - match.confidence) < 0.03 &&
            Math.abs(c.start - match.start) > 2,
        );
    const identity = {
      exam_code: exam.exam_code,
      exam_version: exam.exam_version,
      question_id: q.id,
      question_version: q.version,
      question_version_id: q.version_id,
      source_audio_id: sourceHash,
      segment_type: "QUESTION",
      job_id: jobId,
    };
    if (!match) {
      proposals.push({
        ...identity,
        status: "PENDING",
        confidence: 0,
        detection_method: "transcript_alignment",
        start_ms: null,
        end_ms: null,
      });
      continue;
    }
    const high =
      match.confidence >= 0.9 &&
      !ambiguous &&
      match.match_kind === "question_text";
    proposals.push({
      ...identity,
      id: createHash("sha256")
        .update(
          JSON.stringify({ ...identity, start: match.start, end: match.end }),
        )
        .digest("hex"),
      start_ms: Math.round(match.start * 1000),
      end_ms: Math.round(match.end * 1000),
      confidence: match.confidence,
      confidence_basis: "normalized_text_similarity_not_asr_probability",
      matched_text: match.matched_text,
      match_kind: match.match_kind,
      detection_method: "timestamp_transcript_alignment",
      status: high ? "AI_DETECTED" : "NEEDS_REVIEW",
      admin_confirmed: false,
    });
    for (let n = match.i; n <= match.j; n++) used.add(n);
    cursor = match.j + 1;
  }
  const nonQuestions = (transcript.utterances || speech)
    .filter((s, i) =>
      transcript.utterances
        ? !proposals.some(
            (p) =>
              p.start_ms !== null &&
              s.start * 1000 < p.end_ms &&
              s.end * 1000 > p.start_ms,
          )
        : !used.has(i),
    )
    .map((s) => ({
      exam_code: exam.exam_code,
      exam_version: exam.exam_version,
      source_audio_id: sourceHash,
      segment_type: classify(s.text),
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
      text: s.text,
      status: "NEEDS_REVIEW",
      detection_method: "transcript_rule_proposal",
    }));
  return {
    job_id: jobId,
    source_sha256: sourceHash,
    exam_code: exam.exam_code,
    exam_version: exam.exam_version,
    questions: proposals,
    non_questions: nonQuestions,
    matched: proposals.filter((p) => p.start_ms !== null).length,
    ready: false,
  };
}
export function confirmSegment(
  segment,
  { actorId, startMs, endMs, at, sourceDurationMs },
) {
  if (
    !actorId ||
    !Number.isInteger(startMs) ||
    !Number.isInteger(endMs) ||
    startMs < 0 ||
    endMs <= startMs ||
    endMs > sourceDurationMs
  )
    throw Error("INVALID_SEGMENT");
  const changed = startMs !== segment.start_ms || endMs !== segment.end_ms;
  return {
    segment: {
      ...segment,
      start_ms: startMs,
      end_ms: endMs,
      revision: (segment.revision || 1) + 1,
      status: changed ? "MANUALLY_ADJUSTED" : "CONFIRMED",
      admin_confirmed: true,
      confirmed_by: actorId,
      confirmed_at: at,
    },
    audit: {
      actor_id: actorId,
      at,
      event: changed ? "segment_adjusted" : "segment_confirmed",
      previous: structuredClone(segment),
      start_ms: startMs,
      end_ms: endMs,
    },
  };
}
