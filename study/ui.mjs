import { escapeHtml as esc } from "./core.mjs";
import { aiEnabled, getClient, getSession, loadCapabilities } from "./auth.mjs";
import { savedWords, toggleWord } from "./storage.mjs";
import { dictionary } from "./repository.mjs";
export const $ = (s) => document.querySelector(s);
export const icons = {
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
  audio:
    '<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  pen: '<path d="m15 4 5 5M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/>',
  book: '<path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>',
};
export const icon = (name) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  (icons[name] || icons.book) +
  "</svg>";
export function toast(message) {
  const el = $("#studyStatus");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 6000);
}
export function empty(title, copy) {
  return (
    '<div class="st-empty"><span class="st-empty-mark" aria-hidden="true">知</span><h3>' +
    esc(title) +
    "</h3><p>" +
    esc(copy) +
    "</p></div>"
  );
}
export function levelLabel(e) {
  const tags = e.curriculumTags || [];
  return tags.length
    ? "Giáo trình HSK " + [...new Set(tags.map((t) => t.level))].join(" · ")
    : "Chưa phân loại HSK";
}
const displayedEntries = new Map();
export function entryCard(e, { compact = false, saved = false } = {}) {
  displayedEntries.set(e.id, e);
  return `<article class="st-word-card ${compact ? "is-compact" : ""}" data-entry="${esc(e.id)}">
    <div class="st-word-head"><div><p class="st-pinyin">${esc(e.pinyin || "")}</p><div class="st-word-title"><a class="st-hanzi" lang="zh-Hans" href="tu-dien.html?word=${encodeURIComponent(e.simplified)}">${esc(e.simplified)}</a>${e.traditional && e.traditional !== e.simplified ? `<span class="st-traditional" lang="zh-Hant">${esc(e.traditional)}</span>` : ""}<button class="st-icon" data-speak="${esc(e.simplified)}" aria-label="Nghe ${esc(e.simplified)}">${icon("audio")}</button></div></div><button class="st-icon st-save" data-save="${esc(e.id)}" aria-label="Lưu từ ${esc(e.simplified)}" aria-pressed="${saved}">${icon("save")}</button></div>
    <div class="st-meta"><span>${esc(levelLabel(e))}</span>${e.partOfSpeech?.length ? `<span>${esc(e.partOfSpeech.join(" · "))}</span>` : ""}${e.hanViet ? `<span class="st-hanviet">${esc(e.hanViet)}</span>` : ""}</div>
    <ol class="st-meanings">${(e.meaningsVi || []).map((m) => `<li>${esc(m)}</li>`).join("")}</ol>
    ${e.classifiers?.length ? `<p class="st-caption">Lượng từ: ${esc(e.classifiers.join(" · "))}</p>` : ""}
    ${
      compact
        ? ""
        : `<div class="st-char-links"><span>Xem từng chữ</span>${[...new Set([...e.simplified])].map((c) => `<a lang="zh-Hans" href="chu-han.html?char=${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}</div>
    ${(e.examples || [])
      .slice(0, 3)
      .map(
        (x) =>
          `<div class="st-example"><button class="st-icon" data-speak="${esc(x.chinese)}" aria-label="Nghe câu ví dụ">${icon("audio")}</button><div><p class="st-example-zh" lang="zh-Hans">${esc(
            x.chinese,
          )
            .split(esc(e.simplified))
            .join(
              "<mark>" + esc(e.simplified) + "</mark>",
            )}</p>${x.pinyin ? `<p class="st-pinyin">${esc(x.pinyin)}</p>` : ""}${x.vietnamese ? `<p>${esc(x.vietnamese)}</p>` : ""}</div></div>`,
      )
      .join("")}
    ${e.detail?.usageNotes?.length ? `<details class="st-details"><summary>Cách dùng và lưu ý</summary><ul>${e.detail.usageNotes.map((n) => "<li>" + esc(n) + "</li>").join("")}</ul>${(e.detail.commonConfusions || []).map((c) => `<p><b>${esc(c.with)}</b> — ${esc(c.difference)}</p>`).join("")}</details>` : ""}
    <div class="st-source">${e.provenance?.source === "openai" ? "Gợi ý AI · cần đối chiếu khi sử dụng" : `Nguồn: ${(e.curriculumTags || []).map((t) => `<a href="${esc(t.href)}">HSK ${esc(t.level)} · Bài ${t.lessonNo}</a>`).join(", ") || "Dữ liệu bổ sung"}`}</div>`
    }
  </article>`;
}
let speechGeneration = 0;
export function stopSpeech() {
  speechGeneration++;
  globalThis.speechSynthesis?.cancel();
  window.dispatchEvent(new Event("study:speech-stop"));
}
export async function speak(text, { rate = 1, onStart, onEnd, onError } = {}) {
  stopSpeech();
  const generation = speechGeneration;
  if (!globalThis.speechSynthesis) {
    const e = Error("Trình duyệt này chưa hỗ trợ đọc văn bản.");
    onError?.(e);
    toast(e.message);
    return;
  }
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1200);
      speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    voices = speechSynthesis.getVoices();
  }
  if (generation !== speechGeneration) return;
  const voice =
    voices.find((v) => /^zh[-_]CN$/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang));
  if (!voice) {
    const e = Error(
      "Thiết bị chưa có giọng tiếng Trung. " +
        (aiEnabled
          ? "Bạn có thể dùng nút Giọng AI trong bài đọc."
          : "Hãy cài giọng tiếng Trung trong phần ngôn ngữ của thiết bị để nghe."),
    );
    onError?.(e);
    toast(e.message);
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang;
  u.voice = voice;
  u.rate = rate;
  u.onstart = () => generation === speechGeneration && onStart?.();
  u.onend = () => generation === speechGeneration && onEnd?.();
  u.onerror = (e) => {
    if (generation !== speechGeneration) return;
    onError?.(e);
    toast("Chưa phát được âm thanh. Hãy thử lại.");
  };
  speechSynthesis.speak(u);
}
let wordGeneration = 0;
export async function showWord(id) {
  const generation = ++wordGeneration;
  const dialog = $("#wordDialog");
  dialog.querySelector(".st-dialog-body").innerHTML =
    '<p role="status">Đang tra từ…</p>';
  dialog.showModal();
  try {
    const [e, ids] = await Promise.all([dictionary.get(id), savedWords()]);
    if (!dialog.open || generation !== wordGeneration) return;
    dialog.querySelector(".st-dialog-body").innerHTML = e
      ? entryCard(e, { saved: ids.includes(id) })
      : empty(
          "Chưa có mục từ",
          "Thử tra từng chữ hoặc tra bổ sung trong Từ điển.",
        );
  } catch (error) {
    if (dialog.open && generation === wordGeneration)
      dialog.querySelector(".st-dialog-body").innerHTML = empty(
        "Chưa tra được từ",
        error.message,
      );
  }
}
export async function initShared() {
  loadCapabilities().then(({ aiEnabled }) => {
    for (const id of ["dictionaryAiButton", "readingUseAi", "aiVoice"]) {
      const control = document.getElementById(id);
      if (control) {
        control.disabled = !aiEnabled;
        if (!aiEnabled) control.title = "AI tạm chưa bật";
      }
    }
    if (!aiEnabled) {
      const note = document.createElement("p");
      note.className = "st-service-note";
      note.textContent =
        "AI tạm chưa bật: nhận dạng chữ viết tay, dịch tự động và tạo câu hỏi. Kho từ, luyện nét và bài mẫu vẫn dùng được.";
      document
        .querySelector(".st-tool-nav")
        .insertAdjacentElement("afterend", note);
    }
  });
  document
    .querySelectorAll("[data-icon]")
    .forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || !button.matches("[data-speak], [data-save], [data-close]"))
      return;
    try {
      if (button.dataset.speak) await speak(button.dataset.speak);
      if (button.dataset.save) {
        button.disabled = true;
        const saved = await toggleWord(
          button.dataset.save,
          displayedEntries.get(button.dataset.save),
        );
        document.querySelectorAll("[data-save]").forEach((b) => {
          if (b.dataset.save === button.dataset.save)
            b.setAttribute("aria-pressed", String(saved));
        });
        toast(saved ? "Đã lưu vào sổ từ." : "Đã bỏ lưu từ.");
      }
      if (button.dataset.close)
        document.getElementById(button.dataset.close).close();
    } catch (e) {
      toast(e.message);
    } finally {
      if (button.dataset.save) button.disabled = false;
    }
  });
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  const auth = $("#authDialog"),
    account = $("#accountButton");
  $("#wordDialog")?.addEventListener("close", () => {
    wordGeneration++;
  });
  auth.addEventListener("close", () => {
    $("#authPassword").value = "";
  });
  account.addEventListener("click", () => auth.showModal());
  const client = await getClient().catch(() => null);
  if (!client) {
    $("#authStatus").textContent =
      "Không kết nối được tài khoản. Bạn vẫn có thể học bằng dữ liệu công khai.";
    return;
  }
  let previousUser = null;
  function update(session) {
    account.textContent = session ? "Tài khoản" : "Đăng nhập";
    $("#authForm").hidden = !!session;
    $("#authSignedIn").hidden = !session;
    $("#authEmailDisplay").textContent = session?.user.email || "";
    const userId = session?.user.id || null;
    if (userId !== previousUser) {
      wordGeneration++;
      $("#wordDialog")?.close();
      displayedEntries.clear();
      stopSpeech();
    }
    window.dispatchEvent(
      new CustomEvent("study:auth", {
        detail: { signedIn: !!session, userId, previousUser },
      }),
    );
    previousUser = userId;
  }
  update(await getSession().catch(() => null));
  client.auth.onAuthStateChange((_event, session) => update(session));
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = e.submitter || $("#authForm button[type=submit]");
    submit.disabled = true;
    $("#authStatus").textContent = "Đang đăng nhập…";
    try {
      const { error } = await client.auth.signInWithPassword({
        email: $("#authEmail").value.trim(),
        password: $("#authPassword").value,
      });
      if (error) throw error;
      auth.close();
      $("#authStatus").textContent = "";
      toast("Đã đăng nhập. Sổ từ và bài đọc được lưu vào tài khoản.");
    } catch {
      $("#authStatus").textContent =
        "Chưa đăng nhập được. Kiểm tra email, mật khẩu và kết nối.";
    } finally {
      submit.disabled = false;
    }
  });
  $("#authSignup").addEventListener("click", async (e) => {
    if (!$("#authForm").reportValidity()) return;
    e.target.disabled = true;
    try {
      const { data, error } = await client.auth.signUp({
        email: $("#authEmail").value.trim(),
        password: $("#authPassword").value,
        options: {
          emailRedirectTo: new URL("tu-dien.html", location.href).href,
        },
      });
      if (error) throw error;
      $("#authStatus").textContent = data.session
        ? "Đã tạo tài khoản."
        : "Hãy mở email xác nhận để hoàn tất đăng ký.";
    } catch {
      $("#authStatus").textContent =
        "Chưa tạo được tài khoản. Hãy thử lại sau.";
    } finally {
      e.target.disabled = false;
    }
  });
  $("#authSignout").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      auth.close();
      stopSpeech();
      toast("Đã đăng xuất.");
    } catch {
      toast("Chưa đăng xuất được. Hãy kiểm tra kết nối và thử lại.");
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("pagehide", stopSpeech);
}
