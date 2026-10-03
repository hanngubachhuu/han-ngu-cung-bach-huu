// Adapter contract: transcribe({bytes,filename,language}) -> timestamped transcript.
// Keys remain exclusively server-side; no exam text is injected as a transcript.
export function openAITranscriber({
  key = process.env.OPENAI_API_KEY,
  fetchImpl = fetch,
} = {}) {
  return {
    async transcribe({ bytes, filename, language = "zh" }) {
      if (!key) throw Error("TRANSCRIBER_NOT_CONFIGURED");
      if (
        !Buffer.isBuffer(bytes) ||
        !bytes.length ||
        bytes.length > 24 * 1024 * 1024
      )
        throw Error("AUDIO_SIZE_INVALID");
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "audio/mpeg" }), filename);
      form.append("model", "whisper-1");
      form.append("language", language);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      form.append("timestamp_granularities[]", "word");
      const response = await fetchImpl(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + key },
          body: form,
          signal: AbortSignal.timeout(110000),
        },
      );
      if (!response.ok) {
        let code;
        try {
          code = (await response.json()).error?.code;
        } catch {}
        throw Error(
          code === "insufficient_quota"
            ? "TRANSCRIBER_QUOTA_EXHAUSTED"
            : response.status === 429
              ? "TRANSCRIBER_RATE_LIMIT"
              : "TRANSCRIPTION_FAILED",
        );
      }
      const result = await response.json();
      return {
        text: result.text,
        utterances: result.segments?.map((s) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        })),
        segments: result.words?.length
          ? result.words.map((w) => ({
              text: w.word,
              start: w.start,
              end: w.end,
            }))
          : result.segments?.map((s) => ({
              text: s.text,
              start: s.start,
              end: s.end,
            })),
        provider: "openai",
        model: "whisper-1",
        granularity: result.words?.length ? "word" : "segment",
      };
    },
  };
}
