import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { parse } from "acorn";
import { createHash } from "node:crypto";

export function extractLegacy(html) {
  let legacy,
    engine,
    replaced = 0;
  const page = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (whole, attributes, code) => {
      if (!/\bconst LESSON\s*=/.test(code)) return whole;
      const ast = parse(code, { ecmaVersion: "latest" });
      const declaration = ast.body
        .filter((n) => n.type === "VariableDeclaration")
        .flatMap((n) => n.declarations)
        .find((n) => n.id.name === "LESSON");
      if (!declaration || declaration.init.type !== "ObjectExpression")
        throw Error("Unrecognized private lesson initializer");
      legacy = vm.runInNewContext(
        "(" + code.slice(declaration.init.start, declaration.init.end) + ")",
        {},
        { timeout: 3000 },
      );
      engine =
        code.slice(0, declaration.init.start) +
        "window.HNH_PRIVATE_LEGACY" +
        code.slice(declaration.init.end);
      engine = engine.replace(
        /(const STORAGE_(?:HISTORY|INPROGRESS)_KEY\s*=\s*)([^;]+);/g,
        "$1($2)+window.HNH_ACCOUNT_SCOPE;",
      );
      engine = engine.replace(
        /((?:historyKey|progressKey):\s*"[^"]+"\s*\+\s*LESSON.id)/g,
        "$1 + window.HNH_ACCOUNT_SCOPE",
      );
      if (engine.includes("hist.push(record);"))
        engine = engine.replace(
          "hist.push(record);",
          "hist.push(record); window.HNH_ATTEMPTS?.capture(record);",
        );
      else if (engine.includes("this.saveHistory(list);"))
        engine = engine.replace(
          "this.saveHistory(list);",
          "this.saveHistory(list); window.HNH_ATTEMPTS?.capture(attempt);",
        );
      else throw Error("Unknown legacy attempt persistence");
      parse(engine, { ecmaVersion: "latest" });
      replaced++;
      return '<script src="private-lesson-loader.js"></script>';
    },
  );
  if (replaced !== 1) throw Error("Expected one private lesson initializer");
  return { page, legacy, engine };
}

export async function protectPublication(root, out) {
  const context = vm.createContext({ window: {} });
  for (const f of [
    "data/lesson-registry.js",
    "data/lesson-manifest.js",
    "data/lessons/hsk2/exercise-revision-v2.js",
  ])
    vm.runInContext(await fs.readFile(path.join(root, f), "utf8"), context);
  const registry = context.window.HAN_NGU_DATA,
    payloads = [],
    assets = [],
    pendingAudio = new Set();
  for (const meta of registry.manifest.filter((m) => m.lessonNo > 3)) {
    let html = await fs.readFile(path.join(root, meta.href), "utf8");
    if (meta.data)
      vm.runInContext(
        await fs.readFile(path.join(root, meta.data), "utf8"),
        context,
      );
    const raw = registry.lessons[meta.id];
    let payload = raw ? JSON.parse(JSON.stringify(raw)) : null;
    if (meta.level === 2) {
      const result = extractLegacy(html);
      html = result.page;
      payload.client_view = result.legacy;
      await fs.mkdir(path.join(out, "study/lesson-engines"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(out, "study/lesson-engines", meta.id + ".js"),
        result.engine,
      );
      html = html.replace(
        /<body\b[^>]*>/i,
        `<body data-lesson-id="${meta.id}" data-lesson-engine="legacy">`,
      );
    } else if (!html.includes("private-lesson-loader.js")) {
      html = html.replace(
        /<script src="data\/lessons\/hsk1\/bai\d+\.js"><\/script>/,
        "",
      );
      html = html.replace(
        '<script src="hsk1-lesson-engine.js"></script>',
        '<script src="private-lesson-loader.js"></script>',
      );
    }
    if (!html.includes("private-lesson.css"))
      html = html.replace(
        "</head>",
        '<link rel="stylesheet" href="private-lesson.css"></head>',
      );
    if (!html.includes("data/lesson-registry.js"))
      html = html.replace(
        '<script src="private-lesson-loader.js">',
        '<script src="data/lesson-registry.js"></script><script src="private-lesson-loader.js">',
      );
    if (!html.includes("data/supabase-public.js"))
      html = html.replace(
        '<script src="private-lesson-loader.js">',
        '<script src="data/supabase-public.js"></script><script src="private-lesson-loader.js">',
      );
    html = html.replace(
      "</head>",
      '<meta name="robots" content="noindex"><noscript><style>body>*{display:none}body::before{content:"Bài học cần JavaScript và tài khoản được cấp quyền."}</style></noscript></head>',
    );
    await fs.writeFile(path.join(out, meta.href), html);
    if (payload) {
      const replaceAssets = async (v, parent) => {
        if (typeof v === "string" && /^audio\/hsk[12]\/bai\d+\//.test(v)) {
          const relative = v.replace(/^audio\//, "");
          let file;
          try {
            file = await fs.readFile(path.join(root, v));
          } catch (error) {
            if (error.code === "ENOENT" && parent?.audioStatus !== "ready") {
              pendingAudio.add(v);
              return "";
            }
            throw error;
          }
          if (!assets.some((a) => a.source === v))
            assets.push({
              lesson_id: meta.id,
              source: v,
              bucket: "lesson-private",
              object_path: relative,
              sha256: createHash("sha256").update(file).digest("hex"),
            });
          return "supabase://lesson-private/" + relative;
        }
        if (Array.isArray(v))
          return Promise.all(v.map((value) => replaceAssets(value)));
        if (v && typeof v === "object")
          return Object.fromEntries(
            await Promise.all(
              Object.entries(v).map(async ([k, value]) => [
                k,
                await replaceAssets(value, v),
              ]),
            ),
          );
        return v;
      };
      payloads.push({ id: meta.id, content: await replaceAssets(payload) });
    }
  }
  // Authoring data is kept in source, but only public lessons are published.
  for (const level of [1, 2])
    for (let no = 4; no <= 15; no++) {
      await fs.rm(path.join(out, `data/lessons/hsk${level}/bai${no}.js`), {
        force: true,
      });
      const assetDir = path.resolve(out, `audio/hsk${level}/bai${no}`);
      if (!assetDir.startsWith(path.resolve(out) + path.sep))
        throw Error("Invalid private audio output path");
      await fs.rm(assetDir, { recursive: true, force: true });
    }
  await fs.rm(path.join(out, "data/lessons/hsk2/exercise-revision-v2.js"), {
    force: true,
  });
  // Revision data is only used by the authoring pipeline for private HSK 2 lessons.
  let registryCode = await fs.readFile(
    path.join(out, "data/lesson-registry.js"),
    "utf8",
  );
  registryCode = registryCode.replace(
    / {4}\/\/ Nạp bộ tái cấu trúc[\s\S]*? {4}\/\/ Private lessons/,
    "    // Private lessons",
  );
  await fs.writeFile(path.join(out, "data/lesson-registry.js"), registryCode);
  const publicManifest = registry.manifest.map(({ data, ...m }) =>
    m.lessonNo > 3 ? { ...m, visibility: "student" } : { ...m, data },
  );
  await fs.writeFile(
    path.join(out, "data/lesson-manifest.js"),
    "window.HAN_NGU_DATA=window.HAN_NGU_DATA||{};window.HAN_NGU_DATA.manifest=" +
      JSON.stringify(publicManifest) +
      ";",
  );
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".cache/private-publication.json"),
    JSON.stringify(
      { format: 1, payloads, assets, pendingAudio: [...pendingAudio] },
      null,
      2,
    ),
  );
  console.log(
    `Protected 24 lesson routes; staged ${payloads.length} content snapshots and ${assets.length} private assets outside dist.`,
  );
}
