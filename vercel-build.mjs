import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await cp(root, dist, {
  recursive: true,
  filter(source) {
    const rel = path.relative(root, source);
    if (!rel) return true;
    const first = rel.split(path.sep)[0];
    return !["dist", ".git", ".github", ".vercel"].includes(first);
  }
});

console.log("Static site copied to dist/");
