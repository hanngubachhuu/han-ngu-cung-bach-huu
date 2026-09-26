/* HSK2 shared engine. Lesson payload is injected only after Supabase Auth/RLS grants access. */
const LESSON = window.HAN_NGU_PRIVATE_LESSON;


/* ================================================================
   2) ENGINE — TRẠNG THÁI & TIỆN ÍCH DÙNG CHUNG
   Phần dưới đây KHÔNG chứa nội dung bài học, chỉ xử lý hiển thị,
   điều hướng, chấm điểm, lưu trữ. Có thể tái sử dụng nguyên vẹn
   cho mọi bài học khác chỉ bằng cách thay LESSON ở trên.
   ================================================================ */

// Gom toàn bộ câu hỏi thành mảng phẳng, giữ liên kết ngược tới section/passage
const ALL_QUESTIONS = [];
LESSON.sections.forEach(sec => {
  sec.questions.forEach((q, idx) => {
    q._sectionId = sec.id;
    q._sectionTitle = sec.title;
    q._skill = sec.skill;
    q._passage = (sec.passages || []).find(p => p.id === q.passageId) || null;
    ALL_QUESTIONS.push(q);
  });
});
ALL_QUESTIONS.forEach((q, i) => q._index = i);

const TOTAL_Q = ALL_QUESTIONS.length;
const STORAGE_HISTORY_KEY = `hsk2_${LESSON.id}_history`;
const STORAGE_INPROGRESS_KEY = `hsk2_${LESSON.id}_inprogress`;

// Trạng thái phiên làm bài hiện tại
let state = {
  current: 0,
  answers: {},        // qId -> giá trị học sinh nhập/chọn
  selfMarks: {},       // qId -> 1 | 0.5 | 0  (tự chấm cho self_check)
  submitted: false,
  startTime: null,
  timeLeftSec: LESSON.timeLimitMinutes * 60,
  timerHandle: null,
  reviewFilter: 'all',
  reviewMode: false,
  retellWindows: {}
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ================================================================
   3) DARK / LIGHT MODE
   ================================================================ */
function initTheme(){
  const saved = localStorage.getItem('hsk2_theme');
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}
$('#themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hsk2_theme', next);
  $('#themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  if(state.submitted) drawSkillChart(); // vẽ lại canvas theo màu theme mới
});

/* ================================================================
   4) HERO / TOPBAR — nạp động từ LESSON
   ================================================================ */
function renderHeaderFromLesson(){
  // Topbar & hero trong lúc làm bài — chỉ hiển thị tên bài bằng tiếng Trung, không kèm dịch nghĩa
  $('#topbarLessonName').textContent = LESSON.title;
  $('#heroZh').innerHTML = `<span class="zh">${escapeHtml(LESSON.title)}</span>`;
  $('#heroSub').textContent = LESSON.subtitle;
  const metaRow = $('#heroMeta'); metaRow.innerHTML='';
  LESSON.meta.forEach(m => metaRow.appendChild(el('span','chip', escapeHtml(m))));
  document.title = `${LESSON.title} — Bài tập HSK 2`;

  // Màn hình mở đầu
  $('#introZh').innerHTML = `<span class="zh">${escapeHtml(LESSON.title)}</span>`;
  $('#introSub').textContent = LESSON.subtitle;
  const introStats = $('#introStats'); introStats.innerHTML = '';
  LESSON.meta.forEach(m => introStats.appendChild(el('span','intro-stat-chip', escapeHtml(m))));
  introStats.appendChild(el('span','intro-stat-chip', `⏱ <b>${LESSON.timeLimitMinutes}</b> phút`));

  // Đếm số từ vựng / điểm ngữ pháp để hiển thị trên 2 nút toggle
  $('#vocabCount').textContent = `${LESSON.vocab.length} từ`;
  $('#grammarCount').textContent = `${LESSON.grammar.length} điểm`;
  renderVocabTable();
  renderGrammarList();
}

function renderVocabTable(){
  const wrap = $('#vocabTableWrap'); wrap.innerHTML = '';
  LESSON.vocab.forEach(v => {
    const row = el('div','vocab-row');
    row.innerHTML = `<span class="han">${escapeHtml(v.han)}</span><span class="pinyin">${escapeHtml(v.pinyin)}</span><span class="nghia">${escapeHtml(v.nghia)}</span>`;
    wrap.appendChild(row);
  });
}

function renderGrammarList(){
  const wrap = $('#grammarListWrap'); wrap.innerHTML = '';
  LESSON.grammar.forEach(g => {
    const item = el('div','grammar-item');
    item.innerHTML = `<div class="g-title">${mixText(g.title)}</div>
      <div class="g-desc">${mixText(g.desc)}</div>
      <div class="g-example">${mixText(g.example)}</div>`;
    wrap.appendChild(item);
  });
}

/* Accordion Từ vựng / Ngữ pháp trên màn hình mở đầu — bấm vào nút nào thì
   panel đó mở ra và panel kia tự thu gọn (chỉ 1 panel mở tại một thời điểm).
   Bấm lại vào nút đang mở sẽ đóng nó lại. */
let activePreviewPanel = null;
function togglePreviewPanel(name){
  const panels = {vocab: $('#previewPanelVocab'), grammar: $('#previewPanelGrammar')};
  const btns = {vocab: $('#btnToggleVocab'), grammar: $('#btnToggleGrammar')};
  const isOpening = activePreviewPanel !== name;
  Object.keys(panels).forEach(k => {
    panels[k].classList.remove('open');
    btns[k].classList.remove('active');
    btns[k].setAttribute('aria-expanded','false');
  });
  if(isOpening){
    panels[name].classList.add('open');
    btns[name].classList.add('active');
    btns[name].setAttribute('aria-expanded','true');
    activePreviewPanel = name;
  } else {
    activePreviewPanel = null;
  }
}
$('#btnToggleVocab').addEventListener('click', () => togglePreviewPanel('vocab'));
$('#btnToggleGrammar').addEventListener('click', () => togglePreviewPanel('grammar'));

/* Tự động tách các đoạn chữ Hán (bọc span.zh dùng font KaiTi) và giữ nguyên
   phần tiếng Việt/số/ký hiệu (font Times New Roman mặc định) trong CÙNG một
   chuỗi văn bản — áp dụng cho mọi nơi có nội dung hỗn hợp Trung + Việt. */
const CJK_RANGE = /([\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]+)/g;
function mixText(str){
  if(str === undefined || str === null) return '';
  const escaped = escapeHtml(String(str));
  return escaped.replace(CJK_RANGE, '<span class="zh">$1</span>').replace(/\n/g,'<br>');
}

/* ================================================================
   5) LƯU TRỮ (LocalStorage) — TÁCH BIỆT DATA LAYER
   Thiết kế theo hướng dễ thay bằng API/Firebase sau này: mọi thao
   tác đọc/ghi lịch sử đều đi qua các hàm dưới đây.
   ================================================================ */
const DataStore = {
  getHistory(){
    try{
      const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch(e){ console.warn('Lỗi đọc lịch sử, trả về mảng rỗng.', e); return []; }
  },
  appendAttempt(record){
    const hist = this.getHistory();
    hist.push(record);
    try{ localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(hist)); }
    catch(e){ console.warn('Không thể lưu lịch sử.', e); }
    return hist;
  },
  clearHistory(){
    localStorage.removeItem(STORAGE_HISTORY_KEY);
  },
  saveInProgress(){
    try{
      localStorage.setItem(STORAGE_INPROGRESS_KEY, JSON.stringify({
        answers: state.answers, selfMarks: state.selfMarks,
        current: state.current, startTime: state.startTime,
        timeLeftSec: state.timeLeftSec,
        retellWindows: state.retellWindows
      }));
    }catch(e){ /* bỏ qua lỗi lưu tạm */ }
  },
  loadInProgress(){
    try{
      const raw = localStorage.getItem(STORAGE_INPROGRESS_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  },
  clearInProgress(){ localStorage.removeItem(STORAGE_INPROGRESS_KEY); }
};

/* ================================================================
   6) ĐỒNG HỒ ĐẾM NGƯỢC
   ================================================================ */
function formatTime(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60), s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function startTimer(){
  updateTimerDisplay();
  state.timerHandle = setInterval(() => {
    if(state.submitted){ clearInterval(state.timerHandle); return; }
    state.timeLeftSec--;
    updateTimerDisplay();
    if(state.timeLeftSec <= 0){
      clearInterval(state.timerHandle);
      submitQuiz(true); // auto-submit khi hết giờ
    }
  }, 1000);
}
function updateTimerDisplay(){
  const disp = $('#timerDisplay');
  disp.innerHTML = `⏱ ${formatTime(state.timeLeftSec)}`;
  disp.classList.toggle('warn', state.timeLeftSec <= 120);
}

/* ================================================================
   7) TIẾN ĐỘ / NAV GRID
   ================================================================ */
function countAnswered(){
  return ALL_QUESTIONS.filter(q => isAnswered(q)).length;
}
function isAnswered(q){
  const v = state.answers[q.id];
  if(v === undefined || v === null) return false;
  if(q.type === 'matching') return Array.isArray(q.terms) && q.terms.length > 0 && q.terms.every(t => v && v[t.id] !== undefined && v[t.id] !== '');
  if(q.type === 'dialog_fill') return Array.isArray(q.lines) && q.lines.some(line => (line.segs||[]).some(seg => typeof seg === 'number')) && q.lines.every(line => (line.segs||[]).filter(seg=>typeof seg==='number').every(seg => v && v[String(seg)]));
  if(q.type === 'multi_fill') return Array.isArray(v) && v.length === q.answers.length && v.every(Boolean);
  if(Array.isArray(v)) return v.length === q.tokens?.length; // reorder: đủ số token
  if(typeof v === 'string') return v.trim().length > 0;
  return true;
}
function updateProgress(){
  const answered = countAnswered();
  const pct = Math.round((answered/TOTAL_Q)*100);
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = `${answered}/${TOTAL_Q} câu đã làm`;
  $('#progressPercent').textContent = pct + '%';
  // vòng tròn tiến độ nhỏ trên hero
  const ring = $('#ringFg');
  if(ring){
    const R = 36, C = 2*Math.PI*R;
    ring.setAttribute('stroke-dasharray', C.toFixed(1));
    ring.setAttribute('stroke-dashoffset', (C - (pct/100)*C).toFixed(1));
  }
  const ringTxt = $('#ringTxt'); if(ringTxt) ringTxt.textContent = pct + '%';
  renderCompactStrip(pct, answered);
}
/* Dải tóm tắt hiện khi menu câu hỏi đang THU GỌN — bấm vào để mở rộng nhanh. */
function renderCompactStrip(pct, answered){
  const strip = $('#navCompactStrip'); if(!strip) return;
  strip.innerHTML = '';
  strip.onclick = () => setNavExpanded(true);
  const dot = el('div','nav-compact-dot', String(state.current+1));
  const track = el('div','nav-compact-track');
  const fill = el('div','nav-compact-fill'); fill.style.width = pct + '%';
  track.appendChild(fill);
  const text = el('div','nav-compact-text', `Câu ${state.current+1}/${TOTAL_Q} · ${pct}% hoàn thành`);
  strip.appendChild(dot); strip.appendChild(track); strip.appendChild(text);
}
const NAV_EXPANDED_KEY = 'navExpanded_' + LESSON.id;
function setNavExpanded(expanded){
  const panel = $('#navPanel');
  panel.classList.toggle('expanded', expanded);
  $('#btnCollapseNav').setAttribute('aria-expanded', expanded ? 'true' : 'false');
  $('#navCollapseLabel').textContent = expanded ? 'Thu gọn' : 'Mở rộng';
  try{ localStorage.setItem(NAV_EXPANDED_KEY, expanded ? '1' : '0'); }catch(e){}
}
function initNavCollapse(){
  const saved = (() => { try{ return localStorage.getItem(NAV_EXPANDED_KEY); }catch(e){ return null; } })();
  setNavExpanded(saved === '1'); // mặc định THU GỌN trừ khi học sinh đã từng mở rộng trước đó
  $('#btnCollapseNav').addEventListener('click', () => {
    setNavExpanded(!$('#navPanel').classList.contains('expanded'));
  });
}
// Lưới điều hướng câu hỏi: một lưới liền mạch, KHÔNG chia nhãn theo từng phần
// (A/B/C/D/E/F) để giữ giao diện gọn — số thứ tự câu là đủ để định vị.
function renderNavGrid(){
  const container = $('#navGridContainer'); container.innerHTML = '';
  $('#legendGraded').style.display = state.submitted ? 'inline' : 'none';
  const grid = el('div','nav-grid');
  const miniContainer = $('#miniNavGridContainer');
  if(miniContainer) miniContainer.innerHTML = '';
  ALL_QUESTIONS.forEach((q, i) => {
    if(state.submitted && state.reviewMode && !questionMatchesFilter(q)) return;
    const cell = el('button','nav-cell', String(i+1));
    cell.type = 'button';
    if(i === state.current) cell.classList.add('current');
    if(state.submitted){
      const g = gradeQuestion(q);
      if(g.score >= g.max) cell.classList.add('correct');
      else if(g.score <= 0) cell.classList.add('wrong');
      else cell.classList.add('partial');
    } else if(isAnswered(q)){
      cell.classList.add('answered');
    }
    cell.addEventListener('click', () => { state.current = i; renderAll(); scrollToQuestion(); });
    grid.appendChild(cell);
    // Ô tương ứng trong menu câu hỏi thu nhỏ — cùng trạng thái/màu sắc,
    // đóng popover ngay sau khi chọn để không che nội dung câu hỏi.
    if(miniContainer){
      const miniCell = cell.cloneNode(true);
      miniCell.addEventListener('click', () => {
        state.current = i; renderAll(); scrollToQuestion();
        closeMiniNav();
      });
      miniContainer.appendChild(miniCell);
    }
  });
  container.appendChild(grid);
}
function closeMiniNav(){
  const pop = $('#miniNavPopover'), btn = $('#btnMiniNav');
  if(pop) pop.classList.remove('open');
  if(btn) btn.setAttribute('aria-expanded','false');
}
function scrollToQuestion(){
  const card = $('#questionArea .q-card');
  if(card) card.scrollIntoView({behavior:'smooth', block:'start'});
}

/* ================================================================
   8) HIỂN THỊ CÂU HỎI THEO TỪNG LOẠI
   ================================================================ */
function renderQuestion(){
  clearAllRetellTimers();
  const area = $('#questionArea'); area.innerHTML = '';
  const q = ALL_QUESTIONS[state.current];
  if(!q) return;

  // Đoạn văn đọc hiểu (hiển thị phía trên câu hỏi thuộc đoạn đó)
  if(q._passage){
    const pc = el('div','passage-card');
    pc.appendChild(el('div','passage-label', escapeHtml(q._passage.label)));
    pc.appendChild(el('div','passage-text', mixText(q._passage.text)));
    area.appendChild(pc);
  }

  if(q.readingText && (!q._passage || String(q._passage.text).trim() !== String(q.readingText).trim())){
    const pc = el('div','passage-card');
    pc.appendChild(el('div','passage-label','阅读材料'));
    pc.appendChild(el('div','passage-text',mixText(q.readingText)));
    area.appendChild(pc);
  }

  const card = el('div','q-card');
  const head = el('div','q-head');
  head.appendChild(el('span','q-badge', `Câu ${q._index+1}/${TOTAL_Q}`));
  head.appendChild(el('span','q-type-badge', typeLabel(q.type)));
  head.appendChild(el('span','q-type-badge', escapeHtml(q._sectionTitle)));
  card.appendChild(head);

  // Chữ Hán trong câu hỏi hiển thị font KaiTi, phần tiếng Việt xen kẽ (nếu có)
  // vẫn giữ font Times New Roman mặc định nhờ mixText tách theo từng đoạn ký tự.
  const rawPrompt = String(q.prompt || '').trim();
  const promptText = rawPrompt
    .replace(/^(Dịch sang tiếng (?:Việt|Trung))\s*/u, '$1:\n')
    .replace(/^(Chọn từ phù hợp để hoàn thành câu)\s+([“‘"][\s\S]+)$/u, '$1:\n$2')
    .replace(/^(Đặt một câu tiếng Trung có từ)\s+([“‘"][\s\S]+)$/u, '$1:\n$2')
    .replace(/^((?:Dựa vào|Viết)[^.:\n]+)\.\s+((?:[“‘"]\s*)?[\u4e00-\u9fff][\s\S]*)$/u, '$1:\n$2')
    .replace(/^(.+?)\.\s+(Chọn (?:câu|lời nhắc)[^.]+)\.?$/u, 'Tình huống:\n$1.\n\n$2.')
    .replace(/([：:])\s+(?=[\u4e00-\u9fff])/u, '$1\n');
  const promptDiv = el('div','q-prompt', mixText(promptText));
  card.appendChild(promptDiv);
  if(q.hint){ card.appendChild(el('div','', `<span class="hint-inline">${mixText(q.hint)}</span>`)); }

  const body = el('div','q-body');
  switch(q.type){
    case 'mcq': renderMcq(q, body); break;
    case 'text_fill': renderTextFill(q, body); break;
    case 'reorder': renderReorder(q, body); break;
    case 'self_check': renderSelfCheck(q, body); break;
    case 'retell': renderRetell(q, body); break;
    case 'multi_fill': renderMultiFill(q, body); break;
    case 'matching': renderMatching(q, body); break;
    case 'dialog_fill': renderDialogFill(q, body); break;
    case 'listening': renderListening(q, body); break;
  }
  card.appendChild(body);

  if(state.submitted) card.appendChild(renderExplainPanel(q));

  area.appendChild(card);
}
function typeLabel(t){
  return {mcq:'Trắc nghiệm', text_fill:'Điền từ', reorder:'Sắp xếp câu', listening:'Nghe hiểu', retell:'Đọc - kể lại', multi_fill:'Điền nhiều chỗ trống', matching:'Nối từ - nghĩa', dialog_fill:'Điền hội thoại', self_check:'Tự luận'}[t] || t;
}

function resultBanner(status){
  // status: 'correct' | 'wrong' | 'partial'
  const map = {
    correct: ['is-correct','✅','Chính xác! Em làm đúng câu này.'],
    wrong: ['is-wrong','❌','Chưa đúng — xem đáp án đúng bên dưới nhé.'],
    partial: ['is-partial','🟡','Đúng một phần.']
  };
  const [cls, icon, text] = map[status];
  return el('div','result-banner '+cls, `<span>${icon}</span><span>${text}</span>`);
}

function renderMcq(q, body){
  if(state.submitted){ const g=gradeQuestion(q); body.appendChild(resultBanner(g.score>=g.max ? 'correct' : 'wrong')); }
  const list=el('div','opt-list'); list.setAttribute('role','radiogroup');
  q.options.forEach(opt=>{
    const row=el('button','opt'); row.type='button'; row.setAttribute('role','radio');
    const selected=state.answers[q.id]===opt.k; row.setAttribute('aria-checked',String(selected));
    row.appendChild(el('span','opt-letter',opt.k)); row.appendChild(el('span','',mixText(opt.t)));
    if(selected) row.classList.add('selected');
    if(state.submitted){ row.disabled=true; row.classList.add('locked'); if(opt.k===q.answer) row.classList.add('correct-answer'); else if(selected) row.classList.add('wrong-answer'); }
    else row.addEventListener('click',()=>{
      // Khi người học đang kéo để bôi đen/copy, không biến thao tác đó thành chọn đáp án.
      if(window.getSelection && window.getSelection().toString().trim()) return;
      state.answers[q.id]=opt.k;
      DataStore.saveInProgress();
      // Trắc nghiệm một đáp án: chọn xong chuyển ngay sang câu kế tiếp để giữ nhịp làm bài.
      if(state.current < TOTAL_Q-1) state.current += 1;
      renderAll();
      window.setTimeout(scrollToQuestion, 0);
    });
    list.appendChild(row);
  }); body.appendChild(list);
}
function renderListening(q, body){
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
function renderTextFill(q, body){
  const input = el('input');
  input.type = 'text'; input.className = 'fill-input';
  input.placeholder = 'Nhập câu trả lời (chữ Hán)...';
  input.value = state.answers[q.id] || '';
  if(state.submitted){
    input.classList.add('locked');
    const g = gradeQuestion(q);
    const isCorrect = g.score > 0;
    input.classList.add(isCorrect ? 'correct' : 'wrong');
    body.appendChild(resultBanner(isCorrect ? 'correct' : 'wrong'));
    body.appendChild(input);
    if(!isCorrect){
      const box = el('div','answer-reveal-box');
      box.appendChild(el('div','label','✅ Đáp án đúng'));
      box.appendChild(el('div','content', mixText((q.answer||[]).join(' / '))));
      body.appendChild(box);
    }
    return;
  } else {
    input.addEventListener('input', () => { state.answers[q.id] = input.value; DataStore.saveInProgress(); updateProgress(); renderNavGrid(); });
  }
  body.appendChild(input);
}

function renderReorder(q, body){
  if(state.submitted){
    const g = gradeQuestion(q);
    body.appendChild(resultBanner(g.score>=g.max ? 'correct' : 'wrong'));
  }
  const current = state.answers[q.id] || [];
  const zone = el('div','reorder-zone');
  current.forEach((tok, i) => {
    const t = el('span','token placed', escapeHtml(tok));
    if(!state.submitted){
      t.addEventListener('click', () => {
        const arr = state.answers[q.id].slice(); arr.splice(i,1);
        state.answers[q.id] = arr; DataStore.saveInProgress(); renderAll();
      });
    }
    zone.appendChild(t);
  });
  body.appendChild(zone);

  const pool = el('div','reorder-pool');
  // đếm số lần mỗi token đã dùng để hỗ trợ token trùng lặp (không có trong bài này nhưng an toàn)
  const usedCount = {};
  current.forEach(t => usedCount[t] = (usedCount[t]||0)+1);
  const consumed = {};
  q.tokens.forEach(tok => {
    consumed[tok] = (consumed[tok]||0)+1;
    const isUsed = consumed[tok] <= (usedCount[tok]||0);
    const t = el('span','token'+(isUsed?' used':''), mixText(tok));
    if(!state.submitted && !isUsed){
      t.addEventListener('click', () => {
        const arr = (state.answers[q.id]||[]).slice(); arr.push(tok);
        state.answers[q.id] = arr; DataStore.saveInProgress(); renderAll();
      });
    }
    pool.appendChild(t);
  });
  body.appendChild(pool);

  if(state.submitted){
    const g = gradeQuestion(q);
    if(g.score < g.max){
      const box = el('div','answer-reveal-box');
      box.appendChild(el('div','label','✅ Câu trả lời đúng'));
      box.appendChild(el('div','content', mixText(q.answer.join(''))));
      body.appendChild(box);
    }
  }
}

const retellTimerHandles = {};
function clearRetellTimer(qId){
  if(retellTimerHandles[qId]){ clearInterval(retellTimerHandles[qId]); delete retellTimerHandles[qId]; }
}
function clearAllRetellTimers(){ Object.keys(retellTimerHandles).forEach(clearRetellTimer); }
function renderRetell(q, body){
  state.retellWindows = state.retellWindows || {};
  let readingWindow = state.retellWindows[q.id];
  if(!readingWindow){
    readingWindow = { endsAt: Date.now() + q.readSeconds * 1000, expired:false };
    state.retellWindows[q.id] = readingWindow;
    DataStore.saveInProgress();
  }
  const source=el('div','retell-source',mixText(q.sourceText));
  const actions=el('div','retell-actions'); const timer=el('span','retell-timer');
  actions.append(timer); body.append(source,actions);
  const expire=()=>{
    readingWindow.expired=true;
    source.hidden=true;
    timer.textContent='Hết 60 giây. Hãy kể lại bằng lời của em; không mở lại đoạn đọc.';
    clearRetellTimer(q.id);
    DataStore.saveInProgress();
  };
  const tick=()=>{
    const left=Math.max(0,Math.ceil((readingWindow.endsAt-Date.now())/1000));
    if(readingWindow.expired || left<=0){ expire(); return; }
    timer.textContent='Còn '+left+' giây để đọc.';
  };
  clearRetellTimer(q.id); tick();
  if(!readingWindow.expired){ retellTimerHandles[q.id]=setInterval(tick,250); }
  renderSelfCheck(q, body);
}
function renderMultiFill(q, body){
  const values=Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : Array(q.answers.length).fill('');
  const text=el('div','multi-fill-text'); let blank=0;
  q.parts.forEach(part=>{ if(part!=='___'){ text.appendChild(el('span','',mixText(part))); return; } const index=blank++; const select=document.createElement('select'); select.className='multi-fill-select'; select.setAttribute('aria-label','Chọn từ cho chỗ trống '+(index+1)); select.appendChild(new Option('— chọn từ —','')); q.options.forEach(word=>select.appendChild(new Option(word,word))); select.value=values[index]||''; if(state.submitted) select.disabled=true; else select.addEventListener('change',()=>{ values[index]=select.value; state.answers[q.id]=values; DataStore.saveInProgress(); updateProgress(); renderNavGrid(); }); text.appendChild(select); });
  body.appendChild(text); body.appendChild(el('div','multi-fill-bank','Từ cho sẵn: '+q.options.join(' · ')));
  if(state.submitted){ const g=gradeQuestion(q); body.insertBefore(resultBanner(g.score>=g.max?'correct':'wrong'),text); if(g.score<g.max) body.appendChild(el('div','answer-reveal-box','<div class="label">Đáp án</div><div class="content">'+mixText(q.answers.join(' · '))+'</div>')); }
}
function renderMatching(q, body){
  const values = (state.answers[q.id] && typeof state.answers[q.id] === 'object')
    ? {...state.answers[q.id]} : {};
  const wrap = el('div','matching-area');
  const intro = el('div','hint-inline','Chọn nghĩa đúng cho từng từ.');
  wrap.appendChild(intro);

  const bank = el('div','multi-fill-bank');
  bank.innerHTML = '<b>Nghĩa lựa chọn:</b> ' + (q.optionsPool||[]).map(o=>escapeHtml(o.k+'. '+o.t)).join(' · ');
  wrap.appendChild(bank);

  (q.terms||[]).forEach(term=>{
    const row=el('div','matching-row');
    row.style.display='grid';
    row.style.gridTemplateColumns='minmax(120px,1fr) minmax(180px,1.5fr)';
    row.style.gap='12px';
    row.style.alignItems='center';
    row.style.margin='10px 0';
    row.appendChild(el('div','', '<span class="zh">'+escapeHtml(term.zh||'')+'</span>'));

    const select=document.createElement('select');
    select.className='multi-fill-select';
    select.setAttribute('aria-label','Chọn nghĩa cho '+(term.zh||''));
    select.appendChild(new Option('— chọn nghĩa —',''));
    (q.optionsPool||[]).forEach(o=>select.appendChild(new Option(o.k+'. '+o.t,o.k)));
    select.value=values[term.id] || '';

    if(state.submitted){
      select.disabled=true;
      const correct=(q.correctMap||{})[String(term.id)] ?? (q.correctMap||{})[term.id];
      if(select.value===correct) select.style.borderColor='var(--green)';
      else select.style.borderColor='var(--red)';
    }else{
      select.addEventListener('change',()=>{
        values[term.id]=select.value;
        state.answers[q.id]=values;
        DataStore.saveInProgress();
        updateProgress();
        renderNavGrid();
      });
    }
    row.appendChild(select);
    wrap.appendChild(row);
  });

  if(state.submitted){
    const g=gradeQuestion(q);
    wrap.insertBefore(resultBanner(g.score>=g.max?'correct':'wrong'),intro);
    const reveal=el('div','answer-reveal-box');
    reveal.appendChild(el('div','label','Đáp án'));
    const answerText=(q.terms||[]).map(t=>{
      const k=(q.correctMap||{})[String(t.id)] ?? (q.correctMap||{})[t.id];
      const opt=(q.optionsPool||[]).find(o=>o.k===k);
      return (t.zh||'')+' → '+(opt ? opt.k+'. '+opt.t : k);
    }).join(' · ');
    reveal.appendChild(el('div','content',mixText(answerText)));
    wrap.appendChild(reveal);
  }
  body.appendChild(wrap);
}

function renderDialogFill(q, body){
  const values=(state.answers[q.id]&&typeof state.answers[q.id]==='object')?{...state.answers[q.id]}:{};
  const wrap=el('div','dialog-fill-area');
  wrap.appendChild(el('div','multi-fill-bank','Từ cho sẵn: '+(q.wordBank||[]).join(' · ')));
  (q.lines||[]).forEach(line=>{
    const row=el('div','dialog-line');
    (line.segs||[]).forEach(seg=>{
      if(typeof seg==='number'){
        const select=document.createElement('select');
        select.className='multi-fill-select';
        select.setAttribute('aria-label','Chọn từ cho chỗ trống '+seg);
        select.appendChild(new Option('— chọn —',''));
        (q.wordBank||[]).forEach(word=>select.appendChild(new Option(word,word)));
        select.value=values[String(seg)]||values[seg]||'';
        if(state.submitted){
          select.disabled=true;
          const correct=(q.correctMap||{})[String(seg)]??(q.correctMap||{})[seg];
          select.style.borderColor=select.value===correct?'var(--green)':'var(--red)';
        }else select.addEventListener('change',()=>{
          values[String(seg)]=select.value; state.answers[q.id]=values;
          DataStore.saveInProgress(); updateProgress(); renderNavGrid();
        });
        row.appendChild(select);
      }else row.appendChild(el('span','',mixText(String(seg))));
    });
    wrap.appendChild(row);
  });
  if(state.submitted){
    const g=gradeQuestion(q);
    wrap.insertBefore(resultBanner(g.score>=g.max?'correct':'wrong'),wrap.firstChild);
    const reveal=el('div','answer-reveal-box');
    reveal.appendChild(el('div','label','Đáp án'));
    reveal.appendChild(el('div','content',mixText(Object.keys(q.correctMap||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>k+'：'+q.correctMap[k]).join(' · '))));
    wrap.appendChild(reveal);
  }
  body.appendChild(wrap);
}

function renderSelfCheck(q, body){
  const wrap = el('div','selfcheck-area');
  const ta = el('textarea');
  ta.placeholder = 'Viết câu trả lời của em vào đây...';
  ta.value = state.answers[q.id] || '';
  if(state.submitted) ta.classList.add('locked');
  else ta.addEventListener('input', () => { state.answers[q.id] = ta.value; DataStore.saveInProgress(); updateProgress(); renderNavGrid(); });
  wrap.appendChild(ta);

  if(state.submitted){
    const box = el('div','model-answer-box');
    box.appendChild(el('div','label','✅ Đáp án mẫu'));
    box.appendChild(el('div','content', mixText(q.model)));
    wrap.appendChild(box);
    if(q.rubric){
      const rubric = el('div','answer-reveal-box');
      rubric.appendChild(el('div','label','Rubric tự chấm'));
      rubric.appendChild(el('div','content',mixText(q.rubric)));
      wrap.appendChild(rubric);
    }

    const markRow = el('div','selfmark-row');
    markRow.appendChild(el('div','label-txt','Em tự chấm bài của mình:'));
    const btnGroup = el('div','btn-group');
    [[1,'✅ Đúng hoàn toàn'],[0.5,'🟡 Đúng một phần'],[0,'❌ Chưa đúng']].forEach(([v,label]) => {
      const b = el('button','selfmark-btn', label);
      b.type='button'; b.dataset.v = v;
      if(state.selfMarks[q.id] === v) b.classList.add('active');
      b.addEventListener('click', () => {
        state.selfMarks[q.id] = v;
        DataStore.saveInProgress();
        renderQuestion(); renderNavGrid(); renderResultSummary();
      });
      btnGroup.appendChild(b);
    });
    markRow.appendChild(btnGroup);
    wrap.appendChild(markRow);
  }
  body.appendChild(wrap);
}

function renderExplainPanel(q){
  const p = el('div','explain-panel');
  if(q.explain) p.appendChild(rowExplain('type-explain','💡','Giải thích', q.explain));
  if(q.error && q.error !== '—') p.appendChild(rowExplain('type-error','⚠️','Lỗi hay gặp', q.error));
  if(q.tip) p.appendChild(rowExplain('type-tip','✨','Mẹo ghi nhớ', q.tip));
  if(q.example) p.appendChild(rowExplain('type-example','📝','Ví dụ thêm', q.example));
  return p;
}
function rowExplain(typeClass, icon, title, content){
  const row = el('div','explain-row '+typeClass);
  row.appendChild(el('span','ico', icon));
  const body = el('div','body');
  body.appendChild(el('div','ttl', title));
  body.appendChild(el('div','txt', mixText(content)));
  row.appendChild(body);
  return row;
}

/* ================================================================
   9) CHẤM ĐIỂM — MÔ HÌNH score/maxScore (CÓ ĐIỂM THÀNH PHẦN)
   ================================================================ */
function gradeQuestion(q){
  const max = 1;
  const v = state.answers[q.id];
  if(q.type === 'mcq'){
    return { score: (v === q.answer) ? 1 : 0, max };
  }
  if(q.type === 'matching'){
    const values = v && typeof v === 'object' ? v : {};
    const correctMap=q.correctMap||{};
    const terms=q.terms||[];
    const ok=terms.length>0 && terms.every(t => String(values[t.id] ?? '') === String(correctMap[String(t.id)] ?? correctMap[t.id] ?? ''));
    return { score: ok ? 1 : 0, max };
  }
  if(q.type === 'dialog_fill'){
    const values=v&&typeof v==='object'?v:{}, correctMap=q.correctMap||{}, keys=Object.keys(correctMap);
    const ok=keys.length>0&&keys.every(k=>String(values[k]||'')===String(correctMap[k]));
    return {score:ok?1:0,max};
  }
  if(q.type === 'text_fill'){
    const norm = s => (s||'').trim().replace(/\s+/g,'');
    const ok = (q.answer||[]).some(a => norm(a) === norm(v));
    return { score: ok ? 1 : 0, max };
  }
  if(q.type === 'multi_fill'){ const ok=Array.isArray(v) && v.length===q.answers.length && v.every((item,index)=>item===q.answers[index]); return { score:ok?1:0, max }; }
  if(q.type === 'reorder'){
    const arr = v || [];
    const ok = arr.length === q.answer.length && arr.every((t,i) => t === q.answer[i]);
    return { score: ok ? 1 : 0, max };
  }
  if(q.type === 'self_check' || q.type === 'retell'){
    const mark = state.selfMarks[q.id];
    return { score: (mark === undefined ? 0 : mark), max };
  }
  return { score:0, max };
}
function computeFullResult(){
  let score=0, max=0, correct=0, wrong=0, unanswered=0;
  const bySection = {}; const bySkill = {};
  LESSON.sections.forEach(s => { bySection[s.id] = {label:s.title, score:0, max:0}; });
  Object.keys(LESSON.skills).forEach(k => { bySkill[k] = {label:LESSON.skills[k].label, score:0, max:0}; });

  ALL_QUESTIONS.forEach(q => {
    const g = gradeQuestion(q);
    score += g.score; max += g.max;
    bySection[q._sectionId].score += g.score; bySection[q._sectionId].max += g.max;
    bySkill[q._skill].score += g.score; bySkill[q._skill].max += g.max;
    if(!isAnswered(q)) unanswered++;
    else if(g.score >= g.max) correct++;
    else if(g.score <= 0) wrong++;
    else correct += 0; // câu partial được tính riêng, không cộng vào correct/wrong tuyệt đối
  });
  const partial = TOTAL_Q - correct - wrong - unanswered;
  const percentage = max>0 ? (score/max*100) : 0;
  return { score, max, percentage, correct, wrong, unanswered, partial, bySection, bySkill };
}
function classify(pct){
  if(pct >= 95) return {tier:'excellent', label:'🏆 Xuất sắc', cls:'tier-excellent'};
  if(pct >= 80) return {tier:'good', label:'🌟 Tốt', cls:'tier-good'};
  if(pct >= 65) return {tier:'fair', label:'👍 Khá', cls:'tier-fair'};
  if(pct >= 50) return {tier:'weak', label:'📖 Cần cố gắng', cls:'tier-weak'};
  return {tier:'poor', label:'📌 Nên ôn lại bài học', cls:'tier-poor'};
}

/* ================================================================
   10) NỘP BÀI / KIỂM TRA TRƯỚC KHI NỘP
   ================================================================ */
$('#btnSubmit').addEventListener('click', () => tryOpenSubmitModal());

function tryOpenSubmitModal(){
  const unanswered = ALL_QUESTIONS.filter(q => !isAnswered(q));
  const modal = el('div','modal-overlay');
  const box = el('div','modal-box');
  if(unanswered.length > 0){
    box.innerHTML = `<h3>⚠️ Còn câu chưa trả lời</h3><p>Bạn còn <b>${unanswered.length}</b> câu chưa trả lời. Bạn có chắc chắn muốn nộp bài không?</p>`;
    const list = el('div','modal-list');
    unanswered.slice(0,30).forEach(q => list.appendChild(el('span','chip-mini', 'Câu '+(q._index+1))));
    box.appendChild(list);
  } else {
    box.innerHTML = `<h3>✅ Đã hoàn thành</h3><p>Bạn đã hoàn thành tất cả câu hỏi. Xác nhận nộp bài?</p>`;
  }
  const actions = el('div','modal-actions');
  const btnBack = el('button','btn btn-secondary','Quay lại làm tiếp');
  btnBack.addEventListener('click', () => modal.remove());
  const btnGo = el('button','btn btn-primary','Vẫn nộp bài');
  btnGo.addEventListener('click', () => { modal.remove(); submitQuiz(false); });
  actions.appendChild(btnBack); actions.appendChild(btnGo);
  box.appendChild(actions);
  modal.appendChild(box);
  $('#modalRoot').appendChild(modal);
}

function submitQuiz(auto){
  if(state.submitted) return;
  state.submitted = true;
  state.reviewMode = false;
  closeMiniNav();
  clearAllRetellTimers();
  clearInterval(state.timerHandle);

  // Với self_check chưa tự chấm, mặc định 0 điểm cho tới khi học sinh tự đánh giá
  const submitTime = Date.now();
  const duration = Math.round((submitTime - state.startTime)/1000);
  const result = computeFullResult();
  const tier = classify(result.percentage);

  // Ghi lịch sử (mỗi lần nộp là 1 bản ghi mới, không ghi đè)
  const history = DataStore.getHistory();
  const record = {
    attemptNumber: history.length + 1,
    lessonId: LESSON.id,
    lessonTitle: LESSON.title,
    startTime: state.startTime,
    submitTime: submitTime,
    duration: duration,
    totalScore: result.score,
    maxScore: result.max,
    percentage: result.percentage,
    correctAnswers: result.correct,
    wrongAnswers: result.wrong,
    unansweredQuestions: result.unanswered,
    scoreBySection: result.bySection,
    scoreBySkill: result.bySkill,
    studentAnswers: state.answers,
    selfMarks: state.selfMarks,
    teacherFeedback: null,
    version: 1,
    auto: !!auto
  };
  DataStore.appendAttempt(record);
  DataStore.clearInProgress();

  renderAll();
  window.setTimeout(()=>document.getElementById('resultArea')?.scrollIntoView({block:'start', behavior:'smooth'}), 0);
}

/* ================================================================
   11) MÀN HÌNH KẾT QUẢ
   ================================================================ */
function renderResultArea(){
  const area = $('#resultArea'); area.innerHTML = '';
  if(!state.submitted) return;
  const result = computeFullResult();
  const tier = classify(result.percentage);

  // --- HERO KẾT QUẢ ---
  const hero = el('div','result-hero '+tier.cls);
  hero.innerHTML = `
    <div class="big-percent">${result.percentage.toFixed(1)}%</div>
    <div class="tier-label">${tier.label}</div>
    <div class="result-stats">
      <div class="result-stat"><b>${result.score.toFixed(1)}/${result.max}</b><span>Tổng điểm</span></div>
      <div class="result-stat"><b>${result.correct}</b><span>Câu đúng</span></div>
      <div class="result-stat"><b>${result.wrong}</b><span>Câu sai</span></div>
      <div class="result-stat"><b>${result.partial}</b><span>Đúng một phần</span></div>
      <div class="result-stat"><b>${formatTime(Math.round((Date.now()-state.startTime)/1000))}</b><span>Thời gian làm bài</span></div>
    </div>
  `;
  area.appendChild(hero);
  area.id = 'resultArea';
  if((tier.tier === 'excellent' || tier.tier === 'good') && !state._confettiShown){
    state._confettiShown = true;
    fireConfetti();
  }

  // --- ĐIỂM THEO PHẦN ---
  const secBox = el('div','q-card');
  secBox.appendChild(el('h3','', 'Điểm theo từng phần'));
  const secList = el('div','section-score-list');
  Object.values(result.bySection).forEach(s => {
    const pct = s.max>0 ? Math.round(s.score/s.max*100) : 0;
    const row = el('div','section-score-row');
    row.innerHTML = `<span class="name">${escapeHtml(s.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      <span class="pct">${pct}%</span>`;
    secList.appendChild(row);
  });
  secBox.appendChild(secList);
  area.appendChild(secBox);

  // --- BIỂU ĐỒ KỸ NĂNG (Canvas) ---
  const chartBox = el('div','q-card');
  chartBox.appendChild(el('h3','', 'Biểu đồ thống kê theo kỹ năng'));
  const canvas = document.createElement('canvas'); canvas.id = 'skillChart';
  chartBox.appendChild(canvas);
  area.appendChild(chartBox);

  // --- NÚT HÀNH ĐỘNG ---
  const actionBox = el('div','q-card no-print');
  actionBox.style.display='flex'; actionBox.style.gap='10px'; actionBox.style.flexWrap='wrap';
  const btnRetake = el('button','btn btn-primary','🔄 Làm lại');
  btnRetake.addEventListener('click', retakeQuiz);
  const btnPrint = el('button','btn btn-secondary','🖨️ In kết quả');
  btnPrint.addEventListener('click', () => window.print());
  const btnHistory = el('button','btn btn-secondary','📊 Xem lịch sử làm bài');
  btnHistory.addEventListener('click', () => showHistoryModal());
  actionBox.appendChild(btnRetake); actionBox.appendChild(btnPrint); actionBox.appendChild(btnHistory);
  area.appendChild(actionBox);

  // --- BỘ LỌC XEM LẠI BÀI ---
  const filterBar = el('div','filter-bar');
  [['all','Tất cả'],['correct','Câu đúng'],['wrong','Câu sai'],['partial','Một phần'],['unanswered','Chưa làm']].forEach(([k,label]) => {
    const chip = el('button','filter-chip'+(state.reviewFilter===k?' active':''), label);
    chip.addEventListener('click', () => {
      state.reviewFilter = k;
      const nextIndex = ALL_QUESTIONS.findIndex(questionMatchesFilter);
      state.reviewMode = nextIndex >= 0;
      if(nextIndex >= 0) state.current = nextIndex;
      renderAll();
      if(state.reviewMode) window.setTimeout(scrollToQuestion, 0);
    });
    filterBar.appendChild(chip);
  });
  area.appendChild(filterBar);

  drawSkillChart();
}
function renderResultSummary(){ if(state.submitted) renderResultArea(); }

/* Hiệu ứng confetti ăn mừng khi đạt mức "Tốt" trở lên — Canvas API thuần,
   tự dọn dẹp sau ~3.2 giây, không ảnh hưởng tới thao tác của học sinh. */
function fireConfetti(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('#confettiCanvas'); if(!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.width = window.innerWidth * dpr;
  const H = canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth+'px'; canvas.style.height = window.innerHeight+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const colors = ['#C0392B','#27AE60','#D68910','#2C3E50','#A93226','#E5A230'];
  const N = 130;
  const pieces = Array.from({length:N}, () => ({
    x: Math.random()*window.innerWidth,
    y: -20 - Math.random()*window.innerHeight*0.4,
    w: 6+Math.random()*6, h: 8+Math.random()*8,
    vy: 2.2+Math.random()*2.6, vx: -1.4+Math.random()*2.8,
    rot: Math.random()*Math.PI, vr: -0.22+Math.random()*0.44,
    color: colors[Math.floor(Math.random()*colors.length)]
  }));
  const start = performance.now();
  const DURATION = 3200;
  function frame(now){
    const t = now - start;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    if(t < DURATION){
      state._confettiHandle = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    }
  }
  cancelAnimationFrame(state._confettiHandle);
  state._confettiHandle = requestAnimationFrame(frame);
}

/* Vẽ biểu đồ cột nhóm kỹ năng bằng Canvas API thuần (không dùng thư viện ngoài) */
function drawSkillChart(){
  const canvas = $('#skillChart'); if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600, cssH = 280;
  canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,cssW,cssH);

  const styles = getComputedStyle(document.documentElement);
  const cText = styles.getPropertyValue('--text').trim();
  const cSoft = styles.getPropertyValue('--text-faint').trim();
  const cBrand = styles.getPropertyValue('--brand').trim();
  const cGreen = styles.getPropertyValue('--green').trim();
  const cRed = styles.getPropertyValue('--red').trim();
  const cGrid = styles.getPropertyValue('--border').trim();

  const result = computeFullResult();
  const skills = Object.values(result.bySkill);
  const padL=42, padB=54, padT=20, padR=16;
  const chartW = cssW - padL - padR, chartH = cssH - padT - padB;
  const barGroupW = chartW/skills.length;
  const barW = Math.min(46, barGroupW*0.34);

  // trục & lưới ngang
  ctx.strokeStyle = cGrid; ctx.fillStyle = cSoft; ctx.font = '11px Arial'; ctx.textAlign='right';
  for(let p=0;p<=100;p+=25){
    const y = padT + chartH - (p/100)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(cssW-padR,y); ctx.stroke();
    ctx.fillText(p+'%', padL-6, y+3);
  }

  skills.forEach((s,i) => {
    const cx = padL + barGroupW*i + barGroupW/2;
    const pctCorrect = s.max>0 ? (s.score/s.max*100) : 0;
    const pctWrong = 100-pctCorrect;
    const hCorrect = (pctCorrect/100)*chartH;
    const hWrong = (pctWrong/100)*chartH;
    // cột sai (nền, phía dưới màu nhạt) - dùng 2 cột cạnh nhau: đúng & tổng
    ctx.fillStyle = cRed+'55';
    ctx.fillRect(cx-barW/2, padT+chartH-hCorrect-hWrong, barW, hWrong);
    ctx.fillStyle = cGreen;
    ctx.fillRect(cx-barW/2, padT+chartH-hCorrect, barW, hCorrect);
    ctx.strokeStyle = cGrid; ctx.strokeRect(cx-barW/2, padT+chartH-hCorrect-hWrong, barW, hCorrect+hWrong);

    ctx.fillStyle = cText; ctx.textAlign='center'; ctx.font='12px Arial';
    ctx.fillText(s.label, cx, cssH-padB+18);
    ctx.font='11px Arial'; ctx.fillStyle = cSoft;
    ctx.fillText(`${s.score.toFixed(1)}/${s.max}`, cx, cssH-padB+34);
    ctx.fillStyle = cText; ctx.font='bold 12px Arial';
    ctx.fillText(Math.round(pctCorrect)+'%', cx, padT+chartH-hCorrect-hWrong-8 < padT+10 ? padT+chartH-hCorrect-6 : padT+chartH-hCorrect-hWrong-6);
  });
}

/* ================================================================
   12) XEM LẠI BÀI THEO BỘ LỌC — hiển thị dưới dạng danh sách câu hỏi
   Ta tái dùng renderQuestion() khi điều hướng; ở đây chỉ lọc nav.
   ================================================================ */
function questionMatchesFilter(q){
  if(state.reviewFilter === 'all') return true;
  if(!state.submitted) return true;
  const g = gradeQuestion(q);
  const answered = isAnswered(q);
  if(state.reviewFilter === 'unanswered') return !answered;
  if(state.reviewFilter === 'correct') return answered && g.score >= g.max;
  if(state.reviewFilter === 'wrong') return answered && g.score <= 0;
  if(state.reviewFilter === 'partial') return answered && g.score>0 && g.score<g.max;
  return true;
}
function jumpToFirstFilterMatch(){
  const idx = ALL_QUESTIONS.findIndex(questionMatchesFilter);
  if(idx>=0) state.current = idx;
}

/* ================================================================
   13) LÀM LẠI BÀI (giữ nguyên lịch sử các lần trước)
   ================================================================ */
function retakeQuiz(){
  const modal = el('div','modal-overlay');
  const box = el('div','modal-box');
  box.innerHTML = `<h3>🔄 Làm lại bài học</h3><p>Toàn bộ đáp án hiện tại sẽ được xóa và đồng hồ sẽ đặt lại. Lịch sử các lần làm trước vẫn được giữ nguyên.</p>`;
  const actions = el('div','modal-actions');
  const btnCancel = el('button','btn btn-secondary','Hủy'); btnCancel.addEventListener('click',()=>modal.remove());
  const btnOk = el('button','btn btn-primary','Làm lại từ đầu');
  btnOk.addEventListener('click', () => {
    modal.remove();
    DataStore.clearInProgress();
    clearAllRetellTimers();
    state = { current:0, answers:{}, selfMarks:{}, submitted:false, startTime:Date.now(),
      timeLeftSec: LESSON.timeLimitMinutes*60, timerHandle:null, reviewFilter:'all', reviewMode:false, retellWindows:{} };
    clearInterval(state.timerHandle);
    startTimer();
    renderAll();
    window.scrollTo({top:0, behavior:'smooth'});
  });
  actions.appendChild(btnCancel); actions.appendChild(btnOk);
  box.appendChild(actions); modal.appendChild(box); $('#modalRoot').appendChild(modal);
}

/* ================================================================
   14) LỊCH SỬ LÀM BÀI — BANNER + MODAL BẢNG LỊCH SỬ
   ================================================================ */
function renderHistoryBanner(){
  const banner = $('#historyBanner');
  const hist = DataStore.getHistory();
  if(hist.length === 0 || state.submitted){ banner.style.display='none'; return; }
  banner.style.display='flex';
  const scores = hist.map(h=>h.percentage);
  const best = Math.max(...scores), avg = scores.reduce((a,b)=>a+b,0)/scores.length;
  const last = hist[hist.length-1];
  const avgDur = hist.reduce((a,h)=>a+h.duration,0)/hist.length;
  banner.innerHTML = '';
  const stats = el('div','stats');
  stats.appendChild(statChip(hist.length,'Lần đã làm'));
  stats.appendChild(statChip(best.toFixed(1)+'%','Điểm cao nhất'));
  stats.appendChild(statChip(avg.toFixed(1)+'%','Điểm trung bình'));
  stats.appendChild(statChip(last.percentage.toFixed(1)+'%','Lần gần nhất'));
  stats.appendChild(statChip(formatTime(avgDur),'TG làm TB'));
  banner.appendChild(stats);
  const btn = el('button','btn btn-secondary','📊 Xem lịch sử chi tiết');
  btn.addEventListener('click', showHistoryModal);
  banner.appendChild(btn);
}
function statChip(val,label){
  const d = el('div','stat'); d.innerHTML = `<b>${val}</b><span>${label}</span>`; return d;
}
function showHistoryModal(){
  const hist = DataStore.getHistory();
  const modal = el('div','modal-overlay');
  const box = el('div','modal-box'); box.style.maxWidth = '640px';
  box.innerHTML = `<h3>📊 Lịch sử làm bài — ${escapeHtml(LESSON.title)}</h3>`;
  if(hist.length===0){
    box.innerHTML += `<p>Chưa có lịch sử làm bài nào cho bài học này.</p>`;
  } else {
    const table = el('table','history-table');
    table.innerHTML = `<thead><tr><th>Lần</th><th>Ngày</th><th>TG làm</th><th>Điểm</th><th>Tỷ lệ</th><th>Xếp loại</th></tr></thead>`;
    const tbody = el('tbody');
    hist.slice().reverse().forEach(h => {
      const tier = classify(h.percentage);
      const tr = el('tr');
      const d = new Date(h.submitTime);
      tr.innerHTML = `<td>#${h.attemptNumber}</td><td>${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</td>
        <td>${formatTime(h.duration)}</td><td>${h.totalScore.toFixed(1)}/${h.maxScore}</td><td>${h.percentage.toFixed(1)}%</td>
        <td><span class="tier-pill" style="background:var(--${tierColorVar(tier.tier)}-soft); color:var(--${tierColorVar(tier.tier)});">${tier.label}</span></td>`;
      tr.addEventListener('click', () => { modal.remove(); showAttemptDetailModal(h); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }
  const actions = el('div','modal-actions');
  if(hist.length>0){
    const btnClear = el('button','btn btn-danger','🗑️ Xóa toàn bộ lịch sử');
    btnClear.addEventListener('click', () => {
      if(confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài của bài học này? Hành động này không thể hoàn tác.')){
        DataStore.clearHistory(); modal.remove(); renderAll();
      }
    });
    actions.appendChild(btnClear);
  }
  const btnClose = el('button','btn btn-secondary','Đóng');
  btnClose.addEventListener('click', () => modal.remove());
  actions.appendChild(btnClose);
  box.appendChild(actions);
  modal.appendChild(box); $('#modalRoot').appendChild(modal);
}
function tierColorVar(tier){
  return {excellent:'green', good:'green', fair:'amber', weak:'orange', poor:'red'}[tier] || 'gray';
}

/* Xem chi tiết một lần làm cụ thể trong lịch sử: đáp án học sinh, đáp án đúng,
   giải thích, điểm từng phần và biểu đồ thống kê riêng của lần làm đó. */
function showAttemptDetailModal(record){
  const tier = classify(record.percentage);
  const modal = el('div','modal-overlay');
  const box = el('div','modal-box'); box.style.maxWidth = '760px'; box.style.maxHeight='86vh'; box.style.overflowY='auto'; box.style.textAlign='left';
  box.innerHTML = `<h3>📄 Chi tiết lần làm #${record.attemptNumber} — ${escapeHtml(record.lessonTitle)}</h3>
    <p style="margin-top:-4px;">${new Date(record.submitTime).toLocaleString('vi-VN')} · Thời gian làm: ${formatTime(record.duration)}</p>
    <div class="result-stats">
      <div class="result-stat"><b>${record.percentage.toFixed(1)}%</b><span>Tỷ lệ đúng</span></div>
      <div class="result-stat"><b>${record.totalScore.toFixed(1)}/${record.maxScore}</b><span>Tổng điểm</span></div>
      <div class="result-stat"><b>${record.correctAnswers}</b><span>Câu đúng</span></div>
      <div class="result-stat"><b>${record.wrongAnswers}</b><span>Câu sai</span></div>
      <div class="result-stat"><b style="color:var(--${tierColorVar(tier.tier)});">${tier.label}</b><span>Xếp loại</span></div>
    </div>`;

  const secTitle = el('h3','', 'Điểm theo từng phần'); secTitle.style.marginTop='20px';
  box.appendChild(secTitle);
  const secList = el('div','section-score-list');
  Object.values(record.scoreBySection || {}).forEach(s => {
    const pct = s.max>0 ? Math.round(s.score/s.max*100) : 0;
    const row = el('div','section-score-row');
    row.innerHTML = `<span class="name">${escapeHtml(s.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      <span class="pct">${pct}%</span>`;
    secList.appendChild(row);
  });
  box.appendChild(secList);

  const chartTitle = el('h3','', 'Biểu đồ thống kê theo kỹ năng'); chartTitle.style.marginTop='18px';
  box.appendChild(chartTitle);
  const canvas = document.createElement('canvas'); canvas.id='attemptDetailChart';
  canvas.style.width='100%'; canvas.style.height='240px'; canvas.style.background='var(--bg-card)';
  canvas.style.borderRadius='var(--radius)'; canvas.style.border='1px solid var(--border)';
  box.appendChild(canvas);

  const listTitle = el('h3','', 'Đáp án chi tiết'); listTitle.style.marginTop='18px';
  box.appendChild(listTitle);
  const answersWrap = el('div','');
  ALL_QUESTIONS.forEach(q => {
    const studentVal = (record.studentAnswers || {})[q.id];
    let studentText = '(chưa trả lời)';
    let correctText = '';
    let isCorrect = null;
    if(q.type === 'mcq'){
      const opt = (q.options||[]).find(o=>o.k===studentVal);
      studentText = opt ? `${opt.k}. ${opt.t}` : '(chưa trả lời)';
      const correctOpt = (q.options||[]).find(o=>o.k===q.answer);
      correctText = correctOpt ? `${correctOpt.k}. ${correctOpt.t}` : q.answer;
      isCorrect = studentVal === q.answer;
    } else if(q.type === 'matching'){
      const vals = studentVal && typeof studentVal === 'object' ? studentVal : {};
      studentText = (q.terms||[]).map(t => {
        const k=vals[t.id];
        const opt=(q.optionsPool||[]).find(o=>o.k===k);
        return (t.zh||'')+' → '+(opt ? opt.k+'. '+opt.t : '(chưa chọn)');
      }).join(' · ');
      correctText = (q.terms||[]).map(t => {
        const k=(q.correctMap||{})[String(t.id)] ?? (q.correctMap||{})[t.id];
        const opt=(q.optionsPool||[]).find(o=>o.k===k);
        return (t.zh||'')+' → '+(opt ? opt.k+'. '+opt.t : k);
      }).join(' · ');
      isCorrect = gradeQuestion(q).score === 1;
    } else if(q.type === 'dialog_fill'){
      const vals=studentVal&&typeof studentVal==='object'?studentVal:{};
      studentText=Object.keys(q.correctMap||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>k+'：'+(vals[k]||'(chưa chọn)')).join(' · ');
      correctText=Object.keys(q.correctMap||{}).sort((a,b)=>Number(a)-Number(b)).map(k=>k+'：'+q.correctMap[k]).join(' · ');
      isCorrect=gradeQuestion(q).score===1;
    } else if(q.type === 'text_fill'){
      studentText = studentVal || '(chưa trả lời)';
      correctText = (q.answer||[]).join(' / ');
      isCorrect = (q.answer||[]).some(a => (a||'').trim().replace(/\s+/g,'') === (studentVal||'').trim().replace(/\s+/g,''));
    } else if(q.type === 'reorder'){
      studentText = Array.isArray(studentVal) && studentVal.length ? studentVal.join('') : '(chưa trả lời)';
      correctText = (q.answer||[]).join('');
      isCorrect = Array.isArray(studentVal) && studentVal.length===q.answer.length && studentVal.every((t,i)=>t===q.answer[i]);
    } else if(q.type === 'self_check' || q.type === 'retell'){
      studentText = studentVal || '(chưa trả lời)';
      correctText = q.model;
      const mark = (record.selfMarks||{})[q.id];
      isCorrect = mark === 1 ? true : (mark === 0 ? false : null);
    }
    const row = el('div','q-card'); row.style.padding='14px 16px'; row.style.margin='10px 0';
    const statusBadge = isCorrect===true ? '<span class="badge" style="color:var(--green); font-weight:700;">✔ Đúng</span>'
      : isCorrect===false ? '<span class="badge" style="color:var(--red); font-weight:700;">✘ Sai</span>'
      : '<span class="badge" style="color:var(--text-faint); font-weight:700;">— Chưa tự chấm</span>';
    row.innerHTML = `<div style="font-size:12px; color:var(--text-faint); margin-bottom:4px;">Câu ${q._index+1} · ${escapeHtml(q.id)}</div>
      <div style="font-size:15px; margin-bottom:6px;">${mixText(q.prompt)}</div>
      <div style="font-size:13.5px; margin-bottom:2px;">Đáp án học sinh: ${mixText(String(studentText))}</div>
      <div style="font-size:13.5px; margin-bottom:2px; color:var(--green);">Đáp án đúng: ${mixText(String(correctText))}</div>
      <div style="margin-top:4px;">${statusBadge}</div>`;
    answersWrap.appendChild(row);
  });
  box.appendChild(answersWrap);

  const actions = el('div','modal-actions');
  const btnBack = el('button','btn btn-secondary','← Quay lại lịch sử');
  btnBack.addEventListener('click', () => { modal.remove(); showHistoryModal(); });
  const btnClose = el('button','btn btn-primary','Đóng');
  btnClose.addEventListener('click', () => modal.remove());
  actions.appendChild(btnBack); actions.appendChild(btnClose);
  box.appendChild(actions);
  modal.appendChild(box); $('#modalRoot').appendChild(modal);

  // Vẽ biểu đồ kỹ năng riêng cho lần làm này (dùng dữ liệu đã lưu, không phải state hiện tại)
  requestAnimationFrame(() => drawAttemptChart(canvas, record));
}

function drawAttemptChart(canvas, record){
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600, cssH = 240;
  canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,cssW,cssH);
  const styles = getComputedStyle(document.documentElement);
  const cText = styles.getPropertyValue('--text').trim();
  const cSoft = styles.getPropertyValue('--text-faint').trim();
  const cGreen = styles.getPropertyValue('--green').trim();
  const cRed = styles.getPropertyValue('--red').trim();
  const cGrid = styles.getPropertyValue('--border').trim();
  const skills = Object.values(record.scoreBySkill || {});
  if(skills.length === 0) return;
  const padL=42, padB=46, padT=16, padR=16;
  const chartW = cssW - padL - padR, chartH = cssH - padT - padB;
  const barGroupW = chartW/skills.length;
  const barW = Math.min(40, barGroupW*0.34);
  ctx.strokeStyle = cGrid; ctx.fillStyle = cSoft; ctx.font = '10px Arial'; ctx.textAlign='right';
  for(let p=0;p<=100;p+=25){
    const y = padT + chartH - (p/100)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(cssW-padR,y); ctx.stroke();
    ctx.fillText(p+'%', padL-6, y+3);
  }
  skills.forEach((s,i) => {
    const cx = padL + barGroupW*i + barGroupW/2;
    const pctCorrect = s.max>0 ? (s.score/s.max*100) : 0;
    const hCorrect = (pctCorrect/100)*chartH;
    const hTotal = chartH;
    ctx.fillStyle = cRed+'55';
    ctx.fillRect(cx-barW/2, padT, barW, hTotal);
    ctx.fillStyle = cGreen;
    ctx.fillRect(cx-barW/2, padT+chartH-hCorrect, barW, hCorrect);
    ctx.strokeStyle = cGrid; ctx.strokeRect(cx-barW/2, padT, barW, hTotal);
    ctx.fillStyle = cText; ctx.textAlign='center'; ctx.font='11px Arial';
    ctx.fillText(s.label, cx, cssH-padB+16);
    ctx.font='bold 11px Arial';
    ctx.fillText(Math.round(pctCorrect)+'%', cx, padT+chartH-hCorrect-6 < padT+10 ? padT+chartH-hCorrect+12 : padT+chartH-hCorrect-6);
  });
}

/* ================================================================
   15) MÀN HÌNH MỞ ĐẦU — hiển thị lịch sử/tiến độ dở dang, chờ bấm
   "Bắt đầu làm bài" thay vì nhảy thẳng vào câu hỏi hoặc chèn modal
   ngay khi tải trang (thân thiện & rõ ràng hơn với người học).
   ================================================================ */
function renderIntroScreen(){
  const hist = DataStore.getHistory();
  const inprog = DataStore.loadInProgress();

  const histBox = $('#introHistoryBox');
  const progBox = $('#introProgressBox');
  const secondaryRow = $('#introSecondaryRow');
  const startBtn = $('#btnStart');

  if(hist.length > 0){
    const scores = hist.map(h=>h.percentage);
    const best = Math.max(...scores), avg = scores.reduce((a,b)=>a+b,0)/scores.length;
    const last = hist[hist.length-1];
    const tier = classify(last.percentage);
    histBox.style.display = 'block';
    histBox.innerHTML = `
      <div class="h-title">👋 Chào mừng quay lại — em đã làm bài này ${hist.length} lần</div>
      <div class="intro-history-grid">
        <div class="cell"><b>${last.percentage.toFixed(1)}%</b><span>Lần gần nhất</span></div>
        <div class="cell"><b>${best.toFixed(1)}%</b><span>Điểm cao nhất</span></div>
        <div class="cell"><b>${avg.toFixed(1)}%</b><span>Điểm trung bình</span></div>
        <div class="cell"><b style="color:var(--${tierColorVar(tier.tier)});">${tier.label}</b><span>Xếp loại gần nhất</span></div>
      </div>`;
    secondaryRow.style.display = 'flex';
  } else {
    histBox.style.display = 'none';
    secondaryRow.style.display = 'none';
  }

  if(inprog && inprog.startTime && (Object.keys(inprog.answers||{}).length > 0 || Object.keys(inprog.retellWindows||{}).length > 0)){
    const answeredCount = ALL_QUESTIONS.filter(q => {
      const v = (inprog.answers||{})[q.id];
      if(v === undefined || v === null) return false;
      if(Array.isArray(v)) return v.length === q.tokens?.length;
      if(typeof v === 'string') return v.trim().length > 0;
      return true;
    }).length;
    progBox.style.display = 'flex';
    progBox.innerHTML = `<span class="txt">📝 Em đang làm dở bài này: <b>${answeredCount}/${TOTAL_Q}</b> câu đã trả lời.</span>`;
    startBtn.innerHTML = '▶️ Tiếp tục làm bài';
  } else {
    progBox.style.display = 'none';
    startBtn.innerHTML = '🚀 Bắt đầu làm bài';
  }
}

function enterQuiz(){
  const inprog = DataStore.loadInProgress();
  if(inprog && inprog.startTime && (Object.keys(inprog.answers||{}).length > 0 || Object.keys(inprog.retellWindows||{}).length > 0)){
    state.answers = inprog.answers || {};
    state.selfMarks = inprog.selfMarks || {};
    state.current = inprog.current || 0;
    state.startTime = inprog.startTime;
    state.timeLeftSec = (typeof inprog.timeLeftSec === 'number') ? inprog.timeLeftSec : LESSON.timeLimitMinutes*60;
    state.retellWindows = inprog.retellWindows || {};
  } else {
    state.startTime = Date.now();
    state.timeLeftSec = LESSON.timeLimitMinutes*60;
  }
  $('#introScreen').style.display = 'none';
  $('#appShell').style.display = 'block';
  initNavCollapse();
  startTimer();
  renderAll();
  window.scrollTo({top:0});
}

$('#btnStart').addEventListener('click', enterQuiz);
$('#btnViewHistoryIntro').addEventListener('click', showHistoryModal);
$('#brandHome').addEventListener('click', () => {
  if(confirm('Quay về màn hình đầu? Đáp án hiện tại vẫn được lưu tự động, em có thể quay lại làm tiếp bất cứ lúc nào.')){
    clearInterval(state.timerHandle);
    $('#appShell').style.display = 'none';
    $('#introScreen').style.display = 'flex';
    renderIntroScreen();
  }
});

/* ================================================================
   16) ĐIỀU HƯỚNG CÂU HỎI (PREV / NEXT) + PHÍM TẮT
   ================================================================ */
$('#btnPrev').addEventListener('click', () => { if(state.current>0){ state.current--; renderAll(); scrollToQuestion(); }});
$('#btnNext').addEventListener('click', () => { if(state.current<TOTAL_Q-1){ state.current++; renderAll(); scrollToQuestion(); }});
document.addEventListener('keydown', (e) => {
  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if(e.key === 'ArrowLeft') $('#btnPrev').click();
  if(e.key === 'ArrowRight') $('#btnNext').click();
});
$('#btnScrollTop').addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
$('#btnScrollBottom').addEventListener('click', () => window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'}));
$('#btnMiniNav').addEventListener('click', () => {
  const pop = $('#miniNavPopover');
  const open = pop.classList.toggle('open');
  $('#btnMiniNav').setAttribute('aria-expanded', open ? 'true' : 'false');
});
$('#btnMiniNavClose').addEventListener('click', closeMiniNav);
document.addEventListener('click', (e) => {
  const pop = $('#miniNavPopover'), btn = $('#btnMiniNav');
  if(pop && pop.classList.contains('open') && !pop.contains(e.target) && e.target !== btn){
    closeMiniNav();
  }
});

/* HSK-QUIZ-INTEGRITY:START */
/* Lớp rào cản trong trình duyệt: ngăn chọn/copy/in nội dung đề trong phiên đang làm. */
function isQuizTaking(){
  const shell = $('#appShell');
  return !!shell && shell.style.display !== 'none' && !state.submitted;
}
function isAnswerEditor(node){
  return !!(node && node.closest && node.closest('input, textarea, select'));
}
function blockQuizCopy(event){
  if(isQuizTaking() && !isAnswerEditor(event.target) && !isAnswerEditor(document.activeElement)) event.preventDefault();
}
document.addEventListener('copy', blockQuizCopy);
document.addEventListener('cut', blockQuizCopy);
document.addEventListener('dragstart', event => {
  if(isQuizTaking() && event.target.closest && event.target.closest('#appShell')) event.preventDefault();
});
document.addEventListener('contextmenu', event => {
  if(isQuizTaking() && event.target.closest && event.target.closest('#appShell') && !isAnswerEditor(event.target)) event.preventDefault();
});
document.addEventListener('keydown', event => {
  if(!isQuizTaking()) return;
  const key = event.key.toLowerCase();
  if((event.ctrlKey || event.metaKey) && ['p','s','u'].includes(key)){ event.preventDefault(); return; }
  if((event.ctrlKey || event.metaKey) && ['c','x'].includes(key) && !isAnswerEditor(document.activeElement)) event.preventDefault();
});
/* HSK-QUIZ-INTEGRITY:END */
/* ================================================================
   17) RENDER TỔNG (GỌI LẠI MỖI KHI STATE THAY ĐỔI)
   ================================================================ */
function renderAll(){
  const appShell = $('#appShell');
  if(appShell) appShell.classList.toggle('is-taking', !state.submitted);
  updateProgress();
  const visibleIndexes = ALL_QUESTIONS.map((q, index) => ({q, index}))
    .filter(({q}) => !state.submitted || !state.reviewMode || questionMatchesFilter(q))
    .map(({index}) => index);
  const hasReviewItems = visibleIndexes.length > 0;
  const showQuestionUI = !state.submitted || (state.reviewMode && hasReviewItems);
  const navPanel = $('#navPanel'), questionArea = $('#questionArea'), navButtons = $('#qNavButtons');
  if(navPanel) navPanel.style.display = showQuestionUI ? '' : 'none';
  if(questionArea) questionArea.style.display = showQuestionUI ? '' : 'none';
  if(navButtons) navButtons.style.display = showQuestionUI ? 'flex' : 'none';
  const miniNavButton = $('#btnMiniNav');
  if(miniNavButton) miniNavButton.style.display = showQuestionUI ? '' : 'none';
  if(!showQuestionUI) closeMiniNav();

  if(showQuestionUI){
    if(state.submitted && !questionMatchesFilter(ALL_QUESTIONS[state.current])) jumpToFirstFilterMatch();
    renderNavGrid();
    renderQuestion();
  } else {
    clearAllRetellTimers();
    const navGrid = $('#navGridContainer'), miniGrid = $('#miniNavGridContainer');
    if(navGrid) navGrid.innerHTML = '';
    if(miniGrid) miniGrid.innerHTML = '';
    if(questionArea) questionArea.innerHTML = '';
  }
  $('#btnSubmit').style.display = state.submitted ? 'none' : 'inline-flex';
  renderResultArea();
  renderHistoryBanner();
  const currentPosition = visibleIndexes.indexOf(state.current);
  $('#btnPrev').disabled = currentPosition <= 0;
  $('#btnNext').disabled = currentPosition < 0 || currentPosition >= visibleIndexes.length - 1;
}/* ================================================================
   18) KHỞI TẠO
   Trang luôn mở ra ở màn hình giới thiệu (#introScreen) trước tiên;
   #appShell (thanh công cụ + câu hỏi) chỉ hiển thị và đồng hồ chỉ
   bắt đầu chạy sau khi người học bấm "Bắt đầu làm bài".
   ================================================================ */
function initQuestionNavFooterObserver(){
  const attach=()=>{
    const nav=$('#qNavButtons'), footer=$('#siteFooter');
    if(!nav || !footer || !('IntersectionObserver' in window)) return;
    const observer=new IntersectionObserver(entries=>{
      nav.classList.toggle('footer-clear', entries.some(entry=>entry.isIntersecting));
    }, {threshold:0.05});
    observer.observe(footer);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
}

function init(){
  initTheme();
  initQuestionNavFooterObserver();
  renderHeaderFromLesson();
  renderIntroScreen();
}
init();
