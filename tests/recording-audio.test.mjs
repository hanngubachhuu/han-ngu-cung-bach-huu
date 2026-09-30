import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecording,
  audioHash,
  syntheticWave,
  recordingRuntimeHealth,
} from "../server/recording-audio.mjs";
test("real FFmpeg converts and validates synthetic WAV into MP3", async () => {
  const raw = syntheticWave(2),
    output = await normalizeRecording(raw, audioHash(raw));
  assert.equal(output.codec, "mp3");
  assert.equal(output.mime, "audio/mpeg");
  assert.equal(output.sha256, audioHash(output.bytes));
  assert(output.duration >= 2 && output.duration < 2.15);
  assert.notDeepEqual(output.bytes.subarray(0, 4), Buffer.from("RIFF"));
  const retry = await normalizeRecording(raw, audioHash(raw));
  assert.equal(output.sha256, retry.sha256);
});
test("invalid bytes, size and checksum substitution are rejected", async () => {
  const fake = Buffer.from("not audio, even if named recording.mp3");
  await assert.rejects(
    normalizeRecording(fake, audioHash(fake)),
    /AUDIO_DECODE_FAILED/,
  );
  await assert.rejects(
    normalizeRecording(syntheticWave(), "0".repeat(64)),
    /AUDIO_HASH_MISMATCH/,
  );
  await assert.rejects(
    normalizeRecording(Buffer.alloc(8 * 1024 * 1024 + 1), "0".repeat(64)),
    /AUDIO_INVALID_SIZE/,
  );
});
test("runtime health uses synthetic audio without credentials", async () => {
  const health = await recordingRuntimeHealth();
  assert.equal(health.conversion, "passed");
  assert(health.elapsedMs < 45000);
});
