import { confirmAssignment } from "./assignment-dialog.mjs";
import {
  mountQuestionFields,
  mountRubricFields,
} from "./assignment-question-form.mjs";
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
  const learners = new Map();
  const report = (error) => {
    const node = root.querySelector("[data-status]");
    if (node) node.textContent = assignmentMessage(error);
  };
  function shell(title, section = "queue") {
    disposePlayers();
    root.innerHTML = `<div class="assignment-admin-layout"><nav class="assignment-sidebar" aria-label="Quản trị học tập"><button class="st-button" data-overview ${section === "overview" ? 'aria-current="page"' : ""}>Tổng quan</button><button class="st-button" data-queue ${section === "queue" ? 'aria-current="page"' : ""}>Bài nộp</button><button class="st-button" data-bank ${section === "bank" ? 'aria-current="page"' : ""}>Đề</button><button class="st-button" data-students>Học viên</button><details><summary>Tình trạng dịch vụ</summary><button class="st-button" data-audio-health>Kiểm tra ghi âm</button></details></nav><section class="assignment-admin-main"><p class="st-eyebrow">QUẢN TRỊ HỌC TẬP</p><h3>${text(title)}</h3><p data-status role="status" aria-live="polite"></p><div data-content></div></section></div>`;
    root.querySelector("[data-overview]").onclick = () => overview();
    root.querySelector("[data-students]").onclick = () =>
      root.dispatchEvent(
        new CustomEvent("assignment:students", { bubbles: true }),
      );
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
      content = shell("Bài nộp");
    content.innerHTML = "<p>Đang tải…</p>";
    try {
      const list = await command("queue", { ...filters, page });
      list.forEach((a) => learners.set(a.id, a.full_name));
      if (!active || generation !== request) return;
      const snapshots = new Map();
      await Promise.all(
        list
          .filter((a) => a.state === "submitted")
          .map(async (a) => {
            try {
              snapshots.set(a.id, await command("get", { attempt_id: a.id }));
            } catch {
              /* Keep list usable if one score cannot load. */
            }
          }),
      );
      if (!active || generation !== request) return;
      content.innerHTML = `<p class="assignment-intro">Theo dõi và chấm các bài học viên đã nộp.</p><div class="assignment-toolbar"><label>Trạng thái<select data-state-filter><option value="">Tất cả</option><option value="ungraded">Chưa chấm</option><option value="graded">Đã chấm</option></select></label><label>Tìm trong trang hiện tại<input type="search" data-search placeholder="Tên học viên hoặc đề"></label></div><table class="assignment-table"><thead><tr><th>Học viên / Đề</th><th>Thời gian nộp</th><th>Trạng thái</th><th>Điểm</th><th>Thao tác</th></tr></thead><tbody data-queue-rows></tbody></table><p data-empty hidden>Không có bài nộp phù hợp.</p><div class="account-actions"><button class="st-button" data-prev ${page ? "" : "disabled"}>← Trước</button><span>Trang ${page + 1}</span><button class="st-button" data-next ${list.length === 20 ? "" : "disabled"}>Sau →</button></div>`;
      function rows() {
        const query = content
          .querySelector("[data-search]")
          .value.toLocaleLowerCase("vi-VN");
        const state = content.querySelector("[data-state-filter]").value;
        const shown = list.filter((a) => {
          const grade = snapshots.get(a.id)?.grading;
          const graded =
            !!a.published_revision ||
            (!!grade?.grades?.length &&
              grade.grades.every((g) => g.score !== null));
          return (
            (!state || (state === "graded" ? graded : !graded)) &&
            (a.full_name + " " + a.title_vi + " " + a.course_title)
              .toLocaleLowerCase("vi-VN")
              .includes(query)
          );
        });
        content.querySelector("[data-queue-rows]").innerHTML = shown
          .map((a) => {
            const snapshot = snapshots.get(a.id),
              result = snapshot?.result;
            const fullyGraded =
              snapshot?.grading?.grades?.length &&
              snapshot.grading.grades.every((g) => g.score !== null);
            return `<tr><td><strong>${text(a.full_name)}</strong><small>${text(a.title_vi)} · ${text(a.course_title)}</small></td><td data-label="Nộp">${snapshot?.submitted_at ? new Date(snapshot.submitted_at).toLocaleString("vi-VN") : a.state === "draft" ? "Đang làm" : "Đã nộp"}</td><td><span class="assignment-pill ${a.published_revision ? "published" : ""}">${a.state === "draft" ? "Đang làm" : a.published_revision ? "Đã công bố" : fullyGraded ? "Đã chấm · Chưa công bố" : "Chưa chấm"}</span></td><td data-label="Điểm">${result ? result.normalized_score + " / 100" : "—"}</td><td><button class="st-button" data-attempt="${esc(a.id)}">Mở bài</button></td></tr>`;
          })
          .join("");
        content.querySelector("[data-empty]").hidden = !!shown.length;
        for (const button of content.querySelectorAll("[data-attempt]"))
          button.onclick = () => inspect(button.dataset.attempt);
      }
      content.querySelector("[data-search]").oninput = rows;
      content.querySelector("[data-state-filter]").onchange = rows;
      rows();
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
      content = shell("Chi tiết bài nộp");
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
      content.innerHTML = `<p class="assignment-learner">${text(learners.get(id) || "Học viên")}</p><div class="assignment-heading"><h4>${text(data.title)}</h4><span class="assignment-pill ${data.result ? "published" : ""}">${data.result ? "Đã công bố" : data.submitted_at ? "Chờ chấm / công bố" : "Đang làm"}</span></div><p>Bắt đầu: ${new Date(data.started_at).toLocaleString("vi-VN")}<br>Nộp: ${data.submitted_at ? new Date(data.submitted_at).toLocaleString("vi-VN") : "Chưa nộp"} · ${data.duration_seconds ?? "—"} giây${data.timed_out ? " · Hết giờ" : ""}</p>
        ${data.result ? `<p>Kết quả đang công bố: <strong>${data.result.normalized_score}/100</strong> · lần ${data.result.revision}</p>` : ""}
        ${(data.contexts || []).map((c, i) => `<section class="assignment-question" id="admin-context-${i}"><h4>${text(c.title)}</h4><p class="assignment-prompt">${text(c.content)}</p></section>`).join("")}<form data-grades>${data.answers
          .map((a) => {
            const g = grade?.grades.find(
                (x) => x.question_version_id === a.question.id,
              ),
              rubric = g?.rubric;
            return `<fieldset class="assignment-question" data-id="${esc(a.question.id)}" ${editable ? "" : "disabled"}><legend>Câu ${a.position}</legend><p class="assignment-prompt">${text(a.question.prompt)}</p>${a.question.context_version_id ? `<p class="st-help">Dùng đoạn đọc chung phía trên.</p>` : ""}<p><strong>Học viên:</strong> ${
              a.question.kind === "speaking"
                ? a.answer?.recording_id
                  ? "Có bản ghi trả lời"
                  : "Chưa có bản ghi"
                : text(
                    typeof a.answer === "string"
                      ? a.answer
                      : Array.isArray(a.answer)
                        ? a.answer.join(" · ")
                        : Object.entries(a.answer || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · "),
                  )
            }</p><details><summary>Đáp án tham khảo</summary><p>${text(answerLabel(g?.grading_question?.answer_key ?? a.private_question.answer_key))}</p><p>${text(g?.grading_question?.explanation ?? a.private_question.explanation)}</p></details>
            ${rubric ? rubric.criteria.map((c) => `<label>${text(c.label)} / ${c.weight}<input type="number" data-criterion="${esc(c.id)}" min="0" max="${c.weight}" step="0.01" value="${g?.criteria_scores?.[c.id] ?? ""}"></label>`).join("") : `<label>Điểm /10<input type="number" data-score min="0" max="10" step="0.01" value="${g?.score ?? ""}"></label>`}
            <label>Nhận xét cho học viên<textarea data-feedback maxlength="4000" rows="2">${esc(g?.feedback || "")}</textarea></label></fieldset>${a.question.kind === "speaking" ? `<div class="assignment-question" data-recording-playback="${esc(a.question.id)}"></div>` : ""}`;
          })
          .join("")}
        ${editable ? '<div class="account-actions assignment-sticky"><button class="st-button primary" type="submit">Lưu điểm</button><button class="st-button" type="button" data-preview>Xem trước kết quả</button><button class="st-button primary" type="button" data-publish disabled>Công bố kết quả</button></div>' : grade ? `<label>Lý do chấm lại<input data-reason maxlength="1000" required></label><label>Phiên bản chấm mới cho một câu<select data-new-key><option value="">Giữ phiên bản chấm hiện tại</option>${revisedKeys.map((k) => `<option value="${esc(k.original)}:${esc(k.question.id)}">Câu ${k.position} · ${text(k.question.prompt)}</option>`).join("")}</select></label><button class="st-button" type="button" data-regrade>Tạo lần chấm lại</button>` : "<p>Bài đang làm, chưa có bản chấm.</p>"}</form><div data-preview-output></div>`;
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
        content.querySelector("button[data-preview]").disabled = true;
        content.querySelector("button[type=submit]").classList.add("primary");
        content.querySelector("[data-publish]").classList.remove("primary");
        content
          .querySelector("button[data-preview]")
          .classList.remove("primary");
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
          content.querySelector("button[data-preview]").disabled =
            dirty.size > 0;
          content.querySelector("[data-publish]").disabled =
            dirty.size > 0 ||
            data.grading.preview_version !== data.grading.edit_version;
          content
            .querySelector("button[type=submit]")
            .classList.toggle("primary", dirty.size > 0);
          content
            .querySelector("[data-preview]")
            .classList.toggle(
              "primary",
              dirty.size === 0 &&
                content.querySelector("[data-publish]").disabled,
            );
          content
            .querySelector("[data-publish]")
            .classList.toggle(
              "primary",
              !content.querySelector("[data-publish]").disabled,
            );
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
            content.querySelector("button[data-preview]").disabled = false;
          }
        } catch (error) {
          report(error);
        } finally {
          if (active && form.isConnected) busy(false);
        }
      };
      content
        .querySelector("button[data-preview]")
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
            !(await confirmAssignment({
              title: "Công bố kết quả cho học viên?",
              message:
                "Học viên sẽ đọc được điểm và nhận xét của bản bạn vừa xem trước.",
              action: "Công bố kết quả",
            }))
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
      content = shell("Đề", "bank");
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
      const definitionCounts = new Map();
      if (data.definitions.length) {
        const { data: links, error: linkError } = await client
          .from("assignment_version_questions")
          .select("assignment_version_id")
          .in(
            "assignment_version_id",
            data.definitions.map((v) => v.id),
          );
        if (!linkError)
          for (const link of links || [])
            definitionCounts.set(
              link.assignment_version_id,
              (definitionCounts.get(link.assignment_version_id) || 0) + 1,
            );
      }
      const { data: courses } = await client
        .from("courses")
        .select("id,program,level,title");
      const course = courses?.find(
        (c) => c.id === lessons.find((l) => l.id === lesson)?.course_id,
      );
      if (!active || generation !== request) return;
      content.innerHTML = `<label>Bài học<select data-lesson>${lessons.map((l) => `<option value="${esc(l.id)}" ${l.id === lesson ? "selected" : ""}>${text(l.title_vi)}</option>`).join("")}</select></label>
        <section data-exam-list><div class="assignment-heading"><h4>Danh sách đề</h4><button class="st-button primary" data-new-exam>+ Tạo đề mới</button></div><div class="account-actions" role="group" aria-label="Lọc đề"><button class="st-button" data-exam-filter="" aria-pressed="true">Tất cả</button><button class="st-button" data-exam-filter="draft" aria-pressed="false">Nháp</button><button class="st-button" data-exam-filter="published" aria-pressed="false">Đã xuất bản</button></div><table class="assignment-table"><thead><tr><th>Tên đề</th><th>Cấp độ</th><th>Số câu</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>${data.definitions.map((v) => `<tr data-exam-state="${esc(v.status)}"><td><strong>${text(v.title)}</strong></td><td data-label="Cấp độ">${text(course?.title || course?.program || "Theo bài học")}</td><td data-label="Số câu">${v.questions?.length ?? (definitionCounts.has(v.id) ? definitionCounts.get(v.id) : "—")}</td><td><span class="assignment-pill ${v.status === "published" ? "published" : ""}">${v.status === "draft" ? "Nháp" : "Đã xuất bản"}</span></td><td data-label="Cập nhật">${v.published_at || v.created_at ? new Date(v.published_at || v.created_at).toLocaleDateString("vi-VN") : "—"}</td><td><button class="st-button" data-definition-preview="${esc(v.id)}">Xem trước</button></td></tr>`).join("")}</tbody></table><p ${data.definitions.length ? "hidden" : ""}>Chưa có đề. Tạo đề mới hoặc nhập PDF / Word để bắt đầu.</p></section>
        <div data-document-import></div><details><summary>Thiết lập tiêu chí chấm</summary><form data-rubric class="account-form"><label>Tên bộ tiêu chí<input name="rubric_key" required maxlength="120"></label><label>Dạng bài<select name="kind"><option value="writing">Viết</option><option value="translation">Dịch</option><option value="speaking">Nói</option></select></label><label>Tiêu chí và trọng số (mỗi dòng: tên | điểm tối đa; tổng 10)<textarea name="criteria" required rows="4" placeholder="Nội dung | 6&#10;Ngữ pháp | 4"></textarea></label><button class="st-button">Lưu bộ tiêu chí</button></form></details>
        <details ${advancedQuestionOpen ? "open" : ""}><summary>Thêm / sửa câu hỏi</summary><form data-question class="account-form"><input type="hidden" name="question_key" value="${crypto.randomUUID()}" required><label>Dạng<select name="kind"><option value="mcq">Trắc nghiệm</option><option value="true_false">Đúng / sai</option><option value="text_fill">Điền từ</option><option value="reorder">Sắp xếp từ</option><option value="multi_fill">Nhiều chỗ trống</option><option value="matching">Ghép cặp</option><option value="translation">Dịch mở</option><option value="writing">Viết</option><option value="speaking">Nói (chưa mở ghi âm)</option></select></label><label>Câu hỏi<textarea name="prompt" required rows="3" maxlength="12000"></textarea></label><label>Các lựa chọn<textarea name="options" rows="4"></textarea></label><label>Đáp án đúng<textarea name="answer" rows="3"></textarea></label><label>Bộ tiêu chí chấm<select name="rubric_version_id"><option value="">Chọn tiêu chí</option>${data.rubrics.map((r) => `<option value="${esc(r.id)}">${text(r.rubric_key)}</option>`).join("")}</select></label><label>Giải thích (chỉ Admin)<textarea name="explanation" rows="2"></textarea></label><label>Gợi ý (chỉ Admin)<textarea name="tip" rows="2"></textarea></label><button class="st-button">Lưu câu hỏi</button><p class="st-help">Nội dung cũ và bài đã nộp luôn được giữ. Hãy kiểm tra đáp án trước khi xuất bản.</p></form></details>
        <div data-write-recovery></div><details data-developer-tools hidden><summary>Công cụ nhập có cấu trúc</summary><div data-import></div></details><label><input type="checkbox" data-show-archived ${includeArchived ? "checked" : ""}> Hiện câu đã lưu trữ</label>
        <form data-definition class="account-form"><h4>Chọn câu hỏi cho đề</h4><p>Chọn câu từ ngân hàng, sắp xếp lại rồi đặt tên và lưu đề.</p>${data.questions.map((q) => `<div class="assignment-question"><label class="assignment-choice"><input type="checkbox" name="question" value="${esc(q.id)}" ${q.archive?.archived ? "disabled" : ""}>${q.archive?.archived ? "Đã lưu trữ · " : ""}${text(q.prompt)}</label><details><summary>Nguồn tài liệu</summary><p class="st-help">${text(q.provenance?.source || "Nguồn tài liệu chưa được xác định")}${q.provenance?.imported_at ? " · Nhập ngày " + new Date(q.provenance.imported_at).toLocaleDateString("vi-VN") : ""}</p></details><div class="account-actions"><button class="st-button" type="button" data-edit-question="${esc(q.id)}">Sửa</button><button class="st-button" type="button" data-copy-question="${esc(q.id)}">Nhân bản câu</button></div><label>Lý do ${q.archive?.archived ? "khôi phục quyền chọn" : "lưu trữ câu"}<input data-archive-reason="${esc(q.id)}" maxlength="1000"></label><button class="st-button" type="button" data-archive-question="${esc(q.id)}">${q.archive?.archived ? "Khôi phục quyền chọn" : "Lưu trữ câu"}</button></div>`).join("") || "<p>Chưa có câu hỏi.</p>"}<section data-selection aria-label="Thứ tự câu trong đề"></section><label>Tên đề<input name="title" required maxlength="200" value="${esc(selection.title)}"></label><label>Giới hạn phút (để trống nếu không giới hạn)<input name="time_limit_minutes" type="number" min="1" max="240" value="${esc(selection.minutes)}"></label><div class="assignment-sticky account-actions"><button class="st-button primary">Lưu đề nháp</button><button class="st-button" type="button" data-jump-definitions>Danh sách đề</button></div></form>
        <div class="account-actions"><button class="st-button" data-bank-prev ${bankPage ? "" : "disabled"}>← Câu trước</button><button class="st-button" data-bank-next ${data.questions.length === 20 ? "" : "disabled"}>Câu sau →</button></div>
        <button class="st-button" data-enable>${data.settings?.enabled ? "Tạm dừng nhận lượt mới" : "Mở nhận bài nộp"}</button><div data-definition-output></div>`;
      for (const button of content.querySelectorAll("[data-exam-filter]"))
        button.onclick = () => {
          for (const b of content.querySelectorAll("[data-exam-filter]"))
            b.setAttribute("aria-pressed", String(b === button));
          for (const row of content.querySelectorAll("[data-exam-state]"))
            row.hidden =
              !!button.dataset.examFilter &&
              row.dataset.examState !== button.dataset.examFilter;
        };
      content.querySelector("[data-new-exam]").onclick = () => {
        content
          .querySelector("[data-document-import]")
          .scrollIntoView({ block: "start" });
        content.querySelector("[data-manual]")?.focus();
      };
      content.querySelector("[data-jump-definitions]").onclick = () =>
        content
          .querySelector("[data-exam-list]")
          ?.scrollIntoView({ block: "center" });
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
                  : "Lưu trữ câu này? Đề đã xuất bản và bài cũ vẫn giữ nguyên nội dung.",
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
      mountRubricFields(content.querySelector("[data-rubric]"));
      const generator = mountDistractorGenerator(
        content.querySelector("[data-question]"),
      );
      const questionFields = mountQuestionFields(
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
        selected.innerHTML = `<h4>Thứ tự đề · ${selection.questions.length} câu</h4>${selection.questions.map((q, i) => `<div class="assignment-row"><span>Câu ${i + 1}<br>${text(q.prompt)}</span><div class="account-actions"><button class="st-button" type="button" data-move-up="${esc(q.id)}" aria-label="Đưa câu ${i + 1} lên" ${i ? "" : "disabled"}>↑</button><button class="st-button" type="button" data-move-down="${esc(q.id)}" aria-label="Đưa câu ${i + 1} xuống" ${i + 1 < selection.questions.length ? "" : "disabled"}>↓</button><button class="st-button" type="button" data-remove-question="${esc(q.id)}">Bỏ khỏi đề</button></div></div>`).join("") || "<p>Chưa chọn câu. Danh sách này chưa được lưu trên máy chủ.</p>"}`;
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
            option.textContent = "Bộ tiêu chí của câu gốc";
            rubricSelect.add(option);
          }
          for (const [name, value] of Object.entries(values))
            form.elements.namedItem(name).value = value;
          generator.reset();
          questionFields.render();
          parentVersion = q.id;
          form.closest("details").open = true;
          form.elements.namedItem("prompt").focus();
          root.querySelector("[data-status]").textContent = button.dataset
            .copyQuestion
            ? "Bản sao đang ở form. Chỉnh nội dung rồi lưu câu hỏi."
            : `Đang chỉnh câu hỏi. Nội dung mới sẽ được lưu riêng; bài đã nộp giữ nguyên.`;
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
            box.innerHTML = `<section class="account-notice"><h4>${text(v.title)}</h4>${(v.contexts || []).map((c) => `<section class="assignment-question"><h4>${text(c.title)}</h4><p class="assignment-prompt">${text(c.content)}</p></section>`).join("")}${v.questions.map((q, i) => `<div class="assignment-question"><p>${i + 1}. ${text(q.prompt)}<br><small>10 điểm</small></p><p>Lựa chọn: ${text(q.options.map((o) => (typeof o === "string" ? o : o.text)).join(" · "))}</p><p>Đáp án (chỉ Admin): ${text(answerLabel(q.answer_key))}</p><p>Giải thích: ${text(q.explanation)}<br>Gợi ý: ${text(q.tip)}</p></div>`).join("")}${v.status === "draft" ? '<button class="st-button primary" data-publish-definition>Xuất bản đề này</button>' : ""}<button class="st-button" data-reuse-definition>Tạo bản nháp từ đề này</button><p>Phục hồi nội dung bằng đề mới: lưu nháp, xem trước rồi xuất bản. Lịch sử cũ giữ nguyên.</p></section>`;
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

  function answerLabel(key) {
    if (!key) return "Chấm theo tiêu chí của đề.";
    if (Array.isArray(key.accepted)) return key.accepted.join(" / ");
    if (key.value !== undefined)
      return typeof key.value === "boolean"
        ? key.value
          ? "Đúng"
          : "Sai"
        : String(key.value);
    if (key.values)
      return key.values
        .map((v) => (Array.isArray(v) ? v.join(" / ") : v))
        .join(" · ");
    return Object.entries(key)
      .map(
        ([k, v]) => k + ": " + (Array.isArray(v) ? v.join(" / ") : String(v)),
      )
      .join(" · ");
  }
  async function overview() {
    const generation = ++request,
      content = shell("Tổng quan", "overview");
    content.innerHTML = "<p>Đang tải hoạt động gần đây…</p>";
    try {
      const list = await command("queue", { page: 0 });
      if (!active || generation !== request) return;
      content.innerHTML = `<p class="assignment-intro">Cùng học viên tiến bộ qua từng bài học.</p><p class="st-help">Thống kê trong ${list.length} lượt gần nhất.</p><div class="assignment-stats"><div class="assignment-stat"><span>Chờ chấm / công bố</span><strong>${list.filter((a) => a.state === "submitted" && !a.published_revision).length}</strong></div><div class="assignment-stat"><span>Đã công bố</span><strong>${list.filter((a) => a.published_revision).length}</strong></div><div class="assignment-stat"><span>Đang làm</span><strong>${list.filter((a) => a.state === "draft").length}</strong></div></div><button class="st-button primary assignment-overview-action" data-open-queue>Mở bài nộp</button>`;
      content.querySelector("[data-open-queue]").onclick = () => queue();
    } catch (e) {
      report(e);
    }
  }
  queue();
  return () => {
    disposePlayers();
    active = false;
    request++;
  };
}
