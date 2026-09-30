import { mountRecorder } from "./recording-ui.mjs";
import {
  assignmentCommand as call,
  assignmentMessage,
  assignmentText as text,
} from "./assignment-service.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { createAssignmentDraft } from "./assignment-draft.mjs";

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
        <section><h4>Bài của bạn</h4>${mine.length ? mine.map((a) => `<div class="assignment-row"><span>${text(a.title_vi)}<small>${new Date(a.started_at).toLocaleString("vi-VN")} · ${a.state === "draft" ? "Đang làm" : a.published_revision ? "Đã có kết quả" : "Chờ công bố"}</small></span><button class="st-button" data-open="${esc(a.id)}">${a.state === "draft" ? "Tiếp tục" : "Xem bài"}</button></div>`).join("") : "<p>Chưa có bài nộp chính thức.</p>"}<div class="account-actions"><button class="st-button" data-history-prev ${historyPage ? "" : "disabled"}>← Trước</button><button class="st-button" data-history-next ${mine.length === 20 ? "" : "disabled"}>Sau →</button></div></section></div>`;
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
        button.onclick = () => open(button.dataset.open);
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
    root.innerHTML = `<div class="assignment-heading"><h3>${text(data.title)}</h3><button class="st-button" data-back>Danh sách bài</button></div>
      <p data-clock role="timer"></p><p data-status role="status" aria-live="polite">${locked ? "Bài đã nộp. " + (data.result ? "Kết quả đã công bố." : "Đang chờ công bố kết quả.") : "Bản nháp được lưu theo tài khoản."}</p>
      ${data.result ? `<div class="account-notice"><strong>Tổng điểm: ${data.result.normalized_score}/100</strong><p>${data.result.raw_score}/${data.result.raw_max_score} điểm gốc · Công bố ${new Date(data.result.published_at).toLocaleString("vi-VN")}</p></div>` : ""}
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
          } else if (q.kind === "speaking")
            input = "<p>Bản ghi gắn với đúng phiên bản câu hỏi này.</p>";
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
          return `<fieldset class="assignment-question" data-question="${esc(q.id)}" ${locked ? "disabled" : ""}><legend>Câu ${position} · ${grade ? grade.score : "Tối đa 10"}${grade ? "/10" : " điểm"}</legend><p class="assignment-prompt">${text(q.prompt)}</p>${q.context_version_id ? `<p class="st-help">Dùng đoạn đọc chung phía trên.</p>` : ""}${input}${grade?.feedback ? `<p class="assignment-feedback">Nhận xét: ${text(grade.feedback)}</p>` : ""}</fieldset>${q.kind === "speaking" ? `<div class="assignment-question" data-recorder="${esc(q.id)}"></div>` : ""}`;
        })
        .join(
          "",
        )}<div class="account-actions">${locked ? '<button type="button" class="st-button" data-refresh>Xem lại trạng thái</button>' : '<button type="button" class="st-button" data-save>Lưu ngay</button><button type="submit" class="st-button primary">Nộp bài</button><button type="button" class="st-button" data-local>Lưu bản trả lời trên máy</button>'}</div></form>`;
    root.querySelector("[data-back]").onclick = list;
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
                : "Đã lưu bản nháp trên tài khoản.";
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
      if (
        !timeout &&
        !window.confirm(
          "Nộp bài này? Sau khi nộp, bạn không thể sửa câu trả lời.",
        )
      )
        return;
      submitting = true;
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
      submit();
    };
    const elapsedAtMount = performance.now();
    const remainingAtMount = data.deadline_at
      ? new Date(data.deadline_at) - new Date(data.server_time)
      : null;
    function tick() {
      if (!active || !form.isConnected) return;
      if (remainingAtMount === null) {
        root.querySelector("[data-clock]").textContent =
          "Bài này không giới hạn thời gian.";
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
  list();
  return disconnect;
}
