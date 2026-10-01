import { $, initShared, empty, toast } from "./ui.mjs";
import { dictionary, characters, reference, grammar } from "./repository.mjs";
import { savedWords, savedWordEntries } from "./storage.mjs";
import { rankEntry, escapeHtml as esc } from "./core.mjs";
import { lexiconManifest } from "./lexicon.mjs";
import {
  matchesLevel,
  readHistory,
  rememberQuery,
  searchGrammar,
} from "./reference-core.mjs";
import {
  modes,
  resultList,
  wordView,
  headerView,
  charactersView,
  entryCharacters,
  examplesView,
  grammarView,
  relatedView,
  noSelection,
} from "./dictionary-view.mjs";

const limit = 12;
let page = 0,
  searchGeneration = 0,
  detailGeneration = 0;
let rows = [],
  ids = [],
  selected = null,
  mode = "word",
  timer,
  composing = false;
let allGrammar = false;
let initializing = true;
const historyStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};
const query = () => $("#dictionarySearch").value.trim();
const level = () => $("#dictionaryLevel").value;
const cumulative = () => $("#cumulativeLevel").checked;
function historyView() {
  const history = readHistory(historyStorage);
  $("#dictionaryHistory").innerHTML = history.length
    ? history
        .map(
          (word) =>
            `<button type="button" data-query="${esc(word)}">${esc(word)}</button>`,
        )
        .join("")
    : '<p class="dc-note">Các từ bạn mở sẽ xuất hiện ở đây.</p>';
  $("#clearDictionaryHistory").disabled = !history.length;
}
function syncUrl(push = false) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({
    word: query(),
    level: level(),
    mode: mode === "word" ? "" : mode,
    entry: selected?.id || "",
    page: page ? String(page) : "",
    cumulative: cumulative() ? "1" : "",
    saved: $("#onlySavedWords").checked ? "1" : "",
  })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href)
    history[push ? "pushState" : "replaceState"]({}, "", url);
}
function setMode(next, { push = true } = {}) {
  mode = Object.hasOwn(modes, next) ? next : "word";
  allGrammar = false;
  document.querySelectorAll("[data-mode]").forEach((b) => {
    const active = b.dataset.mode === mode;
    b.setAttribute("aria-selected", String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $("#dictionaryDetail").setAttribute("aria-labelledby", "tab-" + mode);
  syncUrl(push);
  renderDetail();
}
async function renderDetail() {
  const current = ++detailGeneration,
    entry = selected,
    activeMode = mode;
  const target = $("#dictionaryContent");
  target.innerHTML =
    '<p class="dc-loading" role="status">Đang tải nội dung…</p>';
  $("#dictionaryDetail").setAttribute("aria-busy", "true");
  try {
    let html;
    if (activeMode === "grammar") {
      const all = await grammar();
      html = grammarView(
        allGrammar ? all : searchGrammar(all, query()),
        query(),
        allGrammar,
      );
    } else if (!entry) html = noSelection();
    else if (activeMode === "word")
      html = wordView(entry, ids.includes(entry.id));
    else {
      html = headerView(entry, ids.includes(entry.id));
      if (activeMode === "example")
        html += `<section class="dc-panel"><h3>Ví dụ với “${esc(entry.simplified)}”</h3><p class="dc-note">Cấp HSK gắn với từ đang tra, không gắn với toàn bộ câu ví dụ.</p>${examplesView(entry)}</section>`;
      if (activeMode === "character") {
        const chars = await Promise.all(
          entryCharacters(entry).map((c) => characters.get(c)),
        );
        html += charactersView(chars.filter(Boolean));
      }
      if (activeMode === "related") {
        const result = await dictionary.compounds(entry.simplified, {
          limit: 30,
        });
        html += relatedView(
          result.entries.filter((e) => e.id !== entry.id),
          entry.simplified,
        );
        if (result.warning)
          html += `<p class="st-notice">${esc(result.warning)}</p>`;
      }
    }
    if (current === detailGeneration)
      target.innerHTML =
        `<div class="dc-detail-head"><h2>${esc(modes[activeMode])}</h2><span>${entry ? esc(entry.simplified) : ""}</span></div>` +
        html;
  } catch (error) {
    if (current === detailGeneration)
      target.innerHTML =
        empty("Chưa tải được nội dung", error.message) +
        '<button class="st-button dc-retry" data-retry-detail>Thử lại</button>';
  } finally {
    if (current === detailGeneration)
      $("#dictionaryDetail").removeAttribute("aria-busy");
  }
}
async function search({ push = false, preferredId = null } = {}) {
  const current = ++searchGeneration;
  ++detailGeneration;
  $("#dictionaryCount").textContent = "Đang tra…";
  $("#dictionaryResults").setAttribute("aria-busy", "true");
  $("#dictionaryContent").innerHTML =
    '<p class="dc-loading" role="status">Đang tra kho từ…</p>';
  const q = query(),
    filterLevel = level(),
    inclusive = cumulative();
  $("#hanziiReference").href = q
    ? `https://hanzii.net/search/word/${encodeURIComponent(q)}?hl=vi`
    : "https://hanzii.net/?hl=vi";
  try {
    ids = await savedWords();
    let result;
    if ($("#onlySavedWords").checked) {
      const snapshots = await savedWordEntries();
      const fresh = await dictionary.entries(ids);
      const byId = new Map(fresh.map((e) => [e.id, e]));
      for (const e of snapshots)
        if (!byId.has(e.id) && ids.includes(e.id)) byId.set(e.id, e);
      const matches = [...byId.values()]
        .filter(
          (e) =>
            (!q || rankEntry(e, q) > 0) &&
            matchesLevel(e, filterLevel, inclusive),
        )
        .sort((a, b) => rankEntry(b, q) - rankEntry(a, q));
      result = {
        entries: matches.slice(page * limit, (page + 1) * limit),
        total: matches.length,
      };
    } else
      result = await dictionary.search(q, {
        page,
        limit,
        level: filterLevel,
        cumulative: inclusive,
      });
    if (current !== searchGeneration) return;
    if (page && page * limit >= result.total) {
      page = 0;
      return search({ push });
    }
    rows = result.entries;
    selected = rows.find((e) => e.id === preferredId) || rows[0] || null;
    $("#dictionaryHeading").textContent = $("#onlySavedWords").checked
      ? "Sổ từ đã lưu"
      : filterLevel
        ? `Từ vựng HSK ${filterLevel}${inclusive ? " trở xuống" : ""}`
        : "Kết quả tra cứu";
    $("#dictionaryCount").textContent =
      result.total.toLocaleString("vi-VN") + " kết quả";
    $("#toggleDictionaryShelf").textContent = [
      filterLevel
        ? `HSK ${filterLevel}${inclusive ? " trở xuống" : ""}`
        : "Bộ lọc HSK",
      $("#onlySavedWords").checked ? "đang xem từ đã lưu" : "sổ từ",
    ].join(" · ");
    $("#dictionaryResults").innerHTML = rows.length
      ? resultList(rows, selected.id)
      : '<p class="dc-loading">Không có kết quả. Thử xóa tìm kiếm hoặc bỏ bộ lọc.</p>';
    $("#dictionaryWarning").hidden = !result.warning;
    $("#dictionaryWarning").textContent = result.warning || "";
    $("#savedWordsCount").textContent = String(ids.length);
    $("#dictionaryPagination").innerHTML =
      result.total > limit
        ? `<button type="button" data-page="${page - 1}" class="st-button" aria-label="Trang trước" ${!page ? "disabled" : ""}>←</button><span>${page + 1} / ${Math.ceil(result.total / limit)}</span><button type="button" data-page="${page + 1}" class="st-button" aria-label="Trang sau" ${(page + 1) * limit >= result.total ? "disabled" : ""}>→</button>`
        : "";
    document
      .querySelectorAll("[data-level]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.level === filterLevel)),
      );
    syncUrl(push);
    await renderDetail();
  } catch (error) {
    if (current !== searchGeneration) return;
    rows = [];
    selected = null;
    $("#dictionaryCount").textContent = "Chưa tải được kết quả";
    $("#dictionaryResults").innerHTML =
      '<button type="button" class="st-button dc-retry" data-retry-search>Thử lại</button>';
    $("#dictionaryPagination").innerHTML = "";
    $("#dictionaryContent").innerHTML = empty(
      "Chưa tra được từ",
      error.message,
    );
  } finally {
    if (current === searchGeneration)
      $("#dictionaryResults").removeAttribute("aria-busy");
  }
}
function submitQuery(value) {
  clearTimeout(timer);
  page = 0;
  allGrammar = false;
  $("#dictionarySearch").value = value;
  rememberQuery(historyStorage, value);
  historyView();
  search({ push: true });
}
$("#dictionaryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submitQuery(query());
});
$("#dictionarySearch").addEventListener("compositionstart", () => {
  composing = true;
  clearTimeout(timer);
});
$("#dictionarySearch").addEventListener("compositionend", () => {
  composing = false;
  scheduleSearch();
});
function scheduleSearch() {
  clearTimeout(timer);
  ++searchGeneration;
  ++detailGeneration;
  page = 0;
  allGrammar = false;
  if (!composing) timer = setTimeout(() => search(), 300);
}
$("#dictionarySearch").addEventListener("input", scheduleSearch);
$("#clearDictionarySearch").addEventListener("click", () => {
  submitQuery("");
  $("#dictionarySearch").focus();
});
$("#toggleDictionaryShelf").addEventListener("click", () => {
  const open = $("#dictionaryShelf").classList.toggle("is-open");
  $("#toggleDictionaryShelf").setAttribute("aria-expanded", String(open));
});
for (const id of ["dictionaryLevel", "cumulativeLevel", "onlySavedWords"])
  $("#" + id).addEventListener("change", () => {
    clearTimeout(timer);
    page = 0;
    search({ push: true });
  });
$("#dictionaryResults").addEventListener("click", (e) => {
  const b = e.target.closest("[data-entry-id]");
  if (!b) return;
  selected = rows.find((row) => row.id === b.dataset.entryId);
  if (!selected) return;
  rememberQuery(historyStorage, selected.simplified);
  historyView();
  syncUrl(true);
  document
    .querySelectorAll("[data-entry-id]")
    .forEach((button) =>
      button.setAttribute(
        "aria-current",
        String(button.dataset.entryId === selected.id),
      ),
    );
  renderDetail();
  if (matchMedia("(max-width:700px)").matches)
    $("#dictionaryDetail").scrollIntoView({ block: "start" });
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.query !== undefined) {
    $("#dictionaryLevel").value = "";
    $("#onlySavedWords").checked = false;
    submitQuery(b.dataset.query);
  }
  if (b.dataset.mode) setMode(b.dataset.mode);
  if (b.dataset.showMode) {
    setMode(b.dataset.showMode);
    $("#tab-" + mode).focus();
  }
  if (b.dataset.level) {
    $("#dictionaryLevel").value = b.dataset.level;
    $("#onlySavedWords").checked = false;
    submitQuery("");
  }
  if (b.dataset.page) {
    page = Number(b.dataset.page);
    search({ push: true });
  }
  if (b.hasAttribute("data-all-grammar")) {
    allGrammar = true;
    renderDetail();
  }
  if (b.hasAttribute("data-retry-detail")) renderDetail();
  if (b.hasAttribute("data-retry-search")) search();
});
$(".dc-tabs").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll("[data-mode]")];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0 || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
    return;
  e.preventDefault();
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].focus();
  setMode(tabs[next].dataset.mode);
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.target.closest("input,textarea,select,[contenteditable],dialog")
  ) {
    e.preventDefault();
    $("#dictionarySearch").focus();
  }
});
$("#clearDictionaryHistory").addEventListener("click", () => {
  try {
    localStorage.removeItem("hnh_dictionary_history");
    historyView();
  } catch {
    toast("Thiết bị chưa cho phép thay đổi lịch sử.");
  }
});
window.addEventListener("study:saved", async () => {
  ids = await savedWords().catch(() => ids);
  $("#savedWordsCount").textContent = String(ids.length);
  if ($("#onlySavedWords").checked) search({ preferredId: selected?.id });
});
window.addEventListener("study:auth", (event) => {
  if (initializing) return;
  if (event.detail?.userId === event.detail?.previousUser) return;
  page = 0;
  search();
});
function restoreUrl() {
  const params = new URL(location.href).searchParams;
  $("#dictionarySearch").value =
    params.get("word") || (params.size ? "" : "学习");
  $("#dictionaryLevel").value = /^[1-6]$/.test(params.get("level"))
    ? params.get("level")
    : "";
  $("#cumulativeLevel").checked = params.get("cumulative") === "1";
  $("#onlySavedWords").checked = params.get("saved") === "1";
  page = Math.max(0, Math.min(10000, parseInt(params.get("page")) || 0));
  mode = Object.hasOwn(modes, params.get("mode")) ? params.get("mode") : "word";
  document.querySelectorAll("[data-mode]").forEach((b) => {
    const active = b.dataset.mode === mode;
    b.setAttribute("aria-selected", String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $("#dictionaryDetail").setAttribute("aria-labelledby", "tab-" + mode);
  allGrammar = false;
  return params.get("entry");
}
window.addEventListener("popstate", () => {
  clearTimeout(timer);
  search({ preferredId: restoreUrl() });
});
const preferredId = restoreUrl();
historyView();
await initShared({ serviceNotice: false });
initializing = false;
Promise.all([reference(), lexiconManifest()])
  .then(([extra, { counts }]) => {
    $("#dictionaryCoverage").textContent =
      `${counts.words.toLocaleString("vi-VN")} mục từ nguồn mở · ${extra.entries.length.toLocaleString("vi-VN")} từ có nhãn HSK 2.0`;
    $("#dictionaryLevels").innerHTML = Object.entries(extra.counts)
      .map(
        ([n, count]) =>
          `<button type="button" data-level="${n}" aria-pressed="${level() === n}">HSK ${n}<small>${count.toLocaleString("vi-VN")} từ</small></button>`,
      )
      .join("");
  })
  .catch(() => {
    $("#dictionaryCoverage").textContent =
      "Kho từ giáo trình · đang dùng dữ liệu tải được";
  });
await search({ preferredId });
