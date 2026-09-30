/* Authentication is shared with the account workspace; RLS authorizes every read. */
(async()=>{'use strict';
const LESSON_ID=document.body.dataset.lessonId;
if(!LESSON_ID)return;
const gate=document.createElement('section');
gate.id='privateLessonGate';gate.className='private-lesson-gate';
const card=document.createElement('div');card.className='private-lesson-card';
card.innerHTML='<p class="private-lesson-kicker">KHU VỰC HỌC VIÊN</p><h1 class="private-lesson-title">Tiếp tục bài học của bạn</h1><p class="private-lesson-desc">Đăng nhập bằng tài khoản đã được Bách Hữu duyệt và cấp quyền bài học.</p><div class="private-lesson-actions"><a class="private-lesson-primary" id="privateAccountLink">Mở tài khoản</a><a class="private-lesson-secondary" href="trang-chu.html">Trang chủ</a></div><p class="private-lesson-status" id="privateLessonStatus" role="status">Đang kiểm tra tài khoản…</p>';
gate.append(card);document.body.append(gate);
card.querySelector('#privateAccountLink').href='tai-khoan.html?next='+encodeURIComponent(location.pathname.split('/').pop());
function setStatus(message){card.querySelector('#privateLessonStatus').textContent=message;}
function hideGate(){gate.remove();}
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

  const {data,error}=await supabase.storage.from(asset.bucket).download(asset.path);

  if(error) throw error;
  if(!data) throw new Error('Không tải được tệp nghe riêng.');
  const url=URL.createObjectURL(data);
  window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
  return url;
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

async function loadLesson(supabase,userId){
  const {data:rows,error}=await supabase.rpc('get_private_lesson_content',{p_lesson_id:LESSON_ID});
  const data=rows?.[0];

  if(error) throw error;
  if(!data) throw new Error('Tài khoản này chưa được cấp quyền cho bài học.');
  if(!data.id||!data.content) throw new Error('Dữ liệu bài học riêng không hợp lệ.');
  if(data.content.officialAssignment){
    card.querySelector('.private-lesson-title').textContent='Bài nộp HSK / HSKK';
    card.querySelector('.private-lesson-desc').textContent='Làm bài bằng tài khoản, lưu nháp và xem kết quả sau khi Bách Hữu công bố.';
    const link=card.querySelector('#privateAccountLink');
    link.href='tai-khoan.html?assignment='+encodeURIComponent(LESSON_ID)+'#officialAssignments';
    link.textContent='Mở bài nộp trên tài khoản →';
    setStatus('Bài này sử dụng quy trình nộp bài chính thức.');
    return;
  }

  const {initAttempts}=await import('./study/attempt-sync.mjs');
  window.HNH_ATTEMPTS=await initAttempts(userId,LESSON_ID);
  const content=await resolvePrivateAssets(data.content,supabase);
  if(document.body.dataset.lessonEngine==='legacy') {
    if(!content.client_view)throw new Error('Bài học đang được chuyển sang khu vực riêng. Vui lòng thử lại sau.');
    window.HNH_PRIVATE_LEGACY=content.client_view;
  }
  const {preparePrivateLesson}=await import('./study/private-lesson-data.mjs');
  const lesson=preparePrivateLesson({id:data.id,content},document.body.dataset.lessonEngine);

  window.HAN_NGU_DATA.register(lesson);
  await loadLessonEngine();
}

function loadLessonEngine(){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=document.body.dataset.lessonEngine==='legacy'?'study/lesson-engines/'+LESSON_ID+'.js':'hsk1-lesson-engine.js';
    script.dataset.privateLessonEngine='1';
    script.onload=()=>{
      setTimeout(()=>{
        const title=document.getElementById('introZh')?.textContent?.trim();
        const vocabCount=document.getElementById('vocabCount')?.textContent?.trim();

        if(document.body.dataset.lessonEngine==='legacy'||(title&&title!=='—'&&vocabCount&&vocabCount!=='0 từ')){
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

try{
 const {getClient,getSession}=await import('./study/auth.mjs');
 const {observeAccount,myProfile}=await import('./study/account-service.mjs');
 await observeAccount();
 const session=await getSession();
 if(!session){setStatus('Bạn chưa đăng nhập. Mở tài khoản để đăng nhập hoặc đăng ký.');return;}
 const profile=await myProfile();
 if(profile.status!=='APPROVED'){setStatus('Tài khoản chưa có quyền học đang hoạt động. Kiểm tra trạng thái ở trang tài khoản.');return;}
 const supabase=await getClient();
 window.HNH_ACCOUNT_SCOPE='::account:'+session.user.id;
 let accessCheck;
 const revoke=()=>{clearInterval(accessCheck);location.replace('tai-khoan.html?next='+encodeURIComponent(location.pathname.split('/').pop()));};
 window.addEventListener('study:auth',e=>{if(e.detail.userId!==session.user.id)revoke();});
 await loadLesson(supabase,session.user.id);
 // Recheck access while open; the database remains the authority on every request.
 accessCheck=setInterval(async()=>{
  try{const {data,error}=await supabase.from('lesson_content').select('id').eq('id',LESSON_ID).maybeSingle();if(!error&&!data)revoke();}catch{}
 },60000);
 window.addEventListener('pagehide',()=>clearInterval(accessCheck),{once:true});
}catch(error){setStatus(error?.message?.includes('quyền')?error.message:'Chưa mở được bài học. Kiểm tra kết nối hoặc trạng thái trong trang tài khoản.');}
})();
