import { escapeHtml as esc } from "./core.mjs";
import { levels } from "./hskk-exam-core.mjs";
import { cbtText } from "./hskk-cbt-copy.mjs";

const icons = {
  headphones:
    '<path d="M5 14v-3a7 7 0 0 1 14 0v3M5 13H3v7h4v-7zm14 0h2v7h-4v-7z"/>',
  microphone:
    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
};
export const cbtIcon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icons[name] || icons.headphones}</svg>`;

// Decorative listening illustration, separate from exam content and source images.
export const listeningIllustration = `<svg class="cbt-listening-illustration" viewBox="0 0 600 320" aria-hidden="true"><rect width="600" height="320" fill="#c5e2ea"/><path d="M0 280 120 240 280 270 400 235 600 270V320H0" fill="#dbeef1"/><g><path d="M75 320v-55q0-66 108-66t108 66v55" fill="#536580"/><path d="m150 211 33 90 35-90" fill="#fff"/><path d="m176 240 7 13 8-13 10 64h-36" fill="#aa6b81"/><path d="M128 111q0-73 54-73t57 73v96H123z" fill="#5e3b31"/><ellipse cx="183" cy="126" rx="45" ry="61" fill="#f4ccb0"/><path d="M136 110q8-72 59-48l34 49q-33-8-45-42-14 29-48 41" fill="#5e3b31"/><path d="M171 180v33q12 17 25 0v-33" fill="#efbea4"/><path d="M161 125h10m26 0h10" stroke="#403f43" stroke-width="4" stroke-linecap="round"/><path d="M176 151q8 7 17 0" stroke="#b77365" fill="none" stroke-width="3"/></g><g transform="translate(240)"><path d="M72 320v-56q0-66 108-66t108 66v56" fill="#536580"/><path d="m139 209 41 100 41-100" fill="#fff"/><path d="m173 233 7 16 8-16 12 87h-38" fill="#455467"/><path d="M125 123q-10-88 52-86 68-7 57 86" fill="#42484a"/><ellipse cx="181" cy="127" rx="47" ry="61" fill="#ebc2a5"/><path d="M132 108q0-72 49-57 38-15 47 50-28-14-32-35-24 36-64 42" fill="#42484a"/><path d="M166 179v32q15 16 29 0v-32" fill="#ddb197"/><path d="M158 126h11m25 0h11" stroke="#403f43" stroke-width="4" stroke-linecap="round"/><path d="M173 153q9 5 18 0" stroke="#a87261" fill="none" stroke-width="3"/></g></svg>`;

const numberedPart = (index) =>
  `第${["一", "二", "三", "四"][index] || index + 1}部分`;
export function sectionRange(exam, section) {
  const questions = exam.questions.filter((q) => q.section_id === section?.id);
  return questions.length
    ? `第${questions[0].number}–${questions.at(-1).number}题`
    : exam.exam_code;
}
export function cbtShell({
  exam,
  candidate,
  view,
  preparing,
  step,
  steps,
  time,
  language = "vi",
}) {
  const zh = language === "zh";
  const level = cbtText(levels[exam.level], language);
  const navigation = exam.sections
    .map((section, index) => {
      const active = view.section?.id === section.id;
      return `<li><div class="cbt-part-heading" lang="zh">${numberedPart(index)}</div><ol ${active ? "" : "hidden"}>${exam.questions
        .filter((q) => q.section_id === section.id)
        .map(
          (q) =>
            `<li class="${q.id === view.question?.id ? "current" : ""}" ${q.id === view.question?.id ? 'aria-current="step"' : ""}><span>${q.number}</span><span>${view.recordings?.[q.id] ? "✓" : q.number < (view.question?.number || 0) ? "•" : ""}</span></li>`,
        )
        .join("")}</ol></li>`;
    })
    .join("");
  const name = candidate.name || (zh ? "考生" : "Học viên");
  return `<article class="hskk-cbt ${preparing ? "cbt-preflight" : "cbt-examination"}">
    <header class="cbt-header"><a href="trang-chu.html" class="cbt-brand"><span lang="zh" aria-hidden="true">汉</span><strong>Hán Ngữ<br>Cùng Bách Hữu</strong></a><div><h1>${esc(exam.exam_code)}</h1><p>HSKK ${esc(level)}</p></div><span class="cbt-mode">${zh ? "模拟考试" : "Thi thử HSKK"}</span></header>
    <div class="cbt-layout">
      <nav class="cbt-sidebar" aria-label="${preparing ? "Các bước chuẩn bị" : "Các phần của bài thi"}"><div class="cbt-sidebar-title">${cbtIcon("microphone")}<span lang="zh">口语</span></div>${preparing ? `<ol class="cbt-steps">${steps.map(([, label], i) => `<li class="${i === step ? "current" : ""}" ${i === step ? 'aria-current="step"' : ""}><span>${i < step ? "✓" : i + 1}</span>${esc(label)}</li>`).join("")}</ol>` : `<ol class="cbt-question-tree">${navigation}</ol>`}</nav>
      <section class="cbt-workspace"><div class="cbt-workspace-bar"><p data-question-title tabindex="-1">${preparing ? (zh ? "考试准备" : "Chuẩn bị bài thi") : esc(sectionRange(exam, view.section))}</p><div class="cbt-clock" ${view.remaining === null ? "hidden" : ""}><progress data-phase-progress max="100" value="100" aria-label="Thời gian còn lại"></progress><span>${zh ? "剩余" : "Còn"}</span> <output data-timer>${time}</output></div></div><div class="cbt-content"><div data-body></div><div data-actions class="account-actions"></div><p data-message role="status" aria-live="polite"></p><p data-audio-message role="alert"></p></div>${preparing ? "" : `<footer class="cbt-microphone">${cbtIcon("microphone")}<meter min="0" max="1" value="0" data-live-meter aria-label="Mức âm thanh microphone"></meter><span data-mic-signal>${zh ? "麦克风" : "Microphone"}</span></footer>`}</section>
      <aside class="cbt-candidate"><div class="cbt-candidate-card"><span class="cbt-avatar" aria-hidden="true">${esc(name.trim().slice(0, 1))}</span><dl><dt>${zh ? "考试类型" : "Kỳ thi"}</dt><dd>HSKK</dd><dt>${zh ? "考试科目" : "Cấp độ"}</dt><dd>${esc(level)}</dd><dt>${zh ? "试卷编号" : "Mã đề"}</dt><dd>${esc(exam.exam_code)}</dd><dt>${zh ? "姓名" : "Họ tên"}</dt><dd>${esc(name)}</dd></dl></div><div class="cbt-tools"><button type="button" data-help="rules">${zh ? "考场须知" : "Quy định"}</button><button type="button" data-help="tips">${zh ? "考试提示" : "Hướng dẫn"}</button><button type="button" data-answer-card>${zh ? "答题卡" : "Câu đã lưu"}</button><button type="button" data-font>${zh ? "字体大小" : "Cỡ chữ"}</button></div><p data-saved class="cbt-save-count" ${preparing ? "hidden" : ""}>${view.saved} / ${view.total} câu đã lưu</p><div data-side-actions></div><p class="cbt-help" data-help-content hidden></p></aside>
    </div><footer class="cbt-footer">Hán Ngữ Cùng Bách Hữu · 汉语水平口试</footer></article>`;
}
