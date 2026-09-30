import {
  parseAssignmentImport,
  IMPORT_MAX_BYTES,
} from "./assignment-import.mjs";
import {
  assignmentMessage,
  assignmentText as text,
} from "./assignment-service.mjs";
const definitiveFailure = (error) =>
  [
    "P0001",
    "40001",
    "42501",
    "23514",
    "23503",
    "23505",
    "22P02",
    "PGRST202",
  ].includes(error?.code);
export class QuestionWriteSession {
  constructor(command, uuid = () => crypto.randomUUID()) {
    this.command = command;
    this.uuid = uuid;
    this.pending = null;
  }
  async save(question, metadata) {
    const body = { question, metadata };
    if (
      this.pending &&
      JSON.stringify(body) !==
        JSON.stringify({
          question: this.pending.question,
          metadata: this.pending.metadata,
        })
    )
      throw Error("AUTHORING_PENDING_CHANGED");
    if (!this.pending)
      this.pending = { request_id: this.uuid(), ...structuredClone(body) };
    return this.retry();
  }
  async retry() {
    if (!this.pending) throw Error("INVALID_REQUEST");
    try {
      const result = await this.command("question_create", this.pending);
      this.pending = null;
      return result;
    } catch (error) {
      if (definitiveFailure(error)) this.pending = null;
      throw error;
    }
  }
}
export function sourceDescription(q) {
  const p = q.provenance;
  if (!p) return "Chưa có metadata nguồn.";
  if (p.origin === "legacy_unknown")
    return "Nguồn lịch sử chưa được xác định; giữ version và người tạo cũ, không gán nguồn giả.";
  return `${p.source} · ${p.source_identifier} · mã gốc ${p.source_item_id} · nguồn v${p.source_revision}${p.imported_at ? ` · nhập ${new Date(p.imported_at).toLocaleString("vi-VN")} · Admin ${p.imported_by}` : ""}${p.parent_version_id ? " · bắt nguồn từ version trước" : ""}`;
}
export function mountAssignmentImport(root, lesson, command, refresh) {
  root.innerHTML = `<details><summary>Nhập câu hỏi có provenance</summary><p>JSON hnh-question-import-v1: mỗi câu cần mã gốc; nguồn cần định danh và phiên bản. Kiểm tra và xem trước rồi mới nhập. Không tự xuất bản hoặc bật bài.</p>
    <label>Tệp JSON<input type="file" accept=".json,application/json" data-import-file></label><label>Nội dung JSON<textarea data-import-json rows="8" spellcheck="false"></textarea></label><button class="st-button" type="button" data-import-preview>Kiểm tra và xem trước gói nhập</button>
    <p data-import-status role="status" aria-live="polite"></p><div data-import-result></div><button class="st-button" type="button" data-import-history>Lịch sử nhập nguồn</button><div data-import-history-output></div></details>`;
  const field = root.querySelector("[data-import-json]"),
    output = root.querySelector("[data-import-result]"),
    status = root.querySelector("[data-import-status]");
  let body = null,
    busy = false,
    uncertain = false;
  function lock(value) {
    busy = value;
    for (const c of root.querySelectorAll("input,textarea,button"))
      c.disabled = value || uncertain;
  }
  function invalidate() {
    if (busy || uncertain) return;
    body = null;
    output.replaceChildren();
  }
  field.addEventListener("input", invalidate);
  root.querySelector("[data-import-file]").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > IMPORT_MAX_BYTES) throw Error("IMPORT_TOO_LARGE");
      const raw = await file.text();
      if (!root.isConnected || busy || uncertain) return;
      field.value = raw;
      invalidate();
      status.textContent = "Đã đọc tệp. Chưa gửi câu vào ngân hàng.";
    } catch (error) {
      status.textContent = assignmentMessage(error);
    }
  };
  function finish(result) {
    if (!root.isConnected) return;
    body = null;
    uncertain = false;
    status.textContent = "Đã nhận xác nhận từ máy chủ.";
    output.innerHTML = `<p>${result.already_imported ? "Gói nguồn này đã được nhập; không tạo thêm version." : `Đã nhập ${result.count} câu thành các version nháp mới.`} Lịch sử cũ giữ nguyên. Xem ngân hàng và tạo đề để xem trước/xuất bản.</p><button class="st-button" type="button" data-import-refresh>Xem câu trong ngân hàng</button>`;
    output.querySelector("button").onclick = refresh;
  }
  async function commit() {
    if (busy || !body) return;
    const lockedBody = body;
    lock(true);
    try {
      finish(await command("import_commit", lockedBody));
    } catch (error) {
      if (!root.isConnected) return;
      uncertain = !definitiveFailure(error);
      status.textContent = uncertain
        ? "Chưa nhận được xác nhận. Giữ nguyên gói và thử lại cùng mã yêu cầu; không tạo bản nhập khác."
        : assignmentMessage(error);
      if (definitiveFailure(error)) {
        body = null;
        output.replaceChildren();
      }
    } finally {
      lock(false);
      const retry = output.querySelector("[data-import-commit]");
      if (retry) {
        retry.disabled = false;
        retry.textContent = uncertain
          ? "Kiểm tra / thử lại lần nhập này"
          : "Nhập các version nháp đã xem trước";
      }
    }
  }
  root.querySelector("[data-import-preview]").onclick = async () => {
    if (busy || uncertain) return;
    try {
      body = {
        request_id: crypto.randomUUID(),
        ...parseAssignmentImport(field.value, lesson),
      };
      lock(true);
      const preview = await command("import_preview", body);
      if (!root.isConnected) return;
      if (preview.already_imported) {
        finish(preview);
        return;
      }
      output.innerHTML = `<section class="account-notice"><h4>${preview.count} câu · nguồn ${text(preview.source.source)} · v${text(preview.source.source_revision)}</h4><p>${text(preview.source.source_identifier)}</p>${preview.questions.map((q, i) => `<div class="assignment-question"><p>${i + 1}. ${text(q.question_key)} · version mới ${q.version}</p><p>${text(q.prompt)}</p><p>Lựa chọn: ${text(JSON.stringify(q.options))}</p><p>Đáp án (chỉ Admin): ${text(JSON.stringify(q.answer_key))}</p></div>`).join("")}<button class="st-button primary" type="button" data-import-commit>Nhập các version nháp đã xem trước</button></section>`;
      output.querySelector("[data-import-commit]").onclick = () => {
        if (
          uncertain ||
          window.confirm(
            "Nhập đúng các câu vừa xem trước thành version nháp? Không ghi đè version cũ, không xuất bản đề.",
          )
        )
          commit();
      };
      status.textContent =
        "Preview hợp lệ. Chưa lưu câu vào ngân hàng; sửa JSON sẽ hủy preview này.";
    } catch (error) {
      if (root.isConnected) {
        body = null;
        output.replaceChildren();
        status.textContent = assignmentMessage(error);
      }
    } finally {
      lock(false);
    }
  };
  root.querySelector("[data-import-history]").onclick = async () => {
    try {
      const items = await command("imports", { lesson_id: lesson });
      if (!root.isConnected) return;
      root.querySelector("[data-import-history-output]").innerHTML =
        items
          .map(
            (j) =>
              `<p>${new Date(j.created_at).toLocaleString("vi-VN")} · ${text(j.source?.source)} · nguồn v${text(j.source?.source_revision)} · ${j.count} câu · ${j.state === "committed" ? "Đã nhập" : "Chỉ preview"}</p>`,
          )
          .join("") || "<p>Chưa có gói nhập.</p>";
    } catch (error) {
      if (root.isConnected) status.textContent = assignmentMessage(error);
    }
  };
}
