import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = path.join(root, "dist");
// Only this fixed build-output directory may be removed.
if (path.dirname(out) !== path.resolve(root) || path.basename(out) !== "dist")
  throw Error("Unsafe build path");
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const publicDirectories = new Set([
  "audio",
  "data",
  "homepage",
  "img",
  "media",
  "study",
]);
for (const item of await fs.readdir(root, { withFileTypes: true })) {
  if (item.isDirectory() && publicDirectories.has(item.name))
    await fs.cp(path.join(root, item.name), path.join(out, item.name), {
      recursive: true,
      filter: (sourcePath) => {
        const relative = path.relative(root, sourcePath).split(path.sep).join("/");
        return (
          !relative.split("/").some((x) => x.startsWith(".")) &&
          relative !== "data/study/lexicon" &&
          !relative.startsWith("data/study/lexicon/")
        );
      },
    });
  else if (item.isFile() && /\.(html|css|js|ico|webmanifest)$/.test(item.name))
    await fs.copyFile(path.join(root, item.name), path.join(out, item.name));
}
for (const [name, contents] of Object.entries({
  supabase: "export {createClient} from '@supabase/supabase-js';",
  pinyin:
    "import {pinyin,customPinyin} from 'pinyin-pro'; customPinyin({'行长':'háng zhǎng','银行行长':'yín háng háng zhǎng'}); export {pinyin};",
})) {
  const options = {
    stdin: { contents, resolveDir: root, sourcefile: name + ".mjs" },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    legalComments: "eof",
    outfile: path.join(out, "study/vendor", name + ".mjs"),
  };
  await build(options);
}
await fs.copyFile(
  path.join(root, "node_modules/hanzi-writer/dist/hanzi-writer.min.js"),
  path.join(out, "study/vendor/hanzi-writer.min.js"),
);
const strokeSource = path.join(root, "node_modules/hanzi-writer-data");
const strokeOutput = path.join(out, "data/hanzi-strokes");
await fs.mkdir(strokeOutput, { recursive: true });
const strokeFiles = (await fs.readdir(strokeSource)).filter(
  (f) => f.endsWith(".json") && f !== "package.json",
);
for (let i = 0; i < strokeFiles.length; i += 80)
  await Promise.all(
    strokeFiles
      .slice(i, i + 80)
      .map((file) =>
        fs.copyFile(
          path.join(strokeSource, file),
          path.join(strokeOutput, file),
        ),
      ),
  );
await fs.copyFile(
  path.join(strokeSource, "ARPHICPL.TXT"),
  path.join(strokeOutput, "ARPHICPL.TXT"),
);
await fs.writeFile(
  path.join(strokeOutput, "NOTICE.txt"),
  "Hanzi Writer Data 2.0.1 / Make Me A Hanzi. Original glyphs by Arphic Technology. Redistributed without modification under the Arphic Public License; see ARPHICPL.TXT. Source: https://github.com/chanind/hanzi-writer-data\n",
);
console.log("Bundled stroke data for " + strokeFiles.length + " characters.");
for (const module of ["pinyin-pro", "hanzi-writer", "@supabase/supabase-js"]) {
  const base = path.join(root, "node_modules", module);
  const license = (await fs.readdir(base)).find((x) => /^license/i.test(x));
  if (license)
    await fs.copyFile(
      path.join(base, license),
      path.join(
        out,
        "study/vendor",
        module.replaceAll("/", "-") + "-LICENSE.txt",
      ),
    );
}
await fs.copyFile(
  path.join(out, "trang-chu.html"),
  path.join(out, "index.html"),
);
await fs.writeFile(path.join(out, ".nojekyll"), "");
const version =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  JSON.parse(
    await fs.readFile(path.join(root, "data/study/catalog.json"), "utf8"),
  ).version;
for (const item of await fs.readdir(out))
  if (item.endsWith(".html")) {
    const file = path.join(out, item);
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html.replace(
        /(navigation\.css|hsk1-navigation\.js|private-lesson-loader\.js|data\/supabase-public\.js|pinyin\.(?:css|js)|data\/pinyin-(?:data|audio|basics)\.js)(\?v=[^"']*)?/g,
        "$1?v=" + version,
      ),
    );
  }
console.log("Built public site into dist; API/server/secrets are excluded.");
