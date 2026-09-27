import { initAccountUI } from "./account-ui.mjs";
import { learnerData, saveProfile } from "./account-service.mjs";
import { librarySyncPreview, importGuestLibrary } from "./storage.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { authMessage, safeReturnPath } from "./account-core.mjs";

const dashboard = document.querySelector("#accountDashboard");
let generation = 0,
  currentUser = null,
  currentProfile;
async function update({ session, profile, error }) {
  document
    .querySelector("#main")
    .classList.toggle("is-signed-in", !!session && !!profile && !error);
  if (!session || !profile || error) {
    generation++;
    dashboard.hidden = true;
    dashboard.replaceChildren();
    currentUser = null;
    return;
  }
  if (
    currentUser === session.user.id &&
    currentProfile?.version === profile.version
  )
    return;
  const request = ++generation;
  currentUser = session.user.id;
  currentProfile = profile;
  dashboard.hidden = false;
  dashboard.innerHTML = `<header><div><p class="st-eyebrow">KHU VỰC HỌC TẬP</p><h2>Xin chào, ${esc(profile.full_name || "bạn")}.</h2></div>${profile.role === "ADMIN" ? '<a class="st-button" href="quan-tri.html">Quản trị học viên →</a>' : ""}</header>
 <div class="account-grid"><section class="account-card"><h3>Bài học của bạn</h3><div id="accountLessons" role="status">Đang tải bài học được cấp…</div></section><section class="account-card"><h3>Sổ tay trên tài khoản</h3><p class="st-help">Từ, chữ và bài đọc được lưu trực tiếp lên tài khoản khi có mạng. Mở lại trên thiết bị khác để học tiếp.</p><div id="syncSummary" role="status">Đang kiểm tra…</div><div class="account-actions"><button class="st-button" id="syncRefresh">Kiểm tra đồng bộ</button><a href="tu-dien.html">Mở sổ từ →</a></div><div id="guestImport"></div><p id="syncStatus" class="account-feedback" role="status"></p></section>
 <section class="account-card"><h3>Hồ sơ của bạn</h3><form id="profileForm" class="account-form"><label>Họ và tên<input name="full_name" autocomplete="name" maxlength="120" required value="${esc(profile.full_name)}"></label><label>Số điện thoại <span class="st-help">Không bắt buộc</span><input name="phone" autocomplete="tel" maxlength="30" value="${esc(profile.phone)}"></label><label>Mục tiêu học tập<textarea name="learning_goal" rows="3" maxlength="1000">${esc(profile.learning_goal)}</textarea></label><button class="st-button" type="submit">Lưu hồ sơ</button></form><p id="profileStatus" class="account-feedback" role="status"></p></section>
 <section class="account-card"><h3>Kết quả gần đây</h3><p class="st-help">Kết quả tự luyện do thiết bị gửi lên, có thể gồm phần tự chấm; không phải điểm thi được xác nhận.</p><div id="accountAttempts" role="status">Đang tải…</div></section></div>`;
  document.querySelector("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    const form = new FormData(e.currentTarget),
      status = document.querySelector("#profileStatus");
    try {
      currentProfile = await saveProfile(
        currentProfile,
        Object.fromEntries(form),
      );
      status.textContent = "Đã lưu hồ sơ trên tài khoản.";
    } catch (error) {
      status.textContent = authMessage(error);
      if (error.code === "40001") {
        const link = document.createElement("a");
        link.href = "tai-khoan.html";
        link.textContent = " Mở bản mới trong tab khác";
        link.target = "_blank";
        link.rel = "noopener";
        status.append(link);
      }
    } finally {
      button.disabled = false;
    }
  };
  document.querySelector("#syncRefresh").onclick = refreshSync;
  refreshSync();
  try {
    const data = await learnerData();
    if (request !== generation) return;
    document.querySelector("#accountLessons").innerHTML = data.lessons.length
      ? `<ul class="account-list">${data.lessons.map((l) => `<li><a href="${l.level === 1 ? "hsk1_bai" + l.lesson_no : "bai" + l.lesson_no}_index.html"><span><small>HSK ${l.level} · Bài ${l.lesson_no}</small><br><strong>${esc(l.title_vi)}</strong><br><span lang="zh">${esc(l.title_zh)}</span></span><span aria-hidden="true">→</span></a></li>`).join("")}</ul>`
      : "<p>Chưa có bài học được cấp. Khi tài khoản được duyệt và có quyền học, bài học sẽ xuất hiện tại đây.</p>";
    document.querySelector("#accountAttempts").innerHTML = data.attempts.length
      ? `<ul class="account-list">${data.attempts.map((a) => `<li><strong>${esc(data.lessons.find((l) => l.id === a.lesson_id)?.title_vi || a.lesson_id)}</strong><br>${a.score}/${a.max_score} · ${new Date(a.submitted_at).toLocaleDateString("vi-VN")} · Tự luyện</li>`).join("")}</ul>`
      : "<p>Chưa có kết quả được đồng bộ lên tài khoản.</p>";
  } catch (error) {
    if (request === generation) {
      document.querySelector("#accountLessons").textContent =
        authMessage(error);
      document.querySelector("#accountAttempts").textContent =
        "Chưa tải được kết quả.";
    }
  }
  const next = new URL(location.href).searchParams.get("next");
  if (next) {
    const link = document.createElement("a");
    link.className = "st-button primary";
    link.href = safeReturnPath(next, location.href);
    link.textContent = "Quay lại nơi đang học →";
    dashboard.prepend(link);
  }
}
async function refreshSync() {
  const request = generation,
    summary = document.querySelector("#syncSummary"),
    status = document.querySelector("#syncStatus"),
    guestRoot = document.querySelector("#guestImport");
  if (!summary) return;
  try {
    const { remote, plan, guest } = await librarySyncPreview();
    if (request !== generation) return;
    summary.innerHTML = `<div class="account-metrics"><span><strong>${remote.words.length}</strong>từ đã lưu</span><span><strong>${remote.characters.length}</strong>chữ đã lưu</span><span><strong>${remote.readings.length}</strong>bài đọc gần đây</span></div><p class="st-help">Đã kiểm tra lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}.</p>`;
    const total =
      plan.words.length + plan.characters.length + plan.readings.length;
    guestRoot.innerHTML =
      total || plan.conflicts.length
        ? `<div class="account-notice"><strong>Có dữ liệu học khi chưa đăng nhập</strong><p>${plan.words.length} từ, ${plan.characters.length} chữ, ${plan.readings.length} bài đọc mới trên trình duyệt này. Chỉ nhập nếu đây là dữ liệu của bạn.</p>${plan.conflicts.length ? `<p>${plan.conflicts.length} bài đọc khác bản trên tài khoản. Bạn có thể giữ cả hai bản.</p><label><input type="checkbox" id="keepConflictCopies"> Giữ bản trên máy thành bài đọc riêng</label>` : ""}<button class="st-button" id="importGuest">Nhập dữ liệu này vào tài khoản</button></div>`
        : guest.words.length || guest.characters.length || guest.readings.length
          ? '<p class="st-help">Dữ liệu trên máy đã có trong tài khoản. Bản trên máy vẫn được giữ.</p>'
          : "";
    document
      .querySelector("#importGuest")
      ?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        status.textContent = "Đang nhập dữ liệu…";
        try {
          await importGuestLibrary({
            keepConflictCopies: !!document.querySelector("#keepConflictCopies")
              ?.checked,
          });
          if (request !== generation) return;
          await refreshSync();
          status.textContent =
            "Đã nhập dữ liệu. Bản trên tài khoản có sẵn được giữ nguyên.";
        } catch (error) {
          if (request === generation) {
            status.textContent = error.message;
            e.target.disabled = false;
          }
        }
      });
  } catch (error) {
    if (request === generation) {
      summary.textContent = "Chưa xác minh được dữ liệu trên tài khoản.";
      status.textContent = authMessage(error);
    }
  }
}
window.addEventListener("online", refreshSync);
window.addEventListener("offline", () => {
  const e = document.querySelector("#syncStatus");
  if (e)
    e.textContent =
      "Đang ngoại tuyến. Các thay đổi chưa gửi được sẽ cần thử lại khi có mạng.";
});
await initAccountUI(document.querySelector("#accountAuth"), {
  initialMode:
    new URL(location.href).searchParams.get("mode") ||
    (location.pathname.endsWith("/register") ? "register" : null),
  onUpdate: update,
});
