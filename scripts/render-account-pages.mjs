import fs from "node:fs/promises";
const root = new URL("../", import.meta.url);
for (const [route, title, body] of [
  [
    "tai-khoan",
    "Tài khoản học tập",
    `<section class="account-welcome"><div class="account-story"><p class="st-eyebrow">KHÔNG GIAN HỌC TẬP CỦA BẠN</p><h1>Mỗi ngày một chút.<br><em>Đi xa cùng tiếng Trung.</em></h1><p>Bài học của bạn, những từ đã lưu và bài đọc đang học — gặp lại tất cả ở một nơi.</p><ol class="account-steps"><li><span>01</span><div><strong>Một tài khoản, mọi thiết bị</strong><p>Mở sổ từ và bài đọc trên máy tính hay điện thoại.</p></div></li><li><span>02</span><div><strong>Học đúng lộ trình</strong><p>Nhận bài học sau khi Bách Hữu duyệt và cấp quyền.</p></div></li><li><span>03</span><div><strong>Giữ lại từng bước tiến</strong><p>Xem lại bài đã làm và tiếp tục từ điều bạn đã học.</p></div></li></ol><a href="tu-dien.html">Khám phá công cụ học trước →</a></div><section id="accountAuth" class="account-card" aria-label="Đăng nhập và đăng ký"><p role="status">Đang mở khu vực tài khoản…</p></section></section><section id="accountDashboard" class="account-dashboard" hidden></section>`,
  ],
  [
    "quan-tri",
    "Quản trị học tập",
    `<header><p class="st-eyebrow">DÀNH CHO BÁCH HỮU</p><h1>Quản trị học tập</h1><p>Theo dõi học viên, quản lý đề và chấm bài trong một không gian.</p></header><div id="adminGate" class="account-notice" role="status">Đang xác minh quyền quản trị…</div><section id="adminWorkspace" hidden></section>`,
  ],
]) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="same-origin"><title>${title} | Hán Ngữ Cùng Bách Hữu</title><link rel="stylesheet" href="study/study.css"><link rel="stylesheet" href="study/account.css"><link rel="stylesheet" href="study/assignment.css"><script src="data/supabase-public.js"></script><script type="module" src="study/${route === "tai-khoan" ? "account" : "admin"}.mjs"></script></head><body class="study-page"><a class="st-skip" href="#main">Đến nội dung</a><header class="account-topbar"><a class="account-brand" href="trang-chu.html">Hán Ngữ Cùng Bách Hữu</a><nav aria-label="Điều hướng tài khoản"><a href="trang-chu.html">Trang chủ</a><a href="tai-khoan.html">Tài khoản</a></nav></header><main class="account-main" id="main">${body}<noscript><p>Hãy bật JavaScript để đăng nhập và sử dụng khu vực tài khoản.</p></noscript></main><footer class="account-footer">Học thêm một ngôn ngữ, sống thêm một cuộc đời.<p><a href="chinh-sach-du-lieu.html">Chính sách dữ liệu</a> · <a href="dieu-kien-su-dung.html">Điều kiện sử dụng</a></p></footer></body></html>`;
  await fs.writeFile(new URL(route + ".html", root), html);
}
console.log("Rendered account and administration pages.");
