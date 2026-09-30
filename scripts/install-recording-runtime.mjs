// BtbN is linked by ffmpeg.org. Pin an immutable monthly release and its SHA256.
// Binaries stay in ignored cache, are included only in the server function.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  runtimeDirectory,
  runtimeVersion,
} from "../server/recording-runtime.mjs";
const run = promisify(execFile);
const release = "autobuild-2026-09-30-13-08";
const artifacts = {
  "win32-x64": {
    name: "ffmpeg-n8.1.3-9-g29e619e767-win64-lgpl-shared-8.1.zip",
    sha256: "3e47bda1607740550141e37c0e49d1e5182b34699f15adfd137ee266d346811a",
    bytes: 80733362,
  },
  "linux-x64": {
    name: "ffmpeg-n8.1.3-9-g29e619e767-linux64-lgpl-shared-8.1.tar.xz",
    sha256: "d4d7b6936f492c0b866b1cb4a29a1bbae09d6a064b4ec4eb90c95bed7969535a",
    bytes: 65590572,
  },
};
const platform = `${process.platform}-${process.arch}`;
const artifact = artifacts[platform];
if (!artifact) throw Error("Unsupported recording runtime platform");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestPath = path.join(runtimeDirectory, "manifest.json");
async function cached() {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (manifest.artifactSha256 !== artifact.sha256 || !manifest.files?.length)
      return false;
    for (const file of manifest.files) {
      if (!/^(?:bin|lib|licenses)\/[a-zA-Z0-9_.-]+$/.test(file.path))
        return false;
      if (
        digest(await fs.readFile(path.join(runtimeDirectory, file.path))) !==
        file.sha256
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
await fs.mkdir(path.dirname(runtimeDirectory), { recursive: true });
if (!(await cached())) {
  const downloads = path.resolve(".cache/recording-runtime-downloads");
  await fs.mkdir(downloads, { recursive: true });
  const archive = path.join(downloads, artifact.name);
  let bytes;
  try {
    bytes = await fs.readFile(archive);
  } catch {
    /* Fetch fixed artifact below. */
  }
  if (
    !bytes ||
    bytes.length !== artifact.bytes ||
    digest(bytes) !== artifact.sha256
  ) {
    const response = await fetch(
      `https://github.com/BtbN/FFmpeg-Builds/releases/download/${release}/${artifact.name}`,
      { signal: AbortSignal.timeout(180000) },
    );
    if (!response.ok) throw Error("Recording runtime download failed");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256)
      throw Error("Recording runtime checksum mismatch");
    await fs.writeFile(archive, bytes, { mode: 0o600 });
  }
  const directory = await fs.mkdtemp(
    path.join(path.dirname(runtimeDirectory), "extract-"),
  );
  try {
    // Verified publisher archive only. Never extract a user-supplied document here.
    await run("tar", ["-xf", archive, "-C", directory], {
      windowsHide: true,
      timeout: 120000,
    });
    const [folder] = await fs.readdir(directory);
    const source = path.join(directory, folder);
    const files = [];
    async function copy(from, to) {
      const value = await fs.readFile(path.join(source, from));
      await fs.mkdir(path.dirname(path.join(runtimeDirectory, to)), {
        recursive: true,
      });
      await fs.writeFile(path.join(runtimeDirectory, to), value, {
        mode: 0o755,
      });
      files.push({ path: to, bytes: value.length, sha256: digest(value) });
    }
    const executableExtension = process.platform === "win32" ? ".exe" : "";
    for (const tool of ["ffmpeg", "ffprobe"])
      await copy(
        `bin/${tool}${executableExtension}`,
        `bin/${tool}${executableExtension}`,
      );
    if (process.platform === "win32") {
      for (const filename of await fs.readdir(path.join(source, "bin")))
        if (filename.endsWith(".dll"))
          await copy(`bin/${filename}`, `bin/${filename}`);
    } else {
      // Materialize only SONAME files, avoiding duplicate symlink copies in Vercel.
      for (const filename of await fs.readdir(path.join(source, "lib")))
        if (/^lib[a-z]+\.so\.\d+$/.test(filename))
          await copy(`lib/${filename}`, `lib/${filename}`);
    }
    for (const filename of await fs.readdir(source))
      if (
        /^(?:LICENSE|COPYING|README)/i.test(filename) &&
        (await fs.stat(path.join(source, filename))).isFile()
      )
        await copy(filename, `licenses/${filename}`);
    const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
    if (totalBytes > 210 * 1024 * 1024)
      throw Error("Recording runtime exceeds server bundle budget");
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          version: runtimeVersion,
          release,
          artifactSha256: artifact.sha256,
          totalBytes,
          files,
        },
        null,
        2,
      ),
    );
  } finally {
    // This path was created exclusively by mkdtemp within the fixed workspace cache.
    await fs.rm(directory, { recursive: true, force: true });
  }
}
const { recordingRuntimeHealth } = await import(
  "../server/recording-audio.mjs"
);
const health = await recordingRuntimeHealth();
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
console.log(
  JSON.stringify({ ...health, runtimeBytes: manifest.totalBytes, release }),
);
