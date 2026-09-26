import {
  $,
  initShared,
  empty,
  entryCard,
  icon,
  toast,
  referenceLinks,
} from "./ui.mjs";
import { characters, dictionary, catalog } from "./repository.mjs";
import { escapeHtml as esc, HAN, LEVELS, normalizeLatin } from "./core.mjs";
import { savedCharacters, savedWords, toggleCharacter } from "./storage.mjs";
import { HandwritingCanvas } from "./handwriting.mjs";
import { lexiconManifest } from "./lexicon.mjs";
let all = [],
  radicals = [],
  saved = [],
  mode = "all",
  page = 0,
  reloadRequest = 0,
  renderRequest = 0,
  request = 0;
const PAGE = 72;
function readingProfiles(c) {
  const readings = c.readingProfile?.readings || [],
    deep = c.deepProfile || {};
  return (
    (readings.length
      ? `<details class="st-details" open><summary>Cách đọc theo ngữ cảnh</summary>${readings.map((r) => `<p><b>${esc(r.pinyin)}</b> · ${esc(r.meaning)}<br>${esc(r.when || "")}</p>${(r.examples || []).map((e) => `<p lang="zh-Hans"><a href="tu-dien.html?word=${encodeURIComponent(e.word)}">${esc(e.word)}</a> · ${esc(e.pinyin)} · ${esc(e.meaning)}</p>`).join("")}`).join("")}${c.readingProfile.note ? `<p class="st-caption">${esc(c.readingProfile.note)}</p>` : ""}</details>`
      : "") +
    ((deep.usageNotes || []).length
      ? `<details class="st-details"><summary>Nghĩa và cách dùng</summary><p>${esc(deep.coreMeaning || "")}</p><ul>${deep.usageNotes.map((n) => "<li>" + esc(n) + "</li>").join("")}</ul>${(deep.commonConfusions || []).map((x) => `<p><b>${esc(x.with)}</b> · ${esc(x.difference)}</p>`).join("")}</details>`
      : "")
  );
}
async function render() {
  const generation = ++renderRequest;
  $("#characterGrid").setAttribute("aria-busy", "true");
  const query = $("#characterSearch").value.trim(),
    n = normalizeLatin(query),
    radicalMode = mode === "radicals";
  let rows = radicalMode
    ? radicals.map((r) => ({
        character: r.character || r.unified || r.radical,
        number: r.number,
        pinyin: r.pinyin,
      }))
    : mode === "saved"
      ? saved.map(
          (character) =>
            all.find((c) => c.character === character) || { character },
        )
      : all;
  if (mode === "saved")
    rows = await Promise.all(saved.map((char) => characters.get(char)));
  if (!radicalMode && mode !== "all" && mode !== "common" && mode !== "saved")
    rows = rows.filter((c) => c.curriculumTags?.some((t) => t.level === mode));
  if (query)
    rows = rows.filter(
      (c) =>
        query.includes(c.character) ||
        c.character.includes(query) ||
        [c.pinyin, c.hanViet, ...(c.meaningsVi || [])].some(
          (x) => x && normalizeLatin(x).includes(n),
        ),
    );
  let total = rows.length,
    warning = "";
  if (mode === "all" || mode === "common") {
    const result = await characters.search(query, {
      mode,
      page,
      overlays: all,
    });
    rows = result.rows;
    total = result.total;
    warning = result.warning;
  } else rows = rows.slice(page * PAGE, (page + 1) * PAGE);
  if (generation !== renderRequest) return;
  $("#characterCount").textContent = total + (radicalMode ? " bộ thủ" : " chữ");
  $("#characterWarning").hidden = !warning;
  $("#characterWarning").textContent = warning || "";
  $("#characterGrid").innerHTML = rows.length
    ? rows
        .map(
          (c) =>
            `<button data-char="${esc(c.character)}" lang="zh-Hans" aria-label="Xem chữ ${esc(c.character)}">${esc(c.character)}<small>${esc(c.pinyin || (c.number ? "Bộ " + c.number : ""))}</small></button>`,
        )
        .join("")
    : empty("Chưa có chữ phù hợp", "Đổi bộ lọc hoặc thử gõ trực tiếp chữ Hán.");
  $("#characterPagination").innerHTML =
    total > PAGE
      ? `<button class="st-button" data-page="${page - 1}" ${!page ? "disabled" : ""}>← Trước</button><span>${page + 1} / ${Math.ceil(total / PAGE)}</span><button class="st-button" data-page="${page + 1}" ${(page + 1) * PAGE >= total ? "disabled" : ""}>Sau →</button>`
      : "";
  $("#characterGrid").removeAttribute("aria-busy");
}
async function openCharacter(char, push = true) {
  char = [...char].find((c) => HAN.test(c));
  if (!char) return;
  const seq = ++request;
  $("#characterBrowser").hidden = true;
  const target = $("#characterDetail");
  target.hidden = false;
  target.innerHTML = '<p role="status">Đang tải chữ…</p>';
  if (push) {
    const url = new URL(location.href);
    url.searchParams.set("char", char);
    history.pushState({}, "", url);
  }
  try {
    const [c, compounds, wordIds, characterIds] = await Promise.all([
      characters.get(char, new URL(location.href).searchParams.get("lesson")),
      dictionary.compounds(char),
      savedWords(),
      savedCharacters(),
    ]);
    if (seq !== request) return;
    const deep = c.deepProfile || {},
      isSaved = characterIds.includes(char);
    target.innerHTML = `<button class="st-button" id="backToCharacters">← Kho chữ Hán</button>
      <div class="st-detail-top"><div class="st-character" lang="zh-Hans">${esc(char)}</div><div>
        <p class="st-eyebrow">HÁN TỰ TRONG NGỮ CẢNH</p><h2 class="st-detail-title">${esc(char)} · ${esc(c.pinyin || "Chưa có âm đọc")}</h2>
        <p>${esc((c.meaningsVi || []).join("; ") || "Tra từ ghép bên dưới để xem nghĩa trong ngữ cảnh.")}</p>
        <p class="st-help">Hán Việt: ${esc(c.hanViet || "chưa có dữ liệu")}</p>
        <div class="st-actions"><button class="st-icon" data-speak="${esc(char)}" aria-label="Nghe chữ ${esc(char)}">${icon("audio")}</button>
          <button class="st-button" id="copyCharacter">Sao chép</button>
          <button class="st-button" id="saveCharacter" aria-pressed="${isSaved}">${isSaved ? "Đã lưu chữ" : "Lưu chữ"}</button>
          <button class="st-button primary" id="practiceCharacter">Thứ tự nét & luyện viết</button></div>
      </div></div>
      <dl class="st-facts"><div><dt>Số nét</dt><dd>${esc(c.strokeCount || "Chưa có")}</dd></div><div><dt>Bộ thủ</dt><dd>${esc(c.radical || "Chưa có")}</dd></div><div><dt>Phồn thể</dt><dd>${esc((c.traditional || []).join(" · ") || "—")}</dd></div><div><dt>Giản thể</dt><dd>${esc((c.simplified || []).join(" · ") || "—")}</dd></div></dl>
      ${c.hanVietReadings?.length ? `<details class="st-details"><summary>Âm Hán Việt theo cách đọc và dạng chữ</summary><div class="st-hv-readings">${c.hanVietReadings.map((r) => `<p><b lang="zh-Hant">${esc(r.character)}</b> · ${esc(r.pinyin || "Nguồn chưa chia theo pinyin")} <strong>${esc(r.values.join(" / "))}</strong></p>`).join("")}</div><p class="st-caption">Nguồn Phong Phan; cần đối chiếu ngữ cảnh khi một cách đọc có nhiều âm Hán Việt.</p></details>` : ""}
      ${c.vietnameseReadings?.length ? `<p class="st-caption">Âm Việt (Unihan): ${esc(c.vietnameseReadings.join(" · "))}. Trường này không đồng nhất với âm Hán Việt.</p>` : ""}
      ${!c.meaningsVi?.length && c.definitionEn ? `<p class="st-help">Nghĩa tham khảo tiếng Anh (Unihan): ${esc(c.definitionEn)}</p>` : ""}
      ${c.commonRank ? '<p class="st-caption">Có trong bảng 8.105 chữ thông dụng (2013); đây không phải cấp HSK.</p>' : ""}
      <p class="st-caption">${c.curriculumTags?.length ? "Trong giáo trình HSK 2.0: " + c.curriculumTags.map((t) => `<a href="${esc(t.href)}">HSK ${esc(t.level)} · Bài ${esc(t.lessonNo)}</a>`).join(", ") : "Chưa gán cấp HSK"}</p>
      ${c.structure ? `<details class="st-details" open><summary>Cấu tạo chữ</summary><p>${esc(typeof c.structure === "string" ? c.structure : JSON.stringify(c.structure))}</p></details>` : ""}
      ${deep.memoryAid ? `<details class="st-details"><summary>Gợi ý ghi nhớ</summary><p>${esc(deep.memoryAid)}</p></details>` : ""}
      ${referenceLinks(char)}
      <p class="st-source">Học liệu trong giáo trình được ưu tiên. <a href="nguon-tu-dien.html">Nguồn mở bổ sung</a>: Unicode Unihan 17.0 (Unicode-3.0); âm Hán Việt: Phong Phan (MIT); nghĩa Việt: CVDICT, Phong Phan & CC-CEDICT (CC BY-SA 4.0, bản dịch có hỗ trợ AI khi biên soạn).</p>
      <div class="st-section-head st-compound-heading"><h2>Từ chứa chữ ${esc(char)}</h2><span class="st-caption">${compounds.total} từ</span></div><div id="characterCompounds"></div><div id="compoundPagination" class="st-pagination"></div>`;
    let compoundRequest = 0;
    const renderCompounds = (result, currentPage) => {
      $("#characterCompounds").innerHTML =
        (result.warning
          ? `<p role="status" class="st-notice">${esc(result.warning)}</p>`
          : "") +
        (result.entries.length
          ? result.entries
              .map((w) => entryCard(w, { saved: wordIds.includes(w.id) }))
              .join("")
          : empty(
              "Chưa có từ chứa chữ này",
              "Có thể đối chiếu thêm qua Hanzii hoặc Thi Viện.",
            ));
      $("#compoundPagination").innerHTML =
        result.total > 12
          ? `<button class="st-button" data-compound-page="${currentPage - 1}" ${!currentPage ? "disabled" : ""}>← Trước</button><span>${currentPage + 1} / ${Math.ceil(result.total / 12)}</span><button class="st-button" data-compound-page="${currentPage + 1}" ${(currentPage + 1) * 12 >= result.total ? "disabled" : ""}>Sau →</button>`
          : "";
      $("#characterCompounds").removeAttribute("aria-busy");
    };
    renderCompounds(compounds, 0);
    $("#compoundPagination").onclick = async (event) => {
      const button = event.target.closest("[data-compound-page]");
      if (!button) return;
      const current = ++compoundRequest,
        nextPage = Number(button.dataset.compoundPage);
      $("#characterCompounds").setAttribute("aria-busy", "true");
      const result = await dictionary.compounds(char, { page: nextPage });
      if (seq !== request || current !== compoundRequest) return;
      renderCompounds(result, nextPage);
      target
        .querySelector(".st-compound-heading")
        .scrollIntoView({ block: "start" });
    };
    target
      .querySelector(".st-facts")
      .insertAdjacentHTML("afterend", readingProfiles(c));
    $("#backToCharacters").onclick = () => {
      request++;
      target.hidden = true;
      $("#characterBrowser").hidden = false;
      const url = new URL(location.href);
      url.searchParams.delete("char");
      history.pushState({}, "", url);
    };
    $("#practiceCharacter").onclick = () =>
      window.hanziPractice?.open(char, c.pinyin || "", "stroke");
    $("#copyCharacter").onclick = async () => {
      try {
        await navigator.clipboard.writeText(char);
        toast("Đã sao chép chữ " + char + ".");
      } catch {
        toast("Chưa sao chép được. Bạn có thể chọn chữ lớn và sao chép.");
      }
    };
    $("#saveCharacter").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const nowSaved = await toggleCharacter(char);
        button.setAttribute("aria-pressed", String(nowSaved));
        button.textContent = nowSaved ? "Đã lưu chữ" : "Lưu chữ";
        toast(nowSaved ? "Đã lưu chữ Hán." : "Đã bỏ lưu chữ.");
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    };
  } catch (e) {
    if (seq !== request) return;
    target.innerHTML = empty("Chưa tải được chữ", e.message);
    toast(e.message);
  }
}
async function reload() {
  const seq = ++reloadRequest;
  const [data, rows, ids] = await Promise.all([
    catalog(),
    characters.list(),
    savedCharacters(),
  ]);
  if (seq !== reloadRequest) return;
  all = rows;
  saved = ids;
  radicals = data.radicals;
  await render();
}
let searchTimer;
$("#characterSearch").addEventListener("input", () => {
  page = 0;
  $("#characterBrowser").hidden = false;
  $("#characterDetail").hidden = true;
  request++;
  renderRequest++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 180);
});
$("#characterSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && HAN.test(e.target.value))
    openCharacter(e.target.value);
});
$("#levelFilters").innerHTML = [
  ["all", "Tất cả"],
  ["common", "Thông dụng"],
  ...LEVELS.map((x) => [x, "HSK " + x]),
  ["radicals", "214 bộ thủ"],
  ["saved", "Đã lưu"],
]
  .map(
    ([v, label]) =>
      `<button data-level="${v}" aria-pressed="${v === mode}">${label}</button>`,
  )
  .join("");
$("#levelFilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-level]");
  if (!b) return;
  mode = b.dataset.level;
  page = 0;
  $("#levelFilters")
    .querySelectorAll("button")
    .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  render();
});
$("#characterGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-char]");
  if (b) openCharacter(b.dataset.char);
});
$("#characterPagination").onclick = (e) => {
  const b = e.target.closest("[data-page]");
  if (b) {
    page = Number(b.dataset.page);
    render();
  }
};
new HandwritingCanvas($("#characterInk"), { onSelect: openCharacter });
if (matchMedia("(max-width:700px)").matches)
  document.querySelector(".st-ink-details").open = false;
window.addEventListener("popstate", () => {
  const char = new URL(location.href).searchParams.get("char");
  if (char) openCharacter(char, false);
  else {
    request++;
    $("#characterBrowser").hidden = false;
    $("#characterDetail").hidden = true;
  }
});
window.addEventListener("study:characters-saved", () =>
  reload().catch((e) => toast(e.message)),
);
window.addEventListener("study:auth", () => {
  reload().catch(() => {});
  const char = new URL(location.href).searchParams.get("char");
  if (char) openCharacter(char, false);
});
await initShared();
lexiconManifest()
  .then(({ counts }) => {
    $("#characterCoverage").textContent =
      counts.characters.toLocaleString("vi-VN") +
      " chữ · " +
      counts.commonCharacters.toLocaleString("vi-VN") +
      " chữ thông dụng · " +
      counts.hanVietCharacters.toLocaleString("vi-VN") +
      " chữ có âm Hán Việt";
  })
  .catch(() => {});
await reload().catch((e) => {
  $("#characterGrid").innerHTML = empty("Không tải được kho chữ", e.message);
});
const initial = new URL(location.href).searchParams.get("char");
if (initial) openCharacter(initial, false);
