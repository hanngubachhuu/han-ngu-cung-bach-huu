import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const LEVEL = "hsk2";
const FIRST_SYNCED_LESSON = 8;

function loadLesson(lessonNo) {
  const filename = path.join(ROOT, "data", "lessons", LEVEL, `bai${lessonNo}.js`);
  const context = vm.createContext({
    window: { HAN_NGU_DATA: { lessons: {}, register(lesson) { this.lessons[lesson.id] = lesson; } } }
  });
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  const lesson = Object.values(context.window.HAN_NGU_DATA.lessons)[0];
  if (!lesson) throw new Error(`Không đọc được dữ liệu canonical của Bài ${lessonNo}.`);
  return lesson;
}

function legacyQuestion(question) {
  const { section, sectionTitle, skill, sourceRefs, status, ...legacy } = question;
  if (legacy.explanation && !legacy.explain) legacy.explain = legacy.explanation;
  if (legacy.modelAnswer && !legacy.model) legacy.model = legacy.modelAnswer;
  return legacy;
}

function toLegacy(lesson) {
  const content = lesson.content;
  const all = content.exercises.all;
  const sections = lesson.exerciseSections.map((section) => ({
    id: section.id,
    title: section.title,
    skill: section.skill,
    instruction: section.instruction,
    passages: section.passages || [],
    questions: all.filter((question) => question.section === section.id).map(legacyQuestion)
  }));
  const no = content.course.lessonNo;
  return {
    schemaVersion: 2,
    content,
    id: `hsk2-bai${no}`,
    title: content.course.titleZh,
    titleVi: content.course.titleVi,
    subtitle: content.ui?.heroDescription || `Giáo trình chuẩn HSK 2 — Bài ${no}`,
    meta: [`${content.vocabulary.length} từ mới`, `${content.grammar.length} điểm ngữ pháp`, `${all.length} câu luyện tập`],
    timeLimitMinutes: content.meta.timeLimitMinutes,
    vocab: content.vocabulary,
    grammar: content.grammar,
    sections,
    ui: content.ui || {}
  };
}

function replaceLessonObject(html, objectText) {
  const marker = "const LESSON = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Không tìm thấy LESSON object trong trang.");
  const objectStart = start + marker.length;
  if (html[objectStart] !== "{") throw new Error("LESSON object không bắt đầu bằng dấu {.");
  let depth = 0;
  let end = objectStart;
  for (; end < html.length; end += 1) {
    if (html[end] === "{") depth += 1;
    if (html[end] === "}" && --depth === 0) { end += 1; break; }
  }
  if (depth !== 0) throw new Error("LESSON object chưa đóng đúng cách.");
  return html.slice(0, objectStart) + objectText + html.slice(end);
}

function addListeningRenderer(html) {
  const switchNeedle = "    case 'self_check': renderSelfCheck(q, body); break;";
  const labelNeedle = "self_check:'Tự luận'";
  const anchor = "function renderTextFill(q, body){";
  if (!html.includes("function renderListening(q, body)")) {
    const renderer = `function renderListening(q, body){
  const intro = el('div','hint-inline','🔊 Bấm nghe 2–3 lần, sau đó chọn đáp án. Không đọc phần lời thoại trước khi trả lời.');
  body.appendChild(intro);
  const button = el('button','listen-button','▶ Nghe lại');
  button.type = 'button';
  button.addEventListener('click', () => {
    if(!('speechSynthesis' in window)){ button.textContent='Trình duyệt chưa hỗ trợ phát giọng nói'; return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(q.audioText || '');
    utterance.lang = 'zh-CN'; utterance.rate = .82;
    window.speechSynthesis.speak(utterance);
  });
  body.appendChild(button);
  renderMcq(q, body);
}
`;
    if (!html.includes(switchNeedle) || !html.includes(labelNeedle) || !html.includes(anchor)) {
      throw new Error("Không tìm thấy renderer cần thiết để bổ sung dạng nghe.");
    }
    html = html.replace(switchNeedle, `${switchNeedle}\n    case 'listening': renderListening(q, body); break;`)
      .replace(labelNeedle, "listening:'Nghe hiểu', self_check:'Tự luận'")
      .replace(anchor, `${renderer}${anchor}`);
  }
  return html;
}

for (let lessonNo = FIRST_SYNCED_LESSON; lessonNo <= 15; lessonNo += 1) {
  const lesson = loadLesson(lessonNo);
  const page = path.join(ROOT, `bai${lessonNo}_index.html`);
  const output = addListeningRenderer(replaceLessonObject(fs.readFileSync(page, "utf8"), JSON.stringify(toLegacy(lesson), null, 2)));
  fs.writeFileSync(page, output);
  console.log(`Đồng bộ Bài ${lessonNo}: ${lesson.content.exercises.all.length} câu.`);
}
