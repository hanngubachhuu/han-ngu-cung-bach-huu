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
    skills: Object.fromEntries(lesson.exerciseSections.map(({ skill, title }) => [skill, { label: title }])),
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
  const hasAudio = q.audioStatus === 'ready' && !!q.audioSrc;
  const intro = el('div','hint-inline',hasAudio ? 'Nghe 2–3 lần, sau đó chọn đáp án.' : 'Audio đang được bổ sung. Hãy đọc kịch bản, sau đó chọn đáp án.');
  body.appendChild(intro);
  const player = el('div','audio-player-mini');
  if(!hasAudio){
    const status = el('div','audio-status','Chưa có audio nên kịch bản đang hiển thị để em vẫn làm bài được. Khi giáo viên bổ sung file, kịch bản sẽ tự ẩn.');
    status.setAttribute('role','status');
    const script = el('div','audio-script',mixText(q.audioText || 'Kịch bản đang được chuẩn bị.'));
    script.setAttribute('aria-label','Kịch bản câu nghe');
    player.append(status,script); body.appendChild(player);
  } else {
    const audio = document.createElement('audio'); audio.preload='metadata'; audio.src=q.audioSrc;
    const play = el('button','audio-play','Phát audio'); play.type='button';
    play.setAttribute('aria-label','Phát hoặc tạm dừng tệp nghe tiếng Trung');
    const speed = el('button','audio-speed','1.0×'); speed.type='button';
    speed.setAttribute('aria-label','Đổi tốc độ phát audio');
    const status = el('div','audio-status','Sẵn sàng nghe.'); status.setAttribute('role','status');
    const setRest=()=>{ play.textContent='Phát audio'; };
    play.addEventListener('click', async () => {
      if(audio.paused){ try{ await audio.play(); play.textContent='Tạm dừng'; status.textContent='Đang phát audio.'; }catch{ status.textContent='Không thể phát tệp. Hãy thử lại hoặc báo giáo viên.'; } }
      else { audio.pause(); play.textContent='Tiếp tục'; status.textContent='Đã tạm dừng.'; }
    });
    audio.addEventListener('ended',()=>{setRest();status.textContent='Đã phát xong. Em có thể nghe lại.';});
    audio.addEventListener('error',()=>{setRest();status.textContent='Không tìm thấy tệp nghe. Giáo viên đang bổ sung.';});
    speed.addEventListener('click',()=>{ const rates=[.8,1,1.15]; const next=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length]; audio.playbackRate=next; speed.textContent=next.toFixed(2).replace(/0$/,'')+'×'; });
    player.append(play,speed,status,audio); body.appendChild(player);
  }
  renderMcq(q, body);
}
`;
  const mcqRenderer = `function renderMcq(q, body){
  if(state.submitted){ const g=gradeQuestion(q); body.appendChild(resultBanner(g.score>=g.max ? 'correct' : 'wrong')); }
  const list=el('div','opt-list'); list.setAttribute('role','radiogroup');
  q.options.forEach(opt=>{
    const row=el('button','opt'); row.type='button'; row.setAttribute('role','radio');
    const selected=state.answers[q.id]===opt.k; row.setAttribute('aria-checked',String(selected));
    row.appendChild(el('span','opt-letter',opt.k)); row.appendChild(el('span','',mixText(opt.t)));
    if(selected) row.classList.add('selected');
    if(state.submitted){ row.disabled=true; row.classList.add('locked'); if(opt.k===q.answer) row.classList.add('correct-answer'); else if(selected) row.classList.add('wrong-answer'); }
    else row.addEventListener('click',()=>{ state.answers[q.id]=opt.k; DataStore.saveInProgress(); renderAll(); });
    list.appendChild(row);
  }); body.appendChild(list);
}
`;
  const css = `
/* HSK-LESSON-UX-PATCH:START */
/* Audio and exercise spacing patch: keeps bilingual text legible at every width. */
:root{--space-2xs:4px;--space-xs:8px;--space-sm:12px;--space-md:16px;--space-lg:24px;--space-xl:32px;}
.q-card,.passage-card,.q-prompt,.q-body,.opt,.hint-inline,.selfcheck-area,.model-answer-box,.answer-reveal-box{overflow-wrap:break-word;word-break:break-word;}
.q-card{padding:var(--space-xl);}
.q-head{gap:var(--space-xs);margin-bottom:var(--space-md);}
.q-prompt{margin:var(--space-sm) 0 var(--space-lg);line-height:1.65;white-space:pre-line;}
.q-body{display:grid;gap:var(--space-md);}
.opt-list{gap:var(--space-sm);}
.opt{align-items:flex-start;gap:var(--space-md);padding:var(--space-md) var(--space-lg);line-height:1.55;}
.q-card,.q-card *{user-select:text;}
.opt{width:100%;text-align:left;color:var(--text);font-family:var(--font-vn);cursor:pointer;}
.opt .opt-letter{margin-top:var(--space-2xs);}
.hint-inline{display:flex;align-items:flex-start;line-height:var(--lh-normal,1.5);margin-bottom:0;}
.audio-player-mini{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;margin:0;padding:var(--space-md);border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface-subtle);}
.audio-player-mini button{min-height:48px;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-xs) var(--space-md);font:inherit;font-weight:700;cursor:pointer;background:var(--color-surface);color:var(--color-primary);}
.audio-player-mini button:hover{background:var(--color-primary-subtle);}
.audio-player-mini button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px;}
.audio-speed{min-width:64px;color:var(--color-text-secondary)!important;}
.audio-status{flex:1 1 100%;font-size:var(--fs-sm,14px);line-height:var(--lh-normal,1.5);color:var(--color-text-secondary);}
.audio-script{flex:1 1 100%;padding:var(--space-md);border-left:4px solid var(--color-accent);border-radius:var(--radius-sm);background:var(--color-surface);font-family:var(--font-cn);font-size:var(--fs-md,18px);line-height:var(--lh-relaxed,1.75);color:var(--color-text-primary);}
.audio-player-mini audio{display:none;}
.retell-source{padding:var(--space-md);border-left:4px solid var(--color-primary);background:var(--color-surface-subtle);border-radius:var(--radius-sm);font-family:var(--font-cn);font-size:var(--fs-md,18px);line-height:var(--lh-relaxed,1.75);}
.retell-actions{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;}
.retell-actions button{min-height:48px;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-xs) var(--space-md);font:inherit;font-weight:700;background:var(--color-surface);color:var(--color-primary);}
.retell-timer{color:var(--color-text-secondary);font-weight:700;}
.multi-fill-text{padding:var(--space-lg);border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface-subtle);font-family:var(--font-cn);font-size:var(--fs-lg,20px);line-height:var(--lh-relaxed,1.75);}
.multi-fill-select{min-height:48px;margin:var(--space-2xs);padding:var(--space-xs);border:1px solid var(--color-border-strong);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font:inherit;}
.multi-fill-bank{display:flex;flex-wrap:wrap;gap:var(--space-xs);font-size:var(--fs-sm,14px);color:var(--color-text-secondary);}
.q-prompt{margin-bottom:var(--space-2xl);}.q-body{gap:var(--space-xl);}.mini-nav-grid{grid-template-columns:repeat(5,1fr);gap:var(--space-sm);padding:var(--space-md);}.mini-nav-grid .nav-cell{min-height:48px;aspect-ratio:auto;}.mini-nav-popover{padding-bottom:var(--space-xs);}
@media (max-width:640px){.q-card{padding:var(--space-lg) var(--space-md);}.q-prompt{margin-bottom:var(--space-xl);}.q-body{gap:var(--space-lg);}.opt{padding:var(--space-md);}.audio-player-mini{padding:var(--space-sm);}.mini-nav-grid{gap:var(--space-xs);padding:var(--space-sm);}}
/* HSK-LESSON-UX-PATCH:END */
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
  const retellAnchor = "function renderSelfCheck(q, body){";
  const retellRenderer = `function renderRetell(q, body){
  const source=el('div','retell-source',mixText(q.sourceText));
  const actions=el('div','retell-actions'); const timer=el('span','retell-timer', 'Bắt đầu đọc ngay: còn '+q.readSeconds+' giây.');
  actions.append(timer); body.append(source,actions);
  let left=q.readSeconds; const tick=()=>{ timer.textContent='Còn '+Math.max(left,0)+' giây để đọc.'; if(left--<=0){ clearInterval(interval); source.hidden=true; timer.textContent='Hết giờ. Hãy kể lại bằng lời của em, không mở lại đoạn đọc.'; } }; tick(); const interval=setInterval(tick,1000);
  renderSelfCheck(q, body);
}
function renderMultiFill(q, body){
  const values=Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : Array(q.answers.length).fill('');
  const text=el('div','multi-fill-text'); let blank=0;
  q.parts.forEach(part=>{ if(part!=='___'){ text.appendChild(el('span','',mixText(part))); return; } const index=blank++; const select=document.createElement('select'); select.className='multi-fill-select'; select.setAttribute('aria-label','Chọn từ cho chỗ trống '+(index+1)); select.appendChild(new Option('— chọn từ —','')); q.options.forEach(word=>select.appendChild(new Option(word,word))); select.value=values[index]||''; if(state.submitted) select.disabled=true; else select.addEventListener('change',()=>{ values[index]=select.value; state.answers[q.id]=values; DataStore.saveInProgress(); updateProgress(); renderNavGrid(); }); text.appendChild(select); });
  body.appendChild(text); body.appendChild(el('div','multi-fill-bank','Từ cho sẵn: '+q.options.join(' · ')));
  if(state.submitted){ const g=gradeQuestion(q); body.insertBefore(resultBanner(g.score>=g.max?'correct':'wrong'),text); if(g.score<g.max) body.appendChild(el('div','answer-reveal-box','<div class="label">Đáp án</div><div class="content">'+mixText(q.answers.join(' · '))+'</div>')); }
}
`;
  if (!html.includes("function renderRetell(q, body)")) {
    html = html.replace(switchNeedle, `${switchNeedle}\n    case 'retell': renderRetell(q, body); break;\n    case 'multi_fill': renderMultiFill(q, body); break;`)
      .replace(labelNeedle, "listening:'Nghe hiểu', retell:'Đọc - kể lại', multi_fill:'Điền nhiều chỗ trống', self_check:'Tự luận'")
      .replace(retellAnchor, `${retellRenderer}${retellAnchor}`);
  }
  const mcqStart=html.indexOf("function renderMcq(q, body){"), mcqEnd=html.indexOf("function renderListening(q, body){",mcqStart);
  if(mcqStart>=0 && mcqEnd>mcqStart) html=html.slice(0,mcqStart)+mcqRenderer+html.slice(mcqEnd);
  const retellStart=html.indexOf("function renderRetell(q, body){"), retellEnd=html.indexOf("function renderMultiFill(q, body){",retellStart);
  if(retellStart>=0 && retellEnd>retellStart) html=html.slice(0,retellStart)+retellRenderer.slice(0,retellRenderer.indexOf("function renderMultiFill"))+html.slice(retellEnd);
  if (!html.includes("function renderMultiFill(q, body)")) {
    html = html.replace("function renderSelfCheck(q, body){", `${retellRenderer.split("function renderMultiFill")[1] ? "function renderMultiFill" + retellRenderer.split("function renderMultiFill")[1] : ""}function renderSelfCheck(q, body){`)
      .replace("case 'retell': renderRetell(q, body); break;", "case 'retell': renderRetell(q, body); break;\n    case 'multi_fill': renderMultiFill(q, body); break;")
      .replace("retell:'Đọc - kể lại', self_check:'Tự luận'", "retell:'Đọc - kể lại', multi_fill:'Điền nhiều chỗ trống', self_check:'Tự luận'");
  }
  if (!html.includes("if(q.readingText){")) {
    html = html.replace("  const card = el('div','q-card');", "  if(q.readingText){\n    const pc = el('div','passage-card');\n    pc.appendChild(el('div','passage-label','阅读材料'));\n    pc.appendChild(el('div','passage-text',mixText(q.readingText)));\n    area.appendChild(pc);\n  }\n\n  const card = el('div','q-card');");
  }
  html = html.replace("  const promptDiv = el('div','q-prompt', mixText(q.prompt));", "  const promptText = String(q.prompt || '').replace(/([：:])\\s+(?=[\\u4e00-\\u9fff])/u, '$1\\n');\n  const promptDiv = el('div','q-prompt', mixText(promptText));");
  html = html.replace(/\/\* HSK-LESSON-UX-PATCH:START \*\/[\s\S]*?\/\* HSK-LESSON-UX-PATCH:END \*\/\n?/, '');
  html = html.replace(/\/\* Audio player:[\s\S]*?\.audio-speed\{[^}]*\}\n/, '');
  html = html.replace("</style>", `${css}</style>`);
  html = html.replace(/if\(q\.type === 'self_check'\)/g, "if(q.type === 'self_check' || q.type === 'retell')")
    .replace(/else if\(q\.type === 'self_check'\)/g, "else if(q.type === 'self_check' || q.type === 'retell')");
  html = html.replace("if(Array.isArray(v)) return v.length === q.tokens?.length; // reorder: đủ số token", "if(q.type === 'multi_fill') return Array.isArray(v) && v.length === q.answers.length && v.every(Boolean);\n  if(Array.isArray(v)) return v.length === q.tokens?.length; // reorder: đủ số token")
    .replace("  if(q.type === 'reorder'){", "  if(q.type === 'multi_fill'){ const ok=Array.isArray(v) && v.length===q.answers.length && v.every((item,index)=>item===q.answers[index]); return { score:ok?1:0, max }; }\n  if(q.type === 'reorder'){");
  html = html.replace(/  renderAll\(\);\r?\n  window\.scrollTo\(\{top:0, behavior:'smooth'\}\);/, "  renderAll();\n  window.setTimeout(()=>document.getElementById('resultArea')?.scrollIntoView({block:'start', behavior:'smooth'}), 0);");
  return html;
}

for (let lessonNo = FIRST_SYNCED_LESSON; lessonNo <= 15; lessonNo += 1) {
  const lesson = loadLesson(lessonNo);
  const page = path.join(ROOT, `bai${lessonNo}_index.html`);
  const output = addListeningRenderer(replaceLessonObject(fs.readFileSync(page, "utf8"), JSON.stringify(toLegacy(lesson), null, 2)));
  fs.writeFileSync(page, output);
  console.log(`Đồng bộ Bài ${lessonNo}: ${lesson.content.exercises.all.length} câu.`);
}
