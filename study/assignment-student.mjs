import { confirmAssignment } from "./assignment-dialog.mjs";
import { mountRecorder } from "./recording-ui.mjs";
import {
  assignmentCommand as call,
  assignmentMessage,
  assignmentText as text,
} from "./assignment-service.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { safeMedia } from "./media-url.mjs";
import { createAssignmentDraft } from "./assignment-draft.mjs";
import { mountAssignmentMakeup, makeupLink } from "./assignment-makeup.mjs";

export function mountAssignments(root, profile) {
  let recorders = [];
  const disposeRecorders = () => {
    recorders.forEach((r) => r.dispose());
    recorders = [];
  };
  let active = true,
    request = 0,
    draft,
    timer,
    debounce,
    catalogPage = 0,
    historyPage = 0;
  root.classList.add("assignment-workspace");
  const command = (name, payload) => call(name, payload, profile.user_id);
  const online = () => {
    if (draft) draft.flush().catch(() => {});
  };
  window.addEventListener("online", online);
  const disconnect = () => {
    disposeRecorders();
    active = false;
    request++;
    draft?.dispose();
    clearInterval(timer);
    clearTimeout(debounce);
    window.removeEventListener("online", online);
    makeupDispose?.();
  };
  function report(error) {
    const status = root.querySelector("[data-status]");
    if (status) status.textContent = assignmentMessage(error);
  }
  async function list() {
    disposeRecorders();
    draft?.dispose();
    draft = null;
    clearInterval(timer);
    clearTimeout(debounce);
    const generation = ++request;
    root.innerHTML =
      '<h3>Bài nộp HSK / HSKK</h3><p data-status role="status">Đang tải…</p>';
    try {
      const [catalog, mine] = await Promise.all([
        command("catalog", { page: catalogPage }),
        command("mine", { page: historyPage }),
      ]);
      if (!active || generation !== request) return;
      root.innerHTML = `<h3>Bài nộp HSK / HSKK</h3><p>Bài có câu tự luận sẽ được Bách Hữu chấm. Kết quả hiển thị sau khi được công bố.</p><p data-status role="status"></p>
        <div class="account-grid"><section><h4>Bài đang mở</h4>${catalog.length ? catalog.map((l) => `<div class="assignment-row"><span>${text(l.course_title)} · ${text(l.title_vi)}</span><button class="st-button" data-start="${esc(l.id)}">Bắt đầu lượt mới</button></div>`).join("") : "<p>Chưa có bài được mở nhận bài nộp.</p>"}<div class="account-actions"><button class="st-button" data-catalog-prev ${catalogPage ? "" : "disabled"}>← Trước</button><button class="st-button" data-catalog-next ${catalog.length === 20 ? "" : "disabled"}>Sau →</button></div></section>
        <section><h4>Bài của bạn</h4>${mine.length ? mine.map((a) => `<div class="assignment-row"><span>${text(a.title_vi)}<small>${new Date(a.started_at).toLocaleString("vi-VN")} · ${a.state === "draft" ? "Đang làm" : a.published_revision ? "Đã có kết quả" : "Chờ công bố"}</small></span><button class="st-button" data-open="${esc(a.id)}">${a.makeup_window_id ? "Nộp bù" : a.state === "draft" ? "Tiếp tục" : "Xem bài"}</button></div>`).join("") : "<p>Chưa có bài nộp chính thức.</p>"}<div class="account-actions"><button class="st-button" data-history-prev ${historyPage ? "" : "disabled"}>← Trước</button><button class="st-button" data-history-next ${mine.length === 20 ? "" : "disabled"}>Sau →</button></div></section></div>`;
      for (const button of root.querySelectorAll("[data-start]"))
        button.onclick = async () => {
          button.disabled = true;
          // Persist request ID before contacting server: retry/reload cannot duplicate the start.
          const key = `hnh.assignment.start:${profile.user_id}:${button.dataset.start}`;
          let id;
          try {
            id = localStorage.getItem(key) || crypto.randomUUID();
            localStorage.setItem(key, id);
            const data = await command("start", {
              lesson_id: button.dataset.start,
              request_id: id,
            });
            localStorage.removeItem(key);
            if (active && generation === request) render(data);
          } catch (error) {
            report(error);
            button.disabled = false;
          }
        };
      for (const button of root.querySelectorAll("[data-open]"))
        button.onclick = () => {
          const previous = mine.find((a) => a.id === button.dataset.open);
          if (previous?.makeup_window_id) {
            location.href = makeupLink(previous.id, previous.makeup_exam_code);
            return;
          }
          if (previous?.lesson_id === "exam-H71002") {
            location.href =
              "hskk-de-thi.html?exam=H71002&attempt=" +
              encodeURIComponent(previous.id);
            return;
          }
          open(button.dataset.open);
        };
      for (const [selector, action] of [
        ["[data-catalog-prev]", () => catalogPage--],
        ["[data-catalog-next]", () => catalogPage++],
        ["[data-history-prev]", () => historyPage--],
        ["[data-history-next]", () => historyPage++],
      ])
        root.querySelector(selector).onclick = () => {
          action();
          list();
        };
      const selected = new URL(location.href).searchParams.get("assignment");
      const link = [...root.querySelectorAll("[data-start]")].find(
        (b) => b.dataset.start === selected,
      );
      if (link) {
        link.scrollIntoView({ block: "center" });
        link.focus();
      }
    } catch (error) {
      if (generation === request) report(error);
    }
  }
  async function open(id) {
    const generation = ++request;
    try {
      const data = await command("get", { attempt_id: id });
      if (active && generation === request) render(data);
    } catch (error) {
      report(error);
    }
  }
  function render(data) {
    disposeRecorders();
    draft?.dispose();
    clearInterval(timer);
    clearTimeout(debounce);
    const locked = data.state !== "draft";
    const speaking = data.answers.some((a) => a.question.kind === "speaking");
    root.classList.toggle("speaking-layout", speaking);
    let questionIndex = 0;
    const localKey = `hnh.assignment.draft:${profile.user_id}:${data.attempt_id}`;
    let lateAnswers;
    if (locked) {
      try {
        const stored = JSON.parse(localStorage.getItem(localKey) || "null");
        if (
          stored?.attemptId === data.attempt_id &&
          stored.answers &&
          Object.keys(stored.answers).length
        )
          lateAnswers = stored.answers;
      } catch {
        /* Server result remains readable when browser storage is blocked. */
      }
    }
    root.innerHTML = `<div class="speaking-intro"><p class="st-eyebrow">${speaking ? "BÀI LUYỆN NÓI · HSKK" : "BÀI LUYỆN TẬP · HSK / HSKK"}</p><div class="assignment-heading"><h3>${text(data.title)}</h3><button class="st-button" data-back>Danh sách bài</button></div>
      <p class="assignment-intro">${speaking ? "Bạn hãy đọc kỹ yêu cầu và ghi âm câu trả lời bằng tiếng Trung." : "Hoàn thành từng câu và kiểm tra bài trước khi nộp."}</p>${speaking && !locked ? '<ul class="speaking-guide"><li>① Đọc yêu cầu</li><li>② Bấm ghi âm</li><li>③ Dừng để tự động lưu</li><li>④ Xem lại rồi nộp</li></ul>' : ""}</div><p data-clock role="timer"></p><p data-status role="status" aria-live="polite">${locked ? "✓ Đã nộp bài thành công. Bài của bạn đã được lưu. " + (data.result ? "Kết quả đã công bố." : "Đang chờ công bố kết quả.") : "Bản nháp được lưu theo tài khoản."}</p>
      ${data.result ? `<div class="assignment-result"><strong>Tổng điểm: ${data.result.normalized_score}/100</strong><p>${data.result.raw_score}/${data.result.raw_max_score} điểm gốc · Công bố ${new Date(data.result.published_at).toLocaleString("vi-VN")}</p></div>` : ""}
      ${speaking ? `<div class="speaking-progress"><span data-progress-label>Câu 1 / ${data.answers.length}</span><progress data-progress value="1" max="${data.answers.length}" aria-label="Tiến độ câu hỏi"></progress></div><nav class="speaking-nav" aria-label="Chọn câu hỏi">${data.answers.map((a, i) => `<button type="button" class="st-button" data-step-question="${i}" aria-label="Câu ${i + 1}" ${i === 0 ? 'aria-current="step"' : ""}>${i + 1}<span data-complete="${esc(a.question.id)}">${a.answer?.recording_id ? " ✓" : ""}</span></button>`).join("")}</nav>` : ""}
      ${(data.contexts || []).map((c, i) => `<section class="assignment-question" id="student-context-${i}"><h4>${text(c.title)}</h4><p class="assignment-prompt">${text(c.content)}</p></section>`).join("")}<form data-answers>${data.answers
        .map(({ question: q, answer, position }) => {
          const grade = data.result?.questions.find(
            (g) => g.question_version_id === q.id,
          );
          let input;
          if (q.kind === "mcq" || q.kind === "true_false") {
            const options =
              q.kind === "mcq"
                ? q.options
                : [
                    { id: "true", text: "Đúng" },
                    { id: "false", text: "Sai" },
                  ];
            input = options
              .map(
                (o) =>
                  `<label class="assignment-choice"><input type="radio" name="${esc(q.id)}" value="${esc(o.id)}" ${String(answer) === o.id ? "checked" : ""}>${text(o.text)}</label>`,
              )
              .join("");
          } else if (q.kind === "speaking") input = "";
          else
            input = `<label>${q.kind === "multi_fill" ? "Mỗi chỗ trống một dòng" : q.kind === "reorder" ? "Sắp xếp các từ; phân cách bằng dấu |" : q.kind === "matching" ? "Mỗi cặp một dòng: mã bên trái = mã bên phải" : "Câu trả lời"}
          <textarea name="${esc(q.id)}" rows="3" maxlength="12000">${esc(
            q.kind === "multi_fill"
              ? (answer || []).join("\n")
              : q.kind === "reorder"
                ? (answer || []).join(" | ")
                : q.kind === "matching"
                  ? Object.entries(answer || {})
                      .map(([k, v]) => `${k} = ${v}`)
                      .join("\n")
                  : answer || "",
          )}</textarea></label>
          ${q.options?.length ? `<p class="st-help">${q.options.map(text).join(" · ")}</p>` : ""}`;
          return `${speaking ? `<section class="speaking-question" data-question-page="${position - 1}" ${position !== 1 ? "hidden" : ""}>` : ""}<fieldset class="assignment-question" data-question="${esc(q.id)}" ${locked ? "disabled" : ""}><legend>Câu ${position} · ${grade ? grade.score : "Tối đa 10"}${grade ? "/10" : " điểm"}</legend><p class="assignment-prompt">${text(q.prompt)}</p>${q.pinyin ? `<p class="st-help">${text(q.pinyin)}</p>` : ""}${q.image && safeMedia(q.image) ? `<img class="assignment-question-image" src="${esc(q.image)}" alt="Hình của câu ${position}" loading="lazy">` : ""}${q.audio && safeMedia(q.audio) ? `<audio controls src="${esc(q.audio)}" aria-label="Audio câu ${position}"></audio>` : ""}${q.context_version_id ? `<p class="st-help">Dùng đoạn đọc chung phía trên.</p>` : ""}${input}${grade?.feedback ? `<p class="assignment-feedback">Nhận xét: ${text(grade.feedback)}</p>` : ""}</fieldset>${q.kind === "speaking" ? `<div class="assignment-question" data-recorder="${esc(q.id)}"></div>` : ""}${speaking ? "</section>" : ""}`;
        })
        .join(
          "",
        )}<div class="speaking-controls">${speaking ? '<button type="button" class="st-button" data-question-prev disabled>← Câu trước</button><button type="button" class="st-button primary" data-question-next>Câu tiếp theo →</button>' : ""}</div><div class="account-actions" data-submit-actions ${speaking && !locked ? "hidden" : ""}>${locked ? '<button type="button" class="st-button" data-refresh>Xem lại trạng thái</button>' : '<button type="button" class="st-button" data-save>Lưu ngay</button><button type="submit" class="st-button primary">Xem lại bài</button><button type="button" class="st-button" data-local>Lưu bản trả lời trên máy</button>'}</div></form><section class="speaking-review" data-review hidden aria-label="Xem lại bài trước khi nộp"></section>`;
    root.querySelector("[data-back]").onclick = () => {
      if (recorders.some((r) => r.busy)) {
        report(Error("RECORDING_REQUIRED"));
        return;
      }
      list();
    };
    const pageNodes = [...root.querySelectorAll("[data-question-page]")];
    function showQuestion(index) {
      if (recorders.some((r) => r.busy)) {
        report(Error("RECORDING_REQUIRED"));
        return;
      }
      questionIndex = Math.max(0, Math.min(data.answers.length - 1, index));
      root.querySelector("[data-review]").hidden = true;
      pageNodes.forEach((n, i) => (n.hidden = i !== questionIndex));
      for (const button of root.querySelectorAll("[data-step-question]")) {
        if (Number(button.dataset.stepQuestion) === questionIndex)
          button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      }
      root.querySelector("[data-progress-label]").textContent =
        `Câu ${questionIndex + 1} / ${data.answers.length}`;
      root.querySelector("[data-progress]").value = questionIndex + 1;
      root.querySelector("[data-question-prev]").disabled = questionIndex === 0;
      root.querySelector("[data-question-next]").textContent =
        questionIndex === data.answers.length - 1
          ? locked
            ? "Xem lại từ đầu"
            : "Xem lại bài"
          : "Câu tiếp theo →";
      root
        .querySelector("[data-question-next]")
        .classList.toggle(
          "primary",
          !pageNodes[questionIndex]?.querySelector("[data-record].primary"),
        );
    }
    function answered(value, kind) {
      if (kind === "speaking") return !!value?.recording_id;
      if (Array.isArray(value))
        return value.length > 0 && value.every((v) => String(v).trim());
      if (value && typeof value === "object")
        return (
          Object.keys(value).length > 0 &&
          Object.values(value).every((v) => String(v).trim())
        );
      return (
        value !== null && value !== undefined && String(value).trim() !== ""
      );
    }
    function showReview() {
      if (recorders.some((r) => r.busy)) {
        report(Error("RECORDING_REQUIRED"));
        return;
      }
      const values = new Map(
        data.answers.map((a) => [a.question.id, a.answer]),
      );
      for (const a of draft?.snapshot.answers || [])
        values.set(a.question.id, a.answer);
      for (const [id, value] of Object.entries(draft?.pending || {}))
        values.set(id, value);
      const completed = data.answers.filter((a) =>
        answered(values.get(a.question.id), a.question.kind),
      ).length;
      const review = root.querySelector("[data-review]");
      review.innerHTML = `<h4>Xem lại bài của bạn</h4><p>Bạn đã hoàn thành ${completed} / ${data.answers.length} câu.</p><ol>${data.answers.map((a, i) => `<li><span>Câu ${i + 1} · ${answered(values.get(a.question.id), a.question.kind) ? "✓ Đã trả lời" : a.question.kind === "speaking" ? "⚠ Chưa có bản ghi" : "⚠ Chưa hoàn thành"}</span><button class="st-button" type="button" data-review-question="${i}">Quay lại câu ${i + 1}</button></li>`).join("")}</ol><button type="button" class="st-button primary" data-confirm-submit>Nộp bài</button>`;
      review.hidden = false;
      if (speaking) pageNodes.forEach((n) => (n.hidden = true));
      for (const b of review.querySelectorAll("[data-review-question]"))
        b.onclick = () => {
          const index = Number(b.dataset.reviewQuestion);
          if (speaking) showQuestion(index);
          else {
            const question = root.querySelectorAll("[data-question]")[index];
            question.scrollIntoView({ block: "center" });
          }
        };
      review.querySelector("[data-confirm-submit]").onclick = () => submit();
      review.scrollIntoView({ block: "start" });
      review.querySelector("h4").setAttribute("tabindex", "-1");
      review.querySelector("h4").focus();
    }
    if (speaking) {
      root.querySelector("[data-question-prev]").onclick = () =>
        showQuestion(questionIndex - 1);
      root.querySelector("[data-question-next]").onclick = () =>
        questionIndex === data.answers.length - 1
          ? locked
            ? showQuestion(0)
            : showReview()
          : showQuestion(questionIndex + 1);
      for (const b of root.querySelectorAll("[data-step-question]"))
        b.onclick = () => showQuestion(Number(b.dataset.stepQuestion));
      showQuestion(0);
    }
    root
      .querySelector("[data-refresh]")
      ?.addEventListener("click", () => open(data.attempt_id));
    if (locked) {
      mountRecordingInputs();
      draft = null;
      if (lateAnswers) {
        const note = document.createElement("div");
        note.className = "account-notice";
        note.innerHTML =
          '<p>Có câu trả lời trên máy chưa được máy chủ nhận trước khi nộp. Các câu này không thuộc bài đã nộp.</p><button class="st-button" type="button">Tải câu trả lời chưa gửi</button>';
        note.querySelector("button").onclick = () =>
          downloadPending(data.attempt_id, lateAnswers);
        root.append(note);
      }
      return;
    }
    const status = root.querySelector("[data-status]"),
      form = root.querySelector("[data-answers]");
    draft = createAssignmentDraft({
      snapshot: data,
      // Access may itself throw on privacy-restricted browsers; let the draft report it.
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      },
      key: localKey,
      save: (payload) => command("save", payload),
      notify: ({ pending, conflict, storageFailed, error, snapshot }) => {
        if (!active || !status.isConnected) return;
        status.textContent = error
          ? assignmentMessage(error)
          : conflict
            ? assignmentMessage(Error("VERSION_CONFLICT"))
            : storageFailed
              ? "Trình duyệt chưa lưu được bản nháp. Giữ trang mở và bấm Lưu ngay."
              : pending
                ? "Đã giữ bản nháp trên máy; đang chờ đồng bộ."
                : "✓ Đã lưu lúc " +
                  new Date().toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
        if (conflict && !root.querySelector("[data-conflict]")) {
          const actions = document.createElement("div");
          actions.dataset.conflict = "";
          actions.className = "account-notice";
          actions.innerHTML =
            '<p>Bản trên tài khoản đã được sửa ở nơi khác. Bạn có thể tải câu trả lời trên máy để đối chiếu, rồi mở bản mới trên tài khoản.</p><button class="st-button" type="button" data-conflict-export>Tải câu trả lời trên máy</button> <button class="st-button" type="button" data-conflict-remote>Mở bản trên tài khoản</button>';
          actions.querySelector("[data-conflict-export]").onclick = () =>
            downloadPending(data.attempt_id, draft.pending);
          actions.querySelector("[data-conflict-remote]").onclick = () => {
            if (
              !window.confirm(
                "Bỏ bản chưa đồng bộ trên trình duyệt này và mở câu trả lời mới nhất trên tài khoản? Hãy tải bản trên máy trước nếu bạn cần giữ lại.",
              )
            )
              return;
            // Dispose first, then remove the local copy explicitly chosen for replacement.
            draft?.dispose();
            try {
              localStorage.removeItem(localKey);
            } catch (error) {
              report(error);
              return;
            }
            draft = null;
            open(data.attempt_id);
          };
          status.after(actions);
        }
        if (snapshot.state !== "draft")
          queueMicrotask(() => {
            if (active && status.isConnected) render(snapshot);
          });
      },
    });
    // Display recoverable local edits, including conflicts, without silently sending them.
    for (const [id, value] of Object.entries(draft.pending)) {
      const q = data.answers.find((a) => a.question.id === id)?.question;
      if (!q) continue;
      const fields = [...form.elements].filter((e) => e.name === id);
      for (const field of fields) {
        if (field.type === "radio")
          field.checked = field.value === String(value);
        else
          field.value =
            q.kind === "multi_fill"
              ? value.join("\n")
              : q.kind === "reorder"
                ? value.join(" | ")
                : q.kind === "matching"
                  ? Object.entries(value)
                      .map(([k, v]) => `${k} = ${v}`)
                      .join("\n")
                  : value;
      }
    }
    form.addEventListener("input", (event) => {
      const q = data.answers.find(
        (a) => a.question.id === event.target.name,
      )?.question;
      if (!q) return;
      const raw = event.target.value;
      const value =
        q.kind === "true_false"
          ? raw === "true"
          : q.kind === "multi_fill"
            ? raw.split("\n")
            : q.kind === "reorder"
              ? raw
                  .split("|")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : q.kind === "matching"
                ? Object.fromEntries(
                    raw
                      .split("\n")
                      .filter((s) => s.includes("="))
                      .map((s) => s.split("=").map((v) => v.trim())),
                  )
                : raw;
      draft.edit(q.id, value);
      const marker = [...root.querySelectorAll("[data-complete]")].find(
        (n) => n.dataset.complete === q.id,
      );
      if (marker) marker.textContent = answered(value, q.kind) ? " ✓" : "";
      clearTimeout(debounce);
      debounce = setTimeout(() => draft?.flush().catch(() => {}), 500);
    });
    root.querySelector("[data-save]").onclick = () =>
      draft.flush().catch(report);
    root.querySelector("[data-local]").onclick = () => {
      downloadPending(data.attempt_id, draft.pending);
    };
    function downloadPending(attemptId, pendingAnswers) {
      const blob = new Blob(
        [
          JSON.stringify(
            { attempt_id: attemptId, pending_answers: pendingAnswers },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "ban-tra-loi-chua-dong-bo.json";
      link.click();
      URL.revokeObjectURL(url);
    }
    function mountRecordingInputs() {
      for (const node of root.querySelectorAll("[data-recorder]")) {
        const entry = data.answers.find(
          (a) => a.question.id === node.dataset.recorder,
        );
        recorders.push(
          mountRecorder(node, {
            attemptId: data.attempt_id,
            questionId: entry.question.id,
            ownerId: profile.user_id,
            answer: entry.answer,
            locked,
            onState: ({ saved }) => {
              const marker = [...root.querySelectorAll("[data-complete]")].find(
                (n) => n.dataset.complete === entry.question.id,
              );
              if (marker) marker.textContent = saved ? " ✓" : "";
              if (speaking && pageNodes[questionIndex]?.contains(node))
                root
                  .querySelector("[data-question-next]")
                  .classList.toggle("primary", saved);
            },
            onAnswer: async (value) => {
              draft.edit(entry.question.id, value);
              const latest = await draft.flush();
              if (latest.state !== "draft") throw Error("SUBMISSION_LOCKED");
            },
          }),
        );
      }
    }
    mountRecordingInputs();
    let submitting = false;
    async function submit(timeout = false) {
      if (submitting || !active || !form.isConnected) return;
      if (!timeout && recorders.some((r) => r.busy)) {
        status.textContent = "Hãy dừng ghi và lưu bản ghi trước khi nộp bài.";
        return;
      }
      if (timeout) disposeRecorders();
      submitting = true;
      if (
        !timeout &&
        !(await confirmAssignment({
          title: "Bạn có chắc muốn nộp bài?",
          message:
            "Sau khi nộp, bạn không thể chỉnh sửa câu trả lời. Hãy kiểm tra các câu trước khi xác nhận.",
          action: "Nộp bài",
        }))
      ) {
        submitting = false;
        return;
      }
      for (const field of form.querySelectorAll("fieldset,button[type=submit]"))
        field.disabled = true;
      try {
        let latest = draft.snapshot;
        if (!timeout) latest = await draft.flush();
        if (latest.state === "draft")
          latest = await command(timeout ? "get" : "submit", {
            attempt_id: data.attempt_id,
            revision: latest.revision,
          });
        if (active && form.isConnected) render(latest);
      } catch (error) {
        report(error);
        submitting = false;
        if (!timeout)
          for (const field of form.querySelectorAll(
            "fieldset,button[type=submit]",
          ))
            field.disabled = false;
      }
    }
    form.onsubmit = (e) => {
      e.preventDefault();
      showReview();
    };
    const elapsedAtMount = performance.now();
    const remainingAtMount = data.deadline_at
      ? new Date(data.deadline_at) - new Date(data.server_time)
      : null;
    function tick() {
      if (!active || !form.isConnected) return;
      if (remainingAtMount === null) {
        root.querySelector("[data-clock]").hidden = true;
        return;
      }
      const seconds = Math.max(
        0,
        Math.ceil(
          (remainingAtMount - (performance.now() - elapsedAtMount)) / 1000,
        ),
      );
      root.querySelector("[data-clock]").textContent =
        `Còn ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      if (!seconds) {
        for (const field of form.querySelectorAll(
          "fieldset,button[type=submit]",
        ))
          field.disabled = true;
        clearTimeout(debounce);
        submit(true);
      }
    }
    timer = setInterval(tick, 1000);
    tick();
    if (!draft.conflicted) draft.flush().catch(report);
  }
  let makeupDispose;
  const makeupAttempt = new URL(location.href).searchParams.get(
    "makeup_attempt",
  );
  if (makeupAttempt) {
    root.innerHTML = '<p data-status role="status">Đang tải nộp bù…</p>';
    mountAssignmentMakeup(root, {
      attemptId: makeupAttempt,
      ownerId: profile.user_id,
    })
      .then((dispose) => {
        if (active) makeupDispose = dispose;
        else dispose();
      })
      .catch(report);
  } else list();
  return disconnect;
}
