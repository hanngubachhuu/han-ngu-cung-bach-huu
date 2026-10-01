import { validBounds, sourceHash } from "./hskk-review-validation.mjs";
// Pure review state shared by the Admin editor and tests. Runs are append-only snapshots.
export function appendSegmentationRun(exam, run) {
  if (
    run.exam_code !== exam.exam_code ||
    run.exam_version !== exam.exam_version ||
    run.source_audio_hash !== exam.audio.source_audio_id ||
    run.source_sha256 !== sourceHash(exam) ||
    (exam.audio.segmentation_runs || []).some((r) => r.run_id === run.run_id)
  )
    throw Error("SEGMENT_RUN_MISMATCH");
  exam.audio.segmentation_runs = [
    ...(exam.audio.segmentation_runs || []),
    structuredClone(run),
  ];
  exam.audio.proposals = structuredClone(run.questions);
  exam.audio.non_question_proposals = structuredClone(run.non_questions);
  exam.audio.job_id = run.run_id;
  // question.audio_segment is deliberately untouched, including manual unconfirmed edits.
}
export function reviewBoundary(
  exam,
  question,
  proposal,
  { start, end, startMs, endMs, actorId, confirm = false },
) {
  startMs ??= start * 1000;
  endMs ??= end * 1000;
  // Legacy seconds callers are accepted only at exact millisecond precision.
  startMs =
    Number.isFinite(startMs) && Math.abs(startMs - Math.round(startMs)) < 1e-6
      ? Math.round(startMs)
      : startMs;
  endMs =
    Number.isFinite(endMs) && Math.abs(endMs - Math.round(endMs)) < 1e-6
      ? Math.round(endMs)
      : endMs;
  if (!actorId || !validBounds(startMs, endMs, exam.audio.duration_seconds))
    throw Error("INVALID_SEGMENT");
  if (proposal) {
    const run = (exam.audio.segmentation_runs || []).find(
      (r) => r.run_id === proposal.run_id,
    );
    if (
      !run ||
      run.source_audio_hash !== sourceHash(exam) ||
      run.exam_version !== exam.exam_version ||
      proposal.question_id !== question.id
    )
      throw Error("STALE_PROPOSAL");
  }
  const previous = structuredClone(question.audio_segment);
  const changed =
    !proposal || startMs !== proposal.start_ms || endMs !== proposal.end_ms;
  const current = {
    start_ms: startMs,
    end_ms: endMs,
    // Compatibility projection for the existing preview engine; canonical storage is integer ms.
    start_seconds: startMs / 1000,
    end_seconds: endMs / 1000,
    question_id: question.id,
    question_version: question.version,
    question_version_id: question.version_id ?? null,
    exam_code: exam.exam_code,
    exam_version: exam.exam_version,
    source_audio_id: exam.audio.source_audio_id,
    source_sha256: sourceHash(exam),
    verified: confirm,
    status: changed
      ? "MANUALLY_ADJUSTED"
      : confirm
        ? "CONFIRMED"
        : "NEEDS_REVIEW",
    detection_method: changed ? "manual" : proposal.detection_method,
    run_id: proposal?.run_id || null,
    reviewed_by: actorId,
    reviewed_at: new Date().toISOString(),
  };
  question.audio_segment = current;
  exam.audio.review_audit = [
    ...(exam.audio.review_audit || []),
    {
      question_id: question.id,
      question_version: question.version,
      question_version_id: question.version_id ?? null,
      previous,
      current: structuredClone(current),
      actor_id: actorId,
      event: confirm ? "segment_confirmed" : "segment_adjusted",
      at: current.reviewed_at,
    },
  ];
  return current;
}

export function replaceWithProposal(
  exam,
  question,
  proposal,
  { actorId, approved = false },
) {
  if (question.audio_segment && !approved)
    throw Error("REPLACEMENT_CONFIRMATION_REQUIRED");
  return reviewBoundary(exam, question, proposal, {
    startMs: proposal.start_ms,
    endMs: proposal.end_ms,
    actorId,
  });
}
