// A nonempty MediaRecorder container can contain silence. Measure the live
// signal during the local preflight sample; never upload or retain that sample.
export function microphoneLevel(samples) {
  const rms = Math.sqrt(
    samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
      samples.length,
  );
  const decibels = rms > 0 ? 20 * Math.log10(rms) : -60;
  return { rms, value: Math.max(0, Math.min(1, (decibels + 60) / 60)) };
}

export class MicrophoneSample {
  constructor() {
    this.reset();
  }
  reset() {
    this.duration = 0;
    this.signalDuration = 0;
  }
  observe(rms, elapsed) {
    // A suspended/backgrounded analyser cannot manufacture a long signal.
    const duration = Math.max(0, Math.min(100, elapsed));
    this.duration += duration;
    if (rms >= 0.01) this.signalDuration += duration;
  }
  ready({ bytes, active, running }) {
    return (
      bytes > 0 &&
      active &&
      running &&
      this.duration >= 1000 &&
      this.signalDuration >= 350
    );
  }
}
