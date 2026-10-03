// Admin preview is deliberately non-persistent. Never calls Storage, Drive or submission RPC.
import { buildTimeline, nextPreflight } from "./hskk-exam-core.mjs";
export function previewTransport(exam, candidateId) {
  const initial = performance.now(),
    now = () => 1000000 + performance.now() - initial;
  const session = {
    candidate_id: candidateId,
    attempt_id: crypto.randomUUID(),
    exam_code: exam.exam_code,
    exam_version: exam.exam_version,
    question_versions: Object.fromEntries(
      exam.questions.map((q) => [q.id, q.version]),
    ),
    question_version_ids: Object.fromEntries(
      exam.questions.map((q) => [q.id, q.version_id]),
    ),
    state: "CREATED",
    server_time: now(),
    recordings: {},
  };
  const view = () => structuredClone({ ...session, server_time: now() });
  return {
    loadSession: async () => view(),
    transition: async (attempt, target) => {
      if (
        attempt !== session.attempt_id ||
        target !== nextPreflight(session.state)
      )
        throw Error("INVALID_TRANSITION");
      if (target === "COUNTDOWN") {
        const frames = buildTimeline(exam);
        session.server_started_at = now();
        session.server_deadline = session.server_started_at + frames.at(-1).end;
      }
      session.state = target;
      return view();
    },
    saveRecording: async (entry) => {
      const q = exam.questions.find((q) => q.id === entry.question_key);
      if (
        entry.ownerId !== candidateId ||
        entry.attemptId !== session.attempt_id ||
        entry.question_version !== q?.version
      )
        throw Error("INVALID_RECORDING_REFERENCE");
      // Preview discards audio immediately. A saved preview is not an official answer.
      const reference = {
        owner_id: candidateId,
        attempt_id: session.attempt_id,
        question_version_id: q.version_id,
        confirmed: true,
        cleanup_status: "pending",
      };
      session.recordings[q.id] = reference;
      return reference;
    },
    submit: async () => {
      throw Error("PREVIEW_CANNOT_SUBMIT");
    },
    result: async () => null,
  };
}
