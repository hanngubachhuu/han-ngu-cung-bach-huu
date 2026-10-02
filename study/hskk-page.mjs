import { examCatalog } from "./hskk-catalog.mjs";
import { levels } from "./hskk-exam-core.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { getSession } from "./auth.mjs";
import { myProfile } from "./account-service.mjs";
import {
  hskkSessionRequest,
  productionTransport,
} from "./hskk-production-transport.mjs";
import { mountExamExperience } from "./hskk-experience.mjs";
import { ExamSessionJournal } from "./hskk-session-journal.mjs";
const root = document.querySelector("#hskkContent");
const route = document.body.dataset.hskkRoute;
const urls = {
  elementary: "hskk-so-cap.html",
  intermediate: "hskk-trung-cap.html",
  advanced: "hskk-cao-cap.html",
};
const intro = (title, description, seal = "口") =>
  `<section class="hskk-hero"><div><p class="st-eyebrow">HSKK · 汉语水平口试</p><h1>${esc(title)}</h1><p class="hskk-muted">${esc(description)}</p></div><span class="hskk-seal" lang="zh" aria-hidden="true">${seal}</span></section>`;
if (route === "landing")
  root.innerHTML =
    intro("Thi thử HSKK", "Chọn cấp độ để xem danh sách đề thi thử.") +
    `<section class="hskk-grid" aria-label="Ba cấp độ HSKK">${Object.entries(
      levels,
    )
      .map(
        ([level, label], i) =>
          `<article class="hskk-card"><span class="hskk-seal" lang="zh">${["初", "中", "高"][i]}</span><h2>HSKK ${label}</h2><p>Các đề thi thử</p><p class="hskk-muted">${examCatalog.filter((e) => e.level === level).length} đề${level === "elementary" ? " đang chuẩn bị" : ""}</p><a class="st-button" href="${urls[level]}">Xem đề →</a></article>`,
      )
      .join("")}</section>`;
else if (levels[route]) {
  const exams = examCatalog.filter((e) => e.level === route);
  root.innerHTML =
    `<a href="hskk.html">HSKK</a>` +
    intro(
      `HSKK ${levels[route]}`,
      `Danh sách đề thi thử HSKK ${levels[route]}`,
    ) +
    (exams.length
      ? exams
          .map(
            (e) =>
              `<article class="hskk-card"><p class="hskk-badge">Đang chuẩn bị</p><h2>${esc(e.exam_code)}</h2><p>HSKK ${levels[route]} · Đề thi thử</p><p>${e.question_count} câu · ${e.section_count} phần · Có audio</p><a class="st-button" href="hskk-de-thi.html?exam=${e.exam_code}">Xem đề →</a></article>`,
          )
          .join("")
      : `<p class="hskk-empty">Chưa có đề thi thử ở cấp độ này.</p>`);
} else if (route === "exam") {
  const exam = examCatalog.find(
    (e) => e.exam_code === new URLSearchParams(location.search).get("exam"),
  );
  if (!exam)
    root.innerHTML = `<h1>Chưa tìm thấy đề thi</h1><a href="hskk.html">Về HSKK</a>`;
  else {
    document.title = `${exam.exam_code} · HSKK ${levels[exam.level]} | Hán Ngữ Cùng Bách Hữu`;
    root.innerHTML =
      `<a href="${urls[exam.level]}">HSKK ${levels[exam.level]}</a>` +
      intro(exam.exam_code, exam.title) +
      `<div class="hskk-facts"><span>${exam.question_count} câu</span><span>${exam.section_count} phần</span><span>Khoảng ${exam.approximate_minutes} phút</span><span>${exam.preparation_minutes} phút chuẩn bị</span></div><ol class="hskk-sections">${exam.sections.map((s) => `<li>${s.title} · ${s.questions} câu · ${s.response_seconds} giây trả lời mỗi câu</li>`).join("")}</ol><p class="hskk-notice">Đề đang được chuẩn bị và chưa mở nhận bài thi. Bạn sẽ bắt đầu khi Bách Hữu công bố đề cho khóa học của mình.</p><button class="st-button primary" disabled>Bắt đầu thi thử</button>`;
  }
}
// Published catalog and access come from the hosted backend, never local content.
if (route === "exam" || levels[route])
  void (async () => {
    try {
      const session = await getSession();
      if (!session) return;
      const code = new URLSearchParams(location.search).get("exam");
      const attempt = new URLSearchParams(location.search).get("attempt");
      const catalog = await hskkSessionRequest(
        "catalog",
        {},
        { ownerId: session.user.id },
      );
      if (levels[route]) {
        for (const card of root.querySelectorAll(".hskk-card")) {
          if (
            catalog.some(
              (e) => e.exam_code === card.querySelector("h2")?.textContent,
            )
          )
            card.querySelector(".hskk-badge").textContent =
              "Đã mở cho tài khoản của bạn";
        }
        return;
      }
      if (!attempt && !catalog.some((e) => e.exam_code === code)) return;
      const button = root.querySelector("button");
      if (!button) return;
      const notice = root.querySelector(".hskk-notice");
      if (notice)
        notice.textContent =
          "Đề đã được mở cho tài khoản của bạn. Kiểm tra thiết bị và microphone trước khi bắt đầu.";
      button.disabled = false;
      if (attempt) button.textContent = "Tiếp tục / xem bài đã nộp";
      button.onclick = async () => {
        button.disabled = true;
        try {
          const profile = await myProfile();
          if (profile?.user_id !== session.user.id)
            throw Error("ACCOUNT_CHANGED");
          const boot = await hskkSessionRequest(
            attempt ? "resume" : "load",
            attempt ? { attempt_id: attempt } : { exam_code: code },
            { ownerId: session.user.id },
          );
          const dispose = await mountExamExperience(root, {
            exam: boot.exam,
            candidate: {
              id: session.user.id,
              name: profile.full_name,
              email: session.user.email,
            },
            transport: productionTransport({
              ...boot,
              ownerId: session.user.id,
            }),
            journal: new ExamSessionJournal(
              session.user.id,
              boot.session.attempt_id,
            ),
          });
          window.addEventListener("pagehide", () => void dispose(), {
            once: true,
          });
          window.addEventListener("study:auth", (event) => {
            if (event.detail.userId !== session.user.id) {
              void dispose();
              root.textContent =
                "Phiên đăng nhập đã thay đổi. Mở lại đề bằng tài khoản của bạn.";
            }
          });
        } catch {
          root.innerHTML =
            '<p>Chưa mở được bài thi. Kiểm tra tài khoản và kết nối rồi mở lại đề.</p><a href="hskk-so-cap.html">Về danh sách đề</a>';
        }
      };
    } catch {
      /* Unpublished and unauthorized accounts retain the closed catalog. */
    }
  })();
