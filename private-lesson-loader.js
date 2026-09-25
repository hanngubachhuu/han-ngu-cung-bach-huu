/* Authenticated loader for student-private lesson content.
 * Boundary: browser -> Supabase Auth/RLS -> lesson_content -> existing HSK1 engine.
 * This file never contains a secret/secret key.
 */
(()=>{'use strict';

const LESSON_ID = document.body.dataset.lessonId;
if(!LESSON_ID) return;

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

function loadExternalScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.async=true;
    s.onload=resolve;
    s.onerror=()=>reject(new Error('Không tải được thư viện xác thực.'));
    document.head.appendChild(s);
  });
}

function getOrCreateGate(){
  let gate=document.getElementById('privateLessonGate');
  if(gate) return gate;
  gate=document.createElement('div');
  gate.id='privateLessonGate';
  gate.className='private-lesson-gate';
  gate.innerHTML=
    '<div class="private-lesson-card" role="dialog" aria-modal="true" aria-labelledby="privateLessonTitle">'+
      '<p class="private-lesson-kicker">NỘI DUNG HỌC VIÊN</p>'+
      '<h1 class="private-lesson-title" id="privateLessonTitle">Đăng nhập để vào bài học</h1>'+
      '<p class="private-lesson-desc">Bài học này dành cho tài khoản học viên. Đăng nhập để tải nội dung bài học từ kho dữ liệu riêng.</p>'+
      '<form class="private-lesson-form" id="privateLessonForm">'+
        '<div><label for="privateLessonEmail">Email</label><input id="privateLessonEmail" type="email" autocomplete="email" required></div>'+
        '<div><label for="privateLessonPassword">Mật khẩu</label><input id="privateLessonPassword" type="password" minlength="6" autocomplete="current-password" required></div>'+
        '<div class="private-lesson-actions">'+
          '<button class="private-lesson-primary" id="privateLessonLogin" type="submit">Đăng nhập</button>'+
          '<button class="private-lesson-secondary" id="privateLessonSignup" type="button">Tạo tài khoản</button>'+
        '</div>'+
      '</form>'+
      '<div class="private-lesson-status" id="privateLessonStatus" role="status" aria-live="polite"></div>'+
    '</div>';
  document.body.appendChild(gate);
  return gate;
}

function status(text,kind){
  const e=document.getElementById('privateLessonStatus');
  if(e){
    e.textContent=text||'';
    e.style.color=kind==='error'?'#9b1c1c':kind==='ok'?'#2d6a4f':'#5f6368';
  }
}

function hideGate(){
  const gate=document.getElementById('privateLessonGate');
  if(gate) gate.remove();
}

function showGate(){
  const gate=getOrCreateGate();
  gate.style.display='flex';
  return gate;
}

function setBusy(busy){
  const login=document.getElementById('privateLessonLogin');
  const signup=document.getElementById('privateLessonSignup');
  if(login) login.disabled=busy;
  if(signup) signup.disabled=busy;
}

function walkAndResolve(value, supabase){
  if(typeof value==='string' && value.startsWith('supabase://')){
    const raw=value.slice('supabase://'.length);
    const split=raw.indexOf('/');
    if(split<=0) return Promise.resolve(value);
    const bucket=raw.slice(0,split);
    const path=raw.slice(split+1);
    return supabase.storage.from(bucket).createSignedUrl(path,3600)
      .then(({data,error})=>error?Promise.reject(error):(data?.signedUrl||value));
  }
  if(Array.isArray(value)) return Promise.all(value.map(v=>walkAndResolve(v,supabase)));
  if(value && typeof value==='object'){
    const out={};
    const entries=Object.entries(value);
    return Promise.all(entries.map(async ([k,v])=>[k,await walkAndResolve(v,supabase)]))
      .then(rows=>{rows.forEach(([k,v])=>{out[k]=v});return out;});
  }
  return Promise.resolve(value);
}

async function loadLesson(supabase){
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError) throw sessionError;
  if(!session) throw new Error('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.');

  const {data:debugAccess,error:debugAccessError}=await supabase.rpc('debug_bai4_access');
  console.info('[private-lesson] debug access rpc:',{data:debugAccess,error:debugAccessError});
  if(debugAccessError) throw debugAccessError;

  const {data:access,error:accessError}=await supabase
    .from('student_lesson_access')
    .select('lesson_id,active')
    .eq('lesson_id',LESSON_ID)
    .eq('active',true)
    .maybeSingle();

  console.info('[private-lesson] auth user:',session.user.id);
  console.info('[private-lesson] debug result:',debugAccess);
  console.info('[private-lesson] access check:',{data:access,error:accessError});
  if(accessError){
    throw new Error('Kiểm tra quyền thất bại: '+(accessError.message||'Supabase RLS/API error'));
  }

  if(accessError) throw accessError;

  const {data,error}=await supabase
    .from('lesson_content')
    .select('id,level,lesson_no,title_zh,title_vi,visibility,content')
    .eq('id',LESSON_ID)
    .eq('visibility','student')
    .maybeSingle();

  console.info('[private-lesson] lesson check:',{data,error});

  if(error) throw error;
  if(!data){
    if(access?.lesson_id===LESSON_ID && access?.active===true){
      throw new Error('Đã đăng nhập. UID: '+session.user.id+' | QUYỀN: CÓ | lesson_content: BỊ RLS CHẶN');
    }
    throw new Error('Đã đăng nhập. UID: '+session.user.id+' | RPC kiểm tra quyền: '+(debugAccess?.has_access?'CÓ':'KHÔNG')+' | SELECT student_lesson_access: KHÔNG THẤY DÒNG');
  }

  const content=await walkAndResolve(data.content,supabase);
  const lesson={id:data.id,...content};
  window.HAN_NGU_DATA.register(lesson);

  const engine=document.createElement('script');
  engine.src='hsk1-lesson-engine.js';
  engine.dataset.privateLessonEngine='1';
  engine.onload=hideGate;
  engine.onerror=()=>status('Không tải được bộ máy bài học. Vui lòng thử lại.', 'error');
  document.body.appendChild(engine);
}

async function boot(){
  const config=window.HNH_SUPABASE;
  if(!config?.url||!config?.publishableKey) throw new Error('Thiếu cấu hình Supabase public.');

  showGate();
  await loadExternalScript(CDN);

  const supabase=window.supabase.createClient(config.url,config.publishableKey);

  async function continueWithSession(){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){
      status('Hãy đăng nhập hoặc tạo tài khoản học viên để tiếp tục.');
      return;
    }
    setBusy(true);
    status('Đang tải bài học riêng…');
    try{
      await loadLesson(supabase);
    }catch(error){
      setBusy(false);
      status(error?.message||'Không thể tải bài học.','error');
    }
  }

  const form=document.getElementById('privateLessonForm');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    setBusy(true);
    status('Đang đăng nhập…');
    try{
      const email=document.getElementById('privateLessonEmail').value.trim();
      const password=document.getElementById('privateLessonPassword').value;
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error) throw error;
      await continueWithSession();
    }catch(error){
      setBusy(false);
      status(error?.message||'Đăng nhập không thành công.','error');
    }
  });

  document.getElementById('privateLessonSignup')?.addEventListener('click',async ()=>{
    setBusy(true);
    status('Đang tạo tài khoản…');
    try{
      const email=document.getElementById('privateLessonEmail').value.trim();
      const password=document.getElementById('privateLessonPassword').value;
      if(!email||!password) throw new Error('Nhập email và mật khẩu trước khi tạo tài khoản.');
      const {data,error}=await supabase.auth.signUp({
        email,
        password,
        options:{emailRedirectTo:location.href}
      });
      if(error) throw error;
      if(data.session){
        await continueWithSession();
      }else{
        setBusy(false);
        status('Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận, sau đó đăng nhập lại.','ok');
      }
    }catch(error){
      setBusy(false);
      status(error?.message||'Không thể tạo tài khoản.','error');
    }
  });

  await continueWithSession();
}

boot().catch(error=>{
  showGate();
  status(error?.message||'Không thể khởi tạo khu vực học viên.','error');
});

})();