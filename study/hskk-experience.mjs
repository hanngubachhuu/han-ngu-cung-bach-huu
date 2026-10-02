import { HSKKExamEngine } from "./hskk-exam-engine.mjs";
import { ExamAudioPlayer, ExamRecorder } from "./hskk-exam-media.mjs";
import { escapeHtml as esc } from "./core.mjs";
export function formatExamTime(seconds) {
  return seconds === null
    ? "—"
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
// Same experience renderer for admin preview and future authorized student sessions.
export async function mountExamExperience(
  root,
  { exam, candidate, transport, journal, preview = false },
) {
  let stream,
    recorder,
    interval,
    ticking = false,
    disposed = false,
    micDone = false,
    lastQuestionNumber,
    levelFrame,
    context;
  const audioElement = document.createElement("audio");
  audioElement.preload = "metadata";
  const player = new ExamAudioPlayer(audioElement);
  if (transport.production)
    player.playPrompt = (question, offset) =>
      player.playPrivatePrompt(
        () => transport.prompt(question.version_id),
        question.prompt_audio.duration_ms / 1000,
        offset,
      );
  const engine = new HSKKExamEngine({
    exam,
    candidateId: candidate.id,
    transport,
    journal,
    audio: player,
    recorder: {
      start: () => recorder.start(),
      stop: () => recorder?.stop(),
      dispose: async () => recorder?.dispose(),
    },
    onChange: render,
  });
  function button(label, callback) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "st-button primary";
    b.textContent = label;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await callback();
      } catch {
        message("Chưa hoàn tất. Kiểm tra thiết bị và kết nối rồi thử lại.");
      } finally {
        b.disabled = false;
      }
    };
    root.querySelector("[data-actions]").append(b);
  }
  function message(text) {
    const node = root.querySelector("[data-message]");
    if (node) node.textContent = text;
  }
  const status = {
    COUNTDOWN: "Bài thi sẽ bắt đầu sau",
    LISTENING: "Đang nghe…",
    RECORDING: "● Đang ghi âm…",
    PREPARATION: "Thời gian chuẩn bị",
    COMPLETED: "Bài thi thử đã hoàn thành.",
    SUBMITTED: transport.production ? "Đã nộp bài" : "Bài thi thử đã được nộp.",
    GRADED: "Chưa công bố kết quả.",
    PUBLISHED: "Đã công bố kết quả.",
  };
  function render(view) {
    if (disposed) return;
    const previousQuestion = root.dataset.question;
    if (
      root.dataset.state === view.state &&
      root.dataset.question === (view.question?.id || "")
    ) {
      root.querySelector("[data-timer]").textContent = formatExamTime(
        view.remaining,
      );
      root.querySelector("[data-saved]").textContent =
        `${view.saved} / ${view.total} câu đã lưu`;
      if (view.recording_status === "ERROR")
        message(
          "Có bản ghi chưa lưu được. Bài vẫn giữ thời gian; bạn có thể thử lưu lại khi kết nối trở lại.",
        );
      return;
    }
    root.dataset.state = view.state;
    root.dataset.question = view.question?.id || "";
    root.innerHTML = `<article class="hskk-card hskk-session"><div class="hskk-progress"><p data-question-title tabindex="-1">${view.question ? `Câu ${view.question.number} / ${view.total}` : esc(exam.title)}</p><output class="hskk-timer" data-timer aria-label="Thời gian còn lại">${formatExamTime(view.remaining)}</output></div><div data-body></div><div data-actions class="account-actions"></div><p data-saved class="hskk-muted">${view.saved} / ${view.total} câu đã lưu</p><p data-message role="status"></p></article>`;
    const body = root.querySelector("[data-body]");
    if (view.question && previousQuestion !== view.question.id) {
      root
        .querySelector("[data-question-title]")
        .focus({ preventScroll: true });
      message(
        lastQuestionNumber
          ? `Đã hoàn thành câu ${lastQuestionNumber}. Chuyển sang câu ${view.question.number}.`
          : `Câu ${view.question.number}.`,
      );
      lastQuestionNumber = view.question.number;
    }
    if (status[view.state]) {
      body.innerHTML = `${view.section ? `<h2>${esc(view.section.title_vi)}</h2>` : ""}<p class="hskk-status">${status[view.state]}</p>`;
      if (view.question?.prompt_mode !== "audio" && view.question)
        body.innerHTML += `<p class="hskk-question" lang="zh">${esc(view.question.prompt)}</p>${view.question.pinyin ? `<p>${esc(view.question.pinyin)}</p>` : ""}`;
      if (view.state === "PREPARATION")
        body.innerHTML += exam.questions
          .filter(
            (q) =>
              q.section_id === view.section.id && q.prompt_mode !== "audio",
          )
          .map(
            (q) =>
              `<p lang="zh" class="hskk-question">${q.number}. ${esc(q.prompt)}</p>`,
          )
          .join("");
      if (view.state === "COMPLETED") {
        if (transport.production)
          message(
            "Đang lưu các bản ghi và nộp bài. Giữ trang mở cho đến khi hiện Đã nộp bài.",
          );
        button(preview ? "Kết thúc xem trước" : "Nộp bài thi thử", async () => {
          if (preview) {
            message(
              "Đã kết thúc xem trước. Không tạo bài nộp hoặc kết quả chấm.",
            );
          } else await engine.submit();
        });
      }
      if (["SUBMITTED", "GRADED", "PUBLISHED"].includes(view.state))
        void engine.result().then((result) => {
          message(result.message);
          if (result.status === "published")
            body.innerHTML += `<p>Điểm: ${esc(result.score)}</p>${Array.isArray(result.feedback) ? result.feedback.map((q, i) => `<p>Câu ${i + 1}: ${esc(q.feedback)}</p>`).join("") : `<p>${esc(result.feedback)}</p>`}`;
        });
      return;
    }
    if (view.state === "CREATED") {
      body.innerHTML = `<h2>Xác nhận thông tin</h2><p>${esc(candidate.name)}</p><p>${esc(candidate.email)}</p>`;
      button("Xác nhận thông tin", () => engine.advance());
    }
    if (view.state === "CANDIDATE_VERIFIED") {
      body.innerHTML =
        "<h2>Kiểm tra thiết bị</h2><p>Dùng tai nghe để âm thanh đề không lọt vào bản ghi. Mở âm lượng vừa đủ nghe.</p><label><input type='checkbox' data-heard> Tôi nghe rõ âm thanh</label>";
      button("Phát âm kiểm tra tai nghe", async () => {
        const toneContext = new AudioContext();
        try {
          await toneContext.resume();
          const oscillator = toneContext.createOscillator();
          const gain = toneContext.createGain();
          oscillator.frequency.value = 440;
          gain.gain.setValueAtTime(0, toneContext.currentTime);
          gain.gain.linearRampToValueAtTime(
            0.1,
            toneContext.currentTime + 0.05,
          );
          gain.gain.linearRampToValueAtTime(0, toneContext.currentTime + 0.6);
          oscillator.connect(gain).connect(toneContext.destination);
          const ended = new Promise((resolve) => {
            oscillator.onended = resolve;
          });
          oscillator.start();
          oscillator.stop(toneContext.currentTime + 0.65);
          await ended;
        } finally {
          await toneContext.close();
        }
      });
      button("Tiếp tục", async () => {
        if (!body.querySelector("[data-heard]").checked)
          return message("Hãy xác nhận bạn nghe rõ trước khi tiếp tục.");
        await engine.advance();
      });
    }
    if (view.state === "DEVICE_CHECK") {
      body.innerHTML =
        "<h2>Kiểm tra microphone</h2><p>Cho phép microphone để thử ghi âm trước khi thi.</p>";
      button("Cho phép microphone", async () => {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new ExamRecorder(stream);
        await engine.advance();
      });
    }
    if (view.state === "MIC_CHECK") {
      body.innerHTML =
        "<h2>Thử microphone</h2><p>Nói thử một câu và kiểm tra mức âm thanh.</p><meter min='0' max='1' value='0' aria-label='Mức âm thanh microphone'></meter>";
      context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const level = () => {
        if (disposed || root.dataset.state !== "MIC_CHECK") {
          context.close();
          return;
        }
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(
          data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) /
            data.length,
        );
        body.querySelector("meter").value = Math.min(1, rms * 4);
        levelFrame = requestAnimationFrame(level);
      };
      level();
      button("Bắt đầu ghi thử", async () => {
        micDone = false;
        recorder.start();
        message("Đang ghi âm thử…");
      });
      button("Dừng ghi thử", async () => {
        const blob = await recorder.stop();
        micDone = Boolean(blob?.size);
        message(
          micDone
            ? "Microphone đã tạo dữ liệu âm thanh."
            : "Chưa ghi được âm thanh; kiểm tra microphone.",
        );
      });
      button("Microphone hoạt động — Tiếp tục", async () => {
        if (!micDone)
          return message("Hoàn tất kiểm tra microphone trước khi tiếp tục.");
        await engine.advance();
      });
    }
    if (view.state === "READY") {
      body.innerHTML =
        "<h2>Xác nhận sẵn sàng</h2><p>Audio phát theo thứ tự, ghi âm tự bắt đầu và tự dừng khi hết giờ. Mỗi câu chỉ được ghi một lần và tự chuyển khi hết thời gian.</p>";
      button("Tôi đã sẵn sàng", () => engine.advance());
    }
    if (view.state === "STRUCTURE") {
      body.innerHTML = `<h2>Cấu trúc đề</h2><p>${exam.questions.length} câu · ${exam.sections.length} phần</p><ol>${exam.sections.map((s) => `<li>${esc(s.title_vi)} · ${exam.questions.filter((q) => q.section_id === s.id).length} câu${s.preparation_seconds ? ` · ${formatExamTime(s.preparation_seconds)} chuẩn bị` : ""}</li>`).join("")}</ol>`;
      button("Bắt đầu", () => engine.advance());
    }
  }
  const reconnect = () =>
    engine
      .recover()
      .then(() => engine.retrySaves())
      .catch(() =>
        message(
          "Chưa khôi phục được bài. Kiểm tra kết nối; thời gian thi không được đặt lại.",
        ),
      );
  window.addEventListener("online", reconnect);
  // Recover a live timeline without creating another attempt or resetting time.
  if (transport.production) {
    const recovered = await transport.loadSession();
    transport.loadSession = async () => transport.refreshSession();
    if (
      recovered.server_started_at &&
      !["SUBMITTED", "GRADED", "PUBLISHED"].includes(recovered.state)
    ) {
      root.innerHTML =
        '<p>Đang khôi phục bài thi. Thời gian vẫn tiếp tục.</p><button class="st-button" data-resume>Cho phép microphone và khôi phục</button>';
      await new Promise((resolve) => {
        root.querySelector("[data-resume]").onclick = async () => {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recorder = new ExamRecorder(stream);
            resolve();
          } catch {
            root.querySelector("p").textContent =
              "Cần quyền microphone để khôi phục ghi âm. Thời gian thi vẫn tiếp tục.";
          }
        };
      });
    }
    transport.loadSession = async () => recovered;
    await engine.recover();
    transport.loadSession = async () => transport.refreshSession();
  } else await engine.recover();
  interval = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await engine.tick();
    } catch {
      message(
        "Ghi âm bị gián đoạn. Kiểm tra microphone; thời gian bài vẫn tiếp tục.",
      );
    } finally {
      ticking = false;
    }
  }, 100);
  return async () => {
    disposed = true;
    clearInterval(interval);
    cancelAnimationFrame(levelFrame);
    window.removeEventListener("online", reconnect);
    await engine.dispose();
    stream?.getTracks().forEach((t) => t.stop());
    if (context?.state !== "closed") await context?.close();
  };
}
