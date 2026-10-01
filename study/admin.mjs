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
const gate = document.querySelector("#adminGate"),
  workspace = document.querySelector("#adminWorkspace");
let page = 0,
  selected = null,
  request = 0,
  listRequest = 0,
  students = [],
  disposeAssignments;
async function boot() {
  disposeAssignments?.();
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
    workspace.hidden = false;
    workspace.innerHTML = `<form id="adminFilter" class="account-filter"><label>Tìm học viên<input name="search" type="search" placeholder="Tìm theo họ tên" maxlength="120"></label><label>Trạng thái<select name="status"><option value="">Tất cả</option>${["PENDING", "APPROVED", "SUSPENDED", "REJECTED"].map((s) => `<option value="${s}">${accountState({ status: s }).label}</option>`).join("")}</select></label><button class="st-button" type="submit">Tìm kiếm</button></form><div class="account-grid"><section class="account-card"><h2>Học viên</h2><p id="adminCount" class="st-help" role="status"></p><div id="studentList" class="account-list"></div><div class="account-actions"><button id="adminPrevious" class="st-button">← Trước</button><button id="adminNext" class="st-button">Sau →</button></div></section><section class="account-card" id="studentDetail"><p>Chọn một học viên để xem hồ sơ và quyền học.</p></section></div><section class="account-card account-dashboard"><h2>Hoạt động quản trị gần đây</h2><div id="adminAudit"></div></section>`;
    const connection = document.createElement("section");
    const hskkLink=document.createElement("a");
    hskkLink.className="st-button";hskkLink.href="hskk-quan-tri.html";hskkLink.textContent="HSKK · Đề thi thử";
    workspace.prepend(hskkLink);
    connection.className = "account-card";
    workspace.prepend(connection);
    mountDocumentConnection(connection);
    const ownerDocuments = document.createElement("details");
    ownerDocuments.className = "account-card";
    ownerDocuments.innerHTML =
      "<summary>Hồ sơ Google Docs của tôi</summary><div data-owner-documents></div>";
    connection.after(ownerDocuments);
    const assignments = document.createElement("details");
    assignments.className = "account-card account-dashboard";
    assignments.innerHTML =
      "<summary>Bài nộp, chấm điểm và đề HSK / HSKK</summary><div data-assignment-admin></div>";
    workspace.prepend(assignments);
    assignments.addEventListener("assignment:students", () => {
      assignments.open = false;
      document.querySelector("#adminFilter").scrollIntoView({ block: "start" });
      document.querySelector("#adminFilter input").focus();
    });
    let assignmentsMounted = false;
    assignments.addEventListener("toggle", () => {
      if (assignments.open && !assignmentsMounted) {
        assignmentsMounted = true;
        disposeAssignments = mountAssignmentAdmin(
          assignments.querySelector("[data-assignment-admin]"),
          p,
        );
      }
    });
    let ownerDocumentsMounted = false;
    ownerDocuments.addEventListener("toggle", () => {
      if (ownerDocuments.open && !ownerDocumentsMounted) {
        ownerDocumentsMounted = true;
        mountDocuments(
          ownerDocuments.querySelector("[data-owner-documents]"),
          p,
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
    await loadStudents();
    await loadAudit();
  } catch (error) {
    gate.textContent = authMessage(error);
  }
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
await observeAccount();
await boot();
