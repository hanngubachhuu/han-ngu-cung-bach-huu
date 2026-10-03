import {
  observeAccount,
  myProfile,
  adminData,
  adminStudent,
  adminAction,
} from "./account-service.mjs";
import { getClient } from "./auth.mjs";
import { accountState, authMessage } from "./account-core.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { mountDocuments, mountDocumentConnection } from "./admin-documents.mjs";
import { mountAssignmentAdmin } from "./assignment-admin.mjs";
import { assignmentCommand } from "./assignment-service.mjs";
import { adminExamCommand } from "./admin-exam-service.mjs";
const gate = document.querySelector("#adminGate"),
  workspace = document.querySelector("#adminWorkspace");
let page = 0,
  selected = null,
  request = 0,
  listRequest = 0,
  students = [],
  disposeAssignments,
  disposeExams,
  currentProfile,
  examsLoading = false;
const disposers = [];
async function navigate(section, { history = true } = {}) {
  if (!["overview", "students", "exams", "submissions"].includes(section))
    section = "overview";
  for (const panel of workspace.querySelectorAll("[data-admin-panel]"))
    panel.hidden = panel.dataset.adminPanel !== section;
  for (const button of workspace.querySelectorAll("[data-admin-nav]")) {
    if (button.dataset.adminNav === section)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (history) {
    const url = new URL(location.href);
    url.searchParams.set("section", section);
    window.history.pushState({}, "", url);
  }
  const panel = workspace.querySelector(`[data-admin-panel="${section}"]`);
  if (section === "exams" && !disposeExams && !examsLoading) {
    examsLoading = true;
    const generation = request;
    try {
      const { mountExamWorkspace } = await import("./admin-exams.mjs");
      if (generation !== request) return;
      disposeExams = mountExamWorkspace(panel, currentProfile);
    } catch {
      if (generation === request)
        panel.textContent = "Chưa mở được Đề thi. Chọn lại mục này để thử lại.";
    } finally {
      if (generation === request) examsLoading = false;
    }
  }
  if (section === "submissions" && !disposeAssignments)
    disposeAssignments = mountAssignmentAdmin(panel, currentProfile, {
      mode: "submissions",
    });
  workspace.dispatchEvent(
    new CustomEvent("admin:section", { detail: section, bubbles: true }),
  );
}
window.addEventListener("popstate", () => {
  if (!workspace.hidden)
    void navigate(new URLSearchParams(location.search).get("section"), {
      history: false,
    });
});
async function boot() {
  disposeAssignments?.();
  disposeExams?.();
  for (const dispose of disposers.splice(0)) dispose?.();
  disposeAssignments = disposeExams = null;
  examsLoading = false;
  selected = null;
  page = 0;
  const generation = ++request;
  workspace.hidden = true;
  workspace.replaceChildren();
  try {
    const p = await myProfile();
    if (generation !== request) return;
    if (p?.role !== "ADMIN" || p.status !== "APPROVED") {
      gate.innerHTML =
        'Khu vực này chỉ dành cho tài khoản quản trị. <a href="tai-khoan.html">Mở tài khoản →</a>';
      return;
    }
    gate.textContent = "Đã xác minh quyền quản trị.";
    currentProfile = p;
    workspace.hidden = false;
    workspace.classList.add("admin-workspace");
    workspace.innerHTML = `<nav class="admin-primary-nav" aria-label="Quản trị học tập">${[
      ["overview", "Tổng quan"],
      ["students", "Học viên"],
      ["exams", "Đề thi"],
      ["submissions", "Bài nộp"],
    ]
      .map(
        ([id, label]) =>
          `<button class="st-button" data-admin-nav="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</nav><section data-admin-panel="overview"><h2>Tổng quan</h2><div class="assignment-stats" data-overview-stats><p>Đang tải hoạt động…</p></div><details class="account-card"><summary>Hoạt động gần đây</summary><div id="adminAudit"></div></details></section><section data-admin-panel="students" hidden><h2>Học viên</h2><form id="adminFilter" class="account-filter"><label>Tìm học viên<input name="search" type="search" placeholder="Tìm theo họ tên" maxlength="120"></label><label>Trạng thái<select name="status"><option value="">Tất cả</option>${["PENDING", "APPROVED", "SUSPENDED", "REJECTED"].map((s) => `<option value="${s}">${accountState({ status: s }).label}</option>`).join("")}</select></label><button class="st-button" type="submit">Tìm kiếm</button></form><div class="account-grid"><section class="account-card"><p id="adminCount" class="st-help" role="status"></p><div id="studentList" class="account-list"></div><div class="account-actions"><button id="adminPrevious" class="st-button">← Trước</button><button id="adminNext" class="st-button">Sau →</button></div></section><section class="account-card" id="studentDetail"><p>Chọn một học viên để xem hồ sơ và quyền học.</p></section></div><details class="account-card" data-documents><summary>Google Docs</summary><div data-connection></div><div data-owner-documents></div></details><details class="account-card" data-lesson-workspace><summary>Bài tập theo bài học</summary><div data-lesson-admin></div></details></section><section data-admin-panel="exams" hidden></section><section data-admin-panel="submissions" hidden></section>`;
    for (const b of workspace.querySelectorAll("[data-admin-nav]"))
      b.onclick = () => void navigate(b.dataset.adminNav);
    const ownerDocuments = workspace.querySelector("[data-documents]");
    let ownerDocumentsMounted = false;
    ownerDocuments.addEventListener("toggle", () => {
      if (ownerDocuments.open && !ownerDocumentsMounted) {
        ownerDocumentsMounted = true;
        mountDocumentConnection(
          ownerDocuments.querySelector("[data-connection]"),
          {
            onChange: () => {
              if (generation === request)
                void mountDocuments(
                  ownerDocuments.querySelector("[data-owner-documents]"),
                  p,
                );
            },
          },
        );
      }
    });
    const lessons = workspace.querySelector("[data-lesson-workspace]");
    let lessonsMounted = false;
    lessons.addEventListener("toggle", () => {
      if (lessons.open && !lessonsMounted) {
        lessonsMounted = true;
        disposers.push(
          mountAssignmentAdmin(
            lessons.querySelector("[data-lesson-admin]"),
            p,
            { mode: "lessons" },
          ),
        );
      }
    });
    document.querySelector("#adminFilter").onsubmit = (e) => {
      e.preventDefault();
      page = 0;
      loadStudents();
    };
    document.querySelector("#adminPrevious").onclick = () => {
      page = Math.max(0, page - 1);
      loadStudents();
    };
    document.querySelector("#adminNext").onclick = () => {
      page++;
      loadStudents();
    };
    await navigate(
      new URLSearchParams(location.search).get("section") ||
        (new URLSearchParams(location.search).get("module") === "hskk"
          ? "exams"
          : "overview"),
      { history: false },
    );
    await Promise.allSettled([
      loadStudents(),
      loadAudit(),
      loadOverview(p, generation),
    ]);
  } catch (error) {
    gate.textContent = authMessage(error);
  }
}
async function loadOverview(profile, generation) {
  const [all, pending, queue, exams] = await Promise.allSettled([
    adminData(),
    adminData({ status: "PENDING" }),
    assignmentCommand("queue", { page: 0 }, profile.user_id),
    adminExamCommand("summary", {}, profile.user_id),
  ]);
  if (generation !== request) return;
  const count = (r, key) => (r.status === "fulfilled" ? r.value[key] : "—");
  workspace.querySelector("[data-overview-stats]").innerHTML = [
    ["Học viên", count(all, "count")],
    ["Chờ duyệt", count(pending, "count")],
    [
      "Bài chờ chấm (20 lượt gần nhất)",
      queue.status === "fulfilled"
        ? queue.value.filter(
            (a) => a.state === "submitted" && !a.published_revision,
          ).length
        : "—",
    ],
    ["Đề đang hoạt động", count(exams, "active")],
  ]
    .map(
      ([label, n]) =>
        `<div class="assignment-stat"><span>${label}</span><strong>${n}</strong></div>`,
    )
    .join("");
}
async function loadStudents() {
  const generation = request,
    listGeneration = ++listRequest,
    status = document.querySelector("#adminCount");
  status.textContent = "Đang tải…";
  try {
    const values = Object.fromEntries(
        new FormData(document.querySelector("#adminFilter")),
      ),
      result = await adminData({ ...values, page });
    if (generation !== request || listGeneration !== listRequest) return;
    students = result.data;
    status.textContent = `${result.count} học viên · trang ${page + 1}`;
    document.querySelector("#studentList").innerHTML = students.length
      ? students
          .map(
            (p) =>
              `<button class="account-student" data-student="${p.user_id}"><span><strong>${esc(p.full_name || "Chưa điền họ tên")}</strong><small>${esc(p.email)}</small></span><span class="account-badge">${accountState(p).label}</span></button>`,
          )
          .join("")
      : "<p>Không có học viên phù hợp.</p>";
    document
      .querySelectorAll("[data-student]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            showStudent(students.find((p) => p.user_id === b.dataset.student))),
      );
    document.querySelector("#adminPrevious").disabled = page === 0;
    document.querySelector("#adminNext").disabled =
      (page + 1) * 20 >= result.count;
  } catch (error) {
    status.textContent = authMessage(error);
  }
}
async function showStudent(profile) {
  selected = profile;
  const root = document.querySelector("#studentDetail"),
    generation = request;
  root.innerHTML = '<p role="status">Đang tải hồ sơ…</p>';
  try {
    const data = await adminStudent(profile.user_id);
    if (generation !== request || selected.user_id !== profile.user_id) return;
    root.innerHTML = `<h2>${esc(profile.full_name || "Học viên")}</h2><p>${esc(profile.email)}</p><p>${esc(profile.phone || "Chưa có số điện thoại")}</p><p>${esc(profile.learning_goal || "Chưa ghi mục tiêu học")}</p><span class="account-badge">${accountState(profile).label}</span><div class="account-actions">${[
      ["APPROVED", "Duyệt / kích hoạt"],
      ["REJECTED", "Từ chối"],
      ["SUSPENDED", "Tạm ngưng"],
    ]
      .map(
        ([s, label]) =>
          `<button class="st-button" data-state="${s}" ${s === profile.status ? "disabled" : ""}>${label}</button>`,
      )
      .join(
        "",
      )}</div><p class="account-feedback" id="adminActionStatus" role="status"></p>
  <h3>Quyền khóa học và bài học</h3>${data.courses
    .map((course) => {
      const en = data.enrollments.find((e) => e.course_id === course.id),
        all = en?.access_mode === "ALL";
      return `<section class="account-access"><label><input type="checkbox" data-course="${course.id}" ${en?.active ? "checked" : ""}> <strong>${esc(course.title)}</strong></label>${
        en?.active
          ? `<label>Phạm vi<select data-course-mode="${course.id}"><option value="SELECTED" ${!all ? "selected" : ""}>Chỉ các bài được chọn</option><option value="ALL" ${all ? "selected" : ""}>Toàn bộ khóa học</option></select></label>${
              all
                ? '<p class="st-help">Đang cấp toàn bộ khóa. Chọn “Chỉ các bài được chọn” để giới hạn từng bài.</p>'
                : data.lessons
                    .filter((l) => l.course_id === course.id)
                    .map(
                      (l) =>
                        `<label><input type="checkbox" data-lesson="${l.id}" ${data.access.find((a) => a.lesson_id === l.id)?.active ? "checked" : ""}>Bài ${l.lesson_no} · ${esc(l.title_vi)}</label>`,
                    )
                    .join("")
            }`
          : ""
      }</section>`;
    })
    .join(
      "",
    )}<section class="account-access"><h3>Kết quả tự luyện</h3><ul class="account-list">${data.attempts.map((a) => `<li>${esc(a.lesson_id)} · ${a.score}/${a.max_score}<br><small>${new Date(a.submitted_at).toLocaleString("vi-VN")} · Chưa xác nhận</small></li>`).join("") || "<li>Chưa có kết quả.</li>"}</ul></section>`;
    root
      .querySelectorAll("[data-state]")
      .forEach((b) => (b.onclick = () => act(b.dataset.state)));
    root
      .querySelectorAll("[data-course]")
      .forEach(
        (b) => (b.onchange = () => act("course", b.dataset.course, b.checked)),
      );
    root
      .querySelectorAll("[data-course-mode]")
      .forEach(
        (b) =>
          (b.onchange = () =>
            act("course_mode", b.dataset.courseMode, b.value === "ALL")),
      );
    root
      .querySelectorAll("[data-lesson]")
      .forEach(
        (b) => (b.onchange = () => act("lesson", b.dataset.lesson, b.checked)),
      );
    const documents = document.createElement("section");
    documents.className = "account-access";
    root.append(documents);
    mountDocuments(documents, profile);
    const history = document.createElement("section");
    history.className = "account-access";
    history.innerHTML =
      "<h3>Bài giao, bài nộp và kết quả</h3><div data-student-submissions>Đang tải…</div>";
    root.append(history);
    const snapshots = await Promise.allSettled(
      (data.officialAttempts || []).map((a) =>
        assignmentCommand("get", { attempt_id: a.id }, currentProfile.user_id),
      ),
    );
    if (generation !== request || selected?.user_id !== profile.user_id) return;
    history.querySelector("[data-student-submissions]").innerHTML =
      `<ul class="account-list">${snapshots.map((s) => (s.status === "fulfilled" ? `<li><strong>${esc(s.value.title)}</strong> · ${s.value.state === "submitted" ? "Đã nộp" : "Đang làm"}${s.value.submitted_at ? " · " + new Date(s.value.submitted_at).toLocaleString("vi-VN") : ""}<p>${s.value.result ? `${s.value.result.normalized_score} / 100` : "Chưa có kết quả công bố"}</p></li>` : "<li>Chưa tải được một bài. Thử mở lại hồ sơ.</li>")).join("") || "<li>Chưa có bài giao hoặc bài nộp.</li>"}</ul>`;
  } catch (error) {
    root.textContent = authMessage(error);
  }
}
async function act(action, resource = null, enabled = true) {
  const root = document.querySelector("#studentDetail"),
    profile = selected,
    generation = request;
  root
    .querySelectorAll("button,input,select")
    .forEach((b) => (b.disabled = true));
  try {
    await adminAction(profile.user_id, action, resource, enabled);
    if (generation !== request || selected?.user_id !== profile.user_id) return;
    if (["APPROVED", "REJECTED", "SUSPENDED"].includes(action))
      profile.status = action;
    await showStudent(profile);
    document.querySelector("#adminActionStatus").textContent =
      "Đã cập nhật và ghi nhật ký.";
    await loadStudents();
    await loadAudit();
  } catch (error) {
    if (generation !== request || selected?.user_id !== profile.user_id) return;
    await showStudent(profile);
    document.querySelector("#adminActionStatus").textContent =
      authMessage(error);
  }
}
async function loadAudit() {
  const c = await getClient(),
    { data, error } = await c
      .from("audit_logs")
      .select("action,created_at,details")
      .order("created_at", { ascending: false })
      .limit(15);
  const root = document.querySelector("#adminAudit");
  if (!root) return;
  root.innerHTML = error
    ? "<p>Chưa tải được nhật ký.</p>"
    : `<ul class="account-list">${data.map((a) => `<li><strong>${esc(a.action)}</strong> · ${new Date(a.created_at).toLocaleString("vi-VN")} ${a.details.resource ? "· " + esc(a.details.resource) : ""}</li>`).join("") || "<li>Chưa có hoạt động.</li>"}</ul>`;
}
window.addEventListener("study:auth", (e) => {
  if (e.detail.userId !== e.detail.previousUser) boot();
});
window.addEventListener("pagehide", () => {
  request++;
  disposeExams?.();
  disposeAssignments?.();
  for (const dispose of disposers.splice(0)) dispose?.();
  workspace.hidden = true;
});
await observeAccount();
await boot();
