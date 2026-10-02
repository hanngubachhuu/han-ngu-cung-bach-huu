import { HSKKExamEngine } from "./hskk-exam-engine.mjs";
import { ExamAudioPlayer, ExamRecorder } from "./hskk-exam-media.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { microphoneLevel, MicrophoneSample } from "./hskk-microphone.mjs";
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
  let sampleActive = false;
  const microphoneSample = new MicrophoneSample();
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
  function button(label, callback, { primary = true, disabled = false } = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `st-button${primary ? " primary" : ""}`;
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await callback();
      } catch {
        message("Chưa hoàn tất. Kiểm tra thiết bị và kết nối rồi thử lại.");
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    };
    root.querySelector("[data-actions]").append(b);
    return b;
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
    const steps = [
      ["CREATED", "Thông tin"],
      ["CANDIDATE_VERIFIED", "Thiết bị"],
      ["MIC_CHECK", "Microphone"],
      ["READY", "Sẵn sàng"],
      ["STRUCTURE", "Cấu trúc đề"],
    ];
    const step =
      view.state === "DEVICE_CHECK"
        ? 2
        : steps.findIndex(([state]) => state === view.state);
    const preparing = step >= 0;
    const timerLabels = {
      COUNTDOWN: "Bắt đầu sau",
      LISTENING: "Thời gian nghe",
      RECORDING: "Thời gian trả lời",
      PREPARATION: "Thời gian chuẩn bị",
    };
    root.innerHTML = `<article class="hskk-card hskk-session${preparing ? " hskk-preflight" : ""}"><header class="hskk-progress"><div><p class="st-eyebrow">${preparing ? "CHUẨN BỊ BÀI THI" : "THI THỬ HSKK"}</p><p data-question-title tabindex="-1">${view.question ? `Câu ${view.question.number} / ${view.total}` : esc(exam.title)}</p></div><div class="hskk-time-block" ${view.remaining === null ? "hidden" : ""}><span>${timerLabels[view.state] || "Thời gian còn lại"}</span><output class="hskk-timer" data-timer aria-label="Thời gian còn lại">${formatExamTime(view.remaining)}</output></div></header>${preparing ? `<nav class="hskk-preflight-nav" aria-label="Các bước chuẩn bị"><p>Bước ${step + 1} / ${steps.length}</p><ol>${steps.map(([, label], i) => `<li ${i === step ? 'aria-current="step"' : ""} class="${i < step ? "complete" : ""}"><span aria-hidden="true">${i < step ? "✓" : i + 1}</span><span>${label}</span></li>`).join("")}</ol><p class="hskk-muted">Hoàn tất kiểm tra trước khi đồng hồ thi bắt đầu.</p></nav>` : `<div class="hskk-exam-progress"><progress max="${view.total}" value="${view.question ? view.question.number - 1 : view.saved}" aria-label="Tiến trình bài thi"></progress><p data-saved class="hskk-muted">${view.saved} / ${view.total} câu đã lưu</p></div>`}<section class="hskk-session-content"><div data-body></div><div data-actions class="account-actions"></div>${preparing ? `<p data-saved hidden>${view.saved} / ${view.total} câu đã lưu</p>` : ""}<p data-message role="status" aria-live="polite"></p></section></article>`;
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
        "<h2>Thử microphone</h2><p>Chọn microphone, bấm ghi thử rồi nói một câu trong vài giây.</p><label>Microphone<select data-microphone></select></label><div class='hskk-mic-level'><span data-mic-signal>Chưa nhận tín hiệu</span><meter min='0' max='1' value='0' aria-label='Mức âm thanh microphone'></meter><p class='hskk-muted'>Thanh mức âm sẽ thay đổi khi bạn nói.</p></div>";
      context = new AudioContext();
      let analyser = context.createAnalyser();
      let microphoneSource = context.createMediaStreamSource(stream);
      microphoneSource.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let previousFrame = performance.now();
      const level = () => {
        if (disposed || root.dataset.state !== "MIC_CHECK") {
          context.close();
          return;
        }
        analyser.getByteTimeDomainData(data);
        const { rms, value } = microphoneLevel(data);
        const now = performance.now();
        if (sampleActive && context.state === "running")
          microphoneSample.observe(rms, now - previousFrame);
        previousFrame = now;
        body.querySelector("meter").value =
          context.state === "running" ? value : 0;
        body.querySelector("[data-mic-signal]").textContent =
          rms >= 0.01 && context.state === "running"
            ? "Đang nhận âm thanh"
            : "Chưa nhận tiếng nói rõ";
        levelFrame = requestAnimationFrame(level);
      };
      level();
      const select = body.querySelector("[data-microphone]");
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (disposed || !select.isConnected) return;
          for (const device of devices.filter((d) => d.kind === "audioinput")) {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label || "Microphone";
            select.append(option);
          }
          select.value =
            stream.getAudioTracks()[0]?.getSettings().deviceId || "default";
        })
        .catch(() =>
          message("Kiểm tra microphone đang được chọn trong trình duyệt."),
        );
      const start = button("Bắt đầu ghi thử", async () => {
        micDone = false;
        microphoneSample.reset();
        await context.resume();
        if (context.state !== "running") throw Error("MICROPHONE_UNAVAILABLE");
        recorder.start();
        sampleActive = true;
        select.disabled = true;
        start.hidden = true;
        stop.hidden = false;
        continueButton.disabled = true;
        message("Đang ghi âm thử…");
      });
      const stop = button(
        "Dừng ghi thử",
        async () => {
          const blob = await recorder.stop();
          sampleActive = false;
          const track = stream.getAudioTracks()[0];
          micDone = microphoneSample.ready({
            bytes: blob?.size || 0,
            active:
              track?.readyState === "live" && track.enabled && !track.muted,
            running: context.state === "running",
          });
          select.disabled = false;
          start.hidden = false;
          start.textContent = "Ghi thử lại";
          stop.hidden = true;
          continueButton.disabled = !micDone;
          message(
            micDone
              ? "Đã nhận tín hiệu microphone. Bạn có thể tiếp tục."
              : "Chưa nhận đủ tiếng nói. Chọn đúng microphone, kiểm tra âm lượng đầu vào rồi ghi thử lại vài giây.",
          );
        },
        { primary: false },
      );
      stop.hidden = true;
      const continueButton = button(
        "Microphone hoạt động — Tiếp tục",
        async () => {
          const track = stream.getAudioTracks()[0];
          if (
            !micDone ||
            track?.readyState !== "live" ||
            !track.enabled ||
            track.muted
          )
            return message("Hoàn tất kiểm tra microphone trước khi tiếp tục.");
          await engine.advance();
        },
        { disabled: true },
      );
      select.onchange = async () => {
        select.disabled = true;
        continueButton.disabled = true;
        micDone = false;
        try {
          const next = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: select.value },
            },
          });
          if (disposed || !select.isConnected) {
            next.getTracks().forEach((track) => track.stop());
            return;
          }
          await recorder.dispose();
          stream = next;
          recorder = new ExamRecorder(stream);
          microphoneSource.disconnect();
          analyser.disconnect();
          analyser = context.createAnalyser();
          microphoneSource = context.createMediaStreamSource(stream);
          microphoneSource.connect(analyser);
          microphoneSample.reset();
          message("Đã đổi microphone. Ghi thử một câu để kiểm tra.");
        } catch {
          message(
            "Chưa mở được microphone này. Kiểm tra thiết bị và quyền truy cập.",
          );
        } finally {
          select.disabled = false;
        }
      };
    }
    if (view.state === "READY") {
      body.innerHTML =
        "<h2>Xác nhận sẵn sàng</h2><p>Audio phát theo thứ tự, ghi âm tự bắt đầu và tự dừng khi hết giờ. Mỗi câu chỉ được ghi một lần và tự chuyển khi hết thời gian.</p>";
      button("Tôi đã sẵn sàng", () => engine.advance());
    }
    if (view.state === "STRUCTURE") {
      body.innerHTML = `<h2>Cấu trúc đề</h2><p>${exam.questions.length} câu · ${exam.sections.length} phần</p><ol class="hskk-structure">${exam.sections
        .map((s, i) => {
          const questions = exam.questions.filter((q) => q.section_id === s.id);
          return `<li><span class="hskk-muted">PHẦN ${i + 1}</span><h3>${esc(s.title_vi)}</h3><p>Câu ${questions[0].number}–${questions.at(-1).number} · ${questions.length} câu</p><p>${questions[0].response_seconds} giây trả lời mỗi câu${s.preparation_seconds ? ` · ${formatExamTime(s.preparation_seconds)} chuẩn bị` : ""}</p></li>`;
        })
        .join(
          "",
        )}</ol><p class="hskk-muted">Khi bắt đầu, bài thi chạy theo thứ tự và tự chuyển câu.</p>`;
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
      !["COMPLETED", "SUBMITTED", "GRADED", "PUBLISHED"].includes(
        recovered.state,
      )
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
