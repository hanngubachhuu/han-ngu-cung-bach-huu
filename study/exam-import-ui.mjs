import { getSession, getClient } from "./auth.mjs";
import { extractExamQuestions, examCommitPayload } from "./exam-extraction.mjs";
import { escapeHtml as esc } from "./core.mjs";
const labels = {
  mcq: "Trắc nghiệm",
  true_false: "Đúng / Sai",
  text_fill: "Điền / Câu trả lời ngắn",
  writing: "Tự luận",
};
const errors = {
  DOCUMENT_UNSUPPORTED:
    "File này không được hỗ trợ. Vui lòng chọn PDF hoặc Word (.docx).",
  DOCUMENT_TOO_LARGE: "File vượt quá dung lượng cho phép (3 MiB).",
  DOCUMENT_UNREADABLE:
    "Không thể đọc nội dung file. Vui lòng kiểm tra file hoặc thử lại.",
  DOCUMENT_TOO_COMPLEX:
    "File quá nhiều trang hoặc quá phức tạp. Chia thành phần nhỏ rồi thử lại.",
  DOCUMENT_SCAN_UNSUPPORTED:
    "PDF này là bản scan. Hệ thống chưa có OCR; dùng Word hoặc PDF có thể chọn chữ.",
  EXAM_TITLE_REQUIRED: "Nhập tên đề.",
  EXAM_INVALID_COUNT: "Đề cần từ 1 đến 200 câu.",
  EXAM_QUESTION_REQUIRED: "Bổ sung nội dung câu hỏi.",
  EXAM_TYPE_REQUIRED: "Chọn dạng cho các câu chưa xác định.",
  EXAM_ANSWER_REQUIRED: "Kiểm tra lựa chọn và bổ sung đáp án đúng.",
  EXAM_REVIEW_REQUIRED: "Đối chiếu và xác nhận các câu cần kiểm tra.",
  ADMIN_REQUIRED: "Chỉ Admin được nhập đề.",
  ACCOUNT_CHANGED: "Tài khoản đã thay đổi. Mở lại bằng đúng tài khoản.",
};
const message = (e) =>
  errors[e.message] ||
  "Chưa hoàn tất thao tác. Bản nháp được giữ; kiểm tra kết nối rồi thử lại.";
export async function readExamFile(file, ownerId) {
  if (!/\.(pdf|docx)$/i.test(file.name)) throw Error("DOCUMENT_UNSUPPORTED");
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw Error("DOCUMENT_TOO_LARGE");
  const session = await getSession();
  if (session?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const response = await fetch(
    location.hostname === "hanngubachhuu.github.io"
      ? "https://hanngubachhuu.vercel.app/api/exam-import"
      : "./api/exam-import",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ filename: file.name, bytes: btoa(binary) }),
      signal: AbortSignal.timeout(55000),
    },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
export async function commitExamDraft(draft, ownerId) {
  const session = await getSession();
  if (session?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const client = await getClient();
  const { data, error } = await client.rpc("document_exam_import", {
    payload: examCommitPayload(draft),
  });
  if (error) throw error;
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
export function mountDocumentExamImport(
  root,
  {
    lessonId,
    ownerId,
    onSaved = () => {},
    readFile = readExamFile,
    commit = commitExamDraft,
    storage = globalThis.localStorage,
  } = {},
) {
  const key = `hnh.exam-import:${ownerId}:${lessonId}`;
  const openQuestions = new Set();
  let expandedInitialized = false;
  let draft = null,
    file = null,
    busy = false,
    uncertain = false,
    saved = false;
  try {
    const old = JSON.parse(storage.getItem(key) || "null");
    if (old?.ownerId === ownerId && old.lessonId === lessonId) {
      draft = old;
      uncertain = !!old.commitPending;
    }
  } catch {
    /* Show a storage warning on the next save. */
  }
  function persist() {
    if (!draft) return;
    try {
      draft.savedAt = new Date().toISOString();
      storage.setItem(key, JSON.stringify(draft));
      const node = root.querySelector("[data-draft-status]");
      if (node)
        node.textContent =
          "Đã lưu tạm lúc " +
          new Date(draft.savedAt).toLocaleTimeString("vi-VN");
    } catch {
      const node = root.querySelector("[data-draft-status]");
      if (node)
        node.textContent =
          "Chưa lưu tạm được trên máy. Giữ trang mở để tránh mất phần đang sửa.";
    }
  }
  function collect() {
    if (!draft) return;
    draft.title = root.querySelector("[data-exam-title]")?.value || draft.title;
    draft.instructions =
      root.querySelector("[data-instructions]")?.value ?? draft.instructions;
    for (const node of root.querySelectorAll("[data-context]")) {
      const c = draft.contexts.find((c) => c.localId === node.dataset.context);
      if (c) c.text = node.value;
    }
    for (const node of root.querySelectorAll("[data-import-question]")) {
      const q = draft.questions.find(
        (q) => q.localId === node.dataset.importQuestion,
      );
      if (!q) continue;
      q.prompt = node.querySelector("[data-prompt]").value;
      q.kind = node.querySelector("[data-kind]").value;
      q.correctAnswer = node.querySelector("[data-answer]").value;
      q.reviewed = !!node.querySelector("[data-reviewed]")?.checked;
      q.options = [...node.querySelectorAll("[data-option]")].map((n) => ({
        id: n.dataset.option,
        text: n.value,
      }));
      q.contextId =
        node.querySelector("[data-question-context]")?.value || null;
    }
    persist();
  }
  function createDraft(
    filename,
    fileHash,
    extracted = { questions: [], contexts: [], instructions: "", warnings: [] },
    sourceKind = "document",
  ) {
    openQuestions.clear();
    expandedInitialized = false;
    draft = {
      ...extracted,
      ownerId,
      lessonId,
      filename,
      fileHash,
      sourceKind,
      requestId: crypto.randomUUID(),
      title: filename.replace(/\.[^.]+$/, "").slice(0, 200),
      savedAt: new Date().toISOString(),
    };
    persist();
    render();
  }
  function steps(current) {
    return (
      '<ol class="exam-stepper" aria-label="Nhập đề">' +
      ["Chọn file", "Đọc đề", "Kiểm tra", "Thêm vào đề"]
        .map(
          (label, i) =>
            `<li ${i + 1 === current ? 'aria-current="step"' : ""}>${i + 1}. ${label}</li>`,
        )
        .join("") +
      "</ol>"
    );
  }
  function render() {
    if (!root.isConnected) return;
    if (!draft) {
      root.innerHTML = `<section class="exam-builder"><h4>Tạo đề mới</h4><p>Soạn một đề rõ ràng, phù hợp với bài học đang chọn.</p><div class="account-actions"><button type="button" class="st-button" data-manual>Tạo câu hỏi thủ công</button><button type="button" class="st-button" data-file-mode>Nhập từ PDF / Word</button></div><p>Soạn từng câu hoặc tải đề có sẵn để kiểm tra trước khi thêm.</p><div data-upload-panel hidden>${steps(1)}<h4>Nhập đề từ PDF / Word</h4><label class="exam-drop" data-drop>Kéo file PDF hoặc Word vào đây<input type="file" accept=".pdf,.docx" data-file></label><p>Định dạng hỗ trợ: PDF, Word (.docx). Tối đa 3 MiB.</p><p data-file-status></p><button type="button" class="st-button primary" data-analyze disabled>Đọc và phân tích đề</button></div><p data-import-status role="status"></p></section>`;
      root.querySelector("[data-file-mode]").onclick = () =>
        (root.querySelector("[data-upload-panel]").hidden = false);
      root.querySelector("[data-manual]").onclick = () => {
        createDraft("Đề mới", null, undefined, "manual");
        addQuestion();
      };
      const input = root.querySelector("[data-file]"),
        drop = root.querySelector("[data-drop]"),
        analyze = root.querySelector("[data-analyze]");
      function choose(selected) {
        file = selected;
        if (!file) return;
        const status = root.querySelector("[data-file-status]");
        if (!/\.(pdf|docx)$/i.test(file.name)) {
          status.textContent = errors.DOCUMENT_UNSUPPORTED;
          analyze.disabled = true;
          return;
        }
        if (!file.size || file.size > 3 * 1024 * 1024) {
          status.textContent = errors.DOCUMENT_TOO_LARGE;
          analyze.disabled = true;
          return;
        }
        status.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MiB · ${/\.pdf$/i.test(file.name) ? "PDF" : "Word"} · Đã chọn; chưa lưu vào đề.`;
        analyze.disabled = false;
      }
      input.onchange = () => choose(input.files[0]);
      drop.ondragover = (e) => e.preventDefault();
      drop.ondrop = (e) => {
        e.preventDefault();
        choose(e.dataTransfer.files[0]);
      };
      analyze.onclick = async () => {
        if (busy || !file) return;
        busy = true;
        analyze.disabled = true;
        input.disabled = true;
        root.querySelector(".exam-stepper").outerHTML = steps(2);
        root.querySelector("[data-import-status]").textContent =
          "Đang đọc đề. Vui lòng giữ trang mở…";
        try {
          const parsed = await readFile(file, ownerId);
          const extracted = extractExamQuestions(parsed);
          if (!extracted.questions.length) {
            root.querySelector("[data-import-status]").textContent =
              "Chưa nhận diện được câu hỏi trong file. Bạn có thể nhập thủ công.";
            return;
          }
          createDraft(file.name, parsed.sha256, extracted);
        } catch (e) {
          if (root.isConnected)
            root.querySelector("[data-import-status]").textContent = message(e);
        } finally {
          busy = false;
          if (analyze.isConnected) {
            analyze.disabled = false;
            input.disabled = false;
          }
        }
      };
      return;
    }
    const review = draft.questions.filter(
      (q) => q.needsReview.length && !q.reviewed,
    ).length;
    if (!expandedInitialized && draft.questions.length) {
      openQuestions.add(draft.questions[0].localId);
      expandedInitialized = true;
    }
    root.innerHTML = `<section class="exam-builder">${steps(3)}<h4>Kiểm tra đề</h4><p>${esc(draft.filename)} · ✓ ${draft.questions.length} câu được nhận diện · ${review ? "⚠ " : ""}${review} câu cần kiểm tra</p><label>Tên đề<input data-exam-title maxlength="200" value="${esc(draft.title)}" ${uncertain ? "disabled" : ""}></label><p data-draft-status role="status">Đã lưu tạm lúc ${new Date(draft.savedAt).toLocaleTimeString("vi-VN")}</p>${draft.warnings.length ? '<p class="account-notice">Có một số nội dung cần đối chiếu với file gốc, gồm cấu trúc bảng, hình hoặc trang scan.</p>' : ""}
   <details ${draft.instructions ? "open" : ""}><summary>Hướng dẫn chung</summary><textarea data-instructions rows="3" maxlength="50000" ${uncertain ? "disabled" : ""}>${esc(draft.instructions)}</textarea></details>
   ${draft.contexts.map((c) => `<label>Đoạn đọc chung<textarea data-context="${esc(c.localId)}" rows="4" maxlength="50000" ${uncertain ? "disabled" : ""}>${esc(c.text)}</textarea></label>`).join("")}
   ${draft.questions
     .map(
       (
         q,
         i,
       ) => `<details class="assignment-question" data-import-question="${esc(q.localId)}" ${openQuestions.has(q.localId) ? "open" : ""}><summary>Câu ${i + 1} · ${esc(labels[q.kind] || "Chưa xác định")}${q.needsReview.length && !q.reviewed ? " · ⚠ Cần kiểm tra" : ""}<small class="exam-question-preview">${esc(q.prompt.slice(0, 100))}</small></summary><label>Dạng câu<select data-kind ${uncertain ? "disabled" : ""}><option value="">Chưa xác định</option>${Object.entries(
         labels,
       )
         .map(
           ([k, v]) =>
             `<option value="${k}" ${q.kind === k ? "selected" : ""}>${v}</option>`,
         )
         .join(
           "",
         )}</select></label><label>Nội dung<textarea data-prompt maxlength="12000" rows="3" ${uncertain ? "disabled" : ""}>${esc(q.prompt)}</textarea></label>${q.kind === "mcq" ? q.options.map((o) => `<label>Lựa chọn ${esc(o.id)}<textarea data-option="${esc(o.id)}" rows="2" maxlength="2000" ${uncertain ? "disabled" : ""}>${esc(o.text)}</textarea></label>`).join("") : ""}
   <label>${q.kind === "writing" ? "Đáp án mẫu (nếu có)" : "Đáp án đúng"}${
     q.kind === "mcq" || q.kind === "true_false"
       ? `<select data-answer ${uncertain ? "disabled" : ""}><option value="">Chưa tìm thấy đáp án trong file</option>${(q.kind ===
         "mcq"
           ? q.options
           : [
               { id: "true", text: "Đúng" },
               { id: "false", text: "Sai" },
             ]
         )
           .map(
             (o) =>
               `<option value="${esc(o.id)}" ${q.correctAnswer === o.id ? "selected" : ""}>${esc(o.text || "Lựa chọn " + o.id)}</option>`,
           )
           .join("")}</select>`
       : `<textarea data-answer rows="2" maxlength="4000" ${uncertain ? "disabled" : ""}>${esc(q.correctAnswer)}</textarea>`
   }</label>
   ${draft.contexts.length ? `<label>Đoạn đọc của câu<select data-question-context ${uncertain ? "disabled" : ""}><option value="">Không có đoạn đọc chung</option>${draft.contexts.map((c, n) => `<option value="${esc(c.localId)}" ${q.contextId === c.localId ? "selected" : ""}>Đoạn ${n + 1}</option>`).join("")}</select></label>` : ""}
   ${q.needsReview.length ? `<p>${q.needsReview.map(esc).join(" ")}</p><label><input type="checkbox" data-reviewed ${q.reviewed ? "checked" : ""} ${uncertain ? "disabled" : ""}> Tôi đã đối chiếu và kiểm tra câu này</label>` : ""}
   <details><summary>Đối chiếu nội dung gốc</summary><pre style="white-space:pre-wrap">${esc(q.original || "Câu soạn thủ công")}</pre></details><div class="account-actions"><button type="button" class="st-button" data-up ${i === 0 || uncertain ? "disabled" : ""}>Lên</button><button type="button" class="st-button" data-down ${i === draft.questions.length - 1 || uncertain ? "disabled" : ""}>Xuống</button><button type="button" class="st-button" data-remove ${uncertain ? "disabled" : ""}>Xóa câu</button>${q.kind === "mcq" ? `<button type="button" class="st-button" data-add-option ${q.options.length >= 8 || uncertain ? "disabled" : ""}>Thêm lựa chọn</button>` : ""}</div></details>`,
     )
     .join("")}
   <div class="account-actions assignment-sticky"><button type="button" class="st-button" data-add ${uncertain ? "disabled" : ""}>Thêm câu thủ công</button><button type="button" class="st-button primary" data-commit>${uncertain ? "Kiểm tra / thử lại lần lưu này" : "Lưu đề nháp"}</button><button type="button" class="st-button" data-cancel ${uncertain ? "disabled" : ""}>Hủy</button></div><p data-import-status role="status">${uncertain ? "Lần lưu trước chưa có xác nhận. Kiểm tra lại trước khi chỉnh tiếp." : ""}</p></section>`;
    root.oninput = () => collect();
    root.onchange = (e) => {
      collect();
      if (e.target.matches("[data-kind]")) {
        const q = draft.questions.find(
          (q) =>
            q.localId ===
            e.target.closest("[data-import-question]").dataset.importQuestion,
        );
        if (q.kind === "mcq" && q.options.length < 2)
          q.options = [
            { id: "A", text: "" },
            { id: "B", text: "" },
          ];
        persist();
        render();
      }
    };
    root.querySelector("[data-add]").onclick = () => {
      collect();
      addQuestion();
    };
    for (const node of root.querySelectorAll("[data-import-question]")) {
      node.ontoggle = () => {
        if (!node.isConnected) return;
        if (node.open) openQuestions.add(node.dataset.importQuestion);
        else openQuestions.delete(node.dataset.importQuestion);
      };
      const index = draft.questions.findIndex(
        (q) => q.localId === node.dataset.importQuestion,
      );
      node.querySelector("[data-remove]").onclick = () => {
        collect();
        draft.questions.splice(index, 1);
        persist();
        render();
      };
      for (const [selector, delta] of [
        ["[data-up]", -1],
        ["[data-down]", 1],
      ])
        node.querySelector(selector).onclick = () => {
          collect();
          const [q] = draft.questions.splice(index, 1);
          draft.questions.splice(index + delta, 0, q);
          persist();
          render();
        };
      node.querySelector("[data-add-option]")?.addEventListener("click", () => {
        collect();
        const q = draft.questions[index];
        q.options.push({ id: "ABCDEFGH"[q.options.length], text: "" });
        persist();
        render();
      });
    }
    root.querySelector("[data-cancel]").onclick = () => {
      if (!window.confirm("Hủy bản nhập đang chỉnh?")) return;
      storage.removeItem(key);
      draft = null;
      render();
    };
    root.querySelector("[data-commit]").onclick = async () => {
      if (busy || saved) return;
      collect();
      try {
        examCommitPayload(draft);
      } catch (e) {
        root.querySelector("[data-import-status]").textContent = message(e);
        return;
      }
      busy = true;
      draft.commitPending = true;
      persist();
      uncertain = true;
      render();
      root.querySelector("[data-commit]").disabled = true;
      try {
        const result = await commit(draft, ownerId);
        saved = true;
        storage.removeItem(key);
        root.innerHTML = `<section class="account-notice">${steps(4)}<p>✓ Đã thêm ${result.count} câu vào đề nháp ${esc(result.title)}.</p><p>Tiếp tục chỉnh sửa, xem trước rồi xuất bản khi sẵn sàng.</p><button type="button" class="st-button" data-open-exam>Tiếp tục chỉnh sửa đề</button></section>`;
        root.querySelector("[data-open-exam]").onclick = () => onSaved(result);
      } catch (e) {
        const definitive = [
          "P0001",
          "42501",
          "23514",
          "23503",
          "22P02",
          "40001",
        ].includes(e.code);
        if (definitive) {
          uncertain = false;
          draft.commitPending = false;
          persist();
          render();
        }
        if (root.isConnected) {
          root.querySelector("[data-import-status]").textContent = message(e);
          root.querySelector("[data-commit]").disabled = false;
        }
      } finally {
        busy = false;
      }
    };
  }
  function addQuestion() {
    if (draft.questions.length >= 200) return;
    const localId = crypto.randomUUID();
    openQuestions.add(localId);
    draft.questions.push({
      localId,
      number: draft.questions.length + 1,
      prompt: "",
      kind: "mcq",
      options: [
        { id: "A", text: "" },
        { id: "B", text: "" },
      ],
      correctAnswer: "",
      needsReview: [],
      original: "",
      contextId: null,
    });
    persist();
    render();
  }
  render();
  return () => {
    root.oninput = null;
    root.onchange = null;
  };
}
