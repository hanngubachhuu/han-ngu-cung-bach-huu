import { uploadRecording, downloadRecording } from "./recording-service.mjs";
const messages = {
  NotAllowedError: "Chưa được cấp quyền micro. Cho phép micro rồi thử lại.",
  NotFoundError: "Không tìm thấy micro.",
  AUDIO_INVALID_SIZE: "Bản ghi quá 8 MiB hoặc không có âm thanh. Hãy ghi lại.",
  AUDIO_PROCESSING: "Bản ghi đang được chuyển MP3. Quay lại sau ít phút.",
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
  root.innerHTML = `<p data-audio-status role="status">${locked ? "Bản ghi thuộc bài đã nộp." : "Tối đa 6 phút/câu. Nghe thử rồi lưu bản ghi trước khi nộp bài."}</p><div class="account-actions">${locked ? "" : '<button type="button" class="st-button" data-record>Ghi âm</button><button type="button" class="st-button" data-stop disabled>Dừng</button><button type="button" class="st-button" data-upload disabled>Lưu bản ghi</button>'}<button type="button" class="st-button" data-play ${answer?.recording_id ? "" : "disabled"}>Nghe bản đã lưu</button></div><audio controls preload="none" data-preview aria-label="Nghe lại bản ghi" class="assignment-audio" hidden></audio>`;
  const status = root.querySelector("[data-audio-status]"),
    audio = root.querySelector("audio"),
    record = root.querySelector("[data-record]"),
    stop = root.querySelector("[data-stop]"),
    save = root.querySelector("[data-upload]"),
    play = root.querySelector("[data-play]");
  const report = (text) => {
    if (active) status.textContent = text;
  };
  function controls() {
    if (!active) return;
    if (record) record.disabled = busy || recording;
    if (stop) stop.disabled = !recording;
    if (save) save.disabled = busy || recording || !blob;
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
          report("Đã dừng. Nghe thử; bấm Lưu bản ghi để gửi vào bài.");
          controls();
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
          report(
            `Đang ghi ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 6:00`,
          );
          if (seconds >= 360 && recorder.state === "recording") recorder.stop();
        }, 1000);
        report("Đang ghi âm…");
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
  if (save)
    save.onclick = async () => {
      if (busy || !blob || recording) return;
      busy = true;
      controls();
      report("Đang tải và xác nhận bản ghi…");
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
        report("Đã lưu bản ghi vào bản nháp. MP3 đang được xử lý.");
      } catch (e) {
        report(explain(e));
      } finally {
        busy = false;
        controls();
      }
    };
  play.onclick = async () => {
    if (busy || !answer?.recording_id) return;
    busy = true;
    controls();
    report("Đang tải bản ghi riêng tư…");
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
          : "Bản MP3 đã sẵn sàng; bản lưu trữ đang xử lý.",
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
  return {
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
