import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
const excluded = new Set(["dist", ".git", ".github", ".vercel", "node_modules"]);

for (const entry of entries) {
  if (excluded.has(entry.name)) continue;
  await cp(
    path.join(root, entry.name),
    path.join(dist, entry.name),
    { recursive: true }
  );
}

console.log("Static site copied to dist/");
