import { getSession } from "./auth.mjs";
import { uploadRecording } from "./recording-service.mjs";
export async function hskkSessionRequest(
  action,
  payload = {},
  { ownerId, method = "GET", binary = false } = {},
) {
  const session = await getSession();
  if (!session || session.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const params = new URLSearchParams({
    action,
    ...(method === "GET" ? payload : {}),
  });
  const res = await fetch("./api/hskk-session?" + params, {
    method,
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + session.access_token,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw Error((await res.json()).error);
  const data = binary ? await res.blob() : await res.json();
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
export function productionTransport({ exam, session: initial, ownerId }) {
  const call = (action, payload = {}, options = {}) =>
    hskkSessionRequest(action, payload, { ownerId, ...options });
  let first = initial;
  const attemptId = initial.attempt_id;
  return {
    production: true,
    refreshSession: () => call("get", { attempt_id: attemptId }),
    loadSession: async () => {
      if (first) {
        const value = first;
        first = null;
        return value;
      }
      return call("get", { attempt_id: attemptId });
    },
    transition: (id, state) =>
      call("transition", { attempt_id: id, state }, { method: "POST" }),
    saveRecording: async (entry) => {
      const q = exam.questions.find((q) => q.version_id === entry.questionId);
      if (
        entry.ownerId !== ownerId ||
        entry.attemptId !== attemptId ||
        !q ||
        entry.question_key !== q.id ||
        entry.question_version !== q.version ||
        entry.exam_version !== exam.exam_version
      )
        throw Error("INVALID_RECORDING_REFERENCE");
      const uploaded = await uploadRecording({
        blob: entry.blob,
        attemptId,
        questionId: q.version_id,
        requestId: entry.requestId,
        ownerId,
      });
      return call(
        "bind_recording",
        { attempt_id: attemptId, recording_id: uploaded.recording_id },
        { method: "POST" },
      );
    },
    prompt: (qid) =>
      call(
        "prompt",
        { attempt_id: attemptId, question_version_id: qid },
        { binary: true },
      ),
    submit: (id) => call("submit", { attempt_id: id }, { method: "POST" }),
    result: (id) => call("result", { attempt_id: id }),
  };
}
