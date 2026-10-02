import {
  buildTimeline,
  verifySession,
  frameAt,
  remainingSeconds,
  nextPreflight,
  recordingIdentity,
  serverClock,
  canSubmit,
  publicResult,
} from "./hskk-exam-core.mjs";

// The adapter is the permission/time boundary. A browser cannot grant itself a session.
// Preview adapters never write official submissions; production adapters must use server RPC.
export class HSKKExamEngine {
  constructor({
    exam,
    candidateId,
    transport,
    recorder,
    audio,
    monotonic,
    journal,
    onChange = () => {},
  }) {
    this.exam = structuredClone(exam);
    this.candidateId = candidateId;
    this.transport = transport;
    this.recorder = recorder;
    this.audio = audio;
    this.monotonic = monotonic;
    this.onChange = onChange;
    this.journal = journal;
    this.frame = null;
    this.session = null;
    this.activeQuestion = null;
    this.pending = new Map();
    this.persistence = new Map();
    this.answered = new Set();
    this.recordings = {};
    this.disposed = false;
    this.busy = false;
  }
  async recover() {
    const session = await this.transport.loadSession(
      this.exam.exam_code,
      this.exam.exam_version,
    );
    if (this.disposed) return;
    verifySession(this.exam, session, this.candidateId);
    if (this.session && this.session.attempt_id !== session.attempt_id)
      throw Error("SESSION_IDENTITY_MISMATCH");
    this.session = session;
    this.now = serverClock(session.server_time, this.monotonic);
    this.recordings = session.recordings || this.recordings;
    for (const saved of (await this.journal?.load()) || []) {
      const q = this.exam.questions.find((q) => q.id === saved.questionId),
        entry = saved.entry;
      if (
        q &&
        entry.ownerId === this.candidateId &&
        entry.attemptId === session.attempt_id &&
        entry.question_key === q.id &&
        entry.questionId === q.version_id &&
        entry.question_version === q.version &&
        entry.exam_version === this.exam.exam_version
      ) {
        entry.saving = false;
        this.pending.set(q.id, entry);
        this.persistence.set(entry.requestId, Promise.resolve());
      }
    }
    for (const id of [...Object.keys(this.recordings), ...this.pending.keys()])
      this.answered.add(id);
    if (session.server_started_at) this.timeline = buildTimeline(this.exam);
    await this.tick();
    return this.session;
  }
  async advance() {
    if (this.busy || this.disposed) return;
    this.busy = true;
    try {
      const target = nextPreflight(this.session.state);
      if (target === "COUNTDOWN") buildTimeline(this.exam); // No guessing audio offsets.
      const next = await this.transport.transition(
        this.session.attempt_id,
        target,
      );
      verifySession(this.exam, next, this.candidateId);
      if (next.attempt_id !== this.session.attempt_id)
        throw Error("SESSION_IDENTITY_MISMATCH");
      this.session = next;
      this.now = serverClock(next.server_time, this.monotonic);
      if (target === "COUNTDOWN") this.timeline = buildTimeline(this.exam);
      await this.tick();
    } finally {
      this.busy = false;
    }
  }
  question() {
    return this.exam.questions.find((q) => q.id === this.frame?.question_id);
  }
  async finishRecording() {
    clearTimeout(this.recordingStop);
    if (this.finishing) return this.finishing;
    const q = this.activeQuestion;
    this.activeQuestion = null;
    if (!q) return;
    this.finishing = this.captureRecording(q);
    try {
      return await this.finishing;
    } finally {
      this.finishing = null;
    }
  }
  async captureRecording(q) {
    this.answered.add(q.id);
    const blob = await this.recorder.stop();
    if (this.disposed) return;
    if (!blob?.size) {
      this.onChange({ ...this.view(), recording_status: "ERROR" });
      return;
    }
    // Request identity remains unchanged across retries, and cannot be reused for another question.
    const entry = {
      blob,
      requestId: crypto.randomUUID(),
      ...recordingIdentity(this.session, q),
    };
    this.pending.set(q.id, entry);
    // Keep actual Blob bytes immediately. Local durability and network upload continue independently.
    void this.save(q, entry);
  }
  persist(q, entry) {
    if (!this.persistence.has(entry.requestId)) {
      const snapshot = { ...entry };
      delete snapshot.saving;
      const persistence = Promise.resolve()
        .then(() => this.journal?.put(q.id, snapshot))
        .catch((error) => {
          // Retry a failed local transaction with the same retained Blob and request identity.
          this.persistence.delete(entry.requestId);
          throw error;
        });
      this.persistence.set(entry.requestId, persistence);
    }
    return this.persistence.get(entry.requestId);
  }
  async save(q, entry) {
    if (entry.saving || this.disposed) return;
    entry.saving = true;
    try {
      await this.persist(q, entry);
      if (this.disposed) return;
      const result = await this.transport.saveRecording(entry);
      if (this.disposed) return;
      // Validate trusted returned binding before counting the answer as saved.
      const { assertRecordingReference } = await import("./hskk-exam-core.mjs");
      assertRecordingReference(this.session, q, result, this.now());
      this.recordings[q.id] = result;
      this.pending.delete(q.id);
      await this.journal?.remove(q.id);
      this.persistence.delete(entry.requestId);
      this.onChange(this.view());
    } catch {
      if (!this.disposed)
        this.onChange({ ...this.view(), recording_status: "ERROR" });
    } finally {
      entry.saving = false;
    }
  }
  async retrySaves() {
    await Promise.all(
      [...this.pending].map(([id, entry]) =>
        this.save(
          this.exam.questions.find((q) => q.id === id),
          entry,
        ),
      ),
    );
  }
  async tick() {
    if (this.frameUpdate) return this.frameUpdate;
    this.frameUpdate = this.updateFrame();
    try {
      return await this.frameUpdate;
    } finally {
      this.frameUpdate = null;
    }
  }
  async updateFrame() {
    if (this.disposed || !this.session) return;
    let next = ["SUBMITTED", "GRADED", "PUBLISHED"].includes(this.session.state)
      ? { state: this.session.state }
      : this.session.server_started_at && this.timeline
        ? frameAt(this.timeline, this.session.server_started_at, this.now())
        : { state: this.session.state };
    const key = `${next.state}:${next.question_id || next.section_id || ""}`;
    if (key !== this.frameKey) {
      this.audio.stop();
      await this.finishRecording();
      if (this.disposed) return;
      // Recorder sealing may take time; keep the absolute server timeline instead of delaying it.
      if (
        this.session.server_started_at &&
        this.timeline &&
        !["SUBMITTED", "GRADED", "PUBLISHED"].includes(this.session.state)
      )
        next = frameAt(
          this.timeline,
          this.session.server_started_at,
          this.now(),
        );
      this.frameKey = `${next.state}:${next.question_id || next.section_id || ""}`;
      this.frame = next;
      const q = this.question();
      if (next.state === "LISTENING") {
        if (this.exam.delivery_mode === "private_clips") {
          const listening = next;
          void this.audio
            .playPrompt(q, () =>
              Math.max(
                0,
                (this.now() -
                  this.session.server_started_at -
                  listening.start) /
                  1000,
              ),
            )
            .catch(() =>
              this.onChange({ ...this.view(), recording_status: "ERROR" }),
            );
        } else {
          const elapsed =
            (this.now() - this.session.server_started_at - next.start) / 1000;
          void this.audio
            .playSegment(this.exam.audio.url, {
              ...q.audio_segment,
              start_seconds: Math.min(
                q.audio_segment.end_seconds,
                q.audio_segment.start_seconds + Math.max(0, elapsed),
              ),
            })
            .catch(() =>
              this.onChange({ ...this.view(), recording_status: "ERROR" }),
            );
        }
      }
      if (next.state === "RECORDING" && !this.answered.has(q.id)) {
        // A recovered session cannot manufacture audio for already elapsed questions.
        this.activeQuestion = q;
        this.recorder.start();
        if (next.end !== null)
          this.recordingStop = setTimeout(
            () => {
              void this.finishRecording()
                .then(() => this.tick())
                .catch(() =>
                  this.onChange({ ...this.view(), recording_status: "ERROR" }),
                );
            },
            Math.max(0, this.session.server_started_at + next.end - this.now()),
          );
      }
    }
    this.frame = next;
    this.onChange(this.view());
    if (
      this.transport.production &&
      next.state === "COMPLETED" &&
      Object.keys(this.recordings).length === this.exam.questions.length &&
      !this.submitting
    ) {
      this.submitting = true;
      void this.submit()
        .catch(() =>
          this.onChange({ ...this.view(), recording_status: "ERROR" }),
        )
        .finally(() => {
          this.submitting = false;
        });
    }
  }
  view() {
    return {
      state: this.frame?.state || this.session?.state || "CREATED",
      question: this.question(),
      section: this.exam.sections.find((s) => s.id === this.frame?.section_id),
      remaining: this.session?.server_started_at
        ? remainingSeconds(
            this.frame,
            this.session.server_started_at,
            this.now(),
          )
        : null,
      saved: Object.keys(this.recordings).length,
      pending: this.pending.size,
      total: this.exam.questions.length,
    };
  }
  async submit() {
    await this.retrySaves();
    const completed = await this.transport.transition(
      this.session.attempt_id,
      "COMPLETED",
    );
    verifySession(this.exam, completed, this.candidateId);
    canSubmit(this.exam, completed, this.recordings, this.now());
    this.session = await this.transport.submit(this.session.attempt_id);
    verifySession(this.exam, this.session, this.candidateId);
    this.frame = { state: "SUBMITTED" };
    this.onChange(this.view());
  }
  async result() {
    return publicResult(await this.transport.result(this.session.attempt_id));
  }
  async dispose() {
    clearTimeout(this.recordingStop);
    this.disposed = true;
    this.audio.stop();
    await this.recorder.dispose();
    // Closing the view must not abort a queued IndexedDB transaction or wait on the network.
    await Promise.allSettled([...this.persistence.values()]);
    this.pending.clear();
    this.persistence.clear();
    this.journal?.close();
  }
}
