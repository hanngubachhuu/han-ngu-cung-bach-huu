// Local visual checks of supplied draft content. No JWT, hosted calls or attempts.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.STUDY_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
await fs.mkdir("test-results/hskk/cbt", { recursive: true });
const evidence = [];
try {
  for (const code of ["H71002", "H80000", "H91002"]) {
    const source = JSON.parse(
      await fs.readFile(`server/hskk/${code}.json`, "utf8"),
    );
    const pictures = {};
    for (const q of source.questions.filter((q) => q.prompt_image))
      pictures[q.id] = (
        await fs.readFile(`server/hskk/assets/${q.prompt_image.file_name}`)
      ).toString("base64");
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({
          viewport: { width, height: 900 },
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/cbt-visual-check", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/study/study.css"><link rel="stylesheet" href="/study/hskk.css"><body class="hskk-cbt-active"><main class="hskk-main"><section id="visual" class="hskk-cbt-root"></section></main></body></html>',
        }),
      );
      await page.goto(base + "/cbt-visual-check");
      for (const mode of [
        "audio",
        "long",
        ...(code === "H80000" ? ["image", "image-second"] : []),
      ]) {
        await page.evaluate(
          async ({ source, pictures, mode }) => {
            const { cbtShell, listeningIllustration } = await import(
              "/study/hskk-cbt-view.mjs"
            );
            const q =
              mode === "image-second"
                ? source.questions.filter((q) => q.prompt_mode === "image")[1]
                : source.questions.find((q) =>
                    mode === "audio"
                      ? q.prompt_mode === "audio"
                      : mode === "image"
                        ? q.prompt_mode === "image"
                        : q.prompt_mode === "text",
                  );
            const section = source.sections.find((s) => s.id === q.section_id),
              root = document.querySelector("#visual");
            const view = {
              state: mode === "audio" ? "LISTENING" : "RECORDING",
              question: q,
              section,
              saved: 0,
              total: source.questions.length,
              remaining: q.response_seconds,
            };
            root.innerHTML = cbtShell({
              exam: source,
              candidate: { name: "Học viên kiểm thử" },
              view,
              preparing: false,
              time: "01:30",
            });
            const body = root.querySelector("[data-body]");
            const h = document.createElement("h2");
            h.lang = "zh";
            h.textContent = section.title_zh;
            body.append(h);
            const box = document.createElement("div");
            box.className = "cbt-question-box";
            const number = document.createElement("span");
            number.className = "cbt-question-number";
            number.textContent = q.number;
            box.append(number);
            if (mode === "audio")
              box.insertAdjacentHTML("beforeend", listeningIllustration);
            else if (mode.startsWith("image")) {
              const image = document.createElement("img");
              image.className = "cbt-source-picture";
              image.src = "data:image/jpeg;base64," + pictures[q.id];
              image.alt = "Tranh câu " + q.number;
              box.append(image);
            } else {
              const p = document.createElement("p");
              p.className = "hskk-question";
              p.lang = "zh";
              p.textContent = q.prompt;
              box.append(p);
            }
            body.append(box);
            if (mode !== "audio") {
              const label = document.createElement("label");
              label.className = "cbt-notes";
              label.textContent = "草稿区（不计分）";
              const area = document.createElement("textarea");
              area.setAttribute("aria-label", "Nháp chuẩn bị");
              label.append(area);
              body.append(label);
            }
          },
          { source, pictures, mode },
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        assert.ok((await page.getByText(code, { exact: true }).count()) > 0);
        assert.equal(
          (await page.locator("body").innerText()).includes("HỌC BÁ"),
          false,
        );
        if (mode !== "audio")
          await page
            .getByLabel("Nháp chuẩn bị")
            .fill("Nháp thử — không chấm điểm");
        const file = `test-results/hskk/cbt/${code}-${mode}-${width}.png`;
        await page.screenshot({ path: file, fullPage: true });
        evidence.push({
          code,
          mode,
          width,
          overflow: false,
          file,
          scope: "LOCAL_VISUAL_ONLY_NO_HOSTED_SESSION",
        });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  await fs.writeFile(
    "test-results/hskk/cbt/evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      pass: true,
      visual_checks: evidence.length,
      levels: 3,
      hosted: false,
    }),
  );
} finally {
  await browser.close();
}
