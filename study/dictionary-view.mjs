import { escapeHtml as esc, HAN } from "./core.mjs";
import { entryCard, empty, icon } from "./ui.mjs";

export const modes = {
  word: "Từ vựng",
  character: "Hán tự",
  example: "Ví dụ",
  grammar: "Ngữ pháp",
  related: "Kết hợp từ",
};
export function resultList(entries, selected) {
  return entries
    .map(
      (e) =>
        `<button type="button" class="dc-result" data-entry-id="${esc(e.id)}" aria-current="${e.id === selected}"><span class="dc-result-top"><span class="dc-result-zh" lang="zh-Hans">${esc(e.simplified)}</span>${e.hsk ? `<span class="dc-level">HSK ${e.hsk.level}${e.hsk.source === "local-hsk-workbook" ? "*" : ""}</span>` : ""}</span><span class="dc-result-pinyin">${esc(e.pinyin || "Chưa có phiên âm")}</span><span class="dc-result-meaning">${esc(e.meaningsVi?.[0] || "Mở để xem mục từ")}</span></button>`,
    )
    .join("");
}
function sourceLabel(x) {
  if (x.provenance?.source === "local-hsk-workbook")
    return `Tài liệu bổ sung · ${esc(x.provenance.sheet)} · dòng ${x.provenance.row} · chưa thẩm định`;
  return "Ví dụ trong giáo trình";
}
function highlighted(text, word) {
  return word
    ? esc(text)
        .split(esc(word))
        .join(`<mark>${esc(word)}</mark>`)
    : esc(text);
}
export function examplesView(entry, max = Infinity) {
  const examples = (entry.examples || []).slice(0, max);
  return examples.length
    ? examples
        .map(
          (x) =>
            `<article class="dc-example"><div class="st-example"><button type="button" class="st-icon" data-speak="${esc(x.chinese)}" aria-label="Nghe câu ${esc(x.chinese)}">${icon("audio")}</button><div><p class="st-example-zh" lang="zh-Hans">${highlighted(x.chinese, entry.simplified)}</p>${x.pinyin ? `<p class="st-pinyin">${esc(x.pinyin)}</p>` : ""}${x.vietnamese ? `<p>${esc(x.vietnamese)}</p>` : ""}</div></div><p class="st-caption">${sourceLabel(x)}</p></article>`,
        )
        .join("")
    : '<p class="dc-note">Kho hiện có chưa có câu ví dụ cho từ này. Bạn có thể đối chiếu trên Hanzii.</p>';
}
export function wordView(entry, saved) {
  return (
    entryCard(entry, { saved, examples: false, sourceDetails: true }) +
    `<section class="dc-panel"><h3>Ví dụ trong ngữ cảnh</h3>${examplesView(entry, 2)}${entry.examples?.length > 2 ? `<button type="button" class="dc-text-button" data-show-mode="example">Xem ${entry.examples.length} ví dụ →</button>` : ""}<div class="dc-context-nav"><button type="button" data-show-mode="character">Khám phá từng chữ</button><button type="button" data-show-mode="related">Từ và cụm từ liên quan</button></div></section>`
  );
}
export function headerView(entry, saved) {
  return entry
    ? entryCard(entry, { saved, compact: true, sourceDetails: true })
    : "";
}
export function charactersView(rows) {
  return `<section class="dc-panel"><h3>Từng chữ tạo nên từ</h3>${rows.map((c) => `<article class="dc-character"><a class="dc-character-glyph" lang="zh-Hans" href="chu-han.html?char=${encodeURIComponent(c.character)}" aria-label="Luyện viết chữ ${esc(c.character)}">${esc(c.character)}</a><div><p class="st-pinyin">${esc(c.pinyin || "Chưa có âm đọc")}</p>${c.hanViet ? `<p class="st-hanviet">${esc(c.hanViet)}</p>` : ""}<dl class="st-facts"><div><dt>Bộ thủ</dt><dd lang="zh-Hans">${esc(c.radical || "—")}</dd></div><div><dt>Số nét</dt><dd>${c.strokeCount || "—"}</dd></div></dl><p>${esc(c.meaningsVi?.slice(0, 2).join("; ") || "Chưa có nghĩa Việt trong kho.")}</p><a class="dc-text-button" href="chu-han.html?char=${encodeURIComponent(c.character)}">Thứ tự nét & luyện viết →</a></div></article>`).join("")}<p class="dc-note">Âm đọc của chữ đơn có thể khác khi nằm trong từ. Dữ liệu nét và bộ thủ từ Unicode; luyện viết mở trong công cụ Hán tự.</p></section>`;
}
export const entryCharacters = (entry) =>
  [...new Set([...entry.simplified].filter((c) => HAN.test(c)))].slice(0, 12);
export function grammarView(rows, query, all = false) {
  return `<section class="dc-panel"><h3>${all ? "Ngữ pháp trong học liệu công khai" : "Ngữ pháp liên quan"}</h3><p class="dc-note">Tra trong các bài học công khai đã có trên website. Cấp bên dưới là cấp bài học.</p>${rows.length ? rows.map((g) => `<article class="dc-example"><p class="st-eyebrow">Giáo trình HSK ${esc(g.curriculum.level)} · Bài ${g.curriculum.lessonNo}</p><h4>${esc(g.title)}</h4>${g.pattern ? `<div class="dc-grammar-pattern">${esc(g.pattern)}</div>` : ""}<p>${esc(g.explanation)}</p>${g.examples.map((x) => `<p class="st-example-zh" lang="zh-Hans">${highlighted(x, query)}</p>`).join("")}<a class="dc-text-button" href="${esc(g.curriculum.href)}">Mở bài học →</a></article>`).join("") : '<p class="dc-note">Chưa có điểm ngữ pháp khớp trong phần học liệu công khai. Thử tra “吗”, “是不是”, “比” hoặc xem danh mục bên dưới.</p>'}${!all ? '<button class="dc-text-button" type="button" data-all-grammar>Xem toàn bộ ngữ pháp hiện có →</button>' : ""}</section>`;
}
export function relatedView(entries, word) {
  return `<section class="dc-panel"><h3>Từ và cụm chứa “${esc(word)}”</h3><p class="dc-note">Các mục từ có chứa chuỗi chữ đang tra; đây chưa phải danh sách kết hợp từ được phân tích theo ngữ pháp.</p><div class="dc-related">${entries.length ? entries.map((e) => `<button type="button" data-query="${esc(e.simplified)}"><b lang="zh-Hans">${esc(e.simplified)}</b><span>${esc(e.pinyin)}<br>${esc(e.meaningsVi?.[0] || "Xem nghĩa")}</span></button>`).join("") : '<p class="dc-note">Chưa có mục từ dài hơn trong kho. Xem các câu ví dụ hoặc đối chiếu Hanzii để mở rộng cách dùng.</p>'}</div></section>`;
}
export const noSelection = () =>
  empty(
    "Chưa có mục từ phù hợp",
    "Thử từ ngắn hơn, bỏ bộ lọc HSK hoặc đổi sang mục Ngữ pháp. Bạn cũng có thể đối chiếu trực tiếp trên Hanzii.",
  );
