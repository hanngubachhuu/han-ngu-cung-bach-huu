import { $, initShared, entryCard, empty, toast } from "./ui.mjs";
import { dictionary } from "./repository.mjs";
import { savedWords, savedWordEntries } from "./storage.mjs";
import { HandwritingCanvas } from "./handwriting.mjs";
import { api } from "./auth.mjs";
import { wordId, rankEntry } from "./core.mjs";
let page = 0,
  seq = 0,
  ids = [];
const limit = 12;
let searchTimer;
$("#dictionarySearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  seq++;
  page = 0;
  searchTimer = setTimeout(search, 250);
});
async function search(push = true) {
  const current = ++seq,
    query = $("#dictionarySearch").value.trim();
  $("#dictionaryCount").textContent = "Đang tra…";
  $("#dictionaryResults").setAttribute("aria-busy", "true");
  $("#dictionaryAi").hidden = true;
  if (push) {
    const url = new URL(location.href);
    query
      ? url.searchParams.set("word", query)
      : url.searchParams.delete("word");
    history.replaceState({}, "", url);
  }
  try {
    ids = await savedWords();
    let result;
    if ($("#onlySavedWords").checked) {
      const snapshots = await savedWordEntries(),
        found = new Set(snapshots.map((e) => e.id));
      const missing = await Promise.all(
        ids.filter((id) => !found.has(id)).map((id) => dictionary.get(id)),
      );
      const matches = [...snapshots, ...missing.filter(Boolean)]
        .filter((e) => !query || rankEntry(e, query) > 0)
        .sort((a, b) => rankEntry(b, query) - rankEntry(a, query));
      result = {
        entries: matches.slice(page * limit, (page + 1) * limit),
        total: matches.length,
      };
    } else result = await dictionary.search(query, { page, limit });
    if (current !== seq) return;
    $("#dictionaryHeading").textContent = query
      ? "Kết quả cho “" + query + "”"
      : $("#onlySavedWords").checked
        ? "Sổ từ của bạn"
        : "Từ vựng trong giáo trình";
    $("#dictionaryCount").textContent = result.total + " kết quả";
    $("#savedWordsCount").textContent = ids.length + " từ đã lưu";
    $("#dictionaryResults").innerHTML = result.entries.length
      ? result.entries
          .map((e) => entryCard(e, { saved: ids.includes(e.id) }))
          .join("")
      : empty(
          "Chưa tìm thấy từ phù hợp",
          "Thử chữ Hán, pinyin không dấu hoặc một nghĩa tiếng Việt ngắn hơn.",
        );
    $("#dictionaryAi").hidden = !query || $("#onlySavedWords").checked;
    $("#dictionaryPagination").innerHTML =
      result.total > limit
        ? `<button data-page="${page - 1}" class="st-button" ${!page ? "disabled" : ""}>← Trước</button><span>Trang ${page + 1} / ${Math.ceil(result.total / limit)}</span><button data-page="${page + 1}" class="st-button" ${(page + 1) * limit >= result.total ? "disabled" : ""}>Sau →</button>`
        : "";
  } catch (e) {
    if (current === seq) {
      $("#dictionaryResults").innerHTML = empty("Chưa tra được từ", e.message);
      $("#dictionaryCount").textContent = "";
    }
  } finally {
    if (current === seq) $("#dictionaryResults").removeAttribute("aria-busy");
  }
}
$("#dictionaryForm").onsubmit = (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  page = 0;
  search();
};
$("#onlySavedWords").onchange = () => {
  page = 0;
  search();
};
document.querySelectorAll("[data-query]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#dictionarySearch").value = b.dataset.query;
      page = 0;
      search();
    }),
);
$("#dictionaryPagination").onclick = (e) => {
  const b = e.target.closest("[data-page]");
  if (b) {
    page = Number(b.dataset.page);
    search();
    $("#dictionaryHeading").scrollIntoView({ block: "start" });
  }
};
$("#openDictionaryInk").onclick = () => $("#inkDialog").showModal();
new HandwritingCanvas($("#dictionaryInk"), {
  onSelect: (char) => {
    $("#dictionarySearch").value = char;
    $("#inkDialog").close();
    page = 0;
    search();
  },
});
$("#dictionaryAiButton").onclick = async (e) => {
  const query = $("#dictionarySearch").value.trim(),
    current = seq;
  e.target.disabled = true;
  try {
    const data = await api("dictionary", { query });
    if (current !== seq) return;
    const entry = {
      ...data.entry,
      id: wordId(data.entry.simplified),
      curriculumTags: [],
      hskLevel: null,
      hanViet: null,
      provenance: { source: "openai" },
    };
    $("#dictionaryResults").insertAdjacentHTML("beforeend", entryCard(entry));
    $("#dictionaryAi").hidden = true;
    toast("Đã thêm giải thích AI. Hãy đối chiếu nghĩa và ví dụ.");
  } catch (error) {
    toast(error.message);
  } finally {
    e.target.disabled = false;
  }
};
window.addEventListener("study:saved", async () => {
  ids = await savedWords().catch(() => []);
  $("#savedWordsCount").textContent = ids.length + " từ đã lưu";
  if ($("#onlySavedWords").checked) search(false);
});
window.addEventListener("study:auth", () => {
  page = 0;
  search(false);
});
await initShared();
$("#dictionarySearch").value =
  new URL(location.href).searchParams.get("word") || "";
await search(false);
