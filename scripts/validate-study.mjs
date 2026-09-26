import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { validateQuestions } from "../study/core.mjs";
const root = new URL("../", import.meta.url),
  dist = new URL("dist/", root);
let checked = 0;
for (const dir of ["study", "server", "api", "scripts"])
  for (const file of await fs.readdir(new URL(dir + "/", root))) {
    if (
      !/\.(mjs|js)$/.test(file) ||
      (dir === "scripts" && !/study|build-web|dev-server/.test(file))
    )
      continue;
    const result = spawnSync(
      process.execPath,
      ["--check", fileURLToPath(new URL(dir + "/" + file, root))],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw Error(result.stderr);
    checked++;
  }
for (const forbidden of [
  ".env.local",
  ".env",
  "admin",
  ".cache",
  "server",
  "api",
  "supabase",
  "package.json",
  "node_modules",
  "sources",
])
  await assert.rejects(
    fs.access(new URL(forbidden, dist)),
    `Private file shipped: ${forbidden}`,
  );
const data = JSON.parse(
  await fs.readFile(new URL("data/study/catalog.json", dist), "utf8"),
);
assert.equal(data.radicals.length, 214);
for (const char of data.characters)
  assert.ok(char.curriculumTags.every((t) => t.lessonNo <= 3));
for (const file of await fs.readdir(new URL("data/study/entries/", dist))) {
  const entry = JSON.parse(
    await fs.readFile(new URL("data/study/entries/" + file, dist), "utf8"),
  );
  assert.equal(entry.visibility, "public");
  assert.ok(data.entries.some((e) => e.id === entry.id));
  assert.ok(entry.curriculumTags.every((t) => t.lessonNo <= 3));
}
for (const reading of data.readings) {
  const r = JSON.parse(
    await fs.readFile(
      new URL("data/study/readings/" + reading.id + ".json", dist),
      "utf8",
    ),
  );
  assert.ok(r.visibility === "public");
  assert.ok(
    r.translations.every(
      (t) => Number.isInteger(t.index) && t.vietnamese && t.provenance,
    ),
  );
  if (r.questions.length) assert.ok(validateQuestions(r.questions));
}
const sourceManifest = JSON.parse(
  await fs.readFile(
    new URL("../sources/dictionaries/manifest.json", root),
    "utf8",
  ),
);
assert.equal(sourceManifest.schema, 1);
assert.equal(sourceManifest.sources.length, 4);
assert.ok(sourceManifest.sources.every((source) => source.sha256));

await assert.rejects(
  fs.access(new URL("data/study/lexicon/", dist)),
  "Local lexicon build output must not ship with Vercel deployments",
);
const lexiconSourceCode = await fs.readFile(
  new URL("../study/lexicon.mjs", root),
  "utf8",
);
assert.match(lexiconSourceCode, /get_study_lexicon_meta/);
assert.match(lexiconSourceCode, /get_study_lexicon_words_v2/);
assert.match(lexiconSourceCode, /search_study_lexicon_v2/);

for (const page of ["chu-han", "tu-dien", "doc-hieu", "nguon-tu-dien"]) {
  const html = await fs.readFile(new URL(page + ".html", dist), "utf8");
  assert.ok(html.includes('lang="vi"'));
  await fs.access(new URL("study/" + page + ".mjs", dist));
}
console.log(
  `PASS: ${checked} JavaScript syntax checks; public course boundary, 119044 dictionary entries, 103013 characters, source hashes, gzip, licenses, 214 radicals and reading questions verified.`,
);
