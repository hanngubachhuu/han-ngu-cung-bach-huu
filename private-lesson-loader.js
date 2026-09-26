/* Student-private lesson loader.
 * Boundary: browser -> Supabase Auth/RLS -> lesson data/assets -> lesson engine.
 */
(()=>{'use strict';

const LESSON_ID = document.body.dataset.lessonId;
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
if(!LESSON_ID) return;

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.onload=resolve;
    script.onerror=()=>reject(new Error('Không tải được thư viện xác thực.'));
    document.head.appendChild(script);
  });
}

function getGate(){
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

function setStatus(message, kind=''){
  const status=document.getElementById('privateLessonStatus');
  if(!status) return;
  status.textContent=message||'';
  status.classList.toggle('is-error',kind==='error');
  status.classList.toggle('is-ok',kind==='ok');
}

function setBusy(busy){
  document.getElementById('privateLessonLogin')?.toggleAttribute('disabled',busy);
  document.getElementById('privateLessonSignup')?.toggleAttribute('disabled',busy);
}

function hideGate(){
  document.getElementById('privateLessonGate')?.remove();
}

function parsePrivateAsset(value){
  if(typeof value!=='string'||!value.startsWith('supabase://')) return null;

  const resource=value.slice('supabase://'.length);
  const separator=resource.indexOf('/');
  if(separator<=0) throw new Error('Đường dẫn tài nguyên riêng không hợp lệ.');

  return {
    bucket:resource.slice(0,separator),
    path:resource.slice(separator+1)
  };
}

async function resolvePrivateAsset(value,supabase){
  const asset=parsePrivateAsset(value);
  if(!asset) return value;

  const {data,error}=await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.path,3600);

  if(error) throw error;
  if(!data?.signedUrl) throw new Error('Không tạo được đường dẫn nghe riêng.');

  return data.signedUrl;
}

async function resolvePrivateAssets(value,supabase){
  const asset=parsePrivateAsset(value);
  if(asset) return resolvePrivateAsset(value,supabase);
  if(Array.isArray(value)){
    return Promise.all(value.map(item=>resolvePrivateAssets(item,supabase)));
  }
  if(value&&typeof value==='object'){
    const entries=await Promise.all(
      Object.entries(value).map(async ([key,item])=>[
        key,
        await resolvePrivateAssets(item,supabase)
      ])
    );
    return Object.fromEntries(entries);
  }
  return value;
}

async function loadLesson(supabase){
  const {data,error}=await supabase
    .from('lesson_content')
    .select('id,content')
    .eq('id',LESSON_ID)
    .eq('visibility','student')
    .maybeSingle();

  if(error) throw error;
  if(!data) throw new Error('Tài khoản này chưa được cấp quyền cho bài học.');
  if(!data.id||!data.content) throw new Error('Dữ liệu bài học riêng không hợp lệ.');

  const content=await resolvePrivateAssets(data.content,supabase);
  const lesson={
    id:data.id,
    content:content?.content||content,
    exerciseSections:content?.exerciseSections||[]
  };

  window.HAN_NGU_DATA.register(lesson);
  await loadLessonEngine();
}

function loadLessonEngine(){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='hsk1-lesson-engine.js';
    script.dataset.privateLessonEngine='1';
    script.onload=()=>{
      setTimeout(()=>{
        const title=document.getElementById('introZh')?.textContent?.trim();
        const vocabCount=document.getElementById('vocabCount')?.textContent?.trim();

        if(title&&title!=='—'&&vocabCount&&vocabCount!=='0 từ'){
          hideGate();
          resolve();
          return;
        }

        reject(new Error('Bộ máy bài học chưa khởi tạo được dữ liệu.'));
      },0);
    };
    script.onerror=()=>reject(new Error('Không tải được bộ máy bài học.'));
    document.body.appendChild(script);
  });
}

async function continueWithSession(supabase){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){
    setStatus('Hãy đăng nhập hoặc tạo tài khoản học viên để tiếp tục.');
    return;
  }

  setBusy(true);
  setStatus('Đang tải bài học riêng…');

  try{
    await loadLesson(supabase);
  }catch(error){
    setBusy(false);
    setStatus(error?.message||'Không thể tải bài học.','error');
  }
}

async function boot(){
  const config=window.HNH_SUPABASE;
  if(!config?.url||!config?.publishableKey){
    throw new Error('Thiếu cấu hình Supabase public.');
  }

  getGate();
  await loadScript(SUPABASE_CDN);

  const supabase=window.supabase.createClient(
    config.url,
    config.publishableKey
  );

  document.getElementById('privateLessonForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    setBusy(true);
    setStatus('Đang đăng nhập…');

    try{
      const email=document.getElementById('privateLessonEmail').value.trim();
      const password=document.getElementById('privateLessonPassword').value;
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error) throw error;
      await continueWithSession(supabase);
    }catch(error){
      setBusy(false);
      setStatus(error?.message||'Đăng nhập không thành công.','error');
    }
  });

  document.getElementById('privateLessonSignup')?.addEventListener('click',async ()=>{
    setBusy(true);
    setStatus('Đang tạo tài khoản…');

    try{
      const email=document.getElementById('privateLessonEmail').value.trim();
      const password=document.getElementById('privateLessonPassword').value;
      if(!email||!password){
        throw new Error('Nhập email và mật khẩu trước khi tạo tài khoản.');
      }

      const {data,error}=await supabase.auth.signUp({
        email,
        password,
        options:{emailRedirectTo:location.href}
      });
      if(error) throw error;

      if(data.session){
        await continueWithSession(supabase);
      }else{
        setBusy(false);
        setStatus('Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận, sau đó đăng nhập lại.','ok');
      }
    }catch(error){
      setBusy(false);
      setStatus(error?.message||'Không thể tạo tài khoản.','error');
    }
  });

  await continueWithSession(supabase);
}


boot().catch(error=>{
  getGate();
  setStatus(error?.message||'Không thể khởi tạo khu vực học viên.','error');
});

})();