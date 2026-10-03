import test from "node:test";
import assert from "node:assert/strict";
import { ExamAudioPlayer } from "../study/hskk-exam-media.mjs";
import { HSKKExamEngine } from "../study/hskk-exam-engine.mjs";
class LocalAudio extends EventTarget {
  readyState = 4;
  currentTime = 0;
  src = "";
  starts = [];
  getAttribute() {
    return this.src;
  }
  load() {}
  pause() {}
  async play() {
    this.starts.push(this.currentTime);
  }
}
test("a delayed current clip is prepared before listening and plays from zero; mismatched/late/not-ready clips cannot play", async () => {
  const audio = new LocalAudio(),
    player = new ExamAudioPlayer(audio);
  let resolve;
  const loading = player.preparePrivatePrompt(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    "q1",
  );
  await assert.rejects(
    player.playPreparedPrompt("q1", 3, () => 0),
    /AUDIO_NOT_READY/,
  );
  resolve(new Blob(["actual bytes"]));
  await loading;
  await assert.rejects(
    player.playPreparedPrompt("q2", 3, () => 0),
    /AUDIO_NOT_READY/,
  );
  await assert.rejects(
    player.playPreparedPrompt("q1", 3, () => 0.26),
    /AUDIO_WINDOW_MISSED/,
  );
  const playing = player.playPreparedPrompt("q1", 3, () => 0.1);
  assert.deepEqual(audio.starts, [0]);
  audio.currentTime = 3;
  audio.dispatchEvent(new Event("timeupdate"));
  await playing;
  let offset = 0.1;
  audio.play = async () => {
    offset = 0.3;
  };
  await assert.rejects(
    player.playPreparedPrompt("q1", 3, () => offset),
    /AUDIO_WINDOW_MISSED/,
    "Delayed browser playback cannot silently overrun the listening clock.",
  );
  player.stop();
  assert.equal(player.prepared, null);
});
test("changing questions during a slow fetch discards the old bytes instead of playing late", async () => {
  const audio = new LocalAudio(),
    player = new ExamAudioPlayer(audio);
  let resolve;
  const loading = player.preparePrivatePrompt(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    "old",
  );
  player.stop();
  resolve(new Blob(["old question"]));
  await loading;
  assert.equal(player.prepared, null);
  assert.deepEqual(audio.starts, []);
});
test("historical sessions derive their original timing and expired uploads preserve the retained queue", async () => {
  const engine = new HSKKExamEngine({
    exam: {
      delivery_mode: "private_clips",
      timing: { prompt_load_seconds: 5, prompt_start_grace_ms: 250 },
      questions: [],
      sections: [],
    },
    candidateId: "A",
    transport: { production: true },
    onChange() {},
  });
  engine.applyDeliveryTiming({
    delivery_timing: { prompt_load_seconds: 0, prompt_start_grace_ms: 0 },
  });
  assert.equal(engine.exam.timing.prompt_load_seconds, 0);
  engine.session = { server_deadline: 1000, upload_deadline: 2000 };
  engine.now = () => 2000;
  engine.pending.set("q", { blob: new Blob(["retained"]), requestId: "same" });
  await assert.rejects(engine.retrySaves(), /UPLOAD_WINDOW_EXPIRED/);
  assert.equal(engine.pending.get("q").blob.size, 8);
});
