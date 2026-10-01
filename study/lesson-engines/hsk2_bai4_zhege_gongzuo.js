
"use strict";
/* ==========================================================================================
   1. DỮ LIỆU BÀI HỌC — tách biệt hoàn toàn khỏi logic hiển thị.
   Muốn tái sử dụng cho bài học khác: chỉ cần thay object LESSON này.
========================================================================================== */
const LESSON = window.HNH_PRIVATE_LEGACY
const STORE = {
  historyKey: "lms_history__" + LESSON.id + window.HNH_ACCOUNT_SCOPE,
  progressKey: "lms_progress__" + LESSON.id + window.HNH_ACCOUNT_SCOPE,
  themeKey: "lms_theme_pref",

  readJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    }catch(e){ console.warn("Dữ liệu lưu trữ lỗi, dùng giá trị mặc định cho", key, e); return fallback; }
  },
  writeJSON(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ console.warn("Không thể ghi localStorage", e); return false; }
  },
  remove(key){ try{ localStorage.removeItem(key); }catch(e){} },

  getHistory(){ const h = this.readJSON(this.historyKey, []); return Array.isArray(h) ? h : []; },
  saveHistory(list){ this.writeJSON(this.historyKey, list); },
  addAttempt(attempt){
    const list = this.getHistory();
    attempt.attemptNumber = list.length + 1;
    list.push(attempt);
    this.saveHistory(list); window.HNH_ATTEMPTS?.capture(attempt);
    return attempt;
  },
  clearHistory(){ this.remove(this.historyKey); },

  getProgress(){ return this.readJSON(this.progressKey, null); },
  saveProgress(state){ this.writeJSON(this.progressKey, state); },
  clearProgress(){ this.remove(this.progressKey); }
};

/* ==========================================================================================
   3. STATE ỨNG DỤNG
========================================================================================== */
const QUESTIONS = LESSON.questions;
const TOTAL_Q = QUESTIONS.length;
const AUTO_TYPES = new Set(["mcq","blank_most","reorder","text_fill","dialog_fill","matching"]);

const STATE = {
  currentIndex: 0,
  answers: {},         // id -> answer payload (structure depends on type)
  selfMarks: {},        // id -> true/false/null (student self-assessment for self_check)
  startTime: null,
  submitTime: null,
  timeLimitSec: LESSON.timeLimitMinutes * 60,
  remainingSec: LESSON.timeLimitMinutes * 60,
  timerHandle: null,
  submitted: false,
  reviewFilter: "all",
  historyViewOpen: false
};

/* ==========================================================================================
   4. TIỆN ÍCH CHUNG
========================================================================================== */
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function normalizeCompare(s){
  return String(s||"")
    .replace(/\s+/g,"")
    .replace(/[。？！，、]/g,"")
    .replace(/[?!,.]/g,"")
    .trim();
}
function fmtTime(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
function fmtDuration(sec){
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec/60), s = sec%60;
  return m>0 ? `${m} phút ${s} giây` : `${s} giây`;
}
function fmtDate(ts){
  const d = new Date(ts);
  return d.toLocaleString("vi-VN", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove("show"), 2200);
}
function questionById(id){ return QUESTIONS.find(q=>q.id===id); }
function sectionById(id){ return LESSON.sections.find(s=>s.id===id); }

/* ==========================================================================================
   5. THEME (DARK / LIGHT)
========================================================================================== */
function initTheme(){
  const pref = STORE.readJSON(STORE.themeKey, "dark");
  document.documentElement.setAttribute("data-theme", pref);
  $("#themeToggle").textContent = pref==="dark" ? "☀️" : "🌙";
}
$("#themeToggle").addEventListener("click", ()=>{
  const cur = document.documentElement.getAttribute("data-theme")==="dark" ? "dark" : "light";
  const next = cur==="dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  STORE.writeJSON(STORE.themeKey, next);
  $("#themeToggle").textContent = next==="dark" ? "☀️" : "🌙";
});

/* ==========================================================================================
   5b. GẮN METADATA BÀI HỌC VÀO GIAO DIỆN (giúp file có thể tái sử dụng chỉ bằng cách đổi LESSON)
========================================================================================== */
function applyLessonMeta(){
  document.title = LESSON.zhTitle + " · " + LESSON.viSubtitle;
  const pageTag = document.getElementById("pageTitleTag");
  if(pageTag) pageTag.textContent = LESSON.zhTitle + " · " + LESSON.viSubtitle;
  const set = (id,txt)=>{ const e=document.getElementById(id); if(e) e.textContent = txt; };
  set("brandZh", LESSON.zhTitle);
  set("brandSub", LESSON.viSubtitle);
  set("heroZh", LESSON.zhTitle);
  set("heroTitle", LESSON.heroTitle || ("Bài tập về nhà — "+LESSON.viSubtitle));
  set("heroDesc", LESSON.heroDescription || "");
}

/* ==========================================================================================
   6. KHỞI ĐỘNG / MÀN HÌNH BẮT ĐẦU
========================================================================================== */
function initStartScreen(){
  applyLessonMeta();
  $("#metaTotalQ").textContent = TOTAL_Q;
  $("#metaSections").textContent = LESSON.sections.length;
  $("#metaTime").textContent = LESSON.timeLimitMinutes + " phút";

  const history = STORE.getHistory();
  const inProgress = STORE.getProgress();

  if(history.length){
    const scores = history.map(a=>a.percentage);
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
    const last = history[history.length-1];
    const box = $("#historyMiniBox");
    box.classList.remove("hidden");
    box.innerHTML = `📊 Bạn đã làm bài này <b>${history.length}</b> lần. Điểm gần nhất: <b>${last.percentage}%</b> · Điểm cao nhất: <b>${best}%</b> · Trung bình: <b>${avg}%</b>`;
  }

  if(inProgress && !inProgress.submitted){
    showResumeModal(inProgress);
  }
}

function showResumeModal(saved){
  const answeredCount = Object.keys(saved.answers||{}).length;
  openModal(`
    <h3>Tiếp tục bài làm dở?</h3>
    <p>Hệ thống phát hiện bạn có một lần làm bài chưa hoàn thành (${answeredCount}/${TOTAL_Q} câu đã trả lời, còn ${fmtTime(saved.remainingSec)} phút).</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mResumeRestart">Làm lại từ đầu</button>
      <button class="btn btn-primary" id="mResumeContinue">Tiếp tục làm bài</button>
    </div>
  `);
  $("#mResumeContinue").onclick = ()=>{ closeModal(); restoreProgress(saved); beginQuiz(true); };
  $("#mResumeRestart").onclick = ()=>{ closeModal(); STORE.clearProgress(); };
}

function restoreProgress(saved){
  STATE.answers = saved.answers || {};
  STATE.selfMarks = saved.selfMarks || {};
  STATE.currentIndex = saved.currentIndex || 0;
  STATE.startTime = saved.startTime || Date.now();
  STATE.remainingSec = saved.remainingSec != null ? saved.remainingSec : STATE.timeLimitSec;
}

$("#btnStart").addEventListener("click", ()=>{
  STATE.startTime = Date.now();
  STATE.remainingSec = STATE.timeLimitSec;
  beginQuiz(false);
});

function beginQuiz(resumed){
  $("#startScreen").classList.add("hidden");
  $("#quizScreen").classList.remove("hidden");
  $("#timerBox").classList.remove("hidden");
  $("#progressWrap").classList.remove("hidden");
  $("#navPanelToggle").classList.remove("hidden");
  renderQNav();
  renderQuestion(STATE.currentIndex);
  updateProgressBar();
  startTimer();
  if(!resumed) toast("Chúc bạn làm bài tốt! 加油！");
}

/* ==========================================================================================
   7. ĐỒNG HỒ ĐẾM NGƯỢC
========================================================================================== */
function startTimer(){
  clearInterval(STATE.timerHandle);
  updateTimerDisplay();
  STATE.timerHandle = setInterval(()=>{
    STATE.remainingSec--;
    if(STATE.remainingSec <= 0){
      STATE.remainingSec = 0;
      updateTimerDisplay();
      clearInterval(STATE.timerHandle);
      toast("⏰ Đã hết thời gian làm bài!");
      finalizeSubmit(true);
      return;
    }
    updateTimerDisplay();
    persistProgress();
  }, 1000);
}
function updateTimerDisplay(){
  $("#timerDisplay").textContent = fmtTime(STATE.remainingSec);
  $("#timerBox").classList.toggle("warn", STATE.remainingSec <= 300);
}

/* ==========================================================================================
   8. TIẾN ĐỘ / LƯU TẠM (LOCALSTORAGE)
========================================================================================== */
function persistProgress(){
  STORE.saveProgress({
    currentIndex: STATE.currentIndex,
    answers: STATE.answers,
    selfMarks: STATE.selfMarks,
    startTime: STATE.startTime,
    remainingSec: STATE.remainingSec,
    submitted: false
  });
}
function isAnswered(q){
  const a = STATE.answers[q.id];
  if(a === undefined || a === null) return false;
  if(q.type==="mcq") return !!a.choice;
  if(q.type==="blank_most") return Array.isArray(a.blanks) && a.blanks.every(b=>b!==null && b!==undefined);
  if(q.type==="reorder") return Array.isArray(a.order) && a.order.length === q.tokens.length;
  if(q.type==="text_fill") return !!(a.text && a.text.trim().length>0);
  if(q.type==="dialog_fill") return a.blanks && Object.keys(a.blanks).length === Object.keys(q.correctMap).length && Object.values(a.blanks).every(v=>!!v);
  if(q.type==="matching") return a.matches && Object.keys(a.matches).length === q.terms.length && Object.values(a.matches).every(v=>!!v);
  if(q.type==="self_check") return !!(a.text && a.text.trim().length>0);
  return false;
}
function answeredCountAll(){ return QUESTIONS.filter(isAnswered).length; }

function updateProgressBar(){
  const done = answeredCountAll();
  const pct = Math.round(done/TOTAL_Q*100);
  $("#progressText").textContent = `Đã làm: ${done} / ${TOTAL_Q} câu`;
  $("#progressPercent").textContent = pct+"%";
  $("#progressBarFill").style.width = pct+"%";
  $("#unansweredCount").textContent = `Chưa làm: ${TOTAL_Q-done} câu`;
  refreshQNavStates();
}

/* ==========================================================================================
   9. BẢNG ĐIỀU HƯỚNG CÂU HỎI
========================================================================================== */
function renderQNav(){
  const grid = $("#qnavGrid");
  grid.innerHTML = "";
  QUESTIONS.forEach((q, idx)=>{
    const btn = el("button","qnav-item", (idx+1));
    btn.dataset.idx = idx;
    btn.title = sectionById(q.section).title;
    btn.addEventListener("click", ()=>{ STATE.currentIndex = idx; renderQuestion(idx); });
    grid.appendChild(btn);
  });
  refreshQNavStates();
}
function refreshQNavStates(){
  $all(".qnav-item").forEach((btn,idx)=>{
    const q = QUESTIONS[idx];
    btn.classList.remove("answered","current","correct","wrong","self","partial");
    if(idx === STATE.currentIndex) btn.classList.add("current");
    if(STATE.submitted){
      const g = gradeQuestion(q);
      if(g.status==="correct") btn.classList.add("correct");
      else if(g.status==="wrong") btn.classList.add("wrong");
      else if(g.status==="partial") btn.classList.add("partial");
      else if(g.status==="self") btn.classList.add("self");
    } else if(isAnswered(q)){
      btn.classList.add("answered");
    }
  });
}
$("#navPanelToggle").addEventListener("click", ()=>{
  $("#navPanel").scrollIntoView({behavior:"smooth", block:"start"});
});

/* ==========================================================================================
   10. RENDER CÂU HỎI (theo từng dạng)
========================================================================================== */
function renderQuestion(idx){
  STATE.currentIndex = idx;
  const q = QUESTIONS[idx];
  const sec = sectionById(q.section);
  const card = $("#questionCard");
  card.innerHTML = "";

  card.appendChild(el("div","q-section-title", escapeHtml(sec.title)));
  card.appendChild(el("span","q-skill-tag", escapeHtml(sec.skill)));
  card.appendChild(el("div","q-num", `Câu ${idx+1} / ${TOTAL_Q}${sec.instruction ? " · "+escapeHtml(sec.instruction) : ""}`));

  if(sec.passage){
    card.appendChild(el("div","passage-box zh", escapeHtml(LESSON.passages[sec.passage])));
  }

  const body = el("div","q-body");
  card.appendChild(body);

  switch(q.type){
    case "mcq": renderMCQ(body,q); break;
    case "blank_most": renderBlankMost(body,q); break;
    case "reorder": renderReorder(body,q); break;
    case "text_fill": renderTextFill(body,q); break;
    case "dialog_fill": renderDialogFill(body,q); break;
    case "matching": renderMatching(body,q); break;
    case "self_check": renderSelfCheck(body,q); break;
  }

  if(STATE.submitted) renderGradedFeedback(card,q);

  $("#btnPrev").disabled = idx===0;
  $("#btnNext").classList.toggle("hidden", idx===TOTAL_Q-1);
  $("#btnSubmit").classList.toggle("hidden", idx!==TOTAL_Q-1 || STATE.submitted);
  updateProgressBar();
  card.scrollIntoView({behavior:"smooth", block:"start"});
}
function autoAdvance(){
  // Tự động chuyển sang câu tiếp theo sau khi học sinh chọn xong đáp án (không áp dụng cho câu nhập văn bản tự do).
  if(STATE.submitted) return;
  if(STATE.currentIndex >= TOTAL_Q-1) return;
  clearTimeout(autoAdvance._h);
  autoAdvance._h = setTimeout(()=>{
    if(STATE.currentIndex < TOTAL_Q-1) renderQuestion(STATE.currentIndex+1);
  }, 500);
}
function isFirstOfSection(idx){
  const sec = QUESTIONS[idx].section;
  return idx===0 || QUESTIONS[idx-1].section !== sec;
}

function renderMCQ(body,q){
  if(q.prompt) body.appendChild(el("div","q-prompt zh", escapeHtml(q.prompt)));
  if(q.markedSentence){
    const CIRCLES = {1:"①",2:"②",3:"③",4:"④"};
    const line = el("div","sentence-line zh");
    q.markedSentence.forEach(part=>{
      if(typeof part === "number"){
        line.appendChild(el("span","gap-mark", CIRCLES[part] || part));
      } else {
        line.appendChild(document.createTextNode(part));
      }
    });
    body.appendChild(line);
    body.appendChild(el("p",null,`<span style="font-size:15px;color:var(--text-dim);">${q.options.some(o=>o.k==="none") ? `Chọn vị trí đúng để điền ${q.gapWord||"最"}, hoặc chọn "Không cần điền ${q.gapWord||"最"}" nếu câu không cần so sánh nhất.` : `Chọn vị trí đúng để điền ${q.gapWord||"最"}.`}</span>`));
  }
  const list = el("div","options-list");
  const cur = STATE.answers[q.id];
  q.options.forEach(opt=>{
    const item = el("button","option-item");
    item.innerHTML = `<span class="opt-key">${opt.k}</span><span class="zh">${escapeHtml(opt.t)}</span>`;
    if(cur && cur.choice===opt.k) item.classList.add("selected");
    item.disabled = STATE.submitted;
    if(STATE.submitted){
      item.classList.add("locked");
      if(opt.k===q.correct) item.classList.add("correct-answer");
      else if(cur && cur.choice===opt.k) item.classList.add("wrong-selected");
    }
    item.addEventListener("click", ()=>{
      STATE.answers[q.id] = {choice: opt.k};
      persistProgress();
      renderQuestion(STATE.currentIndex);
      autoAdvance();
    });
    list.appendChild(item);
  });
  body.appendChild(list);
  if(STATE.submitted && q.fullCorrect){
    body.appendChild(el("p",null,`<b>Câu hoàn chỉnh đúng:</b> <span class="zh">${escapeHtml(q.fullCorrect)}</span>`));
  }
}

function renderBlankMost(body,q){
  const line = el("div","sentence-line zh");
  const cur = STATE.answers[q.id] || {blanks:new Array(q.blanks.length).fill(null)};
  q.segments.forEach((seg,i)=>{
    line.appendChild(document.createTextNode(seg));
    if(i < q.blanks.length){
      const sel = document.createElement("select");
      sel.className = "blank-select";
      sel.disabled = STATE.submitted;
      sel.innerHTML = `<option value="">(chọn)</option><option value="0">(để trống)</option><option value="1">最</option>`;
      sel.value = cur.blanks[i]==null ? "" : (cur.blanks[i]?"1":"0");
      sel.addEventListener("change", ()=>{
        const arr = (STATE.answers[q.id]||{blanks:new Array(q.blanks.length).fill(null)}).blanks.slice();
        arr[i] = sel.value==="" ? null : sel.value==="1";
        STATE.answers[q.id] = {blanks:arr};
        persistProgress();
        updateProgressBar();
      });
      line.appendChild(sel);
    }
  });
  body.appendChild(line);
  if(STATE.submitted){
    body.appendChild(el("p",null,`<b>Câu hoàn chỉnh đúng:</b> <span class="zh">${escapeHtml(q.fullCorrect)}</span>`));
  }
}

function renderReorder(body,q){
  const cur = STATE.answers[q.id] || {order:[]};
  const answerRow = el("div","reorder-answer-row");
  const poolRow = el("div","reorder-tokens-pool");

  function usedIndices(){ return cur.order.slice(); }

  function draw(){
    answerRow.innerHTML = "";
    poolRow.innerHTML = "";
    if(cur.order.length===0){ answerRow.appendChild(el("span",null,'<span style="color:var(--text-faint);font-size:13px;">Bấm các từ bên dưới theo đúng thứ tự...</span>')); }
    cur.order.forEach((tok,pos)=>{
      const chip = el("button","token-chip zh", escapeHtml(tok));
      chip.disabled = STATE.submitted;
      chip.addEventListener("click", ()=>{
        cur.order.splice(pos,1);
        STATE.answers[q.id] = {order:cur.order};
        persistProgress(); draw(); updateProgressBar();
      });
      answerRow.appendChild(chip);
    });
    // pool = remaining tokens (respect duplicates by index)
    const usedFlags = new Array(q.tokens.length).fill(false);
    cur.order.forEach(tok=>{
      const i = q.tokens.findIndex((t,ti)=>t===tok && !usedFlags[ti]);
      if(i>-1) usedFlags[i]=true;
    });
    q.tokens.forEach((tok,ti)=>{
      const chip = el("button","token-chip zh", escapeHtml(tok));
      if(usedFlags[ti]){ chip.classList.add("used"); chip.disabled = true; }
      else{
        chip.disabled = STATE.submitted;
        chip.addEventListener("click", ()=>{
          cur.order.push(tok);
          STATE.answers[q.id] = {order:cur.order};
          persistProgress(); draw(); updateProgressBar();
          if(cur.order.length === q.tokens.length) autoAdvance();
        });
      }
      poolRow.appendChild(chip);
    });
  }
  draw();
  body.appendChild(el("div",null,'<p style="font-size:13px;color:var(--text-dim);margin-bottom:6px;">Câu bạn đã ghép:</p>'));
  body.appendChild(answerRow);
  body.appendChild(el("div",null,'<p style="font-size:13px;color:var(--text-dim);margin:12px 0 6px;">Các từ cho sẵn:</p>'));
  body.appendChild(poolRow);
  if(!STATE.submitted){
    const resetBtn = el("button","btn btn-ghost btn-sm", "Đặt lại");
    resetBtn.style.marginTop="12px";
    resetBtn.addEventListener("click", ()=>{ cur.order=[]; STATE.answers[q.id]={order:[]}; persistProgress(); draw(); updateProgressBar(); });
    body.appendChild(resetBtn);
  }
  if(STATE.submitted){
    body.appendChild(el("p",null,`<b>Câu đúng:</b> <span class="zh">${escapeHtml(q.fullCorrect)}</span>`));
  }
}

function renderTextFill(body,q){
  body.appendChild(el("div","q-prompt zh", escapeHtml(q.prompt)));
  const cur = STATE.answers[q.id] || {text:""};
  const input = document.createElement("input");
  input.type="text"; input.className="text-input zh";
  input.placeholder="Gõ lại câu đã sửa đúng...";
  input.value = cur.text || "";
  input.disabled = STATE.submitted;
  input.addEventListener("input", ()=>{
    STATE.answers[q.id] = {text: input.value};
    persistProgress();
    updateProgressBar();
  });
  body.appendChild(input);
  if(STATE.submitted){
    body.appendChild(el("p",null,`<b>Đáp án đúng:</b> <span class="zh">${escapeHtml(Array.isArray(q.correct)?q.correct.join(" / "):q.correct)}</span>`));
  }
}

function renderDialogFill(body,q){
  const cur = STATE.answers[q.id] || {blanks:{}};
  const box = el("div","sentence-line zh");
  q.lines.forEach(line=>{
    const p = document.createElement("div");
    p.style.marginBottom="8px";
    if(line.sp){
      const strong = document.createElement("b"); strong.textContent = line.sp+"："; strong.style.fontFamily="var(--vi-font)";
      p.appendChild(strong);
    }
    line.segs.forEach(seg=>{
      if(typeof seg === "number"){
        const sel = document.createElement("select");
        sel.className="blank-select";
        sel.disabled = STATE.submitted;
        sel.innerHTML = `<option value="">?</option>` + q.wordBank.map(w=>`<option value="${w}">${w}</option>`).join("");
        sel.value = (cur.blanks && cur.blanks[seg]) || "";
        if(STATE.submitted){
          const val = (cur.blanks && cur.blanks[seg]) || "";
          sel.classList.add(val === q.correctMap[seg] ? "correct" : "wrong");
        }
        sel.addEventListener("change", ()=>{
          const b = Object.assign({}, (STATE.answers[q.id]||{blanks:{}}).blanks);
          b[seg] = sel.value;
          STATE.answers[q.id] = {blanks:b};
          persistProgress(); updateProgressBar();
          const totalBlanks = Object.keys(q.correctMap).length;
          if(Object.keys(b).length === totalBlanks && Object.values(b).every(v=>!!v)) autoAdvance();
        });
        p.appendChild(sel);
      } else {
        p.appendChild(document.createTextNode(seg));
      }
    });
    box.appendChild(p);
  });
  body.appendChild(box);
  const totalBlanks = Object.keys(q.correctMap).length;
  const reuseNote = totalBlanks > q.wordBank.length ? "có thể dùng lại nhiều lần" : "mỗi từ dùng đúng 1 lần";
  body.appendChild(el("p",null,`<span style="font-size:13px;color:var(--text-dim);">Ngân hàng từ: <span class="zh">${q.wordBank.join(" · ")}</span> (${reuseNote})</span>`));
  if(STATE.submitted){
    const correctStr = Object.entries(q.correctMap).map(([k,v])=>`(${k}) ${v}`).join(" · ");
    const g = gradeQuestion(q);
    body.appendChild(el("p",null,`<b>Đáp án đúng:</b> <span class="zh">${escapeHtml(correctStr)}</span> — <span style="color:var(--text-dim);">Bạn đúng ${g.score}/${g.max} chỗ trống.</span>`));
  }
}

function renderMatching(body,q){
  const cur = STATE.answers[q.id] || {matches:{}};
  const table = document.createElement("table");
  table.className = "match-table";
  const tbody = document.createElement("tbody");
  q.terms.forEach(term=>{
    const tr = document.createElement("tr");
    tr.className = "match-row";
    const tdTerm = document.createElement("td");
    tdTerm.innerHTML = `<span class="match-term zh">${escapeHtml(term.zh)}</span>`;
    const tdSel = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "match-select";
    sel.disabled = STATE.submitted;
    sel.innerHTML = `<option value="">— chọn nghĩa —</option>` + q.optionsPool.map(o=>`<option value="${o.k}">${o.k}. ${escapeHtml(o.t)}</option>`).join("");
    sel.value = (cur.matches && cur.matches[term.id]) || "";
    if(STATE.submitted){
      const val = (cur.matches && cur.matches[term.id]) || "";
      sel.classList.add(val === q.correctMap[term.id] ? "correct" : "wrong");
    }
    sel.addEventListener("change", ()=>{
      const m = Object.assign({}, (STATE.answers[q.id]||{matches:{}}).matches);
      m[term.id] = sel.value;
      STATE.answers[q.id] = {matches:m};
      persistProgress(); updateProgressBar();
    });
    tdSel.appendChild(sel);
    tr.appendChild(tdTerm);
    tr.appendChild(tdSel);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  if(STATE.submitted){
    const g = gradeQuestion(q);
    const correctList = q.terms.map(term=>`${term.zh} → ${q.correctMap[term.id]}. ${q.optionsPool.find(o=>o.k===q.correctMap[term.id]).t}`).join(" · ");
    body.appendChild(el("p",null,`<span style="color:var(--text-dim);">Bạn nối đúng ${g.score}/${g.max} cặp.</span>`));
    body.appendChild(el("p",null,`<b>Đáp án đúng:</b> <span class="zh" style="font-size:16px;">${escapeHtml(correctList)}</span>`));
  }
}

function renderSelfCheck(body,q){
  const promptClass = q.prompt_is_zh ? "q-prompt zh" : "q-prompt";
  const p = el("div", promptClass);
  p.style.whiteSpace = "pre-line";
  p.textContent = q.prompt;
  body.appendChild(p);

  const cur = STATE.answers[q.id] || {text:""};
  const ta = document.createElement("textarea");
  ta.className = "text-input";
  ta.placeholder = q.essay ? "Viết câu trả lời của bạn ở đây..." : "Gõ câu trả lời / bản dịch của bạn...";
  ta.value = cur.text || "";
  ta.disabled = STATE.submitted;
  ta.addEventListener("input", ()=>{
    STATE.answers[q.id] = {text: ta.value};
    persistProgress();
    updateProgressBar();
  });
  body.appendChild(ta);

  if(STATE.submitted){
    const refBox = el("div","ref-answer-box");
    const refP = document.createElement("div");
    refP.style.whiteSpace="pre-line";
    refP.className = "zh";
    refP.innerHTML = `<b style="font-family:var(--vi-font);">Đáp án / câu mẫu tham khảo:</b><br>${escapeHtml(q.reference)}`;
    refBox.appendChild(refP);
    body.appendChild(refBox);

    const markRow = el("div","self-mark-row");
    const mark = STATE.selfMarks[q.id];
    const okBtn = el("button","btn btn-sm "+(mark===true?"btn-primary":"btn-ghost"), "✓ Tôi làm đúng");
    const noBtn = el("button","btn btn-sm "+(mark===false?"btn-danger":"btn-ghost"), "✗ Cần ôn lại");
    okBtn.addEventListener("click", ()=>{ STATE.selfMarks[q.id]=true; persistProgress(); renderQuestion(STATE.currentIndex); });
    noBtn.addEventListener("click", ()=>{ STATE.selfMarks[q.id]=false; persistProgress(); renderQuestion(STATE.currentIndex); });
    markRow.appendChild(okBtn); markRow.appendChild(noBtn);
    body.appendChild(markRow);
  }
}

function renderGradedFeedback(card,q){
  const g = gradeQuestion(q);
  const cls = g.status==="correct"?"ok":g.status==="wrong"?"no":g.status==="partial"?"partial":"pending";
  const label = g.status==="correct" ? "✓ Đúng"
    : g.status==="wrong" ? "✗ Sai"
    : g.status==="partial" ? `◑ Đúng một phần (${g.score}/${g.max})`
    : "◐ Tự đánh giá";
  const badge = el("div","result-badge "+cls, label);
  card.insertBefore(badge, card.querySelector(".q-body"));
  if(q.explain){
    card.appendChild(el("div","explain-box", q.explain));
  }
}

/* ==========================================================================================
   11. ĐIỀU HƯỚNG PREV/NEXT + PHÍM TẮT
========================================================================================== */
$("#btnPrev").addEventListener("click", ()=>{ if(STATE.currentIndex>0) renderQuestion(STATE.currentIndex-1); });
$("#btnNext").addEventListener("click", ()=>{ if(STATE.currentIndex<TOTAL_Q-1) renderQuestion(STATE.currentIndex+1); });
document.addEventListener("keydown", (e)=>{
  if($("#quizScreen").classList.contains("hidden")) return;
  if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) return;
  if(e.key==="ArrowLeft" && STATE.currentIndex>0) renderQuestion(STATE.currentIndex-1);
  if(e.key==="ArrowRight" && STATE.currentIndex<TOTAL_Q-1) renderQuestion(STATE.currentIndex+1);
});

/* ==========================================================================================
   12. NỘP BÀI (kiểm tra trước khi nộp)
========================================================================================== */
$("#btnSubmit").addEventListener("click", ()=>{
  const unanswered = QUESTIONS.filter(q=>!isAnswered(q));
  if(unanswered.length){
    const chips = unanswered.slice(0,30).map(q=>`<span class="missing-chip">Câu ${QUESTIONS.indexOf(q)+1}</span>`).join("");
    openModal(`
      <h3>Bạn còn ${unanswered.length} câu chưa trả lời</h3>
      <div class="missing-list">${chips}${unanswered.length>30?"<span class='missing-chip'>...</span>":""}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mBackToWork">Quay lại làm tiếp</button>
        <button class="btn btn-primary" id="mSubmitAnyway">Vẫn nộp bài</button>
      </div>
    `);
    $("#mBackToWork").onclick = closeModal;
    $("#mSubmitAnyway").onclick = ()=>{ closeModal(); finalizeSubmit(false); };
  } else {
    openModal(`
      <h3>Bạn đã hoàn thành tất cả câu hỏi</h3>
      <p>Xác nhận nộp bài? Sau khi nộp bạn sẽ không thể sửa lại đáp án.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mBackToWork">Kiểm tra lại</button>
        <button class="btn btn-primary" id="mSubmitAnyway">Nộp bài</button>
      </div>
    `);
    $("#mBackToWork").onclick = closeModal;
    $("#mSubmitAnyway").onclick = ()=>{ closeModal(); finalizeSubmit(false); };
  }
});

function finalizeSubmit(timeUp){
  clearInterval(STATE.timerHandle);
  STATE.submitted = true;
  STATE.submitTime = Date.now();
  const result = computeResult();
  STORE.addAttempt(result.attemptRecord);
  STORE.clearProgress();
  toast(timeUp ? "Đã hết thời gian — bài đã được nộp tự động." : "Nộp bài thành công!");
  showResults(result);
}

/* ==========================================================================================
   13. CHẤM ĐIỂM
========================================================================================== */
function gradeQuestion(q){
  const a = STATE.answers[q.id];
  if(q.type === "self_check"){
    if(!STATE.submitted) return {status:"pending", graded:false};
    const mark = STATE.selfMarks[q.id];
    return {status: mark===true ? "correct" : mark===false ? "wrong" : "self", graded:false, selfMark:mark};
  }
  if(!STATE.submitted) return {status:"pending", graded:true};

  // Các dạng câu hỏi có nhiều "ô nhỏ" bên trong (hội thoại nhiều chỗ trống, nối từ)
  // được chấm điểm từng phần (partial credit) thay vì chỉ đúng/sai toàn bộ.
  if(q.type === "dialog_fill"){
    const keys = Object.keys(q.correctMap);
    const max = keys.length;
    const score = a && a.blanks ? keys.filter(k => (a.blanks[k]||"") === q.correctMap[k]).length : 0;
    const status = score===0 ? "wrong" : score===max ? "correct" : "partial";
    return {status, graded:true, score, max};
  }
  if(q.type === "matching"){
    const max = q.terms.length;
    const score = a && a.matches ? q.terms.filter(t => (a.matches[t.id]||"") === q.correctMap[t.id]).length : 0;
    const status = score===0 ? "wrong" : score===max ? "correct" : "partial";
    return {status, graded:true, score, max};
  }

  if(!a) return {status:"wrong", graded:true, unanswered:true, score:0, max:1};
  let ok = false;
  if(q.type === "mcq"){
    ok = a.choice === q.correct;
  } else if(q.type === "blank_most"){
    ok = Array.isArray(a.blanks) && q.blanks.every((b,i)=> a.blanks[i]===b.correct);
  } else if(q.type === "reorder"){
    ok = Array.isArray(a.order) && a.order.length===q.correctOrder.length && a.order.every((t,i)=>t===q.correctOrder[i]);
  } else if(q.type === "text_fill"){
    ok = Array.isArray(q.correct)
      ? q.correct.some(c => normalizeCompare(a.text) === normalizeCompare(c))
      : normalizeCompare(a.text) === normalizeCompare(q.correct);
  }
  return {status: ok ? "correct":"wrong", graded:true, score: ok?1:0, max:1};
}

function computeResult(){
  const autoQuestions = QUESTIONS.filter(q=>AUTO_TYPES.has(q.type));
  const selfQuestions = QUESTIONS.filter(q=>q.type==="self_check");
  let autoScore = 0, autoMax = 0, questionsFullyCorrect = 0;
  autoQuestions.forEach(q=>{
    const g = gradeQuestion(q);
    autoScore += g.score; autoMax += g.max;
    if(g.status==="correct") questionsFullyCorrect++;
  });
  const autoCorrect = questionsFullyCorrect;
  const autoWrong = autoQuestions.length - questionsFullyCorrect;
  const percentage = autoMax ? Math.round(autoScore/autoMax*100) : 0;
  const score100 = percentage;

  // group by skill (autoScore/autoMax dùng để tính % chính xác theo điểm thành phần,
  // autoCorrect/autoTotal dùng để đếm số CÂU chấm đúng hoàn toàn)
  const bySkill = {};
  QUESTIONS.forEach(q=>{
    const sec = sectionById(q.section);
    const skill = sec.skill || "Khác";
    if(!bySkill[skill]) bySkill[skill] = {total:0, autoTotal:0, autoCorrect:0, autoScore:0, autoMax:0, selfTotal:0, selfOk:0, selfDone:0};
    bySkill[skill].total++;
    if(AUTO_TYPES.has(q.type)){
      const g = gradeQuestion(q);
      bySkill[skill].autoTotal++;
      bySkill[skill].autoScore += g.score;
      bySkill[skill].autoMax += g.max;
      if(g.status==="correct") bySkill[skill].autoCorrect++;
    } else {
      bySkill[skill].selfTotal++;
      const mark = STATE.selfMarks[q.id];
      if(mark!==undefined && mark!==null){ bySkill[skill].selfDone++; if(mark===true) bySkill[skill].selfOk++; }
    }
  });

  const unansweredCount = QUESTIONS.filter(q=>!isAnswered(q)).length;
  const durationSec = Math.round((STATE.submitTime - STATE.startTime)/1000);

  let classification = "";
  if(percentage>=95) classification="Xuất sắc";
  else if(percentage>=90) classification="Rất tốt";
  else if(percentage>=80) classification="Giỏi";
  else if(percentage>=70) classification="Khá";
  else if(percentage>=60) classification="Đạt";
  else classification="Cần cố gắng";

  // strengths / weaknesses based only on measured skill data (no fabrication)
  const skillEntries = Object.entries(bySkill).filter(([k,v])=>v.autoMax>0).map(([k,v])=>({skill:k, pct:Math.round(v.autoScore/v.autoMax*100)}));
  skillEntries.sort((a,b)=>b.pct-a.pct);
  const strengths = skillEntries.filter(s=>s.pct>=80).map(s=>s.skill);
  const weaknesses = skillEntries.filter(s=>s.pct<70).map(s=>s.skill);

  const attemptRecord = {
    lessonId: LESSON.id,
    lessonTitle: LESSON.title,
    startTime: STATE.startTime,
    submitTime: STATE.submitTime,
    duration: durationSec,
    totalScore: score100,
    percentage: percentage,
    correctAnswers: autoCorrect,
    wrongAnswers: autoWrong,
    unansweredQuestions: unansweredCount,
    scoreBySection: Object.fromEntries(LESSON.sections.map(s=>{
      const qs = QUESTIONS.filter(q=>q.section===s.id && AUTO_TYPES.has(q.type));
      const c = qs.filter(q=>gradeQuestion(q).status==="correct").length;
      return [s.id, {title:s.title, total:qs.length, correct:c}];
    })),
    scoreBySkill: Object.fromEntries(Object.entries(bySkill).map(([k,v])=>[k,{autoTotal:v.autoTotal,autoCorrect:v.autoCorrect,autoScore:v.autoScore,autoMax:v.autoMax,selfTotal:v.selfTotal,selfDone:v.selfDone,selfOk:v.selfOk}])),
    studentAnswers: STATE.answers,
    selfMarks: STATE.selfMarks,
    teacherFeedback: null,
    classification: classification,
    version: LESSON.version
  };

  return {autoCorrect, autoWrong, autoTotal: autoQuestions.length, autoScore, autoMax, percentage, score100, classification,
           bySkill, unansweredCount, durationSec, strengths, weaknesses, attemptRecord};
}

/* ==========================================================================================
   14. MÀN HÌNH KẾT QUẢ
========================================================================================== */
function showResults(result){
  $("#quizScreen").classList.add("hidden");
  $("#topbar").querySelector("#timerBox").classList.add("hidden");
  $("#progressWrap").classList.add("hidden");
  $("#navPanelToggle").classList.add("hidden");
  $("#resultScreen").classList.remove("hidden");

  const tierClass = result.percentage>=80 ? "tier-good" : result.percentage>=60 ? "tier-mid" : "tier-low";
  const tierEmoji = result.percentage>=80 ? "🏆" : result.percentage>=60 ? "📘" : "📖";
  const sc = $("#resultSummaryCard");
  sc.innerHTML = `
    <h2 style="text-align:center;">Kết quả bài làm</h2>
    <div class="classification-box ${tierClass}">${tierEmoji} ${result.classification}<span class="cb-score">${result.score100} / 100 điểm · ${result.percentage}% đúng</span></div>
    <div class="stat-grid">
      <div class="stat-box"><div class="num">${result.score100}</div><div class="lbl">Điểm (thang 100)</div></div>
      <div class="stat-box"><div class="num">${result.autoScore}/${result.autoMax}</div><div class="lbl">Điểm thành phần đúng</div></div>
      <div class="stat-box"><div class="num">${result.autoCorrect}/${result.autoTotal}</div><div class="lbl">Số câu chấm đúng hoàn toàn</div></div>
      <div class="stat-box"><div class="num">${result.percentage}%</div><div class="lbl">Tỷ lệ đúng</div></div>
      <div class="stat-box"><div class="num">${fmtDuration(result.durationSec)}</div><div class="lbl">Thời gian làm bài</div></div>
      <div class="stat-box"><div class="num">${result.unansweredCount}</div><div class="lbl">Câu bỏ trống</div></div>
    </div>
    <p style="font-size:13.5px;color:var(--text-dim);">Điểm được tính tự động trên <b>${result.autoMax} ý/điểm thành phần</b> thuộc <b>${result.autoTotal} câu có đáp án chuẩn cố định</b> (một số dạng như "nối từ" hay "hoàn thành hội thoại" gồm nhiều ý nhỏ nên được chấm điểm từng phần thay vì chỉ đúng/sai toàn câu). Các câu dạng mở (dịch, viết đoạn, hội thoại tự do) cần bạn <b>tự đánh giá</b> sau khi so sánh với câu mẫu — xem phần "Xem lại chi tiết" bên dưới.</p>
    ${renderStrengthWeakBlock(result)}
  `;

  drawSkillChart(result.bySkill);
  renderHistoryStats();
  renderReviewFilters();
  renderReviewList("all");
  $("#historyTableWrap").classList.add("hidden");
}

function renderStrengthWeakBlock(result){
  let html = '<div style="margin-top:16px;">';
  html += `<p><b>Điểm mạnh:</b> ${result.strengths.length ? escapeHtml(result.strengths.join(", ")) : "Chưa đủ dữ liệu để xác định rõ."}</p>`;
  html += `<p><b>Điểm cần ôn tập:</b> ${result.weaknesses.length ? escapeHtml(result.weaknesses.join(", ")) : "Không có nhóm nào dưới 70% — rất tốt!"}</p>`;
  html += '<p style="font-size:12.5px;color:var(--text-faint);">*Phân tích chỉ dựa trên số liệu các câu có đáp án cố định, không suy diễn thêm.</p></div>';
  return html;
}

function drawSkillChart(bySkill){
  const canvas = $("#skillChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.parentElement.clientWidth - 12;
  const cssH = 320;
  canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  canvas.style.width = cssW+"px"; canvas.style.height = cssH+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const styles = getComputedStyle(document.documentElement);
  const colGreen = styles.getPropertyValue("--green").trim() || "#1f9d55";
  const colRed = styles.getPropertyValue("--red").trim() || "#e03131";
  const colAmber = styles.getPropertyValue("--amber").trim() || "#f0a500";
  const colText = styles.getPropertyValue("--text").trim() || "#1c2333";
  const colGrid = styles.getPropertyValue("--border").trim() || "#e3e7f0";

  const entries = Object.entries(bySkill);
  const rowH = Math.min(46, (cssH-40)/Math.max(entries.length,1));
  const chartLeft = 130, chartRight = cssW-70;
  const chartW = chartRight - chartLeft;

  ctx.font = "12px Times New Roman, serif";
  ctx.textBaseline = "middle";

  entries.forEach(([skill,v], i)=>{
    const y = 24 + i*rowH + rowH/2;
    ctx.fillStyle = colText;
    ctx.textAlign = "right";
    ctx.fillText(skill, chartLeft-12, y);

    // grid line baseline
    ctx.strokeStyle = colGrid;
    ctx.beginPath(); ctx.moveTo(chartLeft,y+rowH*0.32); ctx.lineTo(chartRight,y+rowH*0.32); ctx.stroke();

    if(v.autoMax>0){
      const pctCorrect = v.autoScore/v.autoMax;
      const barH = rowH*0.44;
      // background track
      ctx.fillStyle = colGrid;
      ctx.fillRect(chartLeft, y-barH/2, chartW, barH);
      // correct portion
      ctx.fillStyle = colGreen;
      ctx.fillRect(chartLeft, y-barH/2, chartW*pctCorrect, barH);
      // wrong portion
      ctx.fillStyle = colRed;
      ctx.fillRect(chartLeft+chartW*pctCorrect, y-barH/2, chartW*(1-pctCorrect), barH);
      ctx.fillStyle = colText; ctx.textAlign="left";
      ctx.fillText(`${v.autoScore}/${v.autoMax} điểm (${Math.round(pctCorrect*100)}%)`, chartRight+8, y);
    } else if(v.selfTotal>0){
      const pctDone = v.selfDone/v.selfTotal;
      const barH = rowH*0.44;
      ctx.fillStyle = colGrid;
      ctx.fillRect(chartLeft, y-barH/2, chartW, barH);
      ctx.fillStyle = colAmber;
      ctx.fillRect(chartLeft, y-barH/2, chartW*pctDone, barH);
      ctx.fillStyle = colText; ctx.textAlign="left";
      ctx.fillText(`${v.selfDone}/${v.selfTotal} đã tự đánh giá`, chartRight+8, y);
    }
  });
}
window.addEventListener("resize", ()=>{
  if(!$("#resultScreen").classList.contains("hidden") && STATE.submitted){
    const result = computeResult();
    drawSkillChart(result.bySkill);
  }
});

/* ==========================================================================================
   15. LỌC CÂU + XEM LẠI CHI TIẾT
========================================================================================== */
function renderReviewFilters(){
  const filters = [
    {k:"all", label:"Tất cả"},
    {k:"wrong", label:"Câu sai"},
    {k:"correct", label:"Câu đúng"},
    {k:"unanswered", label:"Câu bỏ trống"},
    {k:"self", label:"Câu tự đánh giá"}
  ];
  const wrap = $("#reviewFilters");
  wrap.innerHTML = "";
  filters.forEach(f=>{
    const chip = el("button","filter-chip"+(STATE.reviewFilter===f.k?" active":""), f.label);
    chip.addEventListener("click", ()=>{ STATE.reviewFilter=f.k; renderReviewFilters(); renderReviewList(f.k); });
    wrap.appendChild(chip);
  });
}
function renderReviewList(filter){
  const list = $("#reviewList");
  list.innerHTML = "";
  QUESTIONS.forEach((q,idx)=>{
    const g = gradeQuestion(q);
    const a = STATE.answers[q.id];
    let show = true;
    if(filter==="wrong") show = (g.status==="wrong"||g.status==="partial") && !g.unanswered && q.type!=="self_check";
    if(filter==="correct") show = g.status==="correct";
    if(filter==="unanswered") show = !isAnswered(q);
    if(filter==="self") show = q.type==="self_check";
    if(!show) return;

    const item = el("div","card");
    item.style.marginBottom="12px";
    const sec = sectionById(q.section);
    const badgeCls = g.status==="correct"?"ok":g.status==="wrong"?"no":g.status==="partial"?"partial":"pending";
    const badgeLabel = g.status==="correct" ? "✓ Đúng" : g.status==="wrong" ? "✗ Sai" : g.status==="partial" ? `◑ Đúng một phần (${g.score}/${g.max})` : "◐ Tự đánh giá";
    item.appendChild(el("div","q-section-title", `Câu ${idx+1} · ${escapeHtml(sec.title)}`));
    item.appendChild(el("div","result-badge "+badgeCls, badgeLabel));

    const studentAnsHtml = describeAnswer(q,a);
    item.appendChild(el("p",null,`<b>Câu hỏi:</b> <span class="zh">${escapeHtml(questionPromptText(q))}</span>`));
    item.appendChild(el("p",null,`<b>Đáp án của bạn:</b> ${studentAnsHtml}`));
    if(q.type!=="self_check"){
      item.appendChild(el("p",null,`<b>Đáp án đúng:</b> <span class="zh">${escapeHtml(correctAnswerText(q))}</span>`));
    }
    if(q.explain) item.appendChild(el("div","explain-box", q.explain));
    if(q.type==="self_check") item.appendChild(el("div","ref-answer-box", `<b>Đáp án tham khảo:</b><br><span style="white-space:pre-line;">${escapeHtml(q.reference)}</span>`));

    const jumpBtn = el("button","btn btn-ghost btn-sm no-print", "Đi tới câu này");
    jumpBtn.style.marginTop="8px";
    jumpBtn.addEventListener("click", ()=>{ item.scrollIntoView({behavior:"smooth"}); });
    list.appendChild(item);
  });
  if(!list.children.length) list.appendChild(el("p",null,"Không có câu nào khớp với bộ lọc này."));
}
function questionPromptText(q){
  if(q.markedSentence){
    return q.markedSentence.map(p=> typeof p==="number" ? "___" : p).join("");
  }
  if(q.type==="matching"){
    return "Nối: " + q.terms.map(t=>t.zh).join("、");
  }
  return q.prompt || q.fullCorrect || "";
}
function describeAnswer(q,a){
  if(!a) return "<i>(bỏ trống)</i>";
  if(q.type==="mcq"){
    const opt = q.options.find(o=>o.k===a.choice);
    return `<span class="zh">${escapeHtml(opt ? (q.markedSentence ? opt.t : opt.k+". "+opt.t) : (a.choice||""))}</span>`;
  }
  if(q.type==="blank_most") return a.blanks.map(b=> b===true?"最":b===false?"(để trống)":"?").join(" / ");
  if(q.type==="reorder") return `<span class="zh">${escapeHtml((a.order||[]).join(""))}</span>`;
  if(q.type==="text_fill") return `<span class="zh">${escapeHtml(a.text||"")}</span>`;
  if(q.type==="dialog_fill") return Object.entries(a.blanks||{}).map(([k,v])=>`(${k}) ${v}`).join(" · ");
  if(q.type==="matching") return q.terms.map(t=>`${t.zh}→${(a.matches&&a.matches[t.id])||"?"}`).join(" · ");
  if(q.type==="self_check") return `<span style="white-space:pre-line;">${escapeHtml(a.text||"")}</span>`;
  return "";
}
function correctAnswerText(q){
  if(q.type==="mcq") return q.fullCorrect || q.options.find(o=>o.k===q.correct).t;
  if(q.type==="blank_most") return q.fullCorrect;
  if(q.type==="reorder") return q.fullCorrect;
  if(q.type==="text_fill") return Array.isArray(q.correct) ? q.correct.join(" / ") : q.correct;
  if(q.type==="dialog_fill") return Object.entries(q.correctMap).map(([k,v])=>`(${k}) ${v}`).join(" · ");
  if(q.type==="matching") return q.terms.map(t=>`${t.zh}→${q.correctMap[t.id]}. ${q.optionsPool.find(o=>o.k===q.correctMap[t.id]).t}`).join(" · ");
  return "";
}

/* ==========================================================================================
   16. LỊCH SỬ NHIỀU LẦN LÀM BÀI
========================================================================================== */
function renderHistoryStats(){
  const history = STORE.getHistory();
  const grid = $("#historyStatGrid");
  if(!history.length){
    grid.innerHTML = `<p style="color:var(--text-dim);">Đây là lần làm bài đầu tiên của bạn với bài học này.</p>`;
    return;
  }
  const scores = history.map(a=>a.percentage);
  const durations = history.map(a=>a.duration);
  const best = Math.max(...scores);
  const worst = Math.min(...scores);
  const avg = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  const avgDur = Math.round(durations.reduce((a,b)=>a+b,0)/durations.length);
  const last = history[history.length-1];
  grid.innerHTML = `
    <div class="stat-box"><div class="num">${history.length}</div><div class="lbl">Số lần đã làm</div></div>
    <div class="stat-box"><div class="num">${best}%</div><div class="lbl">Điểm cao nhất</div></div>
    <div class="stat-box"><div class="num">${worst}%</div><div class="lbl">Điểm thấp nhất</div></div>
    <div class="stat-box"><div class="num">${avg}%</div><div class="lbl">Điểm trung bình</div></div>
    <div class="stat-box"><div class="num">${last.percentage}%</div><div class="lbl">Lần gần nhất</div></div>
    <div class="stat-box"><div class="num">${fmtDuration(avgDur)}</div><div class="lbl">Thời gian TB</div></div>
  `;
}

$("#btnShowHistory").addEventListener("click", ()=>{
  const wrap = $("#historyTableWrap");
  wrap.classList.toggle("hidden");
  if(!wrap.classList.contains("hidden")) renderHistoryTable();
});
function renderHistoryTable(){
  const history = STORE.getHistory();
  const wrap = $("#historyTableWrap");
  if(!history.length){ wrap.innerHTML = "<p>Chưa có lịch sử làm bài.</p>"; return; }
  let html = `<table class="history-table"><thead><tr>
    <th>Lần</th><th>Ngày</th><th>Thời gian làm</th><th>Điểm</th><th>Tỷ lệ đúng</th><th>Xếp loại</th>
  </tr></thead><tbody>`;
  history.forEach((a,i)=>{
    html += `<tr data-idx="${i}">
      <td>#${a.attemptNumber}</td><td>${fmtDate(a.submitTime)}</td><td>${fmtDuration(a.duration)}</td>
      <td>${a.totalScore}</td><td>${a.percentage}%</td><td>${a.classification}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
  $all("table.history-table tbody tr").forEach(tr=>{
    tr.addEventListener("click", ()=> viewAttemptDetail(history[+tr.dataset.idx]));
  });
}
function viewAttemptDetail(attempt){
  const skillRows = Object.entries(attempt.scoreBySkill||{}).map(([k,v])=>{
    const autoStr = v.autoMax ? `${v.autoScore}/${v.autoMax} điểm (${v.autoCorrect}/${v.autoTotal} câu đúng hoàn toàn)` : "—";
    const selfStr = v.selfTotal ? `${v.selfDone}/${v.selfTotal} đã tự đánh giá (${v.selfOk} đúng)` : "—";
    return `<tr><td>${escapeHtml(k)}</td><td>${autoStr}</td><td>${selfStr}</td></tr>`;
  }).join("");
  openModal(`
    <h3>Chi tiết lần làm #${attempt.attemptNumber}</h3>
    <p><b>Ngày:</b> ${fmtDate(attempt.submitTime)} · <b>Thời gian làm:</b> ${fmtDuration(attempt.duration)}</p>
    <p><b>Điểm:</b> ${attempt.totalScore}/100 (${attempt.percentage}%) · <b>Xếp loại:</b> ${attempt.classification}</p>
    <p><b>Đúng/Sai/Bỏ trống:</b> ${attempt.correctAnswers} / ${attempt.wrongAnswers} / ${attempt.unansweredQuestions}</p>
    <table class="history-table" style="margin-top:10px;"><thead><tr><th>Kỹ năng</th><th>Tự động chấm</th><th>Tự đánh giá</th></tr></thead><tbody>${skillRows}</tbody></table>
    <div class="modal-actions"><button class="btn btn-primary" id="mCloseDetail">Đóng</button></div>
  `);
  $("#mCloseDetail").onclick = closeModal;
}
$("#btnClearHistory").addEventListener("click", ()=>{
  openModal(`
    <h3>Xóa toàn bộ lịch sử?</h3>
    <p>Thao tác này sẽ xóa vĩnh viễn tất cả các lần làm bài đã lưu của bài học này. Không thể hoàn tác.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mCancelClear">Hủy</button>
      <button class="btn btn-danger" id="mConfirmClear">Xóa toàn bộ lịch sử</button>
    </div>
  `);
  $("#mCancelClear").onclick = closeModal;
  $("#mConfirmClear").onclick = ()=>{ STORE.clearHistory(); closeModal(); renderHistoryStats(); $("#historyTableWrap").classList.add("hidden"); toast("Đã xóa lịch sử."); };
});

/* ==========================================================================================
   17. LÀM LẠI / IN / XUẤT PDF
========================================================================================== */
$("#btnRetake").addEventListener("click", ()=>{
  openModal(`
    <h3>Làm lại bài?</h3>
    <p>Toàn bộ đáp án hiện tại sẽ bị xóa và đồng hồ sẽ được khởi động lại. Lịch sử các lần làm trước vẫn được giữ nguyên.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mCancelRetake">Hủy</button>
      <button class="btn btn-primary" id="mConfirmRetake">Làm lại từ đầu</button>
    </div>
  `);
  $("#mCancelRetake").onclick = closeModal;
  $("#mConfirmRetake").onclick = ()=>{ closeModal(); resetQuizState(); };
});
function resetQuizState(){
  STATE.currentIndex = 0;
  STATE.answers = {};
  STATE.selfMarks = {};
  STATE.submitted = false;
  STATE.reviewFilter = "all";
  STORE.clearProgress();
  $("#resultScreen").classList.add("hidden");
  $("#startScreen").classList.remove("hidden");
  initStartScreen();
}
$("#btnPrintResult").addEventListener("click", ()=> window.print());
$("#btnPdfExport").addEventListener("click", ()=>{
  toast("Dùng hộp thoại In (Ctrl/Cmd+P) và chọn 'Lưu thành PDF' để xuất file.");
  window.print();
});

/* ==========================================================================================
   18. MODAL DÙNG CHUNG
========================================================================================== */
function openModal(innerHtml){
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box">${innerHtml}</div></div>`;
  $("#modalOverlay").addEventListener("click", (e)=>{ if(e.target.id==="modalOverlay") closeModal(); });
}
function closeModal(){ $("#modalRoot").innerHTML = ""; }

/* ==========================================================================================
   19. NÚT CUỘN LÊN ĐẦU / XUỐNG CUỐI
========================================================================================== */
$("#btnScrollTop").addEventListener("click", ()=> window.scrollTo({top:0, behavior:"smooth"}));
$("#btnScrollBottom").addEventListener("click", ()=> window.scrollTo({top:document.body.scrollHeight, behavior:"smooth"}));

/* ==========================================================================================
   20. KHỞI CHẠY
========================================================================================== */
initTheme();
initStartScreen();
