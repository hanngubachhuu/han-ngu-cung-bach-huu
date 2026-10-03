// Shared authoring validation; no automatic confirmation and no source audio processing.
export const nonQuestionTypes = [
  "INTRO",
  "CANDIDATE_INFO",
  "SECTION_INTRO",
  "PREPARATION",
  "TIME_WARNING",
  "TRANSITION",
  "OUTRO",
  "UNKNOWN",
];
export function parseTimestamp(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw Error("INVALID_TIMESTAMP");
    return value;
  }
  if (typeof value !== "string" || !value.trim())
    throw Error("INVALID_TIMESTAMP");
  const match = /^(\d+):([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if (match)
    return (
      Number(match[1]) * 3600000 +
      Number(match[2]) * 60000 +
      Number(match[3]) * 1000 +
      Number(match[4])
    );
  if (/^\d+(\.\d{1,3})?$/.test(value)) return Math.round(Number(value) * 1000);
  throw Error("INVALID_TIMESTAMP");
}
export function timestamp(ms) {
  if (!Number.isInteger(ms) || ms < 0) return "—";
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export function validBounds(start, end, duration) {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= Math.round(duration * 1000)
  );
}
export function confirmed(segment) {
  return (
    segment?.verified === true &&
    ["CONFIRMED", "MANUALLY_ADJUSTED"].includes(segment.status) &&
    Boolean(segment.reviewed_by && segment.reviewed_at)
  );
}
export function sourceHash(exam) {
  return (
    exam.provenance?.sha256?.[exam.provenance?.audio] ||
    exam.audio.source_audio_id
  );
}
export function checkFinalization(exam, { proposals = false } = {}) {
  const issues = [],
    gaps = [];
  let previous;
  const ids = new Set();
  for (const q of exam.questions) {
    const s = proposals
      ? exam.audio.proposals?.find((p) => p.question_id === q.id)
      : q.audio_segment;
    const add = (code, message) =>
      issues.push({
        question_id: q.id,
        number: q.number,
        code,
        message: `Q${q.number} ${message}`,
      });
    if (ids.has(q.id)) add("IDENTITY", "trùng định danh");
    ids.add(q.id);
    if (!s) {
      add("UNCONFIRMED", "chưa xác nhận");
      continue;
    }
    if (!proposals) {
      if (!confirmed(s)) add("UNCONFIRMED", "chưa xác nhận");
      if (
        s.question_id !== q.id ||
        s.question_version !== q.version ||
        (s.question_version_id ?? null) !== (q.version_id ?? null) ||
        s.exam_code !== exam.exam_code ||
        s.exam_version !== exam.exam_version
      )
        add("IDENTITY", "sai định danh hoặc phiên bản");
      if (
        s.source_sha256 !== sourceHash(exam) ||
        s.source_audio_id !== exam.audio.source_audio_id
      )
        add("SOURCE", "khác nguồn audio hiện tại; cần chạy phân đoạn mới");
    }
    if (!validBounds(s.start_ms, s.end_ms, exam.audio.duration_seconds)) {
      add("BOUNDS", "ranh giới không hợp lệ");
      continue;
    }
    if (s.end_ms - s.start_ms < 200)
      add("SHORT", "đoạn quá ngắn (dưới 200 ms)");
    if (previous) {
      const gap = s.start_ms - previous.s.end_ms;
      if (s.start_ms <= previous.s.start_ms) add("ORDER", "đảo thứ tự");
      if (gap < 0) add("OVERLAP", "chồng lấn câu trước");
      if (gap >= 0) {
        const changed = q.section_id !== previous.q.section_id;
        const prep = changed
          ? (exam.sections.find((x) => x.id === q.section_id)
              ?.preparation_seconds || 0) * 1000
          : 0;
        const expected = (previous.q.response_seconds || 0) * 1000 + prep;
        // Configured response/preparation plus a bounded announcement allowance. No gaps are rewritten.
        const allowance = changed ? 60000 : 15000;
        const reviewed = (exam.audio.non_question_reviews || [])
          .filter(
            (x) =>
              x.source_sha256 === sourceHash(exam) &&
              x.exam_version === exam.exam_version &&
              x.status === "CONFIRMED" &&
              x.segment_type !== "UNKNOWN" &&
              x.start_ms >= previous.s.end_ms &&
              x.end_ms <= s.start_ms,
          )
          .sort((a, b) => a.start_ms - b.start_ms);
        let covered = 0,
          end = previous.s.end_ms;
        for (const r of reviewed) {
          covered += Math.max(0, r.end_ms - Math.max(end, r.start_ms));
          end = Math.max(end, r.end_ms);
        }
        const ok =
          gap <= expected + allowance || gap - covered <= expected + allowance;
        gaps.push({
          from: previous.q.id,
          to: q.id,
          start_ms: previous.s.end_ms,
          end_ms: s.start_ms,
          type: ok ? "EXPECTED_GAP" : "REVIEW_REQUIRED_GAP",
        });
        if (!ok)
          add(
            "GAP",
            "có khoảng trống lớn chưa được giải thích; kiểm tra đoạn ngoài câu hỏi",
          );
      }
    }
    previous = { q, s };
  }
  return {
    status: issues.length ? "NEEDS_REVIEW" : "READY_FOR_PUBLISH",
    issues,
    gaps,
    ready: issues.length === 0,
  };
}
export function reviewSummary(exam) {
  const list = exam.questions.map((q) => q.audio_segment);
  return {
    total: list.length,
    confirmed: list.filter(confirmed).length,
    manually_adjusted: list.filter((s) => s?.status === "MANUALLY_ADJUSTED")
      .length,
    needs_review: list.filter((s) => !confirmed(s)).length,
    non_question: exam.audio.non_question_proposals?.length || 0,
    unknown: (exam.audio.non_question_proposals || []).filter((p) => {
      const key = p.start_ms + ":" + p.end_ms;
      return (
        ((exam.audio.non_question_reviews || []).findLast((r) => r.key === key)
          ?.segment_type || p.segment_type) === "UNKNOWN"
      );
    }).length,
  };
}
