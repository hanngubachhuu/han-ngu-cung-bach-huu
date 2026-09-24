/* Add accessible HSK 1 navigation to the existing static/dynamic menus. */
(()=>{'use strict';
function enhanceSiteFooter(){
  let footer=document.getElementById('siteFooter');
  if(!footer){
    footer=document.createElement('footer');
    footer.id='siteFooter';
    footer.className='site-footer no-print';
    document.body.appendChild(footer);
  }
  footer.classList.add('site-footer-v2');
  const path=(location.pathname.split('/').pop()||'trang-chu.html').toLowerCase();
  const isLesson=/^(bai\d+_index|hsk1_bai\d+_index)\.html$/.test(path);
  const currentKey =
    path==='hskk.html'?'hskk':
    path==='on-tap-chung.html'?'review':
    path==='tu-vung.html'?'vocab':
    /^(chu-han|chu-han-ming)\.html$/.test(path)?'hanzi':
    (path==='trang-chu.html'||path==='index.html')?'home':
    isLesson?'lesson':'';
  footer.innerHTML=`
    <div class="site-footer-inner">
      <div class="footer-v2-brand">
        <div class="footer-v2-seal" aria-hidden="true">汉</div>
        <div>
          <p class="footer-v2-kicker">汉语 · HỌC CÓ NGỮ CẢNH</p>
          <h2 class="footer-v2-title">Hán Ngữ Cùng Bách Hữu</h2>
          <p class="footer-v2-quote">学而时习之，不亦说乎。</p>
          <p class="footer-v2-desc">Học tiếng Trung bằng ngữ cảnh, cấu trúc câu, thực hành và ôn tập có hệ thống. Học để dùng được, hiểu được và nhớ lâu.</p>
          <div class="footer-v2-loop" aria-label="Vòng học tập">
            <span>Từ vựng</span><span>Câu</span><span>Ngữ cảnh</span><span>Ôn tập</span>
          </div>
        </div>
      </div>

      <nav class="footer-v2-col" aria-label="Khám phá">
        <h4>KHÁM PHÁ</h4>
        <a data-key="home" href="trang-chu.html">Trang chủ</a>
        <a data-key="review" href="on-tap-chung.html">Ôn tập chung</a>
        <a data-key="vocab" href="tu-vung.html">Kho từ vựng</a>
        <a data-key="hanzi" href="chu-han.html">Chữ Hán</a>
      </nav>

      <nav class="footer-v2-col" aria-label="Luyện tập">
        <h4>LUYỆN TẬP</h4>
        <a data-key="hskk" href="hskk.html">HSKK</a>
        <a data-key="lesson" href="trang-chu.html#bai-hoc">Lộ trình bài học</a>
        <a href="trang-chu.html#cach-hoc">Cách học</a>
        <a href="trang-chu.html#gioi-thieu">Giới thiệu</a>
      </nav>

      <div class="footer-v2-col">
        <h4>GÓC BÁCH HỮU</h4>
        <div class="footer-v2-feature">
          <strong>以今语为体，以古语为骨</strong>
          <span>Tiếng Việt là nền, Hán văn là chiều sâu. Học tiếng Trung không chỉ ở từ và câu, mà ở cách hiểu và vận dụng.</span>
          <a href="trang-chu.html#lien-he">Liên hệ với Bách Hữu →</a>
        </div>
      </div>
    </div>
    <div class="site-footer-bottom">
      <span class="footer-v2-bottom-note">© <span id="footerYear"></span> Hán Ngữ Cùng Bách Hữu · Học tiếng Trung theo ngữ cảnh</span>
      <a class="footer-v2-back" href="#" aria-label="Quay về đầu trang">↑&nbsp; Lên đầu trang</a>
    </div>
  `;
  footer.querySelectorAll('[data-key]').forEach(a=>{
    if(a.dataset.key===currentKey) a.setAttribute('aria-current','page');
  });
  const y=footer.querySelector('#footerYear');
  if(y) y.textContent=new Date().getFullYear();
  const back=footer.querySelector('.footer-v2-back');
  if(back) back.addEventListener('click',e=>{
    e.preventDefault();
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
enhanceSiteFooter();

/* ===== Lesson layout fix =====
   HSK 1 lesson pages currently carry two .lesson-route blocks:
   one in the intro card and one after the app. Keep a single,
   intentional navigation block and let the footer follow the page.
*/
function normalizeLessonLayout(){
  const hasIntro=!!document.getElementById('introScreen');
  document.body.classList.toggle('has-lesson-intro',hasIntro);

  const routes=Array.from(document.querySelectorAll('.lesson-route'));
  if(!routes.length) return;

  // The static lesson template historically contains the route twice:
  // once inside the intro card and once after the app. Do not merely hide
  // one of them. Move one canonical route to the actual page-flow position:
  // Lesson content -> Lesson navigation -> Footer.
  const canonical=routes[0];
  routes.slice(1).forEach(route=>route.remove());
  const footer=document.getElementById('siteFooter');

  // Remove the canonical route from its original location (inside the card)
  // and place it immediately before the footer.
  if(footer && canonical.parentNode!==footer.parentNode){
    canonical.remove();
    footer.parentNode.insertBefore(canonical,footer);
  }
}
normalizeLessonLayout();

const panel=document.getElementById('hskDropdownPanel');
const dropdown=document.getElementById('hskDropdown');
const dropdownBtn=document.getElementById('hskDropdownBtn');
const navLinks=document.getElementById('siteNavLinks');
const burger=document.getElementById('siteNavBurger');

function closeDropdown(){
  if(!dropdown)return;
  dropdown.classList.remove('open');
  dropdownBtn?.setAttribute('aria-expanded','false');
}
function openDropdown(){
  if(!dropdown)return;
  dropdown.classList.add('open');
  dropdownBtn?.setAttribute('aria-expanded','true');
}
function markCurrentNav(){
  const current=(location.pathname.split('/').pop()||'trang-chu.html').toLowerCase();
  navLinks?.querySelectorAll('a').forEach(a=>{
    const href=(a.getAttribute('href')||'').toLowerCase();
    if(!href||href.startsWith('#')||href.includes('://')||href.startsWith('mailto:'))return;
    const target=href.split('#')[0].split('?')[0];
    if(!target)return;
    const same=(current==='index.html'&&target==='trang-chu.html')||
      (current==='trang-chu.html'&&target==='index.html')||
      target===current;
    if(same&&!href.includes('#'))a.setAttribute('aria-current','page');
  });
}
function ensurePronunciationNav(){
  if(!navLinks)return;
  if(navLinks.querySelector('.site-nav-pronunciation'))return;
  const item=document.createElement('a');
  item.className='site-nav-pronunciation';
  item.href='phat-am.html';
  item.textContent='Phát âm';
  item.setAttribute('aria-label','Phát âm tiếng Trung');
  const firstLink=navLinks.querySelector(':scope > a');
  const hsk=navLinks.querySelector('#hskDropdown');
  if(firstLink)firstLink.insertAdjacentElement('afterend',item);
  else if(hsk)hsk.insertAdjacentElement('beforebegin',item);
  else navLinks.prepend(item);
}

function setupMobileNav(){
  if(!burger||!navLinks)return;
  burger.setAttribute('aria-haspopup','true');
  burger.addEventListener('click',e=>{
    e.stopImmediatePropagation();
    e.stopPropagation();
    const open=navLinks.classList.toggle('open');
    burger.textContent=open?'✕':'☰';
    burger.setAttribute('aria-expanded',open?'true':'false');
    if(!open)closeDropdown();
  },true);
  navLinks.addEventListener('click',e=>{
    const link=e.target.closest?.('a');
    if(!link)return;
    navLinks.classList.remove('open');
    burger.textContent='☰';
    burger.setAttribute('aria-expanded','false');
  });
}
const LEARNING_KEY='hnh_learning_state_v1';
const LESSON_INDEX=Object.create(null);
const CANONICAL_BY_LEVEL=Object.create(null);
let learningState={last:null,visited:[]};

function readLearningState(){
  try{
    const raw=localStorage.getItem(LEARNING_KEY);
    if(!raw)return;
    const parsed=JSON.parse(raw);
    if(parsed&&Array.isArray(parsed.visited)){
      learningState={
        last:parsed.last&&typeof parsed.last==='object'?parsed.last:null,
        visited:[...new Set(parsed.visited.filter(x=>typeof x==='string'))]
      };
    }
  }catch(_e){}
}
function saveLearningState(){
  try{localStorage.setItem(LEARNING_KEY,JSON.stringify(learningState));}catch(_e){}
}
function pathnameKey(){
  return (location.pathname.split('/').pop()||'trang-chu.html').toLowerCase();
}
function registerLesson(meta){
  if(!meta?.href)return;
  const href=meta.href.split('#')[0].split('?')[0];
  const key=href.split('/').pop().toLowerCase();
  const record={
    level:Number(meta.level),
    lessonNo:Number(meta.lessonNo||0),
    title:meta.title||'',
    href
  };
  LESSON_INDEX[key]=record;
  if(!CANONICAL_BY_LEVEL[record.level])CANONICAL_BY_LEVEL[record.level]=[];
  if(!CANONICAL_BY_LEVEL[record.level].some(x=>x.href===href)){
    CANONICAL_BY_LEVEL[record.level].push(record);
    CANONICAL_BY_LEVEL[record.level].sort((a,b)=>a.lessonNo-b.lessonNo);
  }
}
function collectLessonIndex(levels){
  levels.forEach(level=>{
    const badge=level.querySelector('.dd-level-badge')?.textContent?.trim()||'';
    if(!/^[1-6]$/.test(badge))return;
    const links=[...level.querySelectorAll('.dd-level-lessons a')];
    links.forEach(a=>{
      const href=(a.getAttribute('href')||'').split('#')[0].split('?')[0];
      if(!href)return;
      registerLesson({
        level:Number(badge),
        title:a.textContent.trim(),
        href
      });
    });
  });
}
function ingestCanonicalManifest(){
  const manifest=window.HAN_NGU_DATA?.manifest;
  if(!Array.isArray(manifest))return;
  manifest.forEach(item=>{
    registerLesson({
      level:item.level,
      lessonNo:item.lessonNo,
      title:'Bài '+item.lessonNo+' · '+(item.titleZh||item.title||''),
      href:item.href
    });
  });
}
function loadCanonicalManifest(){
  if(Array.isArray(window.HAN_NGU_DATA?.manifest)&&window.HAN_NGU_DATA.manifest.length){
    ingestCanonicalManifest();
    return Promise.resolve();
  }
  return new Promise(resolve=>{
    const existing=document.querySelector('script[data-hnh-lesson-manifest="1"]');
    if(existing){
      existing.addEventListener('load',()=>{ingestCanonicalManifest();resolve();},{once:true});
      existing.addEventListener('error',()=>resolve(),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src='data/lesson-manifest.js';
    script.async=true;
    script.dataset.hnhLessonManifest='1';
    script.onload=()=>{ingestCanonicalManifest();resolve();};
    script.onerror=()=>resolve();
    document.head.appendChild(script);
  });
}
function trackCurrentLesson(){
  const key=pathnameKey();
  const meta=LESSON_INDEX[key];
  if(!meta)return;
  learningState.visited=[...new Set([...learningState.visited,key])].slice(-200);
  learningState.last={path:key,level:meta.level,title:meta.title,href:meta.href,updatedAt:Date.now()};
  saveLearningState();
}
function lessonsForLevel(level){
  const canonical=Array.isArray(CANONICAL_BY_LEVEL[level])?CANONICAL_BY_LEVEL[level]:[];
  if(canonical.length)return canonical.sort((a,b)=>(a.lessonNo||0)-(b.lessonNo||0));

  const fallback=Object.values(LESSON_INDEX)
    .filter(x=>x.level===level)
    .sort((a,b)=>(a.lessonNo||0)-(b.lessonNo||0));

  // HSK 1/2 hiện có manifest đầy đủ. Với các cấp chưa có dữ liệu,
  // trả về mảng rỗng để UI hiển thị đúng "đang xây dựng", không bịa bài.
  return fallback;
}
function buildLevelStatus(level){
  const list=lessonsForLevel(level);
  if(!list.length)return {kind:'empty',label:'Sắp ra mắt',ratio:0};
  const seen=list.filter(x=>learningState.visited.includes(x.href.split('/').pop().toLowerCase())).length;
  const current=learningState.last?.level===level;
  if(current)return {kind:'current',label:seen+' / '+list.length+' · Đang học',ratio:seen/list.length};
  if(seen>0)return {kind:'seen',label:seen+' / '+list.length+' · Đã xem',ratio:seen/list.length};
  return {kind:'empty',label:'Chưa học',ratio:0};
}
function addLevelStatus(level,index){
  const head=level.querySelector('.dd-level-head');
  const name=head?.querySelector('.dd-level-name');
  if(!head||!name)return;
  level.dataset.levelIndex=String(index);
  const status=buildLevelStatus(Number(level.querySelector('.dd-level-badge')?.textContent?.trim()||0));
  level.dataset.learningStatus=status.kind;
  let el=head.querySelector('.hsk-level-status');
  if(!el){
    el=document.createElement('span');
    el.className='hsk-level-status';
    head.insertBefore(el,head.querySelector('.dd-level-caret')||null);
  }
  el.textContent=status.label;
}
function getLastLearningMeta(){
  if(!learningState.last)return null;
  const key=(learningState.last.path||'').toLowerCase();
  if(LESSON_INDEX[key])return {...LESSON_INDEX[key],path:key};
  if(learningState.last.href)return {...learningState.last,path:key};
  return null;
}
function injectBreadcrumb(){
  const key=pathnameKey();
  const meta=LESSON_INDEX[key];
  if(!meta||!document.getElementById('siteNav'))return;
  const old=document.getElementById('siteBreadcrumb');
  if(old)old.remove();
  const nav=document.createElement('nav');
  nav.id='siteBreadcrumb';
  nav.className='breadcrumb-nav no-print';
  nav.setAttribute('aria-label','Đường dẫn trang');
  const list=document.createElement('ol');
  list.className='breadcrumb-list';
  const add=(label,href,extraClass,current=false)=>{
    const li=document.createElement('li');
    li.className='breadcrumb-item'+(extraClass?' '+extraClass:'');
    if(current){
      li.setAttribute('aria-current','page');
      li.textContent=label;
    }else{
      const a=document.createElement('a');
      a.href=href;a.textContent=label;
      li.appendChild(a);
    }
    list.appendChild(li);
  };
  add('Trang chủ','trang-chu.html');
  add('Lộ trình HSK','trang-chu.html#bai-hoc');
  add('HSK '+meta.level,'trang-chu.html#bai-hoc','breadcrumb-level');
  add(meta.title,'', '', true);
  nav.appendChild(list);
  document.getElementById('siteNav').insertAdjacentElement('afterend',nav);
}
function extractLevelNumber(level){
  const fromData=String(level?.getAttribute('data-level')||'').match(/(?:hsk)?(\\d+)/i);
  if(fromData)return Number(fromData[1]);
  const badge=level?.querySelector('.dd-level-badge')?.textContent?.trim()||'';
  const fromBadge=badge.match(/\\d+/);
  if(fromBadge)return Number(fromBadge[0]);
  const text=level?.querySelector('.dd-level-name')?.textContent||'';
  const fromText=text.match(/HSK\\s*(\\d+)/i);
  return fromText?Number(fromText[1]):0;
}

function cleanLevelTitle(level,number){
  // Menu chỉ hiển thị tên cấp độ thuần túy, không kéo theo "Sơ cấp",
  // "Trung cấp", "Cao cấp" hay tên giáo trình cũ từ HTML nguồn.
  return number?('HSK '+number):'HSK';
}

function makeMegaMenu(){
  if(!panel||panel.dataset.megaReady==='1')return;

  // Dựng menu từ dữ liệu chuẩn, không phụ thuộc vào HTML cũ của từng trang.
  // Đây là điểm quan trọng để hover/click cấp HSK không bị đè bởi markup cũ.
  ingestCanonicalManifest();
  trackCurrentLesson();

  panel.innerHTML='';
  panel.classList.add('hsk-mega-panel','hnh-mega-v12');

  const levelCol=document.createElement('div');
  levelCol.className='hsk-mega-levels';

  const detail=document.createElement('section');
  detail.className='hsk-mega-detail';
  detail.setAttribute('aria-live','polite');
  detail.setAttribute('aria-label','Chương trình HSK đang chọn');

  const resumeWrap=document.createElement('div');
  resumeWrap.className='hsk-mega-resume-wrap';

  const renderResume=()=>{
    const last=getLastLearningMeta();
    resumeWrap.innerHTML='';
    if(!last)return;

    const box=document.createElement('div');
    box.className='hsk-mega-resume';
    const copy=document.createElement('div');
    copy.className='hsk-mega-resume-copy';

    const kicker=document.createElement('div');
    kicker.className='hsk-mega-resume-kicker';
    kicker.textContent='HỌC TIẾP';

    const title=document.createElement('p');
    title.className='hsk-mega-resume-title';
    title.textContent=last.title;

    const meta=document.createElement('p');
    meta.className='hsk-mega-resume-meta';
    meta.textContent='HSK '+last.level+' · bài gần nhất đã mở';

    copy.append(kicker,title,meta);

    const link=document.createElement('a');
    link.className='hsk-mega-resume-link';
    link.href=last.href;
    link.textContent='Tiếp tục học →';
    link.addEventListener('click',()=>closeDropdown());

    box.append(copy,link);
    resumeWrap.appendChild(box);
  };

  const renderDetail=number=>{
    const lessons=lessonsForLevel(number);
    detail.classList.remove('is-switching');
    void detail.offsetWidth;
    detail.classList.add('is-switching');

    detail.innerHTML='';
    detail.appendChild(resumeWrap);
    renderResume();

    // Tiêu đề Lộ trình/HSK/số bài đã được bỏ khỏi vùng chi tiết để panel chỉ tập trung vào danh sách bài học.


    if(!lessons.length){
      const empty=document.createElement('div');
      empty.className='hsk-mega-detail-empty';
      empty.innerHTML='<div><strong>HSK '+number+'</strong>Nội dung sẽ được bổ sung trong lộ trình tiếp theo.</div>';
      detail.appendChild(empty);
    }else{
      const list=document.createElement('div');
      list.className='hsk-mega-detail-list';

      lessons.forEach((lesson,lessonIndex)=>{
        const sequence=Math.max(1,Number(lesson.lessonNo)||lessonIndex+1);
        const key=(lesson.href||'').split('#')[0].split('?')[0].split('/').pop().toLowerCase();
        const seen=learningState.visited.includes(key);
        const current=learningState.last?.path===key;
        const power=Math.min(1,0.16+(sequence-1)*0.06);

        const row=document.createElement('div');
        row.className='hsk-mega-lesson-row';
        row.dataset.hnhHskLevel=String(number);
        row.dataset.hnhLessonSeq=String(sequence);
        row.dataset.learningStatus=current?'current':(seen?'seen':'new');
        row.style.setProperty('--hnh-power',power.toFixed(2));

        const main=document.createElement('a');
        main.className='hsk-mega-lesson-link';
        main.href=lesson.href;
        main.textContent=lesson.title || ('Bài '+sequence);
        main.setAttribute('aria-label',main.textContent+(current?' · Tiếp tục học':(seen?' · Xem lại':' · Bắt đầu học')));

        const action=document.createElement('a');
        action.className='hsk-mega-lesson-action';
        action.href=lesson.href;
        action.textContent=current?'Tiếp tục học':(seen?'Xem lại':'Bắt đầu học');

        main.addEventListener('click',()=>closeDropdown());
        action.addEventListener('click',()=>closeDropdown());

        row.append(main,action);
        list.appendChild(row);
      });

      detail.appendChild(list);
      requestAnimationFrame(()=>{list.scrollTop=0;});
    }

    levelCol.querySelectorAll('.dd-level').forEach(x=>{
      x.classList.toggle('active',Number(x.dataset.hnhLevel)===number);
      const h=x.querySelector('.dd-level-head');
      h?.setAttribute('aria-expanded',Number(x.dataset.hnhLevel)===number?'true':'false');
    });
  };

  let hoveredLevel=null;

  for(let number=1;number<=6;number++){
    const level=document.createElement('div');
    level.className='dd-level';
    level.dataset.hnhLevel=String(number);
    level.dataset.hnhHskLevel=String(number);

    const head=document.createElement('div');
    head.className='dd-level-head';
    head.setAttribute('role','button');
    head.setAttribute('tabindex','0');
    head.setAttribute('aria-expanded','false');
    head.setAttribute('aria-label','Xem chương trình HSK '+number);

    const name=document.createElement('span');
    name.className='dd-level-name';
    name.textContent='HSK '+number;

    const status=document.createElement('span');
    status.className='hsk-level-status';

    const caret=document.createElement('span');
    caret.className='dd-level-caret';
    caret.textContent='›';

    head.append(name,status,caret);
    level.appendChild(head);
    levelCol.appendChild(level);

    const updateStatus=()=>{
      const state=buildLevelStatus(number);
      level.dataset.learningStatus=state.kind;
      status.textContent=state.label==='Sắp ra mắt'?'Đang xây dựng':state.label;
    };
    updateStatus();

    const activate=()=>{
      renderDetail(number);
      updateStatus();
    };

    // Hover và click đều chuyển cấp độ.
    // Hover được xử lý ở container để ổn định khi di chuyển qua tên,
    // trạng thái hoặc mũi tên bên trong cùng một cấp.
    head.addEventListener('focus',activate);
    head.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      activate();
    });
    head.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        activate();
      }
      if(e.key==='ArrowDown'||e.key==='ArrowRight'){
        e.preventDefault();
        const next=levelCol.children[Math.min(number,5)]?.querySelector('.dd-level-head');
        next?.focus();
      }
      if(e.key==='ArrowUp'||e.key==='ArrowLeft'){
        e.preventDefault();
        const prev=levelCol.children[Math.max(number-2,0)]?.querySelector('.dd-level-head');
        prev?.focus();
      }
    });
  }

  levelCol.addEventListener('pointerover',e=>{
    const level=e.target.closest?.('.dd-level');
    if(!level || level.parentElement!==levelCol)return;
    if(level===hoveredLevel)return;
    hoveredLevel=level;
    const number=Number(level.dataset.hnhLevel);
    if(number>=1&&number<=6)renderDetail(number);
  });

  levelCol.addEventListener('pointerleave',()=>{
    hoveredLevel=null;
  });

  const review=document.createElement('a');
  review.className='dd-static-link dd-review-link hsk-mega-review';
  review.href='on-tap-chung.html';
  review.textContent='Ôn tập chung →';

  panel.append(levelCol,detail,review);
  panel.dataset.megaReady='1';

  const wanted=Number(learningState.last?.level||1);
  renderDetail(wanted>=1&&wanted<=6?wanted:1);
}

async function initHskMegaMenu(){
  if(!panel||!dropdown)return;

  // Không cho menu nguồn "sổ" ra trước khi mega menu mới được dựng xong.
  // Điều này loại bỏ khoảng nhấp nháy khiến giao diện cũ lộ ra.
  panel.setAttribute('aria-busy','true');
  panel.style.visibility='hidden';
  panel.style.maxHeight='calc(100dvh - 92px)';

  await loadCanonicalManifest();
  makeMegaMenu();
  panel.style.visibility='visible';
  panel.setAttribute('aria-busy','false');
  dropdownBtn?.addEventListener('click',e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    dropdown.classList.contains('open')?closeDropdown():openDropdown();
    if(dropdown.classList.contains('open')){
      const active=panel.querySelector('.dd-level.active .dd-level-head')||panel.querySelector('.dd-level-head');
      active?.focus({preventScroll:true});
    }
  },true);
  document.addEventListener('click',e=>{
    if(dropdown.classList.contains('open')&&!dropdown.contains(e.target))closeDropdown();
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')closeDropdown();
  });
  panel.addEventListener('click',e=>{
    const link=e.target.closest('a');
    if(link&&link.closest('.hsk-mega-detail-list'))closeDropdown();
  });
}
readLearningState();
ensurePronunciationNav();
markCurrentNav();
setupMobileNav();
initHskMegaMenu().finally(injectBreadcrumb);
})();
