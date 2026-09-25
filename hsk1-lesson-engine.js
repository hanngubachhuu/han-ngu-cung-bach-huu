/* HSK 1 shared engine, adapted from the existing HSK 2 lesson engine.
   All learning content lives in data/lessons/hsk1. No HSK 2 scoring keys are used. */
(()=>{'use strict';
const raw = window.HAN_NGU_DATA.getRaw(document.body.dataset.lessonId);
if(!raw) throw new Error('Không tìm thấy dữ liệu bài HSK 1.');
const c=raw.content;
const skillLabels={tuvung:'Từ vựng',phatam:'Pinyin',nguphap:'Ngữ pháp',dochieu:'Đọc',nghe:'Nghe',viet:'Viết',dich:'Dịch',giaotiep:'Nói'};
const LESSON={id:raw.id,title:c.course.titleZh,titleVi:c.course.titleVi,subtitle:'Bài '+c.course.lessonNo+' · '+c.ui.heroDescription,
  meta:['HSK 1 · Giáo trình chuẩn cũ',c.exercises.all.length+' câu','Có nghe bài khóa'],timeLimitMinutes:c.meta.timeLimitMinutes,
  vocab:c.vocabulary,grammar:c.grammar,content:c,skills:Object.fromEntries(Object.entries(skillLabels).map(([k,label])=>[k,{label}])),
  sections:raw.exerciseSections.map(sec=>({...sec,questions:c.exercises.all.filter(q=>q.section===sec.id).map(q=>({...q}))}))};
let storageFailed=false;
function storageWarning(){storageFailed=true;const e=document.getElementById('storageNote');if(e)e.textContent='Trình duyệt đang chặn lưu dữ liệu. Em vẫn làm bài được trong phiên này; tải lại trang sẽ không khôi phục bài.';}
const memoryStorage=new Map();
const safeStorage={getItem(k){try{return window.localStorage.getItem(k);}catch{storageWarning();return memoryStorage.get(k)||null;}},setItem(k,v){memoryStorage.set(k,v);try{window.localStorage.setItem(k,v);}catch{storageWarning();}},removeItem(k){memoryStorage.delete(k);try{window.localStorage.removeItem(k);}catch{storageWarning();}}};
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
const STORAGE_HISTORY_KEY = `${LESSON.id}_history`;
const STORAGE_INPROGRESS_KEY = `${LESSON.id}_inprogress`;

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
  retellWindows: {}, started:false, attemptId:null, submitTime:null, duration:null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ================================================================
   3) DARK / LIGHT MODE
   ================================================================ */
function initTheme(){
  const saved = safeStorage.getItem('hsk1_theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}
$('#themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  safeStorage.setItem('hsk1_theme', next);
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
  document.title = `${LESSON.title} — Bài tập HSK 1`;

  // Màn hình mở đầu
  $('#introZh').innerHTML = `<span class="zh">${escapeHtml(LESSON.title)}</span>`;
  $('#introSub').textContent = LESSON.subtitle;
  const introStats = $('#introStats'); introStats.innerHTML = '';
  LESSON.meta.forEach(m => introStats.appendChild(el('span','intro-stat-chip', escapeHtml(m))));
  introStats.appendChild(el('span','intro-stat-chip', `⏱ <b>${LESSON.timeLimitMinutes}</b> phút`));

  // Đếm số từ vựng / điểm ngữ pháp để hiển thị trên 2 nút toggle
  $('#vocabCount').textContent = `${LESSON.vocab.length} từ`;
  $('#grammarCount').textContent = `${LESSON.grammar.length} điểm`;
  if(storageFailed)storageWarning();
  renderVocabTable();
  renderGrammarList();
}

function renderVocabTable(){
  const wrap = $('#vocabTableWrap'); wrap.innerHTML = '';
  LESSON.vocab.forEach(v => {
    const row = el('div','vocab-row');
    row.innerHTML = `<span class="han">${escapeHtml(v.han)}</span><span class="pinyin">${escapeHtml(v.pinyin)}</span><span class="nghia">${escapeHtml(v.nghia)}</span><span class="vocab-notes">${mixText(v.partOfSpeech+' · '+(v.detail?.collocations||[]).map(x=>x.pattern).join(' · '))}</span>`;
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
      const raw = safeStorage.getItem(STORAGE_HISTORY_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch(e){ console.warn('Lỗi đọc lịch sử, trả về mảng rỗng.', e); return []; }
  },
  appendAttempt(record){
    const hist = this.getHistory();
    hist.push(record);
    try{ safeStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(hist)); }
    catch(e){ console.warn('Không thể lưu lịch sử.', e); }
    return hist;
  },
  clearHistory(){
    safeStorage.removeItem(STORAGE_HISTORY_KEY);
  },
  saveInProgress(){
    try{
      safeStorage.setItem(STORAGE_INPROGRESS_KEY, JSON.stringify({
        answers: state.answers, selfMarks: state.selfMarks,
        current: state.current, startTime: state.startTime,
        timeLeftSec: state.timeLeftSec,
        retellWindows: state.retellWindows,version:c.meta.version,submitted:state.submitted,attemptId:state.attemptId,submitTime:state.submitTime,duration:state.duration
      }));
    }catch(e){ /* bỏ qua lỗi lưu tạm */ }
  },
  loadInProgress(){
    try{
      const raw = safeStorage.getItem(STORAGE_INPROGRESS_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  },
  clearInProgress(){ safeStorage.removeItem(STORAGE_INPROGRESS_KEY); }
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
  clearInterval(state.timerHandle);updateTimerDisplay();
  if(state.submitted)return;
  state.timerHandle=setInterval(()=>{if(state.submitted){clearInterval(state.timerHandle);return;}state.timeLeftSec=Math.max(0,state.timeLeftSec-1);updateTimerDisplay();if(state.timeLeftSec%5===0)DataStore.saveInProgress();if(state.timeLeftSec<=0)submitQuiz(true);},1000);
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
  try{ safeStorage.setItem(NAV_EXPANDED_KEY, expanded ? '1' : '0'); }catch(e){}
}
let navBound=false;
function initNavCollapse(){
  if(navBound)return;navBound=true;
  const saved = (() => { try{ return safeStorage.getItem(NAV_EXPANDED_KEY); }catch(e){ return null; } })();
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
      if(['self_check','retell'].includes(q.type) && isAnswered(q) && state.selfMarks[q.id]===undefined){cell.classList.add('pending');cell.title='Chờ tự chấm';}
      else if(g.score >= g.max) cell.classList.add('correct');
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
  stopAudio();
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
  if(q.countsTowardCore===false) head.appendChild(el('span','q-type-badge','Mở rộng · không tính điểm cốt lõi'));
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
  const sec=LESSON.sections.find(s=>s.id===q._sectionId);
  if(sec?.instruction) card.appendChild(el('p','hint-inline',mixText(sec.instruction)));
  if(q.hint){ card.appendChild(el('div','', `<span class="hint-inline">${mixText(q.hint)}</span>`)); }

  const body = el('div','q-body');
  switch(q.type){
    case 'mcq': renderMcq(q, body); break;
    case 'text_fill': renderTextFill(q, body); break;
    case 'reorder': renderReorder(q, body); break;
    case 'self_check': renderSelfCheck(q, body); break;
    case 'retell': renderRetell(q, body); break;
    case 'multi_fill': renderMultiFill(q, body); break;
    case 'listening': renderListening(q, body); break;
  }
  card.appendChild(body);

  if(state.submitted) card.appendChild(renderExplainPanel(q));

  area.appendChild(card);
}
function typeLabel(t){
  return {mcq:'Trắc nghiệm', text_fill:'Điền từ', reorder:'Sắp xếp câu', listening:'Nghe hiểu', retell:'Đọc - kể lại', multi_fill:'Điền nhiều chỗ trống', self_check:'Tự luận'}[t] || t;
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
  const list=el('div','opt-list'); list.setAttribute('role','radiogroup');list.setAttribute('aria-label','Chọn một đáp án');
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
    let blobUrl=null;
    const setRest=()=>{ play.textContent='Phát audio'; };
    audio.addEventListener('pause',()=>{if(!audio.ended)play.textContent='Tiếp tục';});
    audio.addEventListener('error',()=>{setRest();status.textContent='Tệp nghe chưa tải được. Kiểm tra kết nối rồi thử lại.';});
    async function playAudio(){
      try{
        await audio.play();
        play.textContent='Tạm dừng';
        status.textContent='Đang phát audio.';
      }catch(firstError){
        // Một số trình duyệt từ chối phát trực tiếp media cross-origin từ signed URL.
        // Fallback: tải signed URL thành Blob rồi phát bằng blob: URL.
        try{
          status.textContent='Đang tải audio…';
          const response=await fetch(q.audioSrc,{cache:'no-store'});
          if(!response.ok) throw new Error('HTTP '+response.status);
          const blob=await response.blob();
          if(blobUrl) URL.revokeObjectURL(blobUrl);
          blobUrl=URL.createObjectURL(blob);
          audio.src=blobUrl;
          audio.load();
          await audio.play();
          play.textContent='Tạm dừng';
          status.textContent='Đang phát audio.';
        }catch(secondError){
          const detail=secondError?.message||firstError?.message||'Không rõ lỗi';
          status.textContent='Không thể phát tệp ('+detail+').';
        }
      }
    }
    play.addEventListener('click', async () => {
      if(audio.paused){ await playAudio(); }
      else { audio.pause(); play.textContent='Tiếp tục'; status.textContent='Đã tạm dừng.'; }
    });
    audio.addEventListener('ended',()=>{setRest();status.textContent='Đã phát xong. Em có thể nghe lại.'; if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}});

    speed.addEventListener('click',()=>{ const rates=[.8,1,1.15]; const next=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length]; audio.playbackRate=next; speed.textContent=next.toFixed(2).replace(/0$/,'')+'×'; });
    player.append(play,speed,status,audio); body.appendChild(player);
  }
  renderMcq(q, body);
  if(state.submitted&&q.audioText)body.appendChild(el('div','audio-script',mixText((q.audioTextLabel||'Đối chiếu')+'\n'+q.audioText)));
}
function renderTextFill(q, body){
  const input = el('input');input.setAttribute('aria-label','Câu trả lời bằng chữ Hán');
  input.type = 'text'; input.className = 'fill-input';
  input.placeholder = 'Nhập câu trả lời (chữ Hán)...';
  input.value = state.answers[q.id] || '';
  if(state.submitted){
    input.classList.add('locked'); input.readOnly=true;
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
    const t = el('button','token placed', mixText(tok));t.type='button';t.disabled=state.submitted;t.setAttribute('aria-label','Bỏ thẻ '+tok);
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
    const t = el('button','token'+(isUsed?' used':''), mixText(tok));t.type='button';t.disabled=state.submitted||isUsed;t.setAttribute('aria-label','Chọn thẻ '+tok);
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
function renderSelfCheck(q, body){
  const wrap = el('div','selfcheck-area');
  const ta = el('textarea');ta.setAttribute('aria-label',q.skill==='giaotiep'?'Ghi lại phần em đã nói':'Câu trả lời tự luận');
  ta.placeholder = 'Viết câu trả lời của em vào đây...';
  ta.value = state.answers[q.id] || '';
  if(state.submitted){ta.classList.add('locked');ta.readOnly=true;}
  else ta.addEventListener('input', () => { state.answers[q.id] = ta.value; DataStore.saveInProgress(); updateProgress(); renderNavGrid(); });
  wrap.appendChild(ta);

  if(state.submitted){
    wrap.appendChild(el('p','hint-inline','Đối chiếu bài mẫu và tiêu chí, rồi tự đánh giá bài làm.'));
    const box = el('div','model-answer-box');
    box.appendChild(el('div','label','✅ Đáp án mẫu'));
    box.appendChild(el('div','content', mixText(q.model)));
    wrap.appendChild(box);
    if(q.rubric){
      const rubric = el('div','answer-reveal-box rubric-box');
      rubric.appendChild(el('div','label','Tiêu chí tự chấm'));
      rubric.appendChild(el('div','content',mixText(q.rubric)));
      wrap.appendChild(rubric);
    }

    const markRow = el('div','selfmark-row');
    markRow.appendChild(el('div','label-txt','Em tự chấm bài của mình:'));
    const btnGroup = el('div','btn-group');
    [[1,'✅ Đúng hoàn toàn'],[0.5,'🟡 Đúng một phần'],[0,'❌ Chưa đúng']].forEach(([v,label]) => {
      const b = el('button','selfmark-btn', label);
      b.type='button'; b.dataset.v = v;b.disabled=!isAnswered(q);if(!isAnswered(q))b.title='Câu chưa làm được tính 0 điểm.';
      if(state.selfMarks[q.id] === v) b.classList.add('active');
      b.addEventListener('click', () => {
        state.selfMarks[q.id] = isAnswered(q) ? v : 0;
        persistResult();
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
  const max=1,v=state.answers[q.id];
  if(q.type==='mcq'||q.type==='listening')return {score:v===q.answer?1:0,max};
  if(q.type==='text_fill'){const norm=s=>String(s??'').normalize('NFC').trim().replace(/[\s。.!！?？]/g,'');return {score:q.answer.some(a=>norm(a)===norm(v))?1:0,max};}
  if(q.type==='reorder'){const opts=[q.answer,...(q.acceptedAnswers||[])];return {score:Array.isArray(v)&&opts.some(a=>v.length===a.length&&a.every((t,i)=>t===v[i]))?1:0,max};}
  if(q.type==='multi_fill')return {score:Array.isArray(v)&&v.length===q.answers.length&&v.every((t,i)=>t===q.answers[i])?1:0,max};
  if(q.type==='self_check'||q.type==='retell'){const mark=state.selfMarks[q.id];return {score:isAnswered(q)&&[0,.5,1].includes(mark)?mark:0,max};}
  return {score:0,max};
}
function computeFullResult(){
  let score=0,max=0,correct=0,wrong=0,unanswered=0,partial=0,pending=0,autoScore=0,autoMax=0,manualScore=0,manualMax=0,extensionScore=0,extensionMax=0;
  const bySection={},bySkill={};
  LESSON.sections.forEach(s=>bySection[s.id]={label:s.title,score:0,max:0});
  Object.entries(LESSON.skills).forEach(([k,v])=>bySkill[k]={label:v.label,score:0,max:0});
  ALL_QUESTIONS.forEach(q=>{
    const g=gradeQuestion(q),manual=['self_check','retell'].includes(q.type);
    if(q.countsTowardCore===false){extensionScore+=g.score;extensionMax+=g.max;return;}
    score+=g.score;max+=g.max;bySection[q._sectionId].score+=g.score;bySection[q._sectionId].max+=g.max;
    bySkill[q._skill].score+=g.score;bySkill[q._skill].max+=g.max;
    if(manual){manualScore+=g.score;manualMax+=g.max;}else{autoScore+=g.score;autoMax+=g.max;}
    if(!isAnswered(q))unanswered++;
    else if(manual&&state.selfMarks[q.id]===undefined)pending++;
    else if(g.score===1)correct++;
    else if(g.score===0)wrong++;
    else partial++;
  });
  return {score,max,percentage:max?score/max*100:0,correct,wrong,unanswered,partial,pending,autoScore,autoMax,manualScore,manualMax,extensionScore,extensionMax,bySection,bySkill};
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
  const unanswered = ALL_QUESTIONS.filter(q => q.countsTowardCore!==false && !isAnswered(q));
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
  if(state.submitted)return;
  state.submitted=true;state.reviewMode=false;state.submitTime=Date.now();state.duration=Math.max(0,LESSON.timeLimitMinutes*60-state.timeLeftSec);state.auto=!!auto;
  state.attemptId=state.attemptId||String(state.submitTime)+'-'+Math.random().toString(36).slice(2,8);
  stopAudio();clearInterval(state.timerHandle);clearAllRetellTimers();closeMiniNav();persistResult();DataStore.saveInProgress();renderAll();
  window.setTimeout(()=>$('#resultArea')?.scrollIntoView({block:'start',behavior:'smooth'}),0);
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
      <div class="result-stat"><b>${result.score.toFixed(1)}/${result.max}</b><span>Điểm cốt lõi (gồm tự chấm)</span></div>
      <div class="result-stat"><b>${result.correct}</b><span>Câu đúng</span></div>
      <div class="result-stat"><b>${result.wrong}</b><span>Câu sai</span></div>
      <div class="result-stat"><b>${result.partial}</b><span>Đúng một phần</span></div>
      <div class="result-stat"><b>${formatTime(state.duration||0)}</b><span>Thời gian làm bài</span></div>
    </div>
  `;
  area.appendChild(hero);
  area.appendChild(el('div','score-note',`Chấm tự động: ${result.autoScore}/${result.autoMax}. Tự luận cốt lõi: ${result.manualScore}/${result.manualMax}; còn ${result.pending} câu đã trả lời chưa tự chấm. ${result.unanswered} câu cốt lõi chưa làm. Phần mở rộng: ${result.extensionScore}/${result.extensionMax}, hiển thị riêng và không cộng vào điểm cốt lõi. Mở bộ lọc bên dưới để xem lời giải và tự chấm.`));
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
  const canvas = document.createElement('canvas'); canvas.id = 'skillChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Biểu đồ kỹ năng; số liệu đầy đủ có trong bảng điểm từng phần phía trên.');
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
  [['all','Tất cả'],['correct','Câu đúng'],['wrong','Câu sai'],['partial','Một phần'],['pending','Chờ tự chấm'],['unanswered','Chưa làm']].forEach(([k,label]) => {
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
  const padL=42, padB=72, padT=20, padR=16;
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
    ctx.save();ctx.translate(cx,cssH-padB+18);if(cssW<450)ctx.rotate(-Math.PI/5);ctx.fillText(s.label,0,0);ctx.restore();
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
  const pending = answered && ['self_check','retell'].includes(q.type) && state.selfMarks[q.id] === undefined;
  if(state.reviewFilter === 'pending') return pending;
  if(pending && state.reviewFilter !== 'all') return false;
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
    clearInterval(state.timerHandle);
    clearAllRetellTimers();
    state = { current:0, answers:{}, selfMarks:{}, submitted:false, startTime:Date.now(),
      timeLeftSec: LESSON.timeLimitMinutes*60, timerHandle:null, reviewFilter:'all', reviewMode:false, retellWindows:{},started:true,attemptId:null,submitTime:null,duration:null };
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
    const scroll=el('div','history-scroll');scroll.appendChild(table);box.appendChild(scroll);
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
      <div class="result-stat"><b>${record.totalScore.toFixed(1)}/${record.maxScore}</b><span>Điểm cốt lõi (gồm tự chấm)</span></div>
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
    if(q.type === 'mcq' || q.type === 'listening'){
      const opt = (q.options||[]).find(o=>o.k===studentVal);
      studentText = opt ? `${opt.k}. ${opt.t}` : '(chưa trả lời)';
      const correctOpt = (q.options||[]).find(o=>o.k===q.answer);
      correctText = correctOpt ? `${correctOpt.k}. ${correctOpt.t}` : q.answer;
      isCorrect = studentVal === q.answer;
    } else if(q.type === 'text_fill'){
      studentText = studentVal || '(chưa trả lời)';
      correctText = (q.answer||[]).join(' / ');
      const normalized=x=>String(x||'').normalize('NFC').trim().replace(/[\s。.!！?？]/g,'');
      isCorrect = (q.answer||[]).some(a => normalized(a) === normalized(studentVal));
    } else if(q.type === 'reorder'){
      studentText = Array.isArray(studentVal) && studentVal.length ? studentVal.join('') : '(chưa trả lời)';
      correctText = (q.answer||[]).join('');
      isCorrect = Array.isArray(studentVal) && [q.answer,...(q.acceptedAnswers||[])].some(a=>studentVal.length===a.length&&studentVal.every((t,i)=>t===a[i]));
    } else if(q.type === 'self_check' || q.type === 'retell'){
      studentText = studentVal || '(chưa trả lời)';
      correctText = q.model;
      const mark = (record.selfMarks||{})[q.id];
      isCorrect = mark === 1 ? true : (mark === 0 ? false : (mark === 0.5 ? 'partial' : null));
    }
    const row = el('div','q-card'); row.style.padding='14px 16px'; row.style.margin='10px 0';
    const statusBadge = isCorrect===true ? '<span class="badge" style="color:var(--green); font-weight:700;">✔ Đúng</span>'
      : isCorrect===false ? '<span class="badge" style="color:var(--red); font-weight:700;">✘ Sai</span>'
      : isCorrect==='partial' ? '<span class="badge" style="color:var(--amber); font-weight:700;">◐ Một phần</span>' : '<span class="badge" style="color:var(--text-faint); font-weight:700;">— Chưa tự chấm</span>';
    row.innerHTML = `<div style="font-size:12px; color:var(--text-faint); margin-bottom:4px;">Câu ${q._index+1} · ${escapeHtml(q.id)}</div>
      <div style="font-size:15px; margin-bottom:6px;">${mixText(q.prompt)}</div>
      <div style="font-size:13.5px; margin-bottom:2px;">Đáp án học sinh: ${mixText(String(studentText))}</div>
      <div style="font-size:13.5px; margin-bottom:2px; color:var(--green);">Đáp án đúng: ${mixText(String(correctText))}</div>
      <div style="margin-top:4px;">${statusBadge}</div><details><summary>Giải thích và tiêu chí</summary>${mixText((q.readingText?q.readingText+'\n':'')+q.explain+'\n'+(q.rubric||''))}</details>`;
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

  if(inprog && inprog.startTime && inprog.version===c.meta.version){
    const answeredCount = ALL_QUESTIONS.filter(q => {
      const v = (inprog.answers||{})[q.id];
      if(v === undefined || v === null) return false;
      if(Array.isArray(v)) return v.length === q.tokens?.length;
      if(typeof v === 'string') return v.trim().length > 0;
      return true;
    }).length;
    progBox.style.display = 'flex';
    progBox.innerHTML = `<span class="txt">📝 Em đang làm dở bài này: <b>${answeredCount}/${TOTAL_Q}</b> câu đã trả lời.</span>`;
    startBtn.innerHTML = inprog.submitted ? '📋 Xem kết quả và tự chấm' : '▶️ Tiếp tục làm bài';
    if(inprog.submitted)progBox.innerHTML='<span class="txt">Bài đã nộp; có thể mở lại kết quả và phần tự chấm.</span>';
  } else {
    progBox.style.display = 'none';
    startBtn.innerHTML = '🚀 Bắt đầu làm bài';
  }
}

function enterQuiz(){
  const saved=DataStore.loadInProgress();
  if(saved&&saved.startTime&&saved.version===c.meta.version){
    Object.assign(state,{answers:saved.answers||{},selfMarks:saved.selfMarks||{},current:Math.max(0,Math.min(TOTAL_Q-1,Number(saved.current)||0)),startTime:saved.startTime,
      timeLeftSec:Math.max(0,Math.min(LESSON.timeLimitMinutes*60,Number(saved.timeLeftSec)||0)),submitted:!!saved.submitted,attemptId:saved.attemptId||null,submitTime:saved.submitTime||null,duration:saved.duration||0,reviewMode:false,reviewFilter:'all'});
  }else{state.startTime=Date.now();state.timeLeftSec=LESSON.timeLimitMinutes*60;state.submitted=false;}
  state.started=true;$('#introScreen').style.display='none';$('#appShell').style.display='block';initNavCollapse();startTimer();renderAll();window.scrollTo({top:0});
}

$('#btnStart').addEventListener('click', enterQuiz);
$('#btnViewHistoryIntro').addEventListener('click', showHistoryModal);
$('#brandHome').addEventListener('click', () => {
  if(confirm('Quay về màn hình đầu? Đáp án hiện tại vẫn được lưu tự động, em có thể quay lại làm tiếp bất cứ lúc nào.')){
    clearInterval(state.timerHandle);stopAudio();DataStore.saveInProgress();
    $('#appShell').style.display = 'none';
    $('#introScreen').style.display = 'flex';
    renderIntroScreen();
  }
});

/* ================================================================
   16) ĐIỀU HƯỚNG CÂU HỎI (PREV / NEXT) + PHÍM TẮT
   ================================================================ */
$('#btnPrev').addEventListener('click',()=>moveQuestion(-1));
$('#btnNext').addEventListener('click',()=>moveQuestion(1));
document.addEventListener('keydown', (e) => {
  if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName) || $('#modalRoot').children.length) return;
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


/* ================================================================
   17) RENDER TỔNG (GỌI LẠI MỖI KHI STATE THAY ĐỔI)
   ================================================================ */
function renderAll(){
  stopAudio();
  if(state.started) DataStore.saveInProgress();
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


function init(){
  initTheme();

  renderHeaderFromLesson();
  renderIntroScreen();
}

function stopAudio(){document.querySelectorAll('#questionArea audio').forEach(a=>a.pause());}
function moveQuestion(step){const indices=ALL_QUESTIONS.map((q,i)=>({q,i})).filter(x=>!state.submitted||!state.reviewMode||questionMatchesFilter(x.q)).map(x=>x.i);const j=indices.indexOf(state.current),next=indices[j+step];if(next!==undefined){state.current=next;renderAll();scrollToQuestion();}}
function persistResult(){
  if(!state.submitted||!state.attemptId)return;
  const r=computeFullResult(),hist=DataStore.getHistory(),idx=hist.findIndex(x=>x.attemptId===state.attemptId);
  const record={attemptId:state.attemptId,attemptNumber:idx>=0?hist[idx].attemptNumber:hist.length+1,lessonId:LESSON.id,lessonTitle:LESSON.title,startTime:state.startTime,submitTime:state.submitTime,duration:state.duration,
    totalScore:r.score,maxScore:r.max,percentage:r.percentage,correctAnswers:r.correct,wrongAnswers:r.wrong,unansweredQuestions:r.unanswered,pendingSelfChecks:r.pending,scoreBySection:r.bySection,scoreBySkill:r.bySkill,
    extensionScore:r.extensionScore,extensionMax:r.extensionMax,studentAnswers:state.answers,selfMarks:state.selfMarks,version:c.meta.version,auto:!!state.auto};
  if(idx>=0)hist[idx]=record;else hist.push(record);safeStorage.setItem(STORAGE_HISTORY_KEY,JSON.stringify(hist));
}
function preparePrint(){
  document.querySelector('.print-report')?.remove();if(!state.submitted)return;
  const report=el('div','print-report');report.appendChild(el('h2','',mixText(LESSON.title+' — Bài làm và đối chiếu')));
  const result=computeFullResult();
  report.appendChild(el('p','',mixText('Điểm cốt lõi (gồm tự chấm): '+result.score+'/'+result.max+'; còn '+result.pending+' câu đã trả lời chờ tự chấm. Phần mở rộng: '+result.extensionScore+'/'+result.extensionMax+', không cộng vào điểm cốt lõi.')));
  ALL_QUESTIONS.forEach(q=>{const card=el('div','print-item'),v=state.answers[q.id];let answer=q.model||((q.options||[]).find(o=>o.k===q.answer)?.t)||(Array.isArray(q.answer)?q.answer.join(' '):q.answer)||'';
    card.innerHTML='<h3>'+mixText(q.id+' · '+q._sectionTitle)+'</h3>'+mixText([q.readingText,q.hint,q.prompt].filter(Boolean).join('\n'))+
      (q.options?'<p>'+q.options.map(o=>mixText(o.k+'. '+o.t)).join('<br>')+'</p>':'')+(q.tokens?'<p><b>Thẻ từ:</b> '+mixText(q.tokens.join(' / '))+'</p>':'')+
      '<p><b>Em trả lời:</b> '+mixText(Array.isArray(v)?v.join(' '):String(v||'(chưa làm)'))+'</p><p><b>Đáp án / mẫu:</b> '+mixText(answer)+'</p>'+mixText(q.explain)+
      (q.audioText?'<p><b>Trích lời thoại:</b> '+mixText(q.audioText)+'</p>':'')+(q.rubric?'<p>'+mixText(q.rubric)+'</p>':'');report.appendChild(card);});$('#appShell').appendChild(report);
}
window.addEventListener('beforeprint',preparePrint);
window.addEventListener('pagehide',()=>{if(state.started)DataStore.saveInProgress();stopAudio();});
// Modal focus and keyboard handling, also applied to history/detail modals.
let modalReturnFocus=null;
new MutationObserver(()=>{const dialog=$('#modalRoot .modal-box');if(dialog){if(!dialog.hasAttribute('role')){modalReturnFocus=document.activeElement;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',dialog.querySelector('h3')?.textContent||'Hộp thoại');dialog.querySelector('button')?.focus();}}else{modalReturnFocus?.focus?.();modalReturnFocus=null;}}).observe($('#modalRoot'),{childList:true});
document.addEventListener('keydown',e=>{const modal=$('#modalRoot .modal-overlay');if(!modal)return;if(e.key==='Escape'){e.preventDefault();modal.remove();return;}if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button:not(:disabled),a,input,textarea,[tabindex="0"]')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.addEventListener('keydown',e=>{const row=e.target.closest?.('.opt-list .opt');if(!row||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const a=[...row.parentElement.children],i=a.indexOf(row),step=['ArrowDown','ArrowRight'].includes(e.key)?1:-1;a[(i+step+a.length)%a.length].focus();},true);

init();

})();
