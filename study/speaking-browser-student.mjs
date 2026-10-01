import { observeAccount, myProfile } from "./account-service.mjs";
import { mountAssignments } from "./assignment-student.mjs";
const root = document.querySelector("[data-assignments]");
let dispose,
  generation = 0;
async function boot() {
  dispose?.();
  const own = ++generation;
  try {
    const profile = await myProfile();
    if (own !== generation) return;
    if (profile?.role !== "STUDENT" || profile.status !== "APPROVED") {
      root.innerHTML =
        '<h1>Bài luyện nói</h1><p>Đăng nhập tài khoản học viên đã được duyệt để mở bài của bạn.</p><a class="st-button primary" href="tai-khoan.html">Mở tài khoản học tập</a>';
      return;
    }
    dispose = mountAssignments(root, profile);
  } catch {
    if (own === generation)
      root.innerHTML =
        '<h1>Bài luyện nói</h1><p>Chưa mở được khu vực học tập. Hãy kiểm tra kết nối và thử lại.</p><a class="st-button" href="tai-khoan.html">Quay lại tài khoản</a>';
  }
}
window.addEventListener("study:auth", boot);
observeAccount().catch(() => boot());
boot();
