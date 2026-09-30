import { mountDocumentExamImport } from "./exam-import-ui.mjs";
import { mountRecorder } from "./recording-ui.mjs";
import {
  assignmentCommand as call,
  assignmentAuthoring as callAuthor,
  assignmentMessage,
  assignmentText as text,
} from "./assignment-service.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { getClient, getSession } from "./auth.mjs";
import { mountDistractorGenerator } from "./distractor-admin.mjs";
import {
  QuestionWriteSession,
  mountAssignmentImport,
  sourceDescription,
} from "./assignment-author-ui.mjs";
import {
  AssignmentSelection,
  questionForm,
  questionPayload,
} from "./assignment-editor.mjs";

export function mountAssignmentAdmin(root, profile) {
  root.classList.add("assignment-workspace");
  let players = [];
  const disposePlayers = () => {
    players.forEach((p) => p.dispose());
    players = [];
  };
  let active = true,
    request = 0,
    page = 0,
    bankPage = 0;
  let selection = new AssignmentSelection();
  let includeArchived = false;
  let advancedQuestionOpen = false;
  const command = (name, payload = {}) => call(name, payload, profile.user_id);
  const author = (name, payload = {}) =>
    callAuthor(name, payload, profile.user_id);
  const writes = new QuestionWriteSession(author);
  const archiveRequests = new Map();
  const report = (error) => {
    const node = root.querySelector("[data-status]");
    if (node) node.textContent = assignmentMessage(error);
  };
  function shell(title) {
    disposePlayers();
    root.innerHTML = `<h3>${text(title)}</h3><div class="account-actions"><button class="st-button" data-queue>Bài nộp</button><button class="st-button" data-bank>Đề và rubric</button><button class="st-button" data-audio-health>Kiểm tra hệ thống ghi âm</button></div><p data-status role="status" aria-live="polite"></p><div data-content></div>`;
    root.querySelector("[data-queue]").onclick = () => queue();
    root.querySelector("[data-bank]").onclick = () => bank(selection.lessonId);
    root.querySelector("[data-audio-health]").onclick = async (e) => {
      e.currentTarget.disabled = true;
      const status = root.querySelector("[data-status]");
      status.textContent = "Đang kiểm tra chuyển MP3 bằng âm thanh tổng hợp…";
      try {
        const session = await getSession();
        if (session?.user.id !== profile.user_id)
          throw Error("ACCOUNT_CHANGED");
        const response = await fetch(
          location.hostname === "hanngubachhuu.github.io"
            ? "https://hanngubachhuu.vercel.app/api/recordings?action=health"
            : "./api/recordings?action=health",
          {
            method: "POST",
            headers: { Authorization: "Bearer " + session.access_token },
            signal: AbortSignal.timeout(110000),
          },
        );
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (status.isConnected)
          status.textContent =
            data.conversion === "passed"
              ? `Kiểm tra MP3 thành công (${data.elapsedMs} ms). Speaking vẫn cần kiểm thử lưu trữ trước khi mở.`
              : "Chưa xác nhận được hệ thống ghi âm.";
      } catch {
        if (status.isConnected)
          status.textContent =
            "Chưa kiểm tra được hệ thống ghi âm trên máy chủ. Speaking chưa sẵn sàng để mở.";
      } finally {
        if (e.target.isConnected) e.target.disabled = false;
      }
    };
    return root.querySelector("[data-content]");
  }
  async function queue(filters = {}) {
    const generation = ++request,
      content = shell("Chấm và công bố bài nộp");
    content.innerHTML = "<p>Đang tải…</p>";
    try {
      const list = await command("queue", { ...filters, page });
      if (!active || generation !== request) return;
      content.innerHTML = `<form data-filter class="account-filter"><label>Trạng thái<select name="state"><option value="">Tất cả</option><option value="draft">Đang làm</option><option value="submitted">Đã nộp</option></select></label><label>Mã bài<input name="lesson_id" value="${esc(filters.lesson_id || "")}"></label><button class="st-button">Lọc</button></form>
        ${list.length ? list.map((a) => `<div class="assignment-row"><span><strong>${text(a.full_name)}</strong> · ${text(a.course_title)}<br>${text(a.title_vi)}<small>${new Date(a.started_at).toLocaleString("vi-VN")} · ${a.state === "draft" ? "Đang làm" : a.published_revision ? "Đã công bố" : "Chờ chấm / công bố"}</small></span><button class="st-button" data-attempt="${esc(a.id)}">Mở bài</button></div>`).join("") : "<p>Không có bài nộp phù hợp.</p>"}
        <div class="account-actions"><button class="st-button" data-prev ${page ? "" : "disabled"}>← Trước</button><span>Trang ${page + 1}</span><button class="st-button" data-next ${list.length === 20 ? "" : "disabled"}>Sau →</button></div>`;
      content.querySelector('[name="state"]').value = filters.state || "";
      content.querySelector("[data-filter]").onsubmit = (e) => {
        e.preventDefault();
        page = 0;
        queue(
          Object.fromEntries(
            [...new FormData(e.currentTarget)].filter(([, v]) => v),
          ),
        );
      };
      content.querySelector("[data-prev]").onclick = () => {
        page--;
        queue(filters);
      };
      content.querySelector("[data-next]").onclick = () => {
        page++;
        queue(filters);
      };
      for (const b of content.querySelectorAll("[data-attempt]"))
        b.onclick = () => inspect(b.dataset.attempt);
    } catch (error) {
      report(error);
    }
  }
  async function inspect(id) {
    const generation = ++request,
      content = shell("Bài làm và chấm điểm");
    content.innerHTML = "<p>Đang tải…</p>";
    try {
      let data = await command("get", { attempt_id: id });
      if (!active || generation !== request) return;
      const grade = data.grading,
        editable = grade?.state === "draft";
      let revisedKeys = [];
      if (grade?.state === "published") {
        const bank = await command("bank", { lesson_id: data.lesson_id });
        if (!active || generation !== request) return;
        revisedKeys = data.answers.flatMap((a) =>
          bank.questions
            .filter(
              (q) =>
                q.published_at &&
                q.question_key === a.question.question_key &&
                q.kind === a.question.kind &&
                q.id !==
                  grade.grades.find(
                    (g) => g.question_version_id === a.question.id,
                  )?.grading_question_version_id,
            )
            .map((q) => ({
              original: a.question.id,
              position: a.position,
              question: q,
            })),
        );
      }
      content.innerHTML = `<h4>${text(data.title)}</h4><p>Bắt đầu: ${new Date(data.started_at).toLocaleString("vi-VN")}<br>Nộp: ${data.submitted_at ? new Date(data.submitted_at).toLocaleString("vi-VN") : "Chưa nộp"} · ${data.duration_seconds ?? "—"} giây${data.timed_out ? " · Hết giờ" : ""}</p>
        ${data.result ? `<p>Kết quả đang công bố: <strong>${data.result.normalized_score}/100</strong> · lần ${data.result.revision}</p>` : ""}
        ${(data.contexts || []).map((c, i) => `<section class="assignment-question" id="admin-context-${i}"><h4>${text(c.title)}</h4><p class="assignment-prompt">${text(c.content)}</p></section>`).join("")}<form data-grades>${data.answers
          .map((a) => {
            const g = grade?.grades.find(
                (x) => x.question_version_id === a.question.id,
              ),
              rubric = g?.rubric;
            return `<fieldset class="assignment-question" data-id="${esc(a.question.id)}" ${editable ? "" : "disabled"}><legend>Câu ${a.position} · phiên bản học viên đã làm ${a.question.version}</legend><p class="assignment-prompt">${text(a.question.prompt)}</p>${a.question.context_version_id ? `<p class="st-help">Dùng đoạn đọc chung phía trên.</p>` : ""}<p><strong>Học viên:</strong> ${text(typeof a.answer === "string" ? a.answer : JSON.stringify(a.answer))}</p><details><summary>Đáp án và phiên bản chấm (chỉ Admin)</summary><p>${text(JSON.stringify(g?.grading_question?.answer_key ?? a.private_question.answer_key))}</p><p>${text(g?.grading_question?.explanation ?? a.private_question.explanation)}</p></details>
            ${rubric ? rubric.criteria.map((c) => `<label>${text(c.label)} / ${c.weight}<input type="number" data-criterion="${esc(c.id)}" min="0" max="${c.weight}" step="0.01" value="${g?.criteria_scores?.[c.id] ?? ""}"></label>`).join("") : `<label>Điểm /10<input type="number" data-score min="0" max="10" step="0.01" value="${g?.score ?? ""}"></label>`}
            <label>Nhận xét cho học viên<textarea data-feedback maxlength="4000" rows="2">${esc(g?.feedback || "")}</textarea></label></fieldset>${a.question.kind === "speaking" ? `<div class="assignment-question" data-recording-playback="${esc(a.question.id)}"></div>` : ""}`;
          })
          .join("")}
        ${editable ? '<div class="account-actions"><button class="st-button" type="submit">Lưu chấm điểm</button><button class="st-button" type="button" data-preview>Xem trước kết quả</button><button class="st-button primary" type="button" data-publish disabled>Công bố kết quả</button></div>' : grade ? `<label>Lý do chấm lại<input data-reason maxlength="1000" required></label><label>Phiên bản chấm mới cho một câu<select data-new-key><option value="">Giữ phiên bản chấm hiện tại</option>${revisedKeys.map((k) => `<option value="${esc(k.original)}:${esc(k.question.id)}">Câu ${k.position} · ${esc(k.question.question_key)} · v${k.question.version}</option>`).join("")}</select></label><button class="st-button" type="button" data-regrade>Tạo lần chấm lại</button>` : "<p>Bài đang làm, chưa có bản chấm.</p>"}</form><div data-preview-output></div>`;
      const dirty = new Set(),
        form = content.querySelector("[data-grades]");
      for (const node of content.querySelectorAll(
        "[data-recording-playback]",
      )) {
        const entry = data.answers.find(
          (a) => a.question.id === node.dataset.recordingPlayback,
        );
        players.push(
          mountRecorder(node, {
            attemptId: data.attempt_id,
            questionId: entry.question.id,
            ownerId: profile.user_id,
            answer: entry.answer,
            locked: true,
          }),
        );
      }
      form.addEventListener("input", (e) => {
        const fieldset = e.target.closest("[data-id]");
        if (!fieldset) return;
        dirty.add(fieldset.dataset.id);
        content.querySelector("[data-publish]").disabled = true;
        content.querySelector("[data-preview]").disabled = true;
      });
      const version = () => ({
        attempt_id: id,
        grade_revision: data.grading.revision,
        edit_version: data.grading.edit_version,
      });
      const busy = (value) => {
        for (const field of form.querySelectorAll("fieldset,button"))
          field.disabled = value;
        if (!value) {
          content.querySelector("[data-preview]").disabled = dirty.size > 0;
          content.querySelector("[data-publish]").disabled =
            dirty.size > 0 ||
            data.grading.preview_version !== data.grading.edit_version;
        }
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!editable) return;
        busy(true);
        try {
          for (const qid of [...dirty]) {
            const fieldset = [...form.querySelectorAll("[data-id]")].find(
              (f) => f.dataset.id === qid,
            );
            const fields = [...fieldset.querySelectorAll("[data-criterion]")];
            if (
              fields.some((f) => f.value === "") ||
              (!fields.length &&
                fieldset.querySelector("[data-score]").value === "")
            )
              throw Error("UNGRADED_QUESTIONS");
            data = await command("grade", {
              ...version(),
              question_version_id: qid,
              ...(fields.length
                ? {
                    criteria_scores: Object.fromEntries(
                      fields.map((f) => [f.dataset.criterion, Number(f.value)]),
                    ),
                  }
                : {
                    score: Number(fieldset.querySelector("[data-score]").value),
                  }),
              feedback: fieldset.querySelector("[data-feedback]").value,
            });
            dirty.delete(qid);
          }
          if (active && generation === request) {
            root.querySelector("[data-status]").textContent =
              "Đã lưu. Học viên chưa thấy bản chấm này.";
            content.querySelector("[data-preview]").disabled = false;
          }
        } catch (error) {
          report(error);
        } finally {
          if (active && form.isConnected) busy(false);
        }
      };
      content
        .querySelector("[data-preview]")
        ?.addEventListener("click", async () => {
          busy(true);
          try {
            data = await command("grade_preview", version());
            if (!active || generation !== request) return;
            content.querySelector("[data-preview-output]").innerHTML =
              `<section class="account-notice"><h4>Học viên sẽ thấy</h4><strong>${data.preview.normalized_score}/100</strong><p>${data.preview.raw_score}/${data.preview.raw_max_score} điểm gốc</p>${data.grading.grades.map((g, i) => `<p>Câu ${i + 1}: ${g.score}/10 · ${text(g.feedback)}</p>`).join("")}</section>`;
            content.querySelector("[data-publish]").disabled = false;
          } catch (error) {
            report(error);
          } finally {
            if (active && form.isConnected) busy(false);
          }
        });
      content
        .querySelector("[data-publish]")
        ?.addEventListener("click", async () => {
          if (
            !window.confirm("Công bố bản kết quả vừa xem trước cho học viên?")
          )
            return;
          busy(true);
          try {
            await command("grade_publish", version());
            if (active && generation === request) inspect(id);
          } catch (error) {
            report(error);
          } finally {
            if (active && form.isConnected) busy(false);
          }
        });
      content
        .querySelector("[data-regrade]")
        ?.addEventListener("click", async () => {
          const reason = content.querySelector("[data-reason]").value.trim();
          if (!reason) {
            content.querySelector("[data-reason]").reportValidity();
            return;
          }
          if (
            !window.confirm(
              "Tạo bản chấm mới? Kết quả cũ vẫn hiển thị tới khi bạn công bố lại.",
            )
          )
            return;
          try {
            const key = content.querySelector("[data-new-key]").value;
            const [original, revised] = key.split(":");
            await command("regrade", {
              ...version(),
              reason,
              ...(key
                ? {
                    question_version_id: original,
                    new_question_version_id: revised,
                  }
                : {}),
            });
            if (active && generation === request) inspect(id);
          } catch (error) {
            report(error);
          }
        });
    } catch (error) {
      report(error);
    }
  }
  async function bank(selectedLesson = "") {
    const generation = ++request,
      content = shell("Đề và rubric — bản nháp, xem trước, công bố");
    content.innerHTML = "<p>Đang tải…</p>";
    try {
      const client = await getClient();
      const { data: lessons, error } = await client
        .from("lesson_content")
        .select("id,title_vi,course_id,lesson_no")
        .order("course_id")
        .order("lesson_no")
        .limit(100);
      if (error) throw error;
      if (!active || generation !== request) return;
      const lesson = selectedLesson || lessons[0]?.id;
      if (!lesson) {
        content.textContent = "Chưa có bài học để tạo đề.";
        return;
      }
      if (selection.lessonId !== lesson)
        selection = new AssignmentSelection(lesson);
      const data = await author("bank", {
        lesson_id: lesson,
        page: bankPage,
        include_archived: includeArchived,
      });
      if (!active || generation !== request) return;
      content.innerHTML = `<label>Bài học<select data-lesson>${lessons.map((l) => `<option value="${esc(l.id)}" ${l.id === lesson ? "selected" : ""}>${text(l.course_id)} · ${text(l.title_vi)}</option>`).join("")}</select></label>
        <div data-document-import></div><details><summary>Công cụ soạn nâng cao: rubric</summary><form data-rubric class="account-form"><label>Tên định danh rubric<input name="rubric_key" required maxlength="120"></label><label>Dạng bài<select name="kind"><option value="writing">Viết</option><option value="translation">Dịch</option><option value="speaking">Nói</option></select></label><label>Tiêu chí và trọng số (mỗi dòng: tên | điểm tối đa; tổng 10)<textarea name="criteria" required rows="4" placeholder="Nội dung | 6&#10;Ngữ pháp | 4"></textarea></label><button class="st-button">Lưu phiên bản rubric</button></form></details>
        <details ${advancedQuestionOpen ? "open" : ""}><summary>Công cụ soạn nâng cao: phiên bản câu hỏi</summary><form data-question class="account-form"><label>Mã câu ổn định<input name="question_key" required maxlength="120" placeholder="Ví dụ: bai4_cau01"></label><label>Dạng<select name="kind"><option value="mcq">Trắc nghiệm</option><option value="true_false">Đúng / sai</option><option value="text_fill">Điền từ</option><option value="reorder">Sắp xếp từ</option><option value="multi_fill">Nhiều chỗ trống</option><option value="matching">Ghép cặp</option><option value="translation">Dịch mở</option><option value="writing">Viết</option><option value="speaking">Nói (chưa mở ghi âm)</option></select></label><label>Câu hỏi<textarea name="prompt" required rows="3" maxlength="12000"></textarea></label><label>Lựa chọn (mỗi dòng: A | nội dung; sắp xếp từ: mỗi dòng một từ)<textarea name="options" rows="4"></textarea></label><label>Đáp án (MCQ: mã; đúng/sai: true/false; điền/sắp xếp: mỗi cách đúng một dòng; nhiều chỗ trống: mỗi chỗ một dòng, cách đúng thay thế ngăn bởi |; ghép cặp: trái=phải)<textarea name="answer" rows="3"></textarea></label><label>Rubric cho bài mở<select name="rubric_version_id"><option value="">Chọn rubric</option>${data.rubrics.map((r) => `<option value="${esc(r.id)}">${text(r.rubric_key)} · ${text(r.kind)} · v${r.version}</option>`).join("")}</select></label><label>Giải thích (chỉ Admin)<textarea name="explanation" rows="2"></textarea></label><label>Gợi ý (chỉ Admin)<textarea name="tip" rows="2"></textarea></label><button class="st-button">Lưu phiên bản câu hỏi mới</button><p class="st-help">Dùng lại mã câu để tạo phiên bản tiếp theo; bản cũ được giữ. Kiểm tra tính duy nhất của đáp án trước khi xuất bản.</p></form></details>
        <div data-write-recovery></div><details><summary>Công cụ nhập có cấu trúc</summary><div data-import></div></details><label><input type="checkbox" data-show-archived ${includeArchived ? "checked" : ""}> Hiện phiên bản đã archive</label>
        <form data-definition class="account-form"><h4>Chọn phiên bản câu cho đề mới</h4><p>Câu đã chọn được giữ khi đổi trang. Chọn phiên bản khác của cùng mã sẽ thay thế tại vị trí cũ.</p>${data.questions.map((q) => `<div class="assignment-question"><label class="assignment-choice"><input type="checkbox" name="question" value="${esc(q.id)}" ${q.archive?.archived ? "disabled" : ""}>${text(q.question_key)} · v${q.version} ${q.archive?.archived ? "· Đã archive" : ""} · ${text(q.prompt)}</label><p class="st-help">${text(sourceDescription(q))}</p><div class="account-actions"><button class="st-button" type="button" data-edit-question="${esc(q.id)}">Sửa thành phiên bản mới</button><button class="st-button" type="button" data-copy-question="${esc(q.id)}">Nhân bản câu</button></div><label>Lý do ${q.archive?.archived ? "khôi phục quyền chọn" : "archive phiên bản"}<input data-archive-reason="${esc(q.id)}" maxlength="1000"></label><button class="st-button" type="button" data-archive-question="${esc(q.id)}">${q.archive?.archived ? "Khôi phục quyền chọn" : "Archive phiên bản"}</button></div>`).join("") || "<p>Chưa có câu hỏi.</p>"}<section data-selection aria-label="Thứ tự câu trong đề"></section><label>Tên đề<input name="title" required maxlength="200" value="${esc(selection.title)}"></label><label>Giới hạn phút (để trống nếu không giới hạn)<input name="time_limit_minutes" type="number" min="1" max="240" value="${esc(selection.minutes)}"></label><button class="st-button">Lưu đề nháp</button></form>
        <div class="account-actions"><button class="st-button" data-bank-prev ${bankPage ? "" : "disabled"}>← Câu trước</button><button class="st-button" data-bank-next ${data.questions.length === 20 ? "" : "disabled"}>Câu sau →</button></div>
        <h4>Phiên bản đề</h4>${data.definitions.map((v) => `<div class="assignment-row"><span>${text(v.title)} · v${v.version} · ${v.status === "draft" ? "Nháp" : "Đã xuất bản"}</span><button class="st-button" data-definition-preview="${esc(v.id)}">Xem trước</button></div>`).join("")}
        <button class="st-button" data-enable>${data.settings?.enabled ? "Tạm dừng nhận lượt mới" : "Mở nhận bài nộp"}</button><div data-definition-output></div>`;
      mountDocumentExamImport(content.querySelector("[data-document-import]"), {
        lessonId: lesson,
        ownerId: profile.user_id,
        onSaved: () => {
          bankPage = 0;
          bank(lesson);
        },
      });
      mountAssignmentImport(
        content.querySelector("[data-import]"),
        lesson,
        author,
        () => {
          bankPage = 0;
          bank(lesson);
        },
      );
      content.querySelector("[data-show-archived]").onchange = (e) => {
        includeArchived = e.target.checked;
        bankPage = 0;
        bank(lesson);
      };
      for (const button of content.querySelectorAll("[data-archive-question]"))
        button.onclick = async () => {
          const q = data.questions.find(
            (q) => q.id === button.dataset.archiveQuestion,
          );
          const field = [
            ...content.querySelectorAll("[data-archive-reason]"),
          ].find((f) => f.dataset.archiveReason === q.id);
          const reason = field.value.trim();
          if (!reason && !archiveRequests.has(q.id)) {
            report(Error("ARCHIVE_REASON_REQUIRED"));
            field.focus();
            return;
          }
          if (!archiveRequests.has(q.id)) {
            if (
              !window.confirm(
                q.archive?.archived
                  ? "Khôi phục quyền chọn phiên bản này cho đề mới?"
                  : "Archive phiên bản này? Đề đã xuất bản và bài cũ vẫn dùng đúng phiên bản của mình.",
              )
            )
              return;
            archiveRequests.set(q.id, {
              request_id: crypto.randomUUID(),
              question_version_id: q.id,
              archived: !q.archive?.archived,
              revision: q.archive?.revision || 0,
              reason,
            });
          }
          button.disabled = true;
          field.disabled = true;
          try {
            await author("archive", archiveRequests.get(q.id));
            archiveRequests.delete(q.id);
            selection.remove(q.id);
            if (active && generation === request) bank(lesson);
          } catch (error) {
            if (
              [
                "P0001",
                "40001",
                "42501",
                "23514",
                "23503",
                "23505",
                "22P02",
              ].includes(error?.code)
            )
              archiveRequests.delete(q.id);
            report(error);
          } finally {
            if (button.isConnected) {
              button.disabled = false;
              field.disabled = archiveRequests.has(q.id);
              if (archiveRequests.has(q.id))
                button.textContent = "Kiểm tra / thử lại cùng yêu cầu";
            }
          }
        };
      content.querySelector("[data-lesson]").onchange = (e) => {
        if (
          selection.questions.length &&
          !window.confirm(
            "Đổi bài học sẽ bỏ danh sách câu đang chọn chưa lưu. Tiếp tục?",
          )
        ) {
          e.target.value = lesson;
          return;
        }
        bankPage = 0;
        bank(e.target.value);
      };
      content.querySelector("[data-bank-prev]").onclick = () => {
        bankPage--;
        bank(lesson);
      };
      content.querySelector("[data-bank-next]").onclick = () => {
        bankPage++;
        bank(lesson);
      };
      async function submitForm(form, action, payload) {
        const controls = [
          ...content.querySelectorAll("input,textarea,select,button"),
        ].map((node) => ({ node, disabled: node.disabled }));
        for (const { node } of controls) node.disabled = true;
        try {
          if (action === "question_create")
            await writes.save(payload.question, payload.metadata);
          else await command(action, payload);
          if (action === "definition_create")
            selection = new AssignmentSelection(lesson);
          if (active && generation === request) bank(lesson);
        } catch (error) {
          report(error);
        } finally {
          for (const { node, disabled } of controls)
            if (node.isConnected) node.disabled = disabled;
          if (active && generation === request) renderWriteRecovery();
        }
      }
      content.querySelector("[data-rubric]").onsubmit = (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        f.criteria = f.criteria
          .split("\n")
          .filter((s) => s.trim())
          .map((s, i) => {
            const [label, weight] = s.split("|");
            return {
              id: `criterion_${i + 1}`,
              label: label.trim(),
              weight: Number(weight),
            };
          });
        submitForm(e.currentTarget, "rubric_create", f);
      };
      const generator = mountDistractorGenerator(
        content.querySelector("[data-question]"),
      );
      const advancedDetails = content
        .querySelector("[data-question]")
        .closest("details");
      advancedDetails.ontoggle = () => {
        advancedQuestionOpen = advancedDetails.open;
      };
      let parentVersion = null;
      function renderWriteRecovery() {
        const form = content.querySelector("[data-question]"),
          box = content.querySelector("[data-write-recovery]");
        if (!writes.pending) {
          box.replaceChildren();
          return;
        }
        for (const control of form.querySelectorAll(
          "input,textarea,select,button",
        ))
          control.disabled = true;
        box.innerHTML =
          '<p>Chưa nhận được xác nhận lưu câu. Giữ nguyên yêu cầu và kiểm tra/thử lại trước khi tạo câu khác.</p><button class="st-button" type="button">Kiểm tra / thử lại yêu cầu lưu câu</button>';
        box.querySelector("button").onclick = async (e) => {
          e.target.disabled = true;
          try {
            await writes.retry();
            if (active && generation === request) bank(lesson);
          } catch (error) {
            report(error);
            if (!writes.pending && active && generation === request)
              bank(lesson);
          } finally {
            if (e.target.isConnected) e.target.disabled = false;
          }
        };
      }
      renderWriteRecovery();
      content.querySelector("[data-question]").onsubmit = (e) => {
        e.preventDefault();
        try {
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const payload = questionPayload(f, lesson);
          generator.validate(payload);
          submitForm(e.currentTarget, "question_create", {
            question: payload,
            metadata: {
              parent_version_id: parentVersion,
              generator: generator.metadata(payload),
            },
          });
        } catch (error) {
          report(error);
        }
      };
      const definitionForm = content.querySelector("[data-definition]");
      definitionForm.querySelector('[name="title"]').oninput = (e) => {
        selection.title = e.target.value;
      };
      definitionForm.querySelector('[name="time_limit_minutes"]').oninput = (
        e,
      ) => {
        selection.minutes = e.target.value;
      };
      function renderSelection() {
        for (const input of definitionForm.querySelectorAll(
          '[name="question"]',
        ))
          input.checked = selection.questions.some((q) => q.id === input.value);
        const selected = content.querySelector("[data-selection]");
        selected.innerHTML = `<h4>Thứ tự đề · ${selection.questions.length} câu</h4>${selection.questions.map((q, i) => `<div class="assignment-row"><span>${i + 1}. ${text(q.question_key)} · v${q.version}<br>${text(q.prompt)}</span><div class="account-actions"><button class="st-button" type="button" data-move-up="${esc(q.id)}" aria-label="Đưa câu ${i + 1} lên" ${i ? "" : "disabled"}>↑</button><button class="st-button" type="button" data-move-down="${esc(q.id)}" aria-label="Đưa câu ${i + 1} xuống" ${i + 1 < selection.questions.length ? "" : "disabled"}>↓</button><button class="st-button" type="button" data-remove-question="${esc(q.id)}">Bỏ khỏi đề</button></div></div>`).join("") || "<p>Chưa chọn câu. Danh sách này chưa được lưu trên máy chủ.</p>"}`;
        for (const button of selected.querySelectorAll("button"))
          button.onclick = () => {
            if (button.dataset.removeQuestion)
              selection.remove(button.dataset.removeQuestion);
            else
              selection.move(
                button.dataset.moveUp || button.dataset.moveDown,
                button.dataset.moveUp ? -1 : 1,
              );
            renderSelection();
          };
      }
      for (const input of definitionForm.querySelectorAll('[name="question"]'))
        input.onchange = () => {
          try {
            if (input.checked)
              selection.choose(
                data.questions.find((q) => q.id === input.value),
              );
            else selection.remove(input.value);
            renderSelection();
          } catch (error) {
            input.checked = false;
            report(error);
          }
        };
      renderSelection();
      for (const button of content.querySelectorAll(
        "[data-edit-question],[data-copy-question]",
      ))
        button.onclick = () => {
          if (writes.pending) {
            report(Error("AUTHORING_PENDING_CHANGED"));
            return;
          }
          const q = data.questions.find(
            (q) =>
              q.id ===
              (button.dataset.editQuestion || button.dataset.copyQuestion),
          );
          const values = questionForm(q, !!button.dataset.copyQuestion),
            form = content.querySelector("[data-question]");
          const rubricSelect = form.elements.namedItem("rubric_version_id");
          if (
            values.rubric_version_id &&
            ![...rubricSelect.options].some(
              (o) => o.value === values.rubric_version_id,
            )
          ) {
            const option = document.createElement("option");
            option.value = values.rubric_version_id;
            option.textContent = "Rubric của phiên bản gốc";
            rubricSelect.add(option);
          }
          for (const [name, value] of Object.entries(values))
            form.elements.namedItem(name).value = value;
          generator.reset();
          parentVersion = q.id;
          form.closest("details").open = true;
          form.elements.namedItem("question_key").focus();
          root.querySelector("[data-status]").textContent = button.dataset
            .copyQuestion
            ? "Bản sao đang ở form. Đặt mã câu mới trước khi lưu."
            : `Đang sửa từ v${q.version}. Lưu sẽ tạo phiên bản mới; bài đã nộp và điểm đã công bố giữ nguyên.`;
        };
      content.querySelector("[data-definition]").onsubmit = (e) => {
        e.preventDefault();
        try {
          submitForm(e.currentTarget, "definition_create", selection.payload());
        } catch (error) {
          report(error);
        }
      };
      for (const b of content.querySelectorAll("[data-definition-preview]"))
        b.onclick = async () => {
          try {
            const v = await command("definition_preview", {
              version_id: b.dataset.definitionPreview,
            });
            if (!active || generation !== request) return;
            const box = content.querySelector("[data-definition-output]");
            box.innerHTML = `<section class="account-notice"><h4>${text(v.title)} · v${v.version}</h4>${(v.contexts || []).map((c) => `<section class="assignment-question"><h4>${text(c.title)}</h4><p class="assignment-prompt">${text(c.content)}</p></section>`).join("")}${v.questions.map((q, i) => `<div class="assignment-question"><p>${i + 1}. ${text(q.prompt)}<br><small>${text(q.kind)} · v${q.version} · 10 điểm</small></p><p>Lựa chọn: ${text(JSON.stringify(q.options))}</p><p>Đáp án (chỉ Admin): ${text(JSON.stringify(q.answer_key))}</p><p>Giải thích: ${text(q.explanation)}<br>Gợi ý: ${text(q.tip)}</p></div>`).join("")}${v.status === "draft" ? '<button class="st-button primary" data-publish-definition>Xuất bản đề này</button>' : ""}<button class="st-button" data-reuse-definition>Tạo nháp từ phiên bản này</button><p>Phục hồi nội dung bằng đề mới: lưu nháp, xem trước rồi xuất bản. Lịch sử cũ giữ nguyên.</p></section>`;
            box.querySelector("[data-reuse-definition]").onclick = () => {
              if (
                selection.questions.length &&
                !window.confirm(
                  "Thay danh sách câu chưa lưu bằng phiên bản đề này?",
                )
              )
                return;
              try {
                selection = selection.reuse(v);
                bankPage = 0;
                bank(lesson);
              } catch (error) {
                report(error);
              }
            };
            box
              .querySelector("[data-publish-definition]")
              ?.addEventListener("click", async () => {
                if (
                  !window.confirm(
                    "Xuất bản đề đã xem trước? Lượt làm mới sẽ dùng phiên bản này khi bài được mở.",
                  )
                )
                  return;
                try {
                  await command("definition_publish", { version_id: v.id });
                  if (active && generation === request) bank(lesson);
                } catch (error) {
                  report(error);
                }
              });
          } catch (error) {
            report(error);
          }
        };
      content.querySelector("[data-enable]").onclick = async () => {
        if (
          !window.confirm(
            data.settings?.enabled
              ? "Tạm dừng lượt mới? Bài đang làm và lịch sử vẫn được giữ."
              : "Mở nhận bài chính thức? Học viên sẽ chuyển sang luồng nộp và chờ công bố.",
          )
        )
          return;
        try {
          await command("enable", {
            lesson_id: lesson,
            enabled: !data.settings?.enabled,
          });
          if (active && generation === request) bank(lesson);
        } catch (error) {
          report(error);
        }
      };
    } catch (error) {
      report(error);
    }
  }
  queue();
  return () => {
    disposePlayers();
    active = false;
    request++;
  };
}
