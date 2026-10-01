export class ExamAudioPlayer {
  constructor(audio) {
    this.audio = audio;
    this.stopCurrent = null;
  }
  async playSegment(url, segment) {
    if (!segment?.verified || !(segment.end_seconds > segment.start_seconds))
      throw Error("AUDIO_SEGMENTS_UNVERIFIED");
    this.stop();
    const a = this.audio;
    if (a.getAttribute("src") !== url) {
      a.src = url;
      a.load();
    }
    if (a.readyState < 1)
      await new Promise((resolve, reject) => {
        const clean = () => {
          a.removeEventListener("loadedmetadata", ready);
          a.removeEventListener("error", fail);
        };
        const ready = () => {
          clean();
          resolve();
        };
        const fail = () => {
          clean();
          reject(Error("AUDIO_UNAVAILABLE"));
        };
        a.addEventListener("loadedmetadata", ready);
        a.addEventListener("error", fail);
      });
    a.currentTime = segment.start_seconds;
    return new Promise((resolve, reject) => {
      const clean = () => {
        a.removeEventListener("timeupdate", check);
        a.removeEventListener("ended", done);
        a.removeEventListener("error", fail);
        this.stopCurrent = null;
      };
      const done = () => {
        a.pause();
        clean();
        resolve();
      };
      const fail = () => {
        clean();
        reject(Error("AUDIO_UNAVAILABLE"));
      };
      const check = () => {
        if (a.currentTime >= segment.end_seconds) done();
      };
      this.stopCurrent = done;
      a.addEventListener("timeupdate", check);
      a.addEventListener("ended", done);
      a.addEventListener("error", fail);
      a.play().catch(fail);
    });
  }
  stop() {
    this.audio.pause();
    this.stopCurrent?.();
  }
}
export class ExamRecorder {
  constructor(stream) {
    this.stream = stream;
    this.recorder = null;
    this.pending = null;
  }
  start() {
    if (this.pending) throw Error("RECORDING_ALREADY_ACTIVE");
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : {},
    );
    const r = this.recorder,
      chunks = [];
    this.pending = new Promise((resolve, reject) => {
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => reject(Error("RECORDING_FAILED"));
      r.onstop = () => {
        const blob = new Blob(chunks, { type: r.mimeType });
        this.pending = null;
        blob.size ? resolve(blob) : reject(Error("RECORDING_EMPTY"));
      };
    });
    r.start(250);
  }
  async stop() {
    if (!this.pending) return null;
    const result = this.pending;
    if (this.recorder.state !== "inactive") this.recorder.stop();
    return result;
  }
  async dispose() {
    try {
      await this.stop();
    } finally {
      this.stream.getTracks().forEach((t) => t.stop());
    }
  }
}
