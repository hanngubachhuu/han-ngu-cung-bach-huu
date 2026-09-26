/* Authenticated loader for HSK2 student-private lessons. */
(()=>{'use strict';
const LESSON_ID=document.body.dataset.lessonId;
if(!LESSON_ID)return;
const CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=ok;s.onerror=()=>no(new Error('Không tải được thư viện xác thực.'));document.head.appendChild(s);});}
function gate(){let g=document.getElementById('privateLessonGate');if(g)return g;g=document.createElement('div');g.id='privateLessonGate';g.className='private-lesson-gate';g.innerHTML='<div class="private-lesson-card" role="dialog" aria-modal="true" aria-labelledby="privateLessonTitle"><p class="private-lesson-kicker">NỘI DUNG HỌC VIÊN</p><h1 class="private-lesson-title" id="privateLessonTitle">Đăng nhập để vào bài học</h1><p class="private-lesson-desc">Bài học này dành cho tài khoản học viên. Nội dung chỉ được tải sau khi tài khoản được cấp quyền.</p><form class="private-lesson-form" id="privateLessonForm"><div><label for="privateLessonEmail">Email</label><input id="privateLessonEmail" type="email" autocomplete="email" required></div><div><label for="privateLessonPassword">Mật khẩu</label><input id="privateLessonPassword" type="password" minlength="6" autocomplete="current-password" required></div><div class="private-lesson-actions"><button class="private-lesson-primary" id="privateLessonLogin" type="submit">Đăng nhập</button><button class="private-lesson-secondary" id="privateLessonSignup" type="button">Tạo tài khoản</button></div></form><div class="private-lesson-status" id="privateLessonStatus" role="status" aria-live="polite"></div></div>';document.body.appendChild(g);return g;}
function status(t,k){const e=document.getElementById('privateLessonStatus');if(e){e.textContent=t||'';e.style.color=k==='error'?'#9b1c1c':k==='ok'?'#2d6a4f':'#5f6368';}}
function busy(v){['privateLessonLogin','privateLessonSignup'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=v;});}
function hide(){document.getElementById('privateLessonGate')?.remove();}
async function boot(){
 const cfg=window.HNH_SUPABASE;if(!cfg?.url||!cfg?.publishableKey)throw new Error('Thiếu cấu hình Supabase public.');
 gate();await loadScript('hsk2-lesson-adapter.js');await loadScript(CDN);
 const supabase=window.supabase.createClient(cfg.url,cfg.publishableKey);
 async function load(){
   const {data:{session}}=await supabase.auth.getSession();
   if(!session){status('Hãy đăng nhập hoặc tạo tài khoản học viên để tiếp tục.');return;}
   busy(true);status('Đang tải bài học riêng…');
   const {data,error}=await supabase.rpc('get_private_lesson_content',{p_lesson_id:LESSON_ID});
   if(error)throw error;
   if(!data)throw new Error('Tài khoản này chưa được cấp quyền cho bài học.');
   window.HAN_NGU_PRIVATE_LESSON=window.HAN_NGU_HSK2_ADAPTER.adapt(data.content);
   const s=document.createElement('script');s.src='hsk2-lesson-engine.js';s.onload=hide;s.onerror=()=>status('Không tải được bộ máy bài học. Vui lòng thử lại.','error');document.body.appendChild(s);
 }
 document.getElementById('privateLessonForm')?.addEventListener('submit',async e=>{e.preventDefault();busy(true);status('Đang đăng nhập…');try{const email=document.getElementById('privateLessonEmail').value.trim(),password=document.getElementById('privateLessonPassword').value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;await load();}catch(err){busy(false);status(err?.message||'Đăng nhập không thành công.','error');}});
 document.getElementById('privateLessonSignup')?.addEventListener('click',async()=>{busy(true);status('Đang tạo tài khoản…');try{const email=document.getElementById('privateLessonEmail').value.trim(),password=document.getElementById('privateLessonPassword').value;if(!email||!password)throw new Error('Nhập email và mật khẩu trước khi tạo tài khoản.');const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.href}});if(error)throw error;if(data.session)await load();else{busy(false);status('Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận, sau đó đăng nhập lại.','ok');}}catch(err){busy(false);status(err?.message||'Không thể tạo tài khoản.','error');}});
 await load();
}
boot().catch(err=>{gate();status(err?.message||'Không thể khởi tạo khu vực học viên.','error');});
})();