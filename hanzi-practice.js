(()=>{'use strict';
const WRITER_SRC='https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.3/dist/hanzi-writer.min.js';
let writerPromise=null,currentWriter=null,drawCleanup=null;
function loadWriter(){if(window.HanziWriter)return Promise.resolve(window.HanziWriter);if(writerPromise)return writerPromise;writerPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=WRITER_SRC;s.async=true;s.onload=()=>window.HanziWriter?resolve(window.HanziWriter):reject(new Error('HanziWriter unavailable'));s.onerror=()=>reject(new Error('Cannot load HanziWriter'));document.head.appendChild(s)});return writerPromise}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function styleOnce(){if(document.getElementById('hanziPracticeStyle'))return;const st=document.createElement('style');st.id='hanziPracticeStyle';st.textContent=`
.hanzi-action-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px}
.hanzi-action{border:0;border-radius:999px;padding:8px 11px;font-weight:800;font-size:11px;cursor:pointer}
.hanzi-action.stroke{background:#27AE60;color:#fff}.hanzi-action.trace{background:#F2B01E;color:#432F00}.hanzi-action.quiz{background:#D94A3A;color:#fff}
.hanzi-practice-overlay{position:fixed;inset:0;background:rgba(24,35,30,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
.hanzi-practice-modal{width:min(700px,100%);max-height:94vh;overflow:auto;background:var(--bg-card,#fff);border:1px solid var(--border,#e5e0d8);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.22);padding:18px}
.hanzi-practice-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
.hanzi-practice-title{font-family:var(--font-cn,"PingFang SC","Microsoft YaHei",sans-serif);font-size:22px;font-weight:800}
.hanzi-practice-sub{font-size:13px;color:var(--text-soft,#566573)}
.hanzi-close{border:1px solid var(--border,#e5e0d8);background:var(--bg-soft,#f5f2eb);border-radius:999px;width:36px;height:36px;cursor:pointer;font-size:18px}
.hanzi-mode-row{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 12px}
.hanzi-mode-btn{border:1px solid var(--border,#e5e0d8);background:var(--card,#fff);border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;font-size:12px}
.hanzi-mode-btn.active{background:var(--primary,#c0392b);color:#fff;border-color:var(--primary,#c0392b)}
.hanzi-stage{position:relative;margin:auto;width:min(360px,88vw);height:min(360px,88vw);border:1px solid var(--border,#e5e0d8);border-radius:16px;background:#fff;overflow:hidden}
.hanzi-grid-bg{position:absolute;inset:0;background:linear-gradient(#dfe8e2 1px,transparent 1px),linear-gradient(90deg,#dfe8e2 1px,transparent 1px),linear-gradient(45deg,transparent calc(50% - .5px),#edf1ee calc(50% - .5px),#edf1ee calc(50% + .5px),transparent calc(50% + .5px)),linear-gradient(-45deg,transparent calc(50% - .5px),#edf1ee calc(50% - .5px),#edf1ee calc(50% + .5px),transparent calc(50% + .5px));background-size:50% 50%,50% 50%,100% 100%,100% 100%;pointer-events:none}
.hanzi-writer-target{position:absolute;inset:0;z-index:2;pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}
.hanzi-writer-target svg{display:block;width:100%;height:100%;pointer-events:auto !important;touch-action:none;-webkit-user-select:none;user-select:none}
.hanzi-trace-layer{position:absolute;inset:0;z-index:3;pointer-events:none}
.hanzi-draw-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;pointer-events:auto;cursor:crosshair;-webkit-user-select:none;user-select:none}
.hanzi-practice-info{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:11px;padding:9px 11px;border-radius:10px;background:var(--bg-soft,#f5f2eb);font-size:12px;color:var(--text-soft,#566573)}
.hanzi-clear{border:1px solid var(--border,#e5e0d8);background:var(--card,#fff);padding:7px 11px;border-radius:9px;font-weight:700;cursor:pointer}
.hanzi-source-note{margin-top:10px;font-size:11px;color:var(--text-faint,#8492a6);line-height:1.5}
`;document.head.appendChild(st)}
function openModal(char,pinyin,mode){styleOnce();closeModal();const overlay=document.createElement('div');overlay.className='hanzi-practice-overlay';overlay.id='hanziPracticeOverlay';overlay.innerHTML='<div class="hanzi-practice-modal" role="dialog" aria-modal="true" aria-label="Luyện viết '+esc(char)+'"><div class="hanzi-practice-head"><div><div class="hanzi-practice-title">'+esc(char)+' · '+esc(pinyin||'')+'</div><div class="hanzi-practice-sub">Luyện thứ tự nét và viết chữ</div></div><button class="hanzi-close" type="button" aria-label="Đóng">×</button></div><div class="hanzi-mode-row"><button class="hanzi-mode-btn" data-mode="stroke">▶ Xem nét</button><button class="hanzi-mode-btn" data-mode="trace">✎ Viết mờ</button><button class="hanzi-mode-btn" data-mode="quiz">📝 Tự viết</button></div><div class="hanzi-stage"><div class="hanzi-grid-bg"></div><div class="hanzi-writer-target" id="hanziWriterTarget"></div><div class="hanzi-trace-layer" id="hanziTraceLayer"></div></div><div class="hanzi-practice-info" id="hanziPracticeInfo"><span>Đang tải dữ liệu nét…</span></div><div style="text-align:right;margin-top:9px"><button class="hanzi-clear" id="hanziClear">Xóa nét viết</button></div><div class="hanzi-source-note">Giao diện luyện viết tham khảo mô hình Hanzii. Phần thứ tự nét và luyện nhận diện nét dùng Hanzi Writer, thư viện mã nguồn mở; dữ liệu stroke order của Hanzi Writer được dẫn xuất từ Make Me A Hanzi.</div></div>';document.body.appendChild(overlay);overlay.querySelector('.hanzi-close').onclick=closeModal;overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});overlay.querySelectorAll('.hanzi-mode-btn').forEach(b=>b.onclick=()=>setupMode(char,pinyin,b.dataset.mode));overlay.querySelector('#hanziClear').onclick=()=>clearDrawing();loadWriter().then(()=>setupMode(char,pinyin,mode||'stroke')).catch(()=>{const el=document.getElementById('hanziPracticeInfo');if(el)el.innerHTML='<span>Không tải được dữ liệu nét.</span><span>Kiểm tra kết nối mạng.</span>'})}
function clearStage(){if(currentWriter&&currentWriter.cancelQuiz){try{currentWriter.cancelQuiz()}catch(e){}}currentWriter=null;if(drawCleanup){drawCleanup();drawCleanup=null}const t=document.getElementById('hanziWriterTarget'),l=document.getElementById('hanziTraceLayer');if(t)t.innerHTML='';if(l)l.innerHTML='';const c=document.querySelector('.hanzi-draw-canvas');if(c)c.remove()}
function setupMode(char,pinyin,mode){document.querySelectorAll('.hanzi-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));clearStage();if(mode==='trace')setupTrace(char);else if(mode==='quiz')setupQuiz(char);else setupStroke(char)}
function makeWriter(char,opts){return window.HanziWriter.create('hanziWriterTarget',char,Object.assign({width:360,height:360,padding:20,strokeColor:'#1d8f63',radicalColor:'#d94a3a'},opts||{}))}
function info(a,b){const el=document.getElementById('hanziPracticeInfo');if(el)el.innerHTML='<span>'+a+'</span><span>'+b+'</span>'}
function setupStroke(char){info('Đang phát thứ tự nét…','Chạm “Xem nét” để xem lại');currentWriter=makeWriter(char,{showCharacter:false,showOutline:true,strokeAnimationSpeed:1.2,delayBetweenStrokes:420});currentWriter.animateCharacter({onComplete:()=>{info('✓ Hoàn tất thứ tự nét','Có thể xem lại hoặc chuyển sang viết')}})}
function setupTrace(char){info('Viết đè theo chữ mờ','Dùng chuột hoặc ngón tay để viết');makeWriter(char,{showCharacter:true,showOutline:false,strokeColor:'#b8ddca',radicalColor:'#b8ddca'});const layer=document.getElementById('hanziTraceLayer');if(layer)layer.style.pointerEvents='none';const canvas=document.createElement('canvas');canvas.className='hanzi-draw-canvas';canvas.width=720;canvas.height=720;layer.appendChild(canvas);const ctx=canvas.getContext('2d');ctx.lineWidth=12;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#D68910';let drawing=false,pts=0;const pos=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*(canvas.width/r.width),y:(p.clientY-r.top)*(canvas.height/r.height)}};const down=e=>{e.preventDefault();drawing=true;pts=0;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)},move=e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();pts++},up=()=>{drawing=false;if(pts)info('Đang viết mờ','Tiếp tục luyện từng nét')};canvas.addEventListener('mousedown',down);canvas.addEventListener('mousemove',move);window.addEventListener('mouseup',up);canvas.addEventListener('touchstart',down,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});window.addEventListener('touchend',up);drawCleanup=()=>{canvas.removeEventListener('mousedown',down);canvas.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);canvas.removeEventListener('touchstart',down);canvas.removeEventListener('touchmove',move);window.removeEventListener('touchend',up)}}
function setupQuiz(char){
  info('Tự viết · bắt đầu theo thứ tự nét','Đưa ngón tay hoặc chuột vào ô chữ để viết');
  const target=document.getElementById('hanziWriterTarget');
  if(!target) return;
  target.style.pointerEvents='auto';
  target.style.touchAction='none';
  currentWriter=window.HanziWriter.create(target,char,{width:360,height:360,padding:20,showCharacter:false,showOutline:false,strokeColor:'#1d8f63',radicalColor:'#d94a3a'});
  const svg=target.querySelector('svg');
  if(svg){svg.style.pointerEvents='auto';svg.style.touchAction='none';svg.style.userSelect='none';}
  currentWriter.quiz({
    leniency:1,
    showHintAfterMisses:1,
    onMistake:d=>info('✗ Sai ở nét '+(d.strokeNum+1),'Tổng lỗi: '+d.totalMistakes),
    onCorrectStroke:d=>info('✓ Đúng nét '+d.strokeNum,'Còn '+d.strokesRemaining+' nét'),
    onComplete:d=>info('🎉 Hoàn thành chữ '+d.character,'Tổng lỗi: '+d.totalMistakes)
  });
}
function clearDrawing(){const c=document.querySelector('.hanzi-draw-canvas');if(c)c.getContext('2d').clearRect(0,0,c.width,c.height)}
function closeModal(){const o=document.getElementById('hanziPracticeOverlay');if(o)o.remove();clearStage()}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.hanzi-practice-btn');if(!b)return;e.preventDefault();openModal(b.dataset.char||'',b.dataset.pinyin||'',b.dataset.mode||'stroke')});
window.hanziPractice={open:openModal,close:closeModal};
})();