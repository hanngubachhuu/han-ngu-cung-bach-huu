import test from "node:test";
import assert from "node:assert/strict";
import {
  microphoneLevel,
  MicrophoneSample,
} from "../study/hskk-microphone.mjs";
import {
  providerRequestTimeout,
  providerFetch,
} from "../study/provider-fetch.mjs";

test("nonempty encoded silence and a suspended analyser cannot pass microphone preflight", () => {
  const sample = new MicrophoneSample();
  for (let i = 0; i < 100; i++) sample.observe(0, 20);
  assert.equal(
    sample.ready({ bytes: 8000, active: true, running: true }),
    false,
  );
  assert.deepEqual(microphoneLevel(new Uint8Array(20).fill(128)), {
    rms: 0,
    value: 0,
  });
  sample.reset();
  sample.observe(0.2, 60000);
  assert.equal(
    sample.ready({ bytes: 8000, active: true, running: true }),
    false,
  );
});
test("microphone requires sustained live signal, a real sample and an active audio context", () => {
  const sample = new MicrophoneSample();
  for (let i = 0; i < 60; i++) sample.observe(i < 20 ? 0.1 : 0, 20);
  const valid = { bytes: 8000, active: true, running: true };
  assert.equal(sample.ready(valid), true);
  for (const invalid of [{ bytes: 0 }, { active: false }, { running: false }])
    assert.equal(sample.ready({ ...valid, ...invalid }), false);
  const quiet = microphoneLevel(new Uint8Array([127, 129]));
  const voice = microphoneLevel(new Uint8Array([108, 148]));
  assert.ok(voice.value > quiet.value && voice.rms > 0.01);
  sample.reset();
  assert.equal(sample.ready(valid), false);
});
test("only reserved raw recording uploads receive a longer timeout; caller abort is preserved", async (t) => {
  const url =
    "https://project.invalid/storage/v1/object/speaking-private/00000000-0000-4000-8000-000000000001/raw";
  assert.equal(providerRequestTimeout(url, { method: "POST" }), 120000);
  assert.equal(providerRequestTimeout(url, { method: "GET" }), 8000);
  assert.equal(
    providerRequestTimeout(url.replace("/raw", "/audio.mp3"), {
      method: "POST",
    }),
    8000,
  );
  assert.equal(
    providerRequestTimeout("https://project.invalid/auth/v1/token", {
      method: "POST",
    }),
    8000,
  );
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, "fetch", async (_, options) => {
    assert.equal(options.signal.aborted, true);
    assert.equal(options.method, "POST");
    return "cancelled";
  });
  assert.equal(
    await providerFetch(url, { method: "POST", signal: controller.signal }),
    "cancelled",
  );
});
