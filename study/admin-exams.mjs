import { escapeHtml as esc } from "./core.mjs";
import {
  examLevels,
  importedExam,
  mergeExamCatalog,
} from "./admin-exam-core.mjs";
import { adminExamCommand, hskkAdminRequest } from "./admin-exam-service.mjs";
import { mountExamEditor } from "./admin-exam-editor.mjs";
import { readExamFile } from "./exam-import-ui.mjs";

// Exam catalog is independent of the lesson bank. No legacy lesson definition is seeded here.
export function mountExamWorkspace(root, profile) {
  let alive = true,
    generation = 0,
    openGeneration = 0,
    entries = [],
    selectedType,
    selectedLevel;
  const panels = new Map();
  const ownerId = profile.user_id;
  root.classList.add("assignment-workspace");
  root.innerHTML = `<header class="admin-module-header"><h2>Đề thi</h2><button class="st-button primary" data-create-exam>+ Tạo đề mới</button></header><section data-exam-catalog><div class="admin-exam-types">${["HSK", "HSKK"].map((t) => `<button class="account-card" data-exam-type="${t}"><strong>Đề thi ${t}</strong><span>${t === "HSK" ? "HSK 1–6" : "Sơ cấp · Trung cấp · Cao cấp"}</span></button>`).join("")}</div><div data-exam-levels class="account-actions"></div><p data-catalog-status role="status"></p><div data-exam-list class="admin-exam-list"></div></section><section data-create-panel hidden></section><section data-editors hidden></section>`;
  const catalog = root.querySelector("[data-exam-catalog]"),
    creation = root.querySelector("[data-create-panel]"),
    editors = root.querySelector("[data-editors]");
  const status = (message) => {
    if (alive)
      root.querySelector("[data-catalog-status]").textContent = message;
  };
  function route(exam = "", create = false, push = true) {
    const url = new URL(location.href);
    url.searchParams.set("section", "exams");
    for (const [key, value] of Object.entries({
      type: selectedType,
      level: selectedLevel,
      exam,
      create: create ? "1" : "",
    })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (push) history.pushState({}, "", url);
  }
  function pauseEditors() {
    for (const p of panels.values()) p.dispose?.pause?.();
  }
  function showList(push = true) {
    openGeneration++;
    pauseEditors();
    catalog.hidden = false;
    creation.hidden = true;
    editors.hidden = true;
    root.querySelector("[data-create-exam]").hidden = false;
    if (push) route();
    list();
  }
  function select(type, level, push = true) {
    selectedType = examLevels[type] ? type : "HSK";
    selectedLevel = examLevels[selectedType].some(
      (l) => l.value === String(level),
    )
      ? String(level)
      : examLevels[selectedType][0].value;
    root.querySelector("[data-exam-levels]").innerHTML = examLevels[
      selectedType
    ]
      .map(
        (l) =>
          `<button class="st-button" data-level="${l.value}" aria-pressed="${l.value === selectedLevel}">${l.label}</button>`,
      )
      .join("");
    for (const b of root.querySelectorAll("[data-level]"))
      b.onclick = () => select(selectedType, b.dataset.level);
    for (const b of root.querySelectorAll("[data-exam-type]"))
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.examType === selectedType),
      );
    showList(push);
  }
  function list() {
    const values = entries.filter(
      (e) => e.type === selectedType && String(e.level) === selectedLevel,
    );
    root.querySelector("[data-exam-list]").innerHTML = values.length
      ? values
          .map(
            (e) =>
              `<article class="account-card"><p class="st-eyebrow">${esc(e.code || examLevels[e.type].find((l) => l.value === String(e.level))?.label)}</p><h3>${esc(e.title)}</h3><p>${e.question_count} câu · ${e.active ? "Đang hoạt động" : e.source_review ? "Chưa xuất bản" : "Chưa hoạt động"}</p>${e.type === "HSKK" ? `<p>Audio nguồn: ${esc(e.audio_source_name || "Chưa có")}</p><p>${e.audio ? `${e.audio.confirmed}/${e.audio.total} câu đã xác nhận · ${e.audio.needs_review} câu cần kiểm tra` : "Chưa xác nhận audio"}</p>` : ""}<p class="st-help">Cập nhật: ${e.updated_at ? new Date(e.updated_at).toLocaleString("vi-VN") : "—"}</p><button class="st-button" data-edit-exam="${esc(e.id)}">Sửa đề</button></article>`,
          )
          .join("")
      : `<div class="admin-empty"><h3>${esc(examLevels[selectedType]?.find((l) => l.value === selectedLevel)?.label || "Đề thi")}</h3><p>Chưa có đề thi ở cấp độ này.</p></div>`;
    for (const b of root.querySelectorAll("[data-edit-exam]"))
      b.onclick = () => void open(b.dataset.editExam);
  }
  async function load() {
    const n = ++generation;
    status("Đang tải danh sách đề…");
    const [registered, sources] = await Promise.allSettled([
      adminExamCommand("list", {}, ownerId),
      hskkAdminRequest("catalog", "catalog", { ownerId }),
    ]);
    if (!alive || n !== generation) return;
    entries = mergeExamCatalog(
      registered.status === "fulfilled" ? registered.value : [],
      sources.status === "fulfilled" ? sources.value : [],
    );
    list();
    status(
      registered.status === "rejected"
        ? "Chưa tải được danh sách đề đã lưu. Bạn vẫn có thể mở đề HSKK từ nguồn và kiểm tra nội dung."
        : sources.status === "rejected"
          ? "Chưa tải được danh sách đề HSKK từ nguồn. Kiểm tra kết nối rồi thử lại."
          : "",
    );
  }
  async function open(id, push = true, supplied = null) {
    const opening = ++openGeneration;
    pauseEditors();
    const entry = supplied || entries.find((e) => e.id === id);
    let panel = panels.get(id);
    if (panel?.failed) {
      panel.node.remove();
      panels.delete(id);
      panel = null;
    }
    if (!panel) {
      const node = document.createElement("section");
      node.innerHTML =
        '<div class="account-actions"><button class="st-button" data-back-list>← Quay lại danh sách</button><button class="st-button" data-back-exams>← Quay lại Đề thi HSK / HSKK</button></div><section data-editor></section>';
      editors.append(node);
      panel = { node };
      panels.set(id, panel);
      node.querySelector("[data-back-list]").onclick = () => showList();
      node.querySelector("[data-back-exams]").onclick = () => {
        showList();
        root.querySelector("[data-exam-type]").focus();
      };
      node.querySelector("[data-back-list]").textContent =
        `← Quay lại danh sách ${entry?.type || selectedType}`;
      const content = node.querySelector("[data-editor]");
      content.textContent = "Đang mở đề…";
      if (entry?.source_review) {
        const { mountHSKKAdmin } = await import("./hskk-admin.mjs");
        if (!alive) return;
        panel.dispose = mountHSKKAdmin(content, {
          profile,
          code: id,
          onSaved: () => void load(),
        });
      } else {
        try {
          const model =
            supplied || (await adminExamCommand("get", { id }, ownerId)).exam;
          if (!alive) return;
          if (!model) throw Error();
          const editor = mountExamEditor(content, {
            model,
            audioStatus: () =>
              model.type === "HSKK"
                ? {
                    ready: false,
                    message:
                      "Audio cần được xác nhận và đề cần được kết nối với phiên thi chính thức.",
                  }
                : null,
            publish: (body) => adminExamCommand("publish", body, ownerId),
            onPublished: () => void load(),
          });
          panel.dispose = () => editor.dispose();
        } catch {
          panel.failed = true;
          content.textContent =
            "Chưa mở được đề. Nội dung đang lưu được giữ; kiểm tra kết nối rồi thử lại.";
        }
      }
    }
    if (!alive || opening !== openGeneration) return;
    for (const p of panels.values()) p.node.hidden = p !== panel;
    catalog.hidden = creation.hidden = true;
    editors.hidden = false;
    root.querySelector("[data-create-exam]").hidden = true;
    if (push) route(id);
  }
  function create(push = true) {
    pauseEditors();
    catalog.hidden = editors.hidden = true;
    creation.hidden = false;
    root.querySelector("[data-create-exam]").hidden = true;
    if (push) route("", true);
    if (creation.children.length) return;
    creation.innerHTML = `<button class="st-button" data-back-create>← Quay lại Đề thi</button><h3>Tạo đề mới</h3><form data-create-form class="admin-create-form"><label>Loại đề<select name="type"><option value="HSK">HSK</option><option value="HSKK">HSKK</option></select></label><label>Cấp độ<select name="level"></select></label><label>Tên đề<input name="title" required maxlength="200"></label><label>Tệp đề<input name="file" type="file" accept=".pdf,.docx" required></label><p class="st-help">PDF có thể chọn chữ hoặc Word (.docx), tối đa 3 MiB.</p><button class="st-button primary" type="submit">Tạo đề</button><p data-create-status role="status"></p></form>`;
    creation.querySelector("[data-back-create]").onclick = () => showList();
    const form = creation.querySelector("form");
    const options = () => {
      form.elements.level.innerHTML = examLevels[form.elements.type.value]
        .map((l) => `<option value="${l.value}">${l.label}</option>`)
        .join("");
    };
    form.elements.type.value = selectedType || "HSK";
    options();
    if (selectedLevel) form.elements.level.value = selectedLevel;
    form.elements.type.onchange = options;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const b = form.querySelector("button[type=submit]"),
        feedback = form.querySelector("[data-create-status]");
      if (b.disabled) return;
      b.disabled = true;
      feedback.textContent = "Đang đọc đề…";
      try {
        const file = form.elements.file.files[0],
          document = await readExamFile(file, ownerId);
        const sha256 = [
          ...new Uint8Array(
            await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
          ),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (!alive) return;
        const model = importedExam(document, {
          type: form.elements.type.value,
          level: form.elements.level.value,
          title: form.elements.title.value,
          filename: file.name,
          sha256,
        });
        if (!model.questions.length) throw Error("NO_QUESTIONS");
        select(model.type, model.level, false);
        await open(model.id, true, model);
      } catch (e) {
        feedback.textContent =
          {
            DOCUMENT_SCAN_UNSUPPORTED:
              "PDF này là bản scan. Dùng Word hoặc PDF có thể chọn chữ để đọc nội dung.",
            DOCUMENT_UNSUPPORTED: "Chọn PDF hoặc Word (.docx).",
            DOCUMENT_TOO_LARGE: "File vượt quá 3 MiB.",
            NO_QUESTIONS:
              "Chưa nhận diện được câu hỏi. Kiểm tra đánh số câu trong file.",
          }[e.message] || "Chưa đọc được đề. Giữ file gốc và thử lại.";
      } finally {
        b.disabled = false;
      }
    };
  }
  for (const b of root.querySelectorAll("[data-exam-type]"))
    b.onclick = () => select(b.dataset.examType);
  root.querySelector("[data-create-exam]").onclick = () => create();
  function restore() {
    const p = new URLSearchParams(location.search);
    if (p.get("section") !== "exams" && p.get("module") !== "hskk") return;
    select(
      p.get("type") || (p.get("module") === "hskk" ? "HSKK" : "HSK"),
      p.get("level"),
      false,
    );
    if (p.get("create")) create(false);
    else if (p.get("exam")) void open(p.get("exam"), false);
  }
  const pause = (e) => {
    if (e.detail !== "exams") pauseEditors();
  };
  window.addEventListener("popstate", restore);
  document
    .querySelector("#adminWorkspace")
    ?.addEventListener("admin:section", pause);
  select(
    new URLSearchParams(location.search).get("type") || "HSK",
    new URLSearchParams(location.search).get("level"),
    false,
  );
  void load().then(restore);
  return () => {
    alive = false;
    generation++;
    for (const p of panels.values()) p.dispose?.();
    panels.clear();
    window.removeEventListener("popstate", restore);
    document
      .querySelector("#adminWorkspace")
      ?.removeEventListener("admin:section", pause);
    root.replaceChildren();
  };
}
