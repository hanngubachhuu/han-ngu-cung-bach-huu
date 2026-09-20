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
  const renderer = `function renderListening(q, body){
  const intro = el('div','hint-inline','🔊 Bấm nghe 2–3 lần, sau đó chọn đáp án. Không đọc phần lời thoại trước khi trả lời.');
  body.appendChild(intro);
  const player = el('div','audio-player-mini');
  const play = el('button','audio-play','Phát'); play.type='button';
  play.setAttribute('aria-label','Phát hoặc tạm dừng câu tiếng Trung');
  const speed = el('button','audio-speed','1.0×'); speed.type='button';
  speed.setAttribute('aria-label','Đổi tốc độ phát');
  let rate=.82, paused=false;
  const setRest=()=>{ paused=false; play.textContent='Phát'; };
  play.addEventListener('click', () => {
    if(!('speechSynthesis' in window)){ play.textContent='Không hỗ trợ'; return; }
    if(window.speechSynthesis.speaking && !paused){ window.speechSynthesis.pause(); paused=true; play.textContent='Tiếp tục'; return; }
    if(window.speechSynthesis.speaking && paused){ window.speechSynthesis.resume(); paused=false; play.textContent='Tạm dừng'; return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(q.audioText || '');
    utterance.lang = 'zh-CN'; utterance.rate = rate;
    utterance.onend=setRest; utterance.onerror=setRest;
    window.speechSynthesis.speak(utterance);
    play.textContent='Tạm dừng';
  });
  speed.addEventListener('click',()=>{ rate=rate===.82?1:rate===1?1.15:.82; speed.textContent=rate===.82?'0.8×':rate===1?'1.0×':'1.15×'; });
  player.append(play,speed); body.appendChild(player);
  renderMcq(q, body);
}
`;
  const css = `
/* Audio player: one focused learning action, with clear keyboard states. */
.audio-player-mini{display:flex;gap:var(--space-sm);align-items:center;margin:var(--space-sm) 0;}
.audio-player-mini button{min-height:48px;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-xs) var(--space-md);font:inherit;font-weight:700;cursor:pointer;background:var(--color-surface-subtle);color:var(--color-primary);}
.audio-player-mini button:hover{background:var(--color-primary-subtle);}
.audio-player-mini button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px;}
.audio-speed{min-width:64px;color:var(--color-text-secondary)!important;}
`;
  if (!html.includes(switchNeedle) || !html.includes(labelNeedle) || !html.includes(anchor)) {
    throw new Error("Không tìm thấy renderer cần thiết để bổ sung dạng nghe.");
  }
  if (!html.includes("function renderListening(q, body)")) {
    html = html.replace(switchNeedle, `${switchNeedle}\n    case 'listening': renderListening(q, body); break;`)
      .replace(labelNeedle, "listening:'Nghe hiểu', self_check:'Tự luận'")
      .replace(anchor, `${renderer}${anchor}`);
  } else {
    const start = html.indexOf("function renderListening(q, body)");
    const end = html.indexOf(anchor, start);
    if (end < 0) throw new Error("Không xác định được cuối renderer nghe.");
    html = html.slice(0, start) + renderer + html.slice(end);
  }
  if (!html.includes(".audio-player-mini{")) html = html.replace("</style>", `${css}</style>`);
  return html;
}

for (let lessonNo = FIRST_SYNCED_LESSON; lessonNo <= 15; lessonNo += 1) {
  const lesson = loadLesson(lessonNo);
  const page = path.join(ROOT, `bai${lessonNo}_index.html`);
  const output = addListeningRenderer(replaceLessonObject(fs.readFileSync(page, "utf8"), JSON.stringify(toLegacy(lesson), null, 2)));
  fs.writeFileSync(page, output);
  console.log(`Đồng bộ Bài ${lessonNo}: ${lesson.content.exercises.all.length} câu.`);
}
