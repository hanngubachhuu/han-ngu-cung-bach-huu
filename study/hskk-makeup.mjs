import { hskkSessionRequest } from "./hskk-production-transport.mjs";
import { uploadRecording } from "./recording-service.mjs";
import { ExamSessionJournal } from "./hskk-session-journal.mjs";
import { ExamRecorder, ExamAudioPlayer } from "./hskk-exam-media.mjs";
import { MicrophoneSample, microphoneLevel } from "./hskk-microphone.mjs";
import { escapeHtml as esc } from "./core.mjs";

// Separate, explicitly authorized recovery. Never reopens the original clock.
export async function mountMakeup(root, { ownerId, attemptId }) {
  const call = (action, payload = {}, options = {}) =>
    hskkSessionRequest(
      "makeup_" + action,
      { attempt_id: attemptId, ...payload },
      { ownerId, ...options },
    );
  let boot = await call("load");
  const clockAt = performance.now(),
    serverAt = boot.server_time;
  const now = () => serverAt + performance.now() - clockAt;
  const original = new ExamSessionJournal(ownerId, attemptId);
  const journal = new ExamSessionJournal(
    ownerId,
    attemptId + ":makeup:" + boot.window_id,
  );
  const pending = new Map(),
    work = new Map(),
    retries = new Map();
  const pictureUrls = new Set();
  let alive = true,
    stream,
    recorder,
    context,
    analyser,
    active,
    timer,
    meterFrame,
    sampleActive = false,
    micReady = false,
    submitting = false;
  const sample = new MicrophoneSample();
  const player = new ExamAudioPlayer(document.createElement("audio"));
  const saved = new Set(boot.saved);
  // Server already has bytes but the original bind acknowledgement failed:
  // bind that exact owned reference instead of uploading or rerecording it.
  if (!boot.expired && !boot.submitted) {
    for (const [question_version_id, recording_id] of Object.entries(
      boot.existing_recordings || {},
    )) {
      await call(
        "bind",
        { makeup_window_id: boot.window_id, recording_id },
        { method: "POST" },
      );
      saved.add(question_version_id);
    }
  }
  const valid = (entry, q) =>
    entry.ownerId === ownerId &&
    entry.attemptId === attemptId &&
    entry.questionId === q.version_id &&
    entry.question_version === q.version &&
    entry.blob?.size > 0;
  for (const row of await journal.load()) {
    const q = boot.questions.find((q) => q.id === row.questionId);
    if (
      q &&
      valid(row.entry, q) &&
      row.entry.makeupWindowId === boot.window_id &&
      !saved.has(q.version_id)
    )
      pending.set(q.version_id, row.entry);
  }
  // Keep original bytes/provenance; a separately stored recovery request is stable
  // across retries/reloads and cannot reuse another recording's reservation.
  for (const row of await original.load()) {
    const q = boot.questions.find((q) => q.id === row.questionId);
    if (
      !q ||
      !valid(row.entry, q) ||
      saved.has(q.version_id) ||
      pending.has(q.version_id)
    )
      continue;
    const entry = {
      ...row.entry,
      requestId: crypto.randomUUID(),
      originalRequestId: row.entry.requestId,
      makeupWindowId: boot.window_id,
    };
    delete entry.saving;
    await journal.put(q.id, entry);
    pending.set(q.version_id, entry);
  }
  const message = (text) => {
    if (alive) root.querySelector("[data-message]").textContent = text;
  };
  function render() {
    root.innerHTML = `<section class="hskk-card"><h1>${esc(boot.exam_code || new URL(location.href).searchParams.get("exam") || "HSKK")} · Nộp bù</h1><p>Chỉ bổ sung câu chưa được nhận. Các câu đã lưu được giữ nguyên. Bài sẽ ghi nhận thời điểm nộp bù thực tế.</p><p data-summary></p><p data-message role="status"></p><meter min="0" max="1" value="0" aria-label="Mức âm thanh microphone"></meter><div data-mic></div><div data-questions></div><button class="st-button" data-submit>Nộp bài sau khi bổ sung</button></section>`;
    const mic = document.createElement("button");
    mic.className = "st-button";
    mic.textContent = "Kiểm tra microphone";
    mic.onclick = async () => {
      mic.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        recorder = new ExamRecorder(stream);
        context = new AudioContext();
        await context.resume();
        analyser = context.createAnalyser();
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let previous = performance.now();
        const monitor = () => {
          if (!alive || context.state === "closed") return;
          analyser.getByteTimeDomainData(data);
          const level = microphoneLevel(data),
            at = performance.now();
          if (sampleActive && context.state === "running")
            sample.observe(level.rms, at - previous);
          previous = at;
          const meter = root.querySelector("meter");
          if (meter) meter.value = level.value;
          meterFrame = requestAnimationFrame(monitor);
        };
        monitor();
        sample.reset();
        sampleActive = true;
        recorder.start();
        message("Nói thử một câu trong 3 giây để kiểm tra microphone.");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const blob = await recorder.stop();
        sampleActive = false;
        micReady = sample.ready({
          bytes: blob?.size || 0,
          active: stream.getAudioTracks().some((t) => t.readyState === "live"),
          running: context.state === "running",
        });
        if (!micReady) {
          await recorder.dispose();
          await context.close();
          message("Chưa nhận đủ tiếng nói. Kiểm tra microphone rồi thử lại.");
        } else {
          mic.textContent = "Microphone đã sẵn sàng";
          message("Chọn câu còn thiếu để ghi bổ sung.");
        }
      } catch {
        sampleActive = false;
        message(
          "Chưa mở được microphone. Kiểm tra quyền thiết bị rồi thử lại.",
        );
      } finally {
        if (alive) {
          mic.disabled = micReady;
          update();
        }
      }
    };
    root.querySelector("[data-mic]").append(mic);
    for (const q of boot.questions) {
      const row = document.createElement("article");
      row.innerHTML = `<h2>Câu ${q.number}</h2><p>${esc(q.prompt || "Nghe câu hỏi rồi trả lời.")}</p><p data-state="${q.version_id}"></p>`;
      const button = document.createElement("button");
      button.className = "st-button";
      button.textContent = "Ghi bổ sung";
      button.dataset.question = q.version_id;
      button.onclick = async () => {
        if (
          !micReady ||
          active ||
          pending.has(q.version_id) ||
          saved.has(q.version_id) ||
          boot.timing[q.version_id]
        )
          return;
        button.disabled = true;
        try {
          const t = await call(
            "start",
            {
              makeup_window_id: boot.window_id,
              question_version_id: q.version_id,
            },
            { method: "POST" },
          );
          const anchor = performance.now(),
            clock = () => t.server_time + performance.now() - anchor;
          boot.timing[q.version_id] = t;
          active = {
            q,
            t,
            clock,
            started: false,
            sealing: false,
            audioReady: q.prompt_mode === "text",
            audioFailed: false,
            listening: false,
          };
          update();
          if (q.prompt_mode === "image") {
            const blob = await call(
              "picture",
              {
                makeup_window_id: boot.window_id,
                question_version_id: q.version_id,
              },
              { binary: true },
            );
            if (!alive) return;
            const url = URL.createObjectURL(blob);
            pictureUrls.add(url);
            const image = document.createElement("img");
            image.src = url;
            image.alt = "Tranh câu " + q.number;
            image.className = "cbt-source-picture";
            row.querySelector("[data-state]").before(image);
            if (active?.q.version_id === q.version_id) active.audioReady = true;
          }
          if (q.prompt_mode === "audio") {
            await player.preparePrivatePrompt(
              () =>
                call(
                  "prompt",
                  {
                    makeup_window_id: boot.window_id,
                    question_version_id: q.version_id,
                  },
                  { binary: true },
                ),
              q.version_id,
            );
            if (!alive) return;
            if (active?.q.version_id === q.version_id) active.audioReady = true;
          }
          message("Chuẩn bị trả lời câu " + q.number + ".");
        } catch {
          player.stop();
          if (active) active.audioFailed = true;
          message(
            "Chưa phát được câu hỏi hoặc chưa bắt đầu được ghi. Không làm lại các câu đã nhận; báo Admin nếu lượt ghi này bị lỗi.",
          );
        }
      };
      row.append(button);
      root.querySelector("[data-questions]").append(row);
    }
    root.querySelector("[data-submit]").onclick = async (event) => {
      if (submitting) return;
      submitting = true;
      event.currentTarget.disabled = true;
      try {
        await Promise.all([...pending].map(([id, entry]) => save(id, entry)));
        boot = await call("load");
        boot.saved.forEach((id) => saved.add(id));
        if (saved.size !== boot.questions.length)
          throw Error("RECORDING_REQUIRED");
        const result = await call(
          "submit",
          { makeup_window_id: boot.window_id },
          { method: "POST" },
        );
        if (result.submitted) {
          boot.submitted = true;
          message(
            "Đã nhận đủ bản ghi và nộp bài sau khi bổ sung. Kết quả chấm chưa công bố.",
          );
        }
      } catch {
        message(
          "Chưa nộp được. Các bản ghi còn lưu được giữ lại để gửi lại; kiểm tra kết nối và hạn nộp bù.",
        );
      } finally {
        submitting = false;
        if (alive) update();
      }
    };
  }
  function update() {
    if (!alive) return;
    const expired = now() >= boot.expires_at;
    root.querySelector("[data-summary]").textContent =
      `Đã nhận ${saved.size}/${boot.questions.length} câu nộp bù · ${expired ? "Đã hết hạn" : "Hạn: " + new Date(boot.expires_at).toLocaleString("vi-VN")}`;
    for (const q of boot.questions) {
      const state = root.querySelector(`[data-state="${q.version_id}"]`);
      const seconds =
        active?.q.version_id === q.version_id
          ? Math.max(
              0,
              Math.ceil((active.t.record_end - active.clock()) / 1000),
            )
          : null;
      state.textContent = saved.has(q.version_id)
        ? "Đã nhận"
        : pending.has(q.version_id)
          ? "Đang lưu / chờ gửi lại bản ghi"
          : seconds !== null
            ? `Còn ${seconds} giây`
            : boot.timing[q.version_id]
              ? "Lượt ghi đã bắt đầu; cần bản ghi đã lưu hoặc hỗ trợ của Admin."
              : "Chưa có bản ghi — được ghi bổ sung";
      root.querySelector(`[data-question="${q.version_id}"]`).disabled =
        boot.submitted ||
        expired ||
        !micReady ||
        !!active ||
        saved.has(q.version_id) ||
        pending.has(q.version_id) ||
        !!boot.timing[q.version_id];
    }
    root.querySelector("[data-submit]").disabled =
      submitting ||
      boot.submitted ||
      expired ||
      !!active ||
      saved.size !== boot.questions.length;
  }
  function save(id, entry) {
    if (work.has(id)) return work.get(id);
    const q = boot.questions.find((q) => q.version_id === id);
    const task = (async () => {
      try {
        await journal.put(q.id, entry);
        const uploaded = await uploadRecording({
          ...entry,
          questionId: q.version_id,
          attemptId,
          ownerId,
          makeupWindowId: boot.window_id,
        });
        await call(
          "bind",
          {
            makeup_window_id: boot.window_id,
            recording_id: uploaded.recording_id,
          },
          { method: "POST" },
        );
        if (!alive) return;
        saved.add(id);
        pending.delete(id);
        retries.delete(id);
        await journal.remove(q.id);
        if (entry.originalRequestId) await original.remove(q.id);
      } catch {
        const failures = (retries.get(id)?.failures || 0) + 1;
        retries.set(id, {
          failures,
          at: now() + Math.min(30000, 2000 * 2 ** Math.min(failures - 1, 4)),
        });
        message(
          "Bản ghi được giữ lại; hệ thống sẽ gửi lại khi kết nối ổn định.",
        );
      } finally {
        work.delete(id);
        update();
      }
    })();
    work.set(id, task);
    return task;
  }
  render();
  update();
  timer = setInterval(() => {
    if (!alive) return;
    if (active && !active.sealing) {
      const at = active.clock();
      if (
        active.q.prompt_mode === "audio" &&
        !active.listening &&
        !active.audioFailed &&
        at >= active.t.record_start - active.q.prompt_audio.duration_ms
      ) {
        const current = active;
        current.listening = true;
        if (!current.audioReady) {
          current.audioFailed = true;
          message(
            "Audio chưa tải kịp. Câu này cần Admin xử lý; các câu đã nhận được giữ nguyên.",
          );
        } else
          void player
            .playPreparedPrompt(
              current.q.version_id,
              current.q.prompt_audio.duration_ms / 1000,
              () =>
                (current.clock() -
                  (current.t.record_start -
                    current.q.prompt_audio.duration_ms)) /
                1000,
            )
            .catch(() => {
              current.audioFailed = true;
              message("Audio bị lỗi. Báo Admin để mở lại đúng câu này.");
            });
      }
      if (
        !active.started &&
        !active.audioFailed &&
        at >= active.t.record_start &&
        at < active.t.record_end
      ) {
        if (active.q.prompt_mode === "image" && !active.audioReady) {
          active.audioFailed = true;
          message("Tranh chưa tải kịp. Báo Admin để mở lại đúng câu này.");
          return;
        }
        recorder.start();
        active.started = true;
        message("Đang ghi câu " + active.q.number + ".");
      }
      if (at >= active.t.record_end) {
        const finishing = active;
        active.sealing = true;
        void (async () => {
          try {
            const blob = finishing.started ? await recorder.stop() : null;
            if (!alive) return;
            if (!blob?.size) throw Error("RECORDING_EMPTY");
            const entry = {
              blob,
              requestId: crypto.randomUUID(),
              ownerId,
              attemptId,
              questionId: finishing.q.version_id,
              question_version: finishing.q.version,
              makeupWindowId: boot.window_id,
            };
            pending.set(finishing.q.version_id, entry);
            await journal.put(finishing.q.id, entry);
            void save(finishing.q.version_id, entry);
          } catch {
            message("Chưa giữ được bản ghi. Báo Admin để xử lý câu này.");
          } finally {
            active = null;
            update();
          }
        })();
      }
    }
    if (!boot.submitted && now() < boot.expires_at)
      for (const [id, entry] of pending)
        if (!work.has(id) && now() >= (retries.get(id)?.at || 0))
          void save(id, entry);
    update();
  }, 100);
  return async () => {
    alive = false;
    clearInterval(timer);
    cancelAnimationFrame(meterFrame);
    player.stop();
    for (const url of pictureUrls) URL.revokeObjectURL(url);
    await recorder?.dispose();
    await context?.close();
    original.close();
    journal.close();
  };
}
