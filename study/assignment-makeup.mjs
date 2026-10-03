import {
  assignmentMakeup,
  assignmentMessage,
  assignmentText as text,
} from "./assignment-service.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { mountRecorder } from "./recording-ui.mjs";
import { uploadRecording } from "./recording-service.mjs";
import { ExamSessionJournal } from "./hskk-session-journal.mjs";
import { safeMedia } from "./media-url.mjs";

export function makeupLink(attemptId, examCode) {
  const url = new URL(
    examCode ? "hskk-de-thi.html" : "tai-khoan.html",
    "https://hanngubachhuu.vercel.app/",
  );
  if (examCode) {
    url.searchParams.set("exam", examCode);
    url.searchParams.set("attempt", attemptId);
    url.searchParams.set("makeup", "1");
  } else url.searchParams.set("makeup_attempt", attemptId);
  return url.href;
}

export async function mountAdminMakeup(root, { attemptId, ownerId }) {
  const call = (command, payload = {}) =>
    assignmentMakeup(command, { attempt_id: attemptId, ...payload }, ownerId);
  const snapshot = await call("inspect");
  if (!root.isConnected) return;
  root.innerHTML = `<p>Chỉ mở các câu máy chủ chưa nhận; giữ nguyên câu đã nhận, phiên bản đề và kết quả cũ.</p><p data-makeup-status role="status">${snapshot.missing_numbers?.length ? "Còn thiếu câu " + text(snapshot.missing_numbers.join(", ")) : "Đã nhận đủ các câu."}</p><button class="st-button" type="button" data-open-makeup ${snapshot.can_open && !snapshot.window_id ? "" : "disabled"}>Mở nộp bù câu chưa nhận</button><p data-makeup-link></p>`;
  const status = root.querySelector("[data-makeup-status]"),
    button = root.querySelector("button");
  const show = (window) => {
    root.querySelector("[data-makeup-link]").innerHTML =
      `<label>Liên kết cho học viên<input readonly value="${esc(makeupLink(attemptId, snapshot.hskk ? snapshot.exam_code : null))}"></label><small>Hạn nộp bù: ${new Date(window.expires_at).toLocaleString("vi-VN")}</small>`;
    button.disabled = true;
  };
  if (snapshot.window_id) show(snapshot);
  const requestId = crypto.randomUUID();
  button.onclick = async () => {
    button.disabled = true;
    try {
      const opened = await call("open", {
        request_id: requestId,
        expected_revision: snapshot.revision,
        expected_version_id: snapshot.version_id,
        expected_missing: snapshot.missing,
      });
      if (!root.isConnected) return;
      show(opened);
      status.textContent =
        "Đã mở nộp bù riêng các câu còn thiếu. Học viên dùng liên kết bên dưới.";
    } catch (error) {
      if (root.isConnected) {
        status.textContent = assignmentMessage(error);
        button.disabled = false;
      }
    }
  };
}

export async function mountAssignmentMakeup(root, { attemptId, ownerId }) {
  const call = (command, payload = {}) =>
    assignmentMakeup(command, { attempt_id: attemptId, ...payload }, ownerId);
  const boot = await call("load");
  const journal = new ExamSessionJournal(
    ownerId,
    attemptId + ":assignment-makeup:" + boot.window_id,
  );
  const pending = new Map(),
    localWrites = new Map(),
    flights = new Map(),
    retries = new Map(),
    recorders = [];
  let alive = true,
    submitting = false;
  const expires = Date.parse(boot.expires_at),
    clock = performance.now(),
    serverAt = Date.parse(boot.server_time);
  const expired = () => serverAt + performance.now() - clock >= expires;
  const accepted = new Set(
    boot.answers.filter((a) => a.answer !== null).map((a) => a.question.id),
  );
  const persist = (id, value) => {
    const task = (localWrites.get(id) || Promise.resolve())
      .catch(() => {})
      .then(() => journal.put(id, value));
    localWrites.set(id, task);
    return task;
  };
  root.innerHTML = `<h3>${text(boot.title)} · Nộp bù</h3><p>Chỉ bổ sung câu chưa được nhận. Các câu đã nhận được giữ nguyên. Bài ghi thời điểm nộp bù thực tế.</p><p>Hạn: ${new Date(expires).toLocaleString("vi-VN")}</p><p data-makeup-status role="status" aria-live="polite"></p>${(boot.contexts || []).map((c) => `<section class="assignment-question"><h4>${text(c.title)}</h4><p>${text(c.content)}</p></section>`).join("")}${boot.answers
    .map((a) => {
      const q = a.question;
      const fields =
        q.kind === "speaking"
          ? "<div data-makeup-recorder></div>"
          : q.kind === "mcq" || q.kind === "true_false"
            ? (q.kind === "true_false"
                ? [
                    { id: "true", text: "Đúng" },
                    { id: "false", text: "Sai" },
                  ]
                : q.options
              )
                .map(
                  (o) =>
                    `<label><input type="radio" name="${esc(q.id)}" value="${esc(o.id)}">${text(o.text)}</label>`,
                )
                .join("")
            : `<label>${q.kind === "multi_fill" ? "Mỗi chỗ trống một dòng" : q.kind === "reorder" ? "Các từ phân cách bằng |" : q.kind === "matching" ? "Mỗi cặp một dòng: mã = mã" : "Câu trả lời"}<textarea rows="4" maxlength="12000" data-value></textarea></label>`;
      return `<section class="assignment-question" data-makeup-question="${esc(q.id)}"><h4>Câu ${a.position}</h4><p class="assignment-prompt">${text(q.prompt)}</p>${q.pinyin ? `<p>${text(q.pinyin)}</p>` : ""}${q.image && safeMedia(q.image) ? `<img class="assignment-question-image" src="${esc(q.image)}" alt="Hình câu ${a.position}">` : ""}${q.audio && safeMedia(q.audio) ? `<audio controls src="${esc(q.audio)}" aria-label="Audio câu ${a.position}"></audio>` : ""}<p data-answer-status></p><fieldset ${accepted.has(q.id) || boot.submitted || boot.expired ? "disabled" : ""}>${fields}${q.kind === "speaking" ? "" : '<button class="st-button" type="button" data-send-answer>Gửi câu bổ sung</button>'}</fieldset></section>`;
    })
    .join(
      "",
    )}<button class="st-button primary" type="button" data-submit-makeup disabled>Nộp bài sau khi bổ sung</button>`;
  const status = root.querySelector("[data-makeup-status]"),
    submit = root.querySelector("[data-submit-makeup]");
  const section = (id) =>
    [...root.querySelectorAll("[data-makeup-question]")].find(
      (n) => n.dataset.makeupQuestion === id,
    );
  function update() {
    if (!alive) return;
    submit.disabled =
      submitting ||
      boot.submitted ||
      expired() ||
      accepted.size !== boot.answers.length ||
      flights.size > 0;
    if (boot.submitted)
      status.textContent =
        "Đã nộp bù thành công. Bài đang chờ Admin chấm và công bố kết quả.";
    else if (expired())
      status.textContent =
        "Lượt nộp bù đã hết hạn. Các câu được nhận vẫn được giữ; nhờ Admin mở lại những câu còn thiếu.";
    for (const a of boot.answers) {
      const node = section(a.question.id);
      node.querySelector("[data-answer-status]").textContent = accepted.has(
        a.question.id,
      )
        ? "Đã được máy chủ nhận"
        : pending.has(a.question.id)
          ? "Bản trả lời được giữ trên máy; đang chờ gửi lại"
          : "Chưa nhận câu bổ sung";
      if (accepted.has(a.question.id) || expired() || boot.submitted)
        node.querySelector("fieldset").disabled = true;
    }
  }
  function valid(entry, id) {
    return (
      entry.ownerId === ownerId &&
      entry.attemptId === attemptId &&
      entry.versionId === boot.assignment_version_id &&
      entry.windowId === boot.window_id &&
      entry.questionId === id
    );
  }
  async function send(id, entry) {
    if (flights.has(id)) return flights.get(id);
    if (!alive || accepted.has(id) || expired() || boot.submitted) return;
    const work = (async () => {
      if (!valid(entry, id)) throw Error("VERSION_CONFLICT");
      await persist(id, entry);
      pending.set(id, entry);
      let value = entry.answer;
      if (entry.blob)
        value = await uploadRecording({
          blob: entry.blob,
          requestId: entry.requestId,
          attemptId,
          questionId: id,
          ownerId,
          assignmentMakeupWindowId: boot.window_id,
        });
      await call("save", {
        window_id: boot.window_id,
        question_version_id: id,
        request_id: entry.requestId,
        answer: value,
      });
      if (!alive) return;
      accepted.add(id);
      pending.delete(id);
      clearTimeout(retries.get(id));
      retries.delete(id);
      await journal.remove(id);
      return value;
    })();
    flights.set(id, work);
    update();
    try {
      return await work;
    } catch (error) {
      if (alive) {
        status.textContent = assignmentMessage(error);
        if (
          !expired() &&
          ![
            "ACCOUNT_CHANGED",
            "VERSION_CONFLICT",
            "RECORDING_LOCKED",
            "LESSON_ACCESS_REQUIRED",
            "UPLOAD_WINDOW_EXPIRED",
          ].includes(error.message)
        ) {
          clearTimeout(retries.get(id));
          retries.set(
            id,
            setTimeout(() => {
              retries.delete(id);
              if (alive) void send(id, entry).catch(() => {});
            }, 15000),
          );
        }
      }
      throw error;
    } finally {
      flights.delete(id);
      update();
    }
  }
  const entry = (id, value) => ({
    ownerId,
    attemptId,
    versionId: boot.assignment_version_id,
    windowId: boot.window_id,
    questionId: id,
    requestId: pending.get(id)?.requestId || crypto.randomUUID(),
    ...value,
  });
  function read(node, kind) {
    if (kind === "mcq" || kind === "true_false") {
      const selected = node.querySelector("input:checked");
      return selected
        ? kind === "true_false"
          ? selected.value === "true"
          : selected.value
        : null;
    }
    const value = node.querySelector("textarea").value.trim();
    if (!value) return null;
    if (kind === "multi_fill") return value.split("\n").map((x) => x.trim());
    if (kind === "reorder") return value.split("|").map((x) => x.trim());
    if (kind === "matching")
      return Object.fromEntries(
        value.split("\n").map((x) => x.split("=").map((y) => y.trim())),
      );
    return value;
  }
  const stored = await journal.load();
  let previousDraft;
  try {
    previousDraft = JSON.parse(
      localStorage.getItem(`hnh.assignment.draft:${ownerId}:${attemptId}`) ||
        "null",
    );
  } catch {
    /* Ignore an unreadable local draft; the server remains authoritative. */
  }
  for (const a of boot.answers) {
    const id = a.question.id,
      node = section(id),
      retained = stored.find((r) => r.questionId === id)?.entry;
    if (retained && valid(retained, id) && !accepted.has(id))
      pending.set(id, retained);
    if (a.question.kind === "speaking") {
      recorders.push(
        mountRecorder(node.querySelector("[data-makeup-recorder]"), {
          attemptId,
          questionId: id,
          ownerId,
          answer: a.answer,
          locked: accepted.has(id) || boot.submitted || boot.expired,
          allowReplay: false,
          lockReceived: true,
          upload: async (value) =>
            send(
              id,
              entry(id, { blob: value.blob, requestId: value.requestId }),
            ),
          onState: update,
        }),
      );
    } else {
      const retainedValue =
        retained?.answer ??
        (previousDraft?.attemptId === attemptId
          ? previousDraft.answers?.[id]
          : undefined);
      if (retainedValue !== undefined) {
        const textarea = node.querySelector("textarea");
        if (textarea)
          textarea.value = Array.isArray(retainedValue)
            ? retainedValue.join(a.question.kind === "reorder" ? " | " : "\n")
            : typeof retainedValue === "object"
              ? Object.entries(retainedValue)
                  .map(([k, v]) => k + " = " + v)
                  .join("\n")
              : retainedValue;
        else
          for (const input of node.querySelectorAll("input"))
            input.checked = input.value === String(retainedValue);
      }
      node.querySelector("[data-send-answer]").onclick = async (e) => {
        const value = pending.get(id)?.sent
          ? pending.get(id)
          : entry(id, { answer: read(node, a.question.kind), sent: true });
        if (value.answer === null) {
          status.textContent = "Nhập câu trả lời trước khi gửi bổ sung.";
          return;
        }
        e.currentTarget.disabled = true;
        try {
          await send(id, value);
        } catch {
          /* Status and durable retry handled above. */
        }
        if (alive && !accepted.has(id))
          node.querySelector("[data-send-answer]").disabled = false;
      };
      node.oninput = () => {
        if (!accepted.has(id) && !pending.get(id)?.sent) {
          const value = entry(id, {
            answer: read(node, a.question.kind),
            sent: false,
          });
          pending.set(id, value);
          void persist(id, value).catch(() => {
            status.textContent =
              "Chưa giữ được bản trả lời trên máy. Giữ trang mở và thử gửi.";
          });
        }
      };
    }
    if (
      retained &&
      valid(retained, id) &&
      (retained.blob || retained.sent) &&
      !accepted.has(id)
    )
      void send(id, retained).catch(() => {});
  }
  const online = () => {
    for (const [id, value] of pending)
      if (value.blob || value.sent) void send(id, value).catch(() => {});
  };
  window.addEventListener("online", online);
  submit.onclick = async () => {
    submitting = true;
    update();
    try {
      await Promise.all([...flights.values()]);
      await call("submit", { window_id: boot.window_id });
      boot.submitted = true;
    } catch (error) {
      if (alive) status.textContent = assignmentMessage(error);
    } finally {
      submitting = false;
      update();
    }
  };
  const timer = setInterval(update, 1000);
  update();
  return () => {
    alive = false;
    clearInterval(timer);
    for (const id of retries.values()) clearTimeout(id);
    window.removeEventListener("online", online);
    recorders.forEach((r) => r.dispose());
    journal.close();
  };
}
