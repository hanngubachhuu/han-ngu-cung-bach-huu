import { HSKKExamEngine } from "./hskk-exam-engine.mjs";
import { ExamAudioPlayer, ExamRecorder } from "./hskk-exam-media.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { microphoneLevel, MicrophoneSample } from "./hskk-microphone.mjs";
import { cbtShell, cbtIcon, listeningIllustration } from "./hskk-cbt-view.mjs";
import { cbtText, localizeCBT } from "./hskk-cbt-copy.mjs";
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
  let language = "vi",
    languageSelected = false,
    fontLarge = false;
  let analyser, microphoneSource, sampleUrl;
  let resourcesReleased = false;
  const notes = new Map();
  const trialAudio = document.createElement("audio");
  const t = (text) => cbtText(text, language);
  root.classList.add("hskk-cbt-root");
  if (!preview) document.body.classList.add("hskk-cbt-active");
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
  if (transport.production) {
    player.preparePrompt = (question) =>
      player.preparePrivatePrompt(
        () => transport.prompt(question.version_id),
        question.version_id,
      );
    player.playBufferedPrompt = (question, offset) =>
      player.playPreparedPrompt(
        question.version_id,
        question.prompt_audio.duration_ms / 1000,
        offset,
        engine.exam.timing.prompt_start_grace_ms / 1000,
      );
  }
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
  function releaseResources() {
    if (resourcesReleased) return;
    resourcesReleased = true;
    clearInterval(interval);
    cancelAnimationFrame(levelFrame);
    window.removeEventListener("online", reconnect);
    sampleActive = false;
    trialAudio.pause();
    trialAudio.removeAttribute("src");
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    sampleUrl = null;
    microphoneSource?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
    void engine.dispose().catch(() => {});
  }
  function button(label, callback, { primary = true, disabled = false } = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `st-button${primary ? " primary" : ""}`;
    b.textContent = t(label);
    b.disabled = disabled;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await callback();
      } catch (error) {
        message(
          error.message === "RUNTIME_UPDATE_REQUIRED"
            ? "Giao diện thi đã được cập nhật. Tải lại trang để kiểm tra thiết bị rồi bắt đầu; bài thi chưa tính giờ."
            : "Chưa hoàn tất. Kiểm tra thiết bị và kết nối rồi thử lại.",
        );
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    };
    root.querySelector("[data-actions]").append(b);
    return b;
  }
  function message(text) {
    const node = root.querySelector("[data-message]");
    if (node) node.textContent = t(text);
  }
  function monitorMicrophone() {
    if (!context || context.state === "closed") context = new AudioContext();
    microphoneSource?.disconnect();
    analyser = context.createAnalyser();
    microphoneSource = context.createMediaStreamSource(stream);
    microphoneSource.connect(analyser);
    cancelAnimationFrame(levelFrame);
    const data = new Uint8Array(analyser.fftSize);
    let previousFrame = performance.now();
    const level = () => {
      if (disposed || context.state === "closed") return;
      analyser.getByteTimeDomainData(data);
      const { rms, value } = microphoneLevel(data),
        now = performance.now();
      if (sampleActive && context.state === "running")
        microphoneSample.observe(rms, now - previousFrame);
      previousFrame = now;
      root.querySelectorAll("meter").forEach((meter) => {
        meter.value = context.state === "running" ? value : 0;
      });
      const signal = root.querySelector("[data-mic-signal]");
      if (signal)
        signal.textContent =
          rms >= 0.01 && context.state === "running"
            ? t("Đang nhận âm thanh")
            : t("Chưa nhận tiếng nói rõ");
      levelFrame = requestAnimationFrame(level);
    };
    level();
  }
  function notices(view) {
    if (view.audio_status === "ERROR") {
      const node = root.querySelector("[data-audio-message]");
      if (node)
        node.textContent = t(
          `Audio câu ${view.audio_error_question || ""} chưa phát đầy đủ. Lượt thi này cần được kiểm tra lại.`,
        );
    }
    if (view.upload_window_expired && view.saved < view.total)
      message(
        `Đã hết thời hạn tải bản ghi. Server đã lưu ${view.saved}/${view.total} câu; bài chưa được nộp. Giữ cửa sổ này để bảo toàn các bản ghi còn lại.`,
      );
    else if (view.recording_status === "ERROR")
      message(
        "Có bản ghi chưa lưu được. Bài vẫn giữ thời gian; bạn có thể thử lưu lại khi kết nối trở lại.",
      );
  }
  const status = {
    PROMPT_LOADING: "Đang tải audio câu hỏi…",
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
    if (["SUBMITTED", "GRADED", "PUBLISHED"].includes(view.state)) {
      if (resourcesReleased && root.dataset.state === view.state) return;
      releaseResources();
      root.dataset.state = view.state;
      root.dataset.question = "";
      root.classList.remove("hskk-cbt-root", "cbt-font-large");
      if (!preview) document.body.classList.remove("hskk-cbt-active");
      root.innerHTML = `<section class="hskk-card" data-submission-complete aria-labelledby="hskkSubmissionTitle"><p class="st-eyebrow">${esc(exam.exam_code)}</p><h1 id="hskkSubmissionTitle" tabindex="-1">${t("Đã nộp bài")}</h1><p>${t(`Đã lưu ${view.saved}/${view.total} câu.`)}</p><p>${t("Microphone đã tắt. Bạn có thể rời trang.")}</p><p data-message role="status" aria-live="polite">${t("Đang kiểm tra kết quả…")}</p><div data-result></div><div class="account-actions"><a class="st-button primary" href="tai-khoan.html#officialAssignments">${t("Về bài nộp của tôi")}</a><a class="st-button" href="hskk.html">${t("Về danh sách đề HSKK")}</a></div></section>`;
      root.querySelector("h1").focus({ preventScroll: true });
      void engine
        .result()
        .then((result) => {
          if (disposed) return;
          message(result.message);
          if (result.status === "published")
            root.querySelector("[data-result]").innerHTML =
              `<p>Điểm: ${esc(result.score)}</p>${Array.isArray(result.feedback) ? result.feedback.map((q, i) => `<p>Câu ${i + 1}: ${esc(q.feedback)}</p>`).join("") : `<p>${esc(result.feedback)}</p>`}`;
        })
        .catch(() => {
          if (!disposed)
            message(
              "Bài đã nộp thành công. Bạn có thể xem kết quả sau trong Bài của bạn.",
            );
        });
      return;
    }
    const previousQuestion = root.dataset.question;
    if (
      root.dataset.state === view.state &&
      root.dataset.question === (view.question?.id || "")
    ) {
      root.querySelector("[data-timer]").textContent = formatExamTime(
        view.remaining,
      );
      root.querySelector("[data-saved]").textContent = t(
        `${view.saved} / ${view.total} câu đã lưu`,
      );
      const progress = root.querySelector("[data-phase-progress]");
      if (progress && view.phase_seconds)
        progress.value = Math.min(
          100,
          (100 * view.remaining) / view.phase_seconds,
        );
      notices(view);
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
      PROMPT_LOADING: "Chuẩn bị audio",
      RECORDING: "Thời gian trả lời",
      PREPARATION: "Thời gian chuẩn bị",
    };
    root.innerHTML = cbtShell({
      exam,
      candidate,
      view,
      preparing,
      step,
      steps,
      time: formatExamTime(view.remaining),
      language,
    });
    queueMicrotask(() => !disposed && localizeCBT(root, language));
    root.classList.toggle("cbt-font-large", fontLarge);
    root
      .querySelector("[data-timer]")
      .setAttribute(
        "aria-label",
        timerLabels[view.state] || "Thời gian còn lại",
      );
    root.querySelectorAll("[data-help]").forEach((node) => {
      node.onclick = () => {
        const help = root.querySelector("[data-help-content]");
        help.hidden = false;
        help.textContent = t(
          node.dataset.help === "rules"
            ? "Bài thi chạy theo thứ tự và giờ server. Mỗi câu ghi một lần; không quay lại câu đã qua. Giữ tab mở đến khi bài được nộp."
            : "Đeo tai nghe. Nói khi trạng thái chuyển sang Đang ghi âm. Bản ghi tự lưu; ô nháp chỉ để chuẩn bị, không được chấm.",
        );
      };
    });
    root.querySelector("[data-answer-card]").onclick = () => {
      const help = root.querySelector("[data-help-content]");
      help.hidden = false;
      const current = engine.view();
      help.textContent = `${t(`Đã lưu ${current.saved}/${current.total} câu.`)} ${exam.questions.map((q) => `${q.number}: ${t(current.recordings?.[q.id] ? "đã lưu" : "chưa lưu")}`).join(" · ")}`;
    };
    root.querySelector("[data-font]").onclick = () => {
      fontLarge = !fontLarge;
      root.classList.toggle("cbt-font-large", fontLarge);
    };
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
      if (view.question) {
        let content =
          view.question.prompt_mode === "audio"
            ? listeningIllustration
            : `<p class="hskk-question" lang="zh">${esc(view.question.prompt)}</p>${view.question.pinyin ? `<p class="cbt-pinyin">${esc(view.question.pinyin)}</p>` : ""}`;
        if (
          view.question.prompt_mode === "image" &&
          view.question.image_blob_url?.startsWith("blob:")
        )
          content += `<img class="cbt-source-picture" src="${esc(view.question.image_blob_url)}" alt="Tranh câu ${view.question.number}">`;
        body.innerHTML += `<div class="cbt-question-box"><span class="cbt-question-number">${view.question.number}</span>${content}</div>`;
        if (view.question.prompt_mode !== "audio") {
          const key = view.question.id;
          body.insertAdjacentHTML(
            "beforeend",
            '<label class="cbt-notes">草稿区（不计分）<textarea data-notes aria-label="Nháp chuẩn bị, không chấm điểm"></textarea></label>',
          );
          const area = body.querySelector("[data-notes]");
          area.value = notes.get(key) || "";
          area.oninput = () => notes.set(key, area.value);
        }
      }
      if (view.state === "PREPARATION") {
        const scope = view.section.preparation_section_ids || [view.section.id];
        body.innerHTML += exam.questions
          .filter(
            (q) => scope.includes(q.section_id) && q.prompt_mode !== "audio",
          )
          .map(
            (q) =>
              `<div class="cbt-preparation-question"><p lang="zh" class="hskk-question">${q.number}. ${esc(q.prompt)}</p>${q.pinyin ? `<p class="cbt-pinyin">${esc(q.pinyin)}</p>` : ""}${q.image_blob_url?.startsWith("blob:") ? `<img class="cbt-source-picture" src="${esc(q.image_blob_url)}" alt="Tranh câu ${q.number}">` : ""}<label class="cbt-notes">草稿区（不计分）<textarea data-preparation-notes="${esc(q.id)}" aria-label="Nháp chuẩn bị, không chấm điểm"></textarea></label></div>`,
          )
          .join("");
        body.querySelectorAll("[data-preparation-notes]").forEach((area) => {
          const key = area.dataset.preparationNotes;
          area.value = notes.get(key) || "";
          area.oninput = () => notes.set(key, area.value);
        });
      }
      if (view.state === "COMPLETED") {
        if (transport.production)
          message(
            "Đang lưu các bản ghi và nộp bài. Giữ trang mở cho đến khi hiện Đã nộp bài.",
          );
        button(
          preview ? "Kết thúc xem trước" : "Nộp bài thi thử",
          async () => {
            if (preview) {
              message(
                "Đã kết thúc xem trước. Không tạo bài nộp hoặc kết quả chấm.",
              );
            } else {
              try {
                await engine.submit();
              } catch (error) {
                message(
                  error.message === "UPLOAD_WINDOW_EXPIRED" ||
                    engine.view().upload_window_expired
                    ? `Đã hết thời hạn tải bản ghi. Đã lưu ${engine.view().saved}/${view.total} câu; bài chưa được nộp.`
                    : `Chưa nộp được bài. Đã lưu ${engine.view().saved}/${view.total} câu; giữ trang mở và thử lưu lại khi kết nối ổn định.`,
                );
              }
            }
          },
          { disabled: view.upload_window_expired && !preview },
        );
        notices(view);
      }
      return;
    }
    if (view.state === "CREATED") {
      if (!languageSelected) {
        body.innerHTML = `<div class="cbt-language"><span lang="zh" class="cbt-language-mark">汉</span><h2 lang="zh">欢迎参加汉语网络考试</h2><p>Chọn ngôn ngữ giao diện · 请选择语言</p></div>`;
        for (const [value, label] of [
          ["vi", "Tiếng Việt"],
          ["zh", "中文"],
        ])
          button(label, () => {
            language = value;
            languageSelected = true;
            delete root.dataset.state;
            render(view);
          });
        return;
      }
      body.innerHTML = `<h2>Xác nhận thông tin</h2><p>${esc(candidate.name)}</p><p>${esc(candidate.email)}</p>`;
      button("Xác nhận thông tin", () => engine.advance());
    }
    if (view.state === "CANDIDATE_VERIFIED") {
      body.innerHTML = `<h2>Kiểm tra thiết bị</h2><div class="cbt-device-art">${cbtIcon("headphones")}</div><p>Dùng tai nghe để âm thanh đề không lọt vào bản ghi. Mở âm lượng vừa đủ nghe.</p><label><input type='checkbox' data-heard> Tôi nghe rõ âm thanh</label>`;
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
        monitorMicrophone();
        await context.resume();
        await engine.advance();
      });
    }
    if (view.state === "MIC_CHECK") {
      body.innerHTML =
        "<h2>Thử microphone</h2><p>Chọn microphone, bấm ghi thử rồi nói một câu trong vài giây.</p><label>Microphone<select data-microphone></select></label><div class='hskk-mic-level'><span data-mic-signal>Chưa nhận tín hiệu</span><meter min='0' max='1' value='0' aria-label='Mức âm thanh microphone'></meter><p class='hskk-muted'>Thanh mức âm sẽ thay đổi khi bạn nói.</p></div>";
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
          trialAudio.pause();
          if (sampleUrl) URL.revokeObjectURL(sampleUrl);
          sampleUrl = blob?.size ? URL.createObjectURL(blob) : null;
          hearTrial.disabled = !sampleUrl;
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
          start.textContent = t("Ghi thử lại");
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
      const hearTrial = button(
        "Nghe bản ghi thử",
        async () => {
          if (!sampleUrl) return;
          trialAudio.src = sampleUrl;
          await trialAudio.play();
        },
        { primary: false, disabled: true },
      );
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
          trialAudio.pause();
          trialAudio.removeAttribute("src");
          if (sampleUrl) URL.revokeObjectURL(sampleUrl);
          sampleUrl = null;
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
          monitorMicrophone();
          hearTrial.disabled = true;
          trialAudio.pause();
          if (sampleUrl) URL.revokeObjectURL(sampleUrl);
          sampleUrl = null;
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
            monitorMicrophone();
            await context.resume();
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
  if (!resourcesReleased)
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
    root.classList.remove("hskk-cbt-root", "cbt-font-large");
    if (!preview) document.body.classList.remove("hskk-cbt-active");
    releaseResources();
  };
}
