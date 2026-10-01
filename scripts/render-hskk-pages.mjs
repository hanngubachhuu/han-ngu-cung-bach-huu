import fs from "node:fs/promises";
const pages = {
  hskk: "landing",
  "hskk-so-cap": "elementary",
  "hskk-trung-cap": "intermediate",
  "hskk-cao-cap": "advanced",
  "hskk-de-thi": "exam",
  "hskk-quan-tri": "admin",
};
for (const [name, route] of Object.entries(pages)) {
  await fs.writeFile(
    new URL("../" + name + ".html", import.meta.url),
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thi thử HSKK | Hán Ngữ Cùng Bách Hữu</title><link rel="stylesheet" href="study/study.css"><link rel="stylesheet" href="study/account.css"><link rel="stylesheet" href="study/hskk.css">${route === "admin" ? '<meta name="robots" content="noindex"><script src="data/supabase-public.js"></script>' : ""}<script type="module" src="study/hskk-${route === "admin" ? "admin-entry" : "page"}.mjs"></script></head><body class="study-page" data-hskk-route="${route}"><a class="st-skip" href="#main">Đến nội dung</a><header class="account-topbar"><a class="account-brand" href="trang-chu.html">Hán Ngữ Cùng Bách Hữu</a><nav aria-label="Điều hướng"><a href="hskk.html">HSKK</a><a href="tai-khoan.html">Tài khoản</a></nav></header><main class="hskk-main" id="main"><section id="${route === "admin" ? "hskkAdmin" : "hskkContent"}"><p role="status">Đang mở HSKK…</p></section><noscript>Bật JavaScript để xem danh sách đề thi thử.</noscript></main><footer class="hskk-footer">Học thêm một ngôn ngữ, sống thêm một cuộc đời.</footer></body></html>`,
  );
}
console.log("Rendered shared HSKK landing, levels, exam and admin routes.");
