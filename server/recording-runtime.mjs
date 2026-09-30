import path from "node:path";

// Server-only, pinned release. No caller-supplied executable or library paths.
export const runtimeVersion = "8.1.3";
export const runtimeDirectory = path.resolve(
  process.cwd(),
  ".cache/recording-runtime",
  `${process.platform}-${process.arch}-${runtimeVersion}`,
);
export const ffmpeg = path.join(
  runtimeDirectory,
  "bin",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
export const ffprobe = path.join(
  runtimeDirectory,
  "bin",
  process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
);
export const decoderEnvironment = {
  // Decoders never inherit Supabase, Drive, OAuth, or worker secrets.
  ...Object.fromEntries(
    ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  ),
  ...(process.platform === "linux"
    ? { LD_LIBRARY_PATH: path.join(runtimeDirectory, "lib") }
    : {}),
};
