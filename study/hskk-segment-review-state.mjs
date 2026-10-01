// Pure review state shared by the Admin editor and tests. Runs are append-only snapshots.
export function appendSegmentationRun(exam, run) {
  if (
    run.exam_code !== exam.exam_code ||
    run.exam_version !== exam.exam_version ||
    run.source_audio_hash !== exam.audio.source_audio_id
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
  { start, end, actorId, confirm = false },
) {
  if (
    !actorId ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > exam.audio.duration_seconds
  )
    throw Error("INVALID_SEGMENT");
  const previous = structuredClone(question.audio_segment);
  const changed =
    !proposal ||
    start * 1000 !== proposal.start_ms ||
    end * 1000 !== proposal.end_ms;
  const current = {
    start_seconds: start,
    end_seconds: end,
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
      previous,
      current: structuredClone(current),
      actor_id: actorId,
      event: confirm ? "segment_confirmed" : "segment_adjusted",
      at: current.reviewed_at,
    },
  ];
  return current;
}
