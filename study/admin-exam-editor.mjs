import { escapeHtml as esc } from "./core.mjs";
import { questionForm } from "./assignment-editor.mjs";
import {
  ExamEditSession,
  kindLabels,
  examValidation,
} from "./admin-exam-core.mjs";

export function mountExamEditor(
  root,
  {
    model,
    publish,
    onPublished = () => {},
    audioRoot = null,
    audioStatus = () => null,
    onChange = () => {},
    questionMedia = null,
  },
) {
  const state = new ExamEditSession(model);
  let mediaUrl = null;
  let alive = true,
    busy = false,
    tab = "content";
  root.classList.add("admin-exam-editor", "assignment-workspace");
  root.innerHTML = `<header class="admin-editor-header"><div><p class="st-eyebrow">${esc(model.type)} ${esc(model.levelLabel || model.level)}</p><h2>${esc(model.code || "Sửa đề")}</h2><label>Tên đề<input data-title maxlength="200" value="${esc(model.title)}"></label></div><div><p data-audio-status role="status"></p><button class="st-button primary" data-publish>LƯU & XUẤT BẢN</button></div></header><p data-feedback role="status" aria-live="polite"></p><nav class="account-actions" aria-label="Nội dung đề"><button class="st-button" data-editor-tab="content" aria-pressed="true">Nội dung</button>${model.type === "HSKK" ? '<button class="st-button" data-editor-tab="audio" aria-pressed="false">Audio</button><button class="st-button" data-editor-tab="segments" aria-pressed="false">Phân đoạn audio</button>' : ""}</nav><section data-content-tab><details class="admin-instructions"><summary>Hướng dẫn và đoạn đọc chung</summary><label>Hướng dẫn<textarea data-instructions rows="3">${esc(model.instructions || "")}</textarea></label>${(model.contexts || []).map((c, i) => `<label>Đoạn đọc ${i + 1}<textarea data-context="${i}" rows="4">${esc(c.text || c.content)}</textarea></label>`).join("")}</details><div class="admin-question-layout"><nav data-question-nav class="admin-question-nav" aria-label="Chọn câu hỏi"></nav><section data-question-panel></section></div></section><section data-audio-tab hidden></section><section data-segments-tab hidden></section>`;
  if (audioRoot) root.querySelector("[data-segments-tab]").append(audioRoot);
  if (model.warnings?.length) {
    const notice = document.createElement("p");
    notice.className = "account-notice";
    notice.textContent =
      "Có hình, bảng hoặc nội dung cần đối chiếu với file gốc. Kiểm tra lại các câu trước khi xuất bản.";
    root.querySelector("[data-content-tab]").prepend(notice);
  }
  const feedback = (message) => {
    if (alive) root.querySelector("[data-feedback]").textContent = message;
  };
  function changed() {
    onChange(structuredClone(state.model));
    gate();
  }
  function gate() {
    const status = audioStatus();
    root.querySelector("[data-audio-status]").textContent =
      status?.message || "";
    const button = root.querySelector("[data-publish]");
    button.disabled =
      busy || (status && !status.ready) || model.backend_available === false;
    if (model.backend_available === false)
      feedback(
        "Chưa thể lưu đề lúc này. Nội dung đang sửa được giữ trong lần mở này.",
      );
    root
      .querySelectorAll("input,textarea,select,[data-question],[data-move]")
      .forEach((n) => {
        n.disabled =
          busy || !!state.pending || n.hasAttribute("data-structure-locked");
      });
  }
  function question() {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = null;
    const q = state.model.questions[state.index];
    root.querySelector("[data-question-nav]").innerHTML = state.model.questions
      .map(
        (_, i) =>
          `<button class="st-button" data-question="${i}" aria-label="Câu ${i + 1}" ${i === state.index ? 'aria-current="step"' : ""}>${i + 1}</button>`,
      )
      .join("");
    for (const b of root.querySelectorAll("[data-question]"))
      b.onclick = () => {
        state.index = Number(b.dataset.question);
        question();
      };
    const panel = root.querySelector("[data-question-panel]");
    if (!q) {
      panel.innerHTML =
        "<p>Chưa nhận diện được câu hỏi. Hãy kiểm tra tài liệu nguồn.</p>";
      gate();
      return;
    }
    const hskk = state.model.type === "HSKK";
    const kinds = Object.entries(kindLabels).filter(([kind]) =>
      hskk
        ? ![
            "mcq",
            "true_false",
            "text_fill",
            "reorder",
            "matching",
            "multi_fill",
            "writing",
            "translation",
            "speaking",
          ].includes(kind)
        : ![
            "speaking_repeat",
            "speaking_answer",
            "speaking_long_answer",
            "picture_description",
            "read_aloud",
            "short_response",
            "long_response",
          ].includes(kind),
    );
    const fields = hskk
      ? { answer: q.teacher_answer || "" }
      : questionForm({ ...q, options: q.options || [] });
    panel.innerHTML = `<h3>Câu ${state.index + 1}</h3><label>Dạng câu hỏi<select data-field="kind"><option value="">Chọn dạng câu</option>${kinds.map(([kind, label]) => `<option value="${kind}" ${(q.kind || q.type) === kind ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Nội dung câu hỏi<textarea lang="zh" data-field="prompt" rows="4" maxlength="12000">${esc(q.prompt)}</textarea></label>${q.kind === "mcq" ? `<div data-options>${(q.options || []).map((o, i) => `<label>Lựa chọn ${i + 1}<textarea data-option="${i}" maxlength="2000" rows="2">${esc(o.text)}</textarea></label>`).join("")}</div><button class="st-button" data-add-option ${(q.options || []).length >= 8 ? "disabled" : ""}>+ Thêm lựa chọn</button><label>Đáp án đúng<select data-answer><option value="">Chọn đáp án đúng</option>${(q.options || []).map((o, i) => `<option value="${esc(o.id)}" ${q.answer_key?.value === o.id ? "selected" : ""}>Lựa chọn ${i + 1}</option>`).join("")}</select></label>` : q.kind === "true_false" ? `<label>Đáp án đúng<select data-answer><option value="true" ${fields.answer === "true" ? "selected" : ""}>Đúng</option><option value="false" ${fields.answer === "false" ? "selected" : ""}>Sai</option></select></label>` : `<label>${hskk || ["writing", "speaking", "translation"].includes(q.kind) ? "Đáp án / gợi ý cho giáo viên" : "Đáp án chấp nhận (mỗi cách trả lời một dòng)"}<textarea data-answer rows="3">${esc(q.teacher_answer || fields.answer)}</textarea></label>`}<label>Giải thích<textarea data-field="explanation" rows="3">${esc(q.explanation || "")}</textarea></label><label>Pinyin<input data-field="pinyin" value="${esc(q.pinyin || "")}"></label><label>Hình ảnh (đường dẫn)<input data-field="image" value="${esc(q.image || "")}"></label>${
      !hskk
        ? `<label>Audio câu hỏi (đường dẫn)<input data-field="audio" value="${esc(q.audio || "")}"></label>`
        : `<label>Thời gian trả lời (giây)<input type="number" min="1" max="600" data-field="response_seconds" value="${q.response_seconds ?? ""}"></label><label>Cách trình bày<select data-field="prompt_mode">${[
            ["text", "Văn bản"],
            ["audio", "Nghe audio"],
            ["image", "Hình ảnh"],
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${q.prompt_mode === v ? "selected" : ""}>${l}</option>`,
            )
            .join("")}</select></label>`
    }<label>Gợi ý<textarea data-field="tip" rows="2">${esc(q.tip || "")}</textarea></label>${state.model.contexts?.length ? `<label>Đoạn đọc của câu<select data-field="contextId"><option value="">Không có đoạn đọc chung</option>${state.model.contexts.map((c, i) => `<option value="${esc(c.localId || c.id)}" ${q.contextId === (c.localId || c.id) ? "selected" : ""}>Đoạn ${i + 1}</option>`).join("")}</select></label>` : ""}<div class="account-actions"><button class="st-button" data-move="-1" ${state.index === 0 ? "disabled" : ""}>Đưa lên trước</button><button class="st-button" data-move="1" ${state.index === state.model.questions.length - 1 ? "disabled" : ""}>Đưa xuống sau</button></div><p class="st-help">${state.model.questions.length} câu · Thay đổi sẽ áp dụng khi lưu và xuất bản.</p>`;
    if (q.prompt_image && questionMedia) {
      const figure = document.createElement("figure");
      figure.textContent = "Đang mở tranh nguồn…";
      panel.prepend(figure);
      void questionMedia(q)
        .then((blob) => {
          if (!alive || !figure.isConnected) return;
          mediaUrl = URL.createObjectURL(blob);
          const image = document.createElement("img");
          image.src = mediaUrl;
          image.alt = `Tranh nguồn câu ${q.number || state.index + 1}`;
          image.style.maxWidth = "100%";
          image.style.maxHeight = "320px";
          figure.replaceChildren(image);
        })
        .catch(() => {
          if (figure.isConnected)
            figure.textContent =
              "Chưa mở được tranh nguồn. Kiểm tra phiên Admin và kết nối.";
        });
    }
    if (hskk) {
      for (const field of panel.querySelectorAll(
        '[data-field="kind"],[data-field="prompt_mode"],[data-move]',
      ))
        field.setAttribute("data-structure-locked", "");
      panel.querySelector('[data-field="image"]').closest("label").remove();
      panel.querySelector('[data-field="response_seconds"]').max = "300";
    }
    for (const field of panel.querySelectorAll("[data-field]"))
      field.oninput = () => {
        q[field.dataset.field] =
          field.dataset.field === "response_seconds"
            ? Number(field.value)
            : field.value;
        if (field.dataset.field === "kind") {
          q.options ||= [];
          q.answer_key = null;
          if (q.kind === "mcq" && !q.options.length)
            q.options = [
              { id: "A", text: "" },
              { id: "B", text: "" },
            ];
          if (q.kind === "true_false") q.answer_key = { value: true };
          question();
        }
        changed();
      };
    for (const field of panel.querySelectorAll("[data-option]"))
      field.oninput = () => {
        q.options[Number(field.dataset.option)].text = field.value;
        changed();
      };
    const answer = panel.querySelector("[data-answer]");
    if (["reorder", "matching"].includes(q.kind)) {
      const label = document.createElement("label");
      label.textContent = "Từ / nội dung lựa chọn (mỗi mục một dòng)";
      const input = document.createElement("textarea");
      input.rows = 4;
      input.value = (q.options || []).join("\n");
      input.oninput = () => {
        q.options = input.value.split("\n").filter(Boolean);
        changed();
      };
      label.append(input);
      answer.closest("label").before(label);
    }
    answer.oninput = () => {
      if (hskk || ["writing", "speaking", "translation"].includes(q.kind))
        q.teacher_answer = answer.value;
      else if (q.kind === "mcq") q.answer_key = { value: answer.value };
      else if (q.kind === "true_false")
        q.answer_key = { value: answer.value === "true" };
      else if (["text_fill", "reorder"].includes(q.kind))
        q.answer_key = { accepted: answer.value.split("\n").filter(Boolean) };
      else if (q.kind === "multi_fill")
        q.answer_key = {
          values: answer.value
            .split("\n")
            .filter(Boolean)
            .map((s) => s.split("|").map((v) => v.trim())),
        };
      else if (q.kind === "matching")
        q.answer_key = {
          pairs: Object.fromEntries(
            answer.value
              .split("\n")
              .filter(Boolean)
              .map((s) => s.split("=").map((v) => v.trim())),
          ),
        };
      changed();
    };
    const add = panel.querySelector("[data-add-option]");
    if (add)
      add.onclick = () => {
        const id = [..."ABCDEFGH"].find(
          (id) => !q.options.some((o) => o.id === id),
        );
        if (id) q.options.push({ id, text: "" });
        question();
        changed();
      };
    for (const b of panel.querySelectorAll("[data-move]"))
      b.onclick = () => {
        state.move(Number(b.dataset.move));
        question();
        changed();
      };
    gate();
  }
  root.querySelector("[data-title]").oninput = (e) => {
    state.model.title = e.target.value;
    changed();
  };
  const durationLabel = document.createElement("label");
  durationLabel.textContent =
    "Thời gian làm đề (phút, để trống nếu không giới hạn)";
  const duration = document.createElement("input");
  duration.type = "number";
  duration.min = "1";
  duration.max = "240";
  duration.value = state.model.time_limit_minutes ?? "";
  duration.oninput = () => {
    state.model.time_limit_minutes = duration.value
      ? Number(duration.value)
      : null;
    changed();
  };
  durationLabel.append(duration);
  root.querySelector("[data-title]").closest("label").after(durationLabel);
  root.querySelector("[data-instructions]").oninput = (e) => {
    state.model.instructions = e.target.value;
    changed();
  };
  for (const f of root.querySelectorAll("[data-context]"))
    f.oninput = () => {
      state.model.contexts[Number(f.dataset.context)].text = f.value;
      changed();
    };
  for (const b of root.querySelectorAll("[data-editor-tab]"))
    b.onclick = () => {
      tab = b.dataset.editorTab;
      for (const n of root.querySelectorAll("[data-editor-tab]"))
        n.setAttribute("aria-pressed", String(n === b));
      root.querySelector("[data-content-tab]").hidden = tab !== "content";
      root.querySelector("[data-audio-tab]").hidden = tab !== "audio";
      root.querySelector("[data-segments-tab]").hidden = tab !== "segments";
      root.dispatchEvent(new CustomEvent("exam:tab", { detail: tab }));
    };
  root.querySelector("[data-audio-tab]").innerHTML =
    `<p>${esc(model.source?.filename || model.audio_source_name || "Chưa có audio nguồn")}</p><p>Audio nguồn được giữ riêng tư. Chọn “Phân đoạn audio” để nghe và xác nhận từng câu.</p><div data-source-upload></div>`;
  root.querySelector("[data-publish]").onclick = async () => {
    if (busy) return;
    const issues = examValidation(state.model);
    if (issues.length) {
      feedback(issues.join(" "));
      return;
    }
    busy = true;
    gate();
    try {
      const result = await publish(state.publication());
      if (!alive) return;
      state.published(result);
      feedback(
        "Đã lưu và xuất bản. Lượt làm mới dùng nội dung mới; bài làm trước đây được giữ nguyên.",
      );
      onPublished(result);
    } catch (e) {
      const rejected = {
        INVALID_EXAM: "Kiểm tra tên đề, loại đề và cấp độ.",
        INVALID_QUESTION: "Kiểm tra nội dung và đáp án của các câu hỏi.",
        INVALID_QUESTIONS: "Đề cần các câu hỏi hợp lệ, không trùng nhau.",
        INVALID_OPTIONS: "Kiểm tra các lựa chọn và đáp án đúng.",
        INVALID_ANSWER_KEY: "Bổ sung đáp án hợp lệ trước khi xuất bản.",
        INVALID_CONTEXT: "Kiểm tra đoạn đọc chung và câu sử dụng đoạn đọc đó.",
        INVALID_MEDIA: "Kiểm tra đường dẫn hình ảnh và audio.",
        SOURCE_DEFINITION_LOCKED:
          "Tài liệu nguồn của đề đã thay đổi. Mở lại đề để đối chiếu.",
        HSKK_OFFICIAL_BINDING_REQUIRED:
          "Đề chưa được kết nối với phiên thi chính thức.",
      }[e.message];
      if (
        rejected ||
        e.code === "40001" ||
        e.message === "VERSION_CONFLICT" ||
        e.code?.startsWith("22") ||
        e.message === "EXAM_VALIDATION"
      )
        state.pending = null;
      feedback(
        e.issues?.join(" ") ||
          rejected ||
          (e.message === "VERSION_CONFLICT"
            ? "Đề đã được cập nhật ở nơi khác. Nội dung đang sửa vẫn được giữ; mở lại để đối chiếu."
            : "Chưa xác nhận được lần lưu. Bấm lại để kiểm tra cùng yêu cầu; nội dung đang sửa vẫn được giữ."),
      );
    } finally {
      busy = false;
      if (alive) gate();
    }
  };
  question();
  return {
    state,
    refreshGate: gate,
    audioPanel: root.querySelector("[data-source-upload]"),
    dispose() {
      alive = false;
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      root.replaceChildren();
    },
  };
}
