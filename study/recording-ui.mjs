import { uploadRecording, downloadRecording } from "./recording-service.mjs";
const messages = {
  NotAllowedError: "Chưa được cấp quyền micro. Cho phép micro rồi thử lại.",
  NotFoundError: "Không tìm thấy micro.",
  AUDIO_INVALID_SIZE: "Bản ghi quá 8 MiB hoặc không có âm thanh. Hãy ghi lại.",
  AUDIO_PROCESSING:
    "Bản ghi đang được chuẩn bị để nghe lại. Vui lòng quay lại sau ít phút.",
  AUDIO_EXPIRED: "Bản ghi đã hết hạn lưu. Bài nộp và nhận xét vẫn được giữ.",
  SUBMISSION_LOCKED: "Bài đã nộp hoặc hết giờ; không thể thay bản ghi.",
  ACCOUNT_CHANGED: "Tài khoản đã thay đổi. Mở lại bài bằng đúng tài khoản.",
};
const explain = (e) =>
  messages[e.name] ||
  messages[e.message] ||
  "Chưa hoàn tất thao tác. Giữ trang mở và thử lại; bản ghi mới chưa được xác nhận lưu.";
export function mountRecorder(
  root,
  {
    attemptId,
    questionId,
    ownerId,
    answer,
    locked = false,
    onAnswer = async () => {},
    onState = () => {},
    autoSave = true,
    upload = uploadRecording,
    download = downloadRecording,
    media = globalThis.navigator?.mediaDevices,
    Recorder = globalThis.MediaRecorder,
  } = {},
) {
  let active = true,
    recorder,
    stream,
    blob,
    requestId,
    localUrl,
    remoteUrl,
    timer,
    seconds = 0,
    busy = false,
    recording = false,
    pending = false,
    generation = 0;
  root.innerHTML = `<div class="recorder" data-state="idle"><span class="recorder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></span><p data-audio-status role="status" aria-live="polite">${locked ? "Bản ghi của bài đã nộp" : answer?.recording_id ? "✓ Bản ghi đã lưu" : "Sẵn sàng ghi âm"}</p><span class="recorder-clock" data-audio-clock hidden>00:00</span><div class="account-actions">${locked ? "" : '<button type="button" class="st-button primary" data-record>Bắt đầu ghi âm</button><button type="button" class="st-button" data-stop hidden disabled>Dừng ghi âm</button><button type="button" class="st-button" data-upload hidden disabled>Thử lưu lại</button>'}<button type="button" class="st-button" data-replay hidden>Nghe lại</button><button type="button" class="st-button" data-play ${answer?.recording_id ? "" : "hidden disabled"}>Nghe bản đã lưu</button></div><audio controls preload="none" data-preview aria-label="Nghe lại bản ghi" class="assignment-audio" hidden></audio>${locked ? "" : '<small class="recorder-help">Tối đa 6 phút. Bản ghi được lưu tự động sau khi dừng.</small>'}</div>`;
  const status = root.querySelector("[data-audio-status]"),
    audio = root.querySelector("audio"),
    record = root.querySelector("[data-record]"),
    stop = root.querySelector("[data-stop]"),
    save = root.querySelector("[data-upload]"),
    play = root.querySelector("[data-play]"),
    replay = root.querySelector("[data-replay]"),
    clock = root.querySelector("[data-audio-clock]"),
    panel = root.querySelector(".recorder");
  const report = (text) => {
    if (active) status.textContent = text;
  };
  function controls() {
    if (!active) return;
    panel.dataset.state = recording
      ? "recording"
      : busy
        ? "saving"
        : pending
          ? "unsaved"
          : answer?.recording_id
            ? "saved"
            : "idle";
    clock.hidden = !recording;
    if (record) {
      record.disabled = busy || recording;
      record.hidden = recording;
      record.classList.toggle("primary", !blob && !answer?.recording_id);
    }
    if (stop) {
      stop.disabled = !recording;
      stop.hidden = !recording;
    }
    if (save) {
      save.disabled = busy || recording || !blob;
      save.hidden = !pending || recording;
    }
    replay.hidden = !blob || recording;
    replay.disabled = busy || recording;
    play.hidden = !answer?.recording_id || recording || (!!blob && !locked);
    onState({
      busy: recording || busy || pending,
      saved: !!answer?.recording_id && !pending,
      recording,
    });
    play.disabled = busy || recording || !answer?.recording_id;
  }
  function stopTracks() {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function releaseLocal() {
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = null;
  }
  if (record)
    record.onclick = async () => {
      if (busy || recording) return;
      if (!media?.getUserMedia || !Recorder) {
        report(
          "Trình duyệt chưa hỗ trợ ghi âm. Dùng Chrome, Edge hoặc Safari mới qua HTTPS.",
        );
        return;
      }
      busy = true;
      controls();
      const own = ++generation;
      try {
        const obtained = await media.getUserMedia({ audio: true });
        if (!active || own !== generation) {
          obtained.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = obtained;
        const mime = [
          "audio/webm;codecs=opus",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ].find((m) => Recorder.isTypeSupported(m));
        if (!mime) throw Error("AUDIO_UNSUPPORTED");
        recorder = new Recorder(stream, {
          mimeType: mime,
          audioBitsPerSecond: 64000,
        });
        const chunks = [];
        let total = 0,
          overflow = false;
        recorder.ondataavailable = (e) => {
          if (e.data.size) {
            total += e.data.size;
            if (total <= 8 * 1024 * 1024) chunks.push(e.data);
            else {
              overflow = true;
              if (recorder.state === "recording") recorder.stop();
            }
          }
        };
        recorder.onstop = () => {
          recording = false;
          stopTracks();
          if (!active || own !== generation) return;
          if (overflow || !total) {
            report(messages.AUDIO_INVALID_SIZE);
            controls();
            return;
          }
          releaseLocal();
          blob = new Blob(chunks, { type: mime });
          requestId = crypto.randomUUID();
          pending = true;
          localUrl = URL.createObjectURL(blob);
          audio.src = localUrl;
          audio.hidden = false;
          record.textContent = "Ghi lại";
          report("✓ Đã ghi âm. Bạn có thể nghe lại hoặc ghi lại.");
          controls();
          if (autoSave) void saveRecording();
        };
        recorder.onerror = () => {
          recording = false;
          stopTracks();
          report("Micro gặp lỗi. Hãy ghi lại.");
          controls();
        };
        recorder.start(1000);
        audio.pause();
        recording = true;
        seconds = 0;
        timer = setInterval(() => {
          seconds++;
          clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
          if (seconds >= 360 && recorder.state === "recording") recorder.stop();
        }, 1000);
        clock.textContent = "00:00";
        report("● Đang ghi âm");
      } catch (e) {
        stopTracks();
        report(explain(e));
      } finally {
        busy = false;
        controls();
      }
    };
  if (stop)
    stop.onclick = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
  async function saveRecording() {
    if (busy || !blob || recording) return;
    busy = true;
    controls();
    report("Đang lưu bản ghi…");
    try {
      const value = await upload({
        blob,
        requestId,
        attemptId,
        questionId,
        ownerId,
      });
      if (!active) return;
      await onAnswer(value);
      if (!active) return;
      answer = value;
      pending = false;
      save.hidden = true;
      record.textContent = "Ghi lại";
      report(
        "✓ Bản ghi đã lưu lúc " +
          new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    } catch (e) {
      report(explain(e));
    } finally {
      busy = false;
      controls();
    }
  }
  if (save) save.onclick = saveRecording;
  replay.onclick = async () => {
    if (!localUrl || busy || recording) return;
    audio.src = localUrl;
    audio.hidden = false;
    try {
      await audio.play();
    } catch {
      report("Bấm nút phát trên thanh âm thanh để nghe lại.");
    }
  };
  play.onclick = async () => {
    if (busy || !answer?.recording_id) return;
    busy = true;
    controls();
    report("Đang mở bản ghi…");
    try {
      const value = await download(answer.recording_id, ownerId);
      if (!active) return;
      if (remoteUrl) URL.revokeObjectURL(remoteUrl);
      remoteUrl = URL.createObjectURL(value.blob);
      audio.src = remoteUrl;
      audio.hidden = false;
      report(
        value.meta.expires_at
          ? "Bản ghi lưu đến " +
              new Date(value.meta.expires_at).toLocaleString("vi-VN") +
              "."
          : "Bản ghi đã sẵn sàng để nghe lại.",
      );
      await audio.play();
    } catch (e) {
      report(explain(e));
    } finally {
      busy = false;
      controls();
    }
  };
  const unload = (e) => {
    if (recording || busy || pending) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", unload);
  controls();
  return {
    get saved() {
      return !!answer?.recording_id && !pending;
    },
    get busy() {
      return recording || busy || pending;
    },
    dispose() {
      active = false;
      generation++;
      if (recorder?.state === "recording") recorder.stop();
      stopTracks();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      releaseLocal();
      if (remoteUrl) URL.revokeObjectURL(remoteUrl);
      window.removeEventListener("beforeunload", unload);
    },
  };
}
