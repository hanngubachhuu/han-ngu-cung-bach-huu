// Shared exam logic. Content, durations and source audio belong to versioned config.
export const levels = Object.freeze({
  elementary: "Sơ cấp",
  intermediate: "Trung cấp",
  advanced: "Cao cấp",
});
export const questionTypes = Object.freeze([
  "speaking_repeat",
  "speaking_answer",
  "speaking_long_answer",
  "picture_description",
  "read_aloud",
  "short_response",
  "long_response",
]);
const preflight = [
  "CREATED",
  "CANDIDATE_VERIFIED",
  "DEVICE_CHECK",
  "MIC_CHECK",
  "READY",
  "STRUCTURE",
  "COUNTDOWN",
];
function requireValue(ok, code) {
  if (!ok) throw Error(code);
}
function positive(v) {
  return Number.isFinite(v) && v > 0;
}
export function validateExam(exam, { playable = false } = {}) {
  requireValue(
    exam &&
      /^[A-Za-z0-9_-]{1,64}$/.test(exam.exam_code) &&
      levels[exam.level] &&
      exam.exam_version &&
      exam.title,
    "INVALID_EXAM",
  );
  requireValue(
    ["official", "mock", "teacher_created"].includes(exam.source_type),
    "INVALID_SOURCE",
  );
  requireValue(
    exam.source_type !== "official" ||
      (exam.provenance?.document &&
        exam.provenance?.audio &&
        exam.provenance?.source_version),
    "SOURCE_REQUIRED",
  );
  requireValue(
    Array.isArray(exam.sections) &&
      exam.sections.length > 0 &&
      Array.isArray(exam.questions),
    "SECTIONS_REQUIRED",
  );
  const sections = new Set(),
    questions = new Set(),
    numbers = new Set();
  for (const s of exam.sections) {
    requireValue(
      s.id &&
        !sections.has(s.id) &&
        s.title_vi &&
        Number.isFinite(s.preparation_seconds) &&
        s.preparation_seconds >= 0,
      "INVALID_SECTION",
    );
    sections.add(s.id);
    requireValue(
      exam.questions.some((q) => q.section_id === s.id),
      "EMPTY_SECTION",
    );
  }
  for (const q of exam.questions) {
    requireValue(
      q.id &&
        q.version &&
        !questions.has(q.id) &&
        Number.isInteger(q.number) &&
        q.number > 0 &&
        !numbers.has(q.number) &&
        sections.has(q.section_id),
      "INVALID_QUESTION_IDENTITY",
    );
    requireValue(
      questionTypes.includes(q.type) &&
        ["audio", "text", "image"].includes(q.prompt_mode) &&
        typeof q.prompt === "string",
      "INVALID_QUESTION_TYPE",
    );
    requireValue(
      q.response_seconds === null
        ? q.auto_stop === false
        : positive(q.response_seconds),
      "INVALID_TIMING",
    );
    requireValue(
      typeof q.auto_start === "boolean" &&
        typeof q.auto_stop === "boolean" &&
        typeof q.allow_replay === "boolean" &&
        typeof q.allow_rerecord === "boolean",
      "INVALID_RECORDING_RULES",
    );
    if (q.prompt_mode === "audio" && (playable || q.audio_segment)) {
      const a = q.audio_segment;
      requireValue(
        (!playable || a?.verified === true) &&
          positive(a.end_seconds) &&
          Number.isFinite(a.start_seconds) &&
          a.start_seconds >= 0 &&
          a.end_seconds > a.start_seconds &&
          a.end_seconds <= exam.audio.duration_seconds,
        "AUDIO_SEGMENTS_UNVERIFIED",
      );
    }
    questions.add(q.id);
    numbers.add(q.number);
  }
  if (playable)
    requireValue(
      exam.audio?.url && positive(exam.timing?.countdown_seconds),
      "INVALID_AUDIO",
    );
  return exam;
}
export function buildTimeline(exam) {
  validateExam(exam, { playable: true });
  const frames = [];
  let at = 0;
  const add = (state, seconds, extra) => {
    if (seconds === null) {
      frames.push({ state, start: at, end: null, ...extra });
      at = Infinity;
    } else if (seconds > 0) {
      frames.push({
        state,
        start: at,
        end: at + Math.round(seconds * 1000),
        ...extra,
      });
      at += Math.round(seconds * 1000);
    }
  };
  add("COUNTDOWN", exam.timing.countdown_seconds, {});
  for (const s of exam.sections) {
    add("PREPARATION", s.preparation_seconds, { section_id: s.id });
    for (const q of exam.questions.filter((q) => q.section_id === s.id)) {
      if (q.prompt_mode === "audio")
        add(
          "LISTENING",
          q.audio_segment.end_seconds - q.audio_segment.start_seconds,
          { section_id: s.id, question_id: q.id },
        );
      add(q.auto_start ? "RECORDING" : "READY_TO_RESPOND", q.response_seconds, {
        section_id: s.id,
        question_id: q.id,
      });
    }
  }
  return frames;
}
export function frameAt(timeline, startedAt, now) {
  const elapsed = Math.max(0, now - startedAt);
  return (
    timeline.find(
      (f) => elapsed >= f.start && (f.end === null || elapsed < f.end),
    ) || { state: "COMPLETED" }
  );
}
export function remainingSeconds(frame, startedAt, now) {
  return frame.end === null || frame.end === undefined
    ? null
    : Math.max(0, Math.ceil((startedAt + frame.end - now) / 1000));
}
export function verifySession(exam, session, candidateId) {
  requireValue(
    session?.candidate_id === candidateId &&
      session.attempt_id &&
      session.exam_code === exam.exam_code &&
      String(session.exam_version) === String(exam.exam_version),
    "SESSION_IDENTITY_MISMATCH",
  );
  requireValue(
    exam.questions.every(
      (q) =>
        session.question_versions?.[q.id] === q.version &&
        (!q.version_id ||
          session.question_version_ids?.[q.id] === q.version_id),
    ),
    "QUESTION_VERSION_MISMATCH",
  );
  requireValue(
    Number.isFinite(session.server_time) &&
      (!session.server_started_at ||
        (Number.isFinite(session.server_started_at) &&
          Number.isFinite(session.server_deadline) &&
          session.server_deadline > session.server_started_at)),
    "SERVER_CLOCK_REQUIRED",
  );
  return session;
}
export function nextPreflight(state) {
  const n = preflight.indexOf(state);
  requireValue(n >= 0 && n < preflight.length - 1, "INVALID_TRANSITION");
  return preflight[n + 1];
}
export function recordingIdentity(session, question) {
  requireValue(
    typeof question.version_id === "string" && question.version_id.length > 0,
    "QUESTION_VERSION_MISMATCH",
  );
  return {
    ownerId: session.candidate_id,
    attemptId: session.attempt_id,
    questionId: question.version_id,
    question_key: question.id,
    question_version: question.version,
  };
}
export function assertRecordingReference(session, question, recording, now) {
  requireValue(
    typeof question.version_id === "string" &&
      question.version_id.length > 0 &&
      recording &&
      recording.owner_id === session.candidate_id &&
      recording.attempt_id === session.attempt_id &&
      recording.question_version_id === question.version_id &&
      recording.confirmed === true &&
      (!recording.expires_at || recording.expires_at > now) &&
      recording.cleanup_status !== "completed",
    "INVALID_RECORDING_REFERENCE",
  );
}
export function canSubmit(exam, session, recordings, now) {
  requireValue(session.state === "COMPLETED", "EXAM_NOT_COMPLETED");
  for (const q of exam.questions)
    assertRecordingReference(session, q, recordings[q.id], now);
  return true;
}
export function publicResult(result) {
  if (!result?.published_at || result.source !== "official")
    return { status: "pending", message: "Chưa công bố kết quả." };
  return {
    status: "published",
    message: "Đã công bố kết quả.",
    score: result.score,
    feedback: result.feedback,
  };
}
// Monotonic clock anchored to the last trusted server response; never Date.now().
export function serverClock(serverTime, monotonic = () => performance.now()) {
  requireValue(Number.isFinite(serverTime), "SERVER_CLOCK_REQUIRED");
  const received = monotonic();
  return () => serverTime + Math.max(0, monotonic() - received);
}
