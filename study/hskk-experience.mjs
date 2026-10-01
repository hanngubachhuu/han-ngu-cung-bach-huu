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
    testBlobUrl,
    interval,
    ticking = false,
    disposed = false,
    micDone = false,
    levelFrame,
    context;
  const audioElement = document.createElement("audio");
  audioElement.preload = "metadata";
  const player = new ExamAudioPlayer(audioElement);
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
    RECORDING: "Đang ghi âm",
    PREPARATION: "Thời gian chuẩn bị",
    COMPLETED: "Bài thi thử đã hoàn thành.",
    SUBMITTED: "Bài thi thử đã được nộp.",
    GRADED: "Chưa công bố kết quả.",
    PUBLISHED: "Đã công bố kết quả.",
  };
  function render(view) {
    if (disposed) return;
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
    root.innerHTML = `<article class="hskk-card hskk-session"><div class="hskk-progress"><p>${view.question ? `Câu ${view.question.number} / ${view.total}` : esc(exam.title)}</p><output class="hskk-timer" data-timer aria-label="Thời gian còn lại">${formatExamTime(view.remaining)}</output></div><div data-body></div><div data-actions class="account-actions"></div><p data-saved class="hskk-muted">${view.saved} / ${view.total} câu đã lưu</p><p data-message role="status"></p></article>`;
    const body = root.querySelector("[data-body]");
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
      if (view.state === "COMPLETED")
        button(preview ? "Kết thúc xem trước" : "Nộp bài thi thử", async () => {
          if (preview) {
            message(
              "Đã kết thúc xem trước. Không tạo bài nộp hoặc kết quả chấm.",
            );
          } else await engine.submit();
        });
      if (["SUBMITTED", "GRADED", "PUBLISHED"].includes(view.state))
        void engine.result().then((result) => {
          message(result.message);
          if (result.status === "published")
            body.innerHTML += `<p>Điểm: ${esc(result.score)}</p><p>${esc(result.feedback)}</p>`;
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
        "<h2>Thử microphone</h2><p>Hãy nói thử một câu, dừng ghi và nghe lại.</p><meter min='0' max='1' value='0' aria-label='Mức âm thanh microphone'></meter><div data-replay></div>";
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
      button("Dừng và nghe lại", async () => {
        const blob = await recorder.stop();
        if (!blob) return;
        if (testBlobUrl) URL.revokeObjectURL(testBlobUrl);
        testBlobUrl = URL.createObjectURL(blob);
        const a = document.createElement("audio");
        a.controls = true;
        a.src = testBlobUrl;
        a.onended = () => {
          micDone = true;
          message(
            "Đã nghe lại bản ghi. Hãy xác nhận âm thanh rõ trước khi tiếp tục.",
          );
        };
        body.querySelector("[data-replay]").replaceChildren(a);
      });
      button("Tôi nghe rõ bản ghi — Tiếp tục", async () => {
        if (!micDone)
          return message("Nghe hết bản ghi thử trước khi tiếp tục.");
        await engine.advance();
      });
    }
    if (view.state === "READY") {
      body.innerHTML =
        "<h2>Xác nhận sẵn sàng</h2><p>Audio phát theo thứ tự, ghi âm tự bắt đầu và tự dừng khi hết giờ. Không quay lại hoặc ghi lại câu đã kết thúc.</p>";
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
  await engine.recover();
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
    if (testBlobUrl) URL.revokeObjectURL(testBlobUrl);
  };
}
