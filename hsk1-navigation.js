/* Add accessible HSK 1 navigation to the existing static/dynamic menus. */
(()=>{'use strict';
const FOOTER_CSS = `
/* ===== Hán Ngữ Cùng Bách Hữu · Footer System v2 ===== */
.site-footer-v2{
  position:relative;
  isolation:isolate;
  overflow:hidden;
  margin-top:48px !important;
  color:#F8F5EE;
  background:#26343F;
  border-top:1px solid rgba(214,137,16,.45);
}
.site-footer-v2::before{
  content:"";
  position:absolute;left:0;right:0;top:0;height:4px;
  background:#C0392B;
}
.site-footer-v2::after{
  content:"学  ·  汉  ·  习  ·  礼";
  position:absolute;right:24px;top:18px;
  color:rgba(255,255,255,.045);
  font-family:"Songti SC","Noto Serif SC","STSong",serif;
  font-size:42px;font-weight:700;letter-spacing:.35em;
  pointer-events:none;user-select:none;
}
.site-footer-v2 .site-footer-inner{
  position:relative;z-index:1;
  width:min(1100px,calc(100% - 40px));
  margin:0 auto !important;
  padding:58px 0 30px !important;
  display:grid !important;
  grid-template-columns:minmax(250px,1.45fr) minmax(140px,.8fr) minmax(160px,.9fr) minmax(190px,1fr) !important;
  gap:34px !important;
}
.site-footer-v2 .footer-v2-brand{
  display:flex;align-items:flex-start;gap:14px;
}
.site-footer-v2 .footer-v2-seal{
  width:48px;height:48px;flex:0 0 48px;
  display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(214,137,16,.7);
  border-radius:14px;
  color:#F4C56E;
  font-family:"Songti SC","Noto Serif SC","STSong",serif;
  font-size:28px;font-weight:700;
  background:rgba(255,255,255,.04);
  box-shadow:0 8px 22px rgba(0,0,0,.14);
}
.site-footer-v2 .footer-v2-kicker{
  margin:0 0 4px;
  color:#F4C56E;
  font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;
}
.site-footer-v2 .footer-v2-title{
  margin:0;
  color:#FFFDF8;
  font-size:20px;font-weight:800;line-height:1.25;
}
.site-footer-v2 .footer-v2-quote{
  margin:16px 0 8px;
  color:#FFFDF8;
  font-family:"Songti SC","Noto Serif SC","STSong",serif;
  font-size:15px;line-height:1.7;
}
.site-footer-v2 .footer-v2-desc{
  margin:0;
  max-width:390px;
  color:rgba(248,245,238,.72);
  font-size:13px;line-height:1.8;
}
.site-footer-v2 .footer-v2-loop{
  display:flex;flex-wrap:wrap;gap:7px;margin-top:16px;
}
.site-footer-v2 .footer-v2-loop span{
  display:inline-flex;align-items:center;min-height:30px;
  padding:4px 9px;border:1px solid rgba(255,255,255,.12);
  border-radius:999px;color:rgba(248,245,238,.84);
  font-size:11px;background:rgba(255,255,255,.035);
}
.site-footer-v2 .footer-v2-col h4{
  margin:2px 0 14px;color:#FFFDF8;
  font-size:12.5px;font-weight:800;letter-spacing:.06em;
}
.site-footer-v2 .footer-v2-col a{
  display:flex;align-items:center;gap:7px;
  width:fit-content;max-width:100%;
  min-height:36px;padding:5px 0;
  color:rgba(248,245,238,.72);
  text-decoration:none;font-size:13px;line-height:1.4;
  border-radius:8px;
  transition:color .18s ease,transform .18s ease;
}
.site-footer-v2 .footer-v2-col a::before{
  content:"";
  width:5px;height:5px;flex:0 0 5px;border-radius:50%;
  background:rgba(244,197,110,.55);
  transition:background .18s ease,transform .18s ease;
}
.site-footer-v2 .footer-v2-col a:hover,
.site-footer-v2 .footer-v2-col a[aria-current="page"]{
  color:#FFFDF8;transform:translateX(2px);
}
.site-footer-v2 .footer-v2-col a:hover::before,
.site-footer-v2 .footer-v2-col a[aria-current="page"]::before{
  background:#C0392B;transform:scale(1.45);
}
.site-footer-v2 .footer-v2-feature{
  margin-top:4px;
  padding:14px 14px 13px;
  border:1px solid rgba(214,137,16,.35);
  border-radius:14px;
  background:rgba(255,255,255,.045);
}
.site-footer-v2 .footer-v2-feature strong{
  display:block;color:#FFFDF8;font-size:13px;margin-bottom:4px;
}
.site-footer-v2 .footer-v2-feature span{
  display:block;color:rgba(248,245,238,.68);font-size:11.5px;line-height:1.6;
}
.site-footer-v2 .footer-v2-feature a{
  min-height:34px;margin-top:7px;color:#F4C56E;font-weight:800;
}
.site-footer-v2 .footer-v2-feature a::before{background:#F4C56E;}
.site-footer-v2 .site-footer-bottom{
  position:relative;z-index:1;
  width:min(1100px,calc(100% - 40px));
  margin:0 auto !important;
  padding:16px 0 20px !important;
  border-top:1px solid rgba(255,255,255,.11) !important;
  color:rgba(248,245,238,.5) !important;
  display:flex;align-items:center;justify-content:space-between;gap:18px;
  font-size:11px !important;text-align:left !important;
}
.site-footer-v2 .footer-v2-bottom-note{line-height:1.6;}
.site-footer-v2 .footer-v2-back{
  display:inline-flex;align-items:center;justify-content:center;
  min-height:38px;padding:8px 13px;
  border:1px solid rgba(255,255,255,.16);border-radius:999px;
  color:rgba(248,245,238,.78);text-decoration:none;font-size:11px;font-weight:700;
  transition:border-color .18s ease,color .18s ease,transform .18s ease;
}
.site-footer-v2 .footer-v2-back:hover{
  color:#FFFDF8;border-color:rgba(244,197,110,.6);transform:translateY(-1px);
}
.site-footer-v2 a:focus-visible{
  outline:2px solid #F4C56E;outline-offset:3px;
}
@media (prefers-reduced-motion:reduce){
  .site-footer-v2 *{transition:none !important;}
}
@media (max-width:920px){
  .site-footer-v2 .site-footer-inner{
    grid-template-columns:1.4fr 1fr 1fr !important;
  }
  .site-footer-v2 .footer-v2-feature{grid-column:2 / -1;}
}
@media (max-width:700px){
  .site-footer-v2::after{right:8px;font-size:30px;top:22px;}
  .site-footer-v2 .site-footer-inner{
    width:min(calc(100% - 28px),620px);
    padding:48px 0 24px !important;
    grid-template-columns:1fr 1fr !important;
    gap:26px 20px !important;
  }
  .site-footer-v2 .footer-v2-brand{grid-column:1 / -1;}
  .site-footer-v2 .footer-v2-feature{grid-column:1 / -1;}
  .site-footer-v2 .site-footer-bottom{
    width:min(calc(100% - 28px),620px);
    padding:14px 0 18px !important;
    flex-direction:column;align-items:flex-start;
  }
}
@media (max-width:460px){
  .site-footer-v2 .site-footer-inner{grid-template-columns:1fr !important;}
  .site-footer-v2 .footer-v2-brand,
  .site-footer-v2 .footer-v2-feature{grid-column:auto;}
  .site-footer-v2 .footer-v2-col a{min-height:38px;}
}
`;
function injectFooterStyles(){
  if(document.getElementById('siteFooterV2Styles')) return;
  const style=document.createElement('style');
  style.id='siteFooterV2Styles';
  style.textContent=FOOTER_CSS;
  document.head.appendChild(style);
}
function enhanceSiteFooter(){
  injectFooterStyles();
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
function setupMobileNav(){
  if(!burger||!navLinks)return;
  burger.setAttribute('aria-haspopup','true');
  burger.addEventListener('click',e=>{
    e.stopPropagation();
    const open=navLinks.classList.toggle('open');
    burger.textContent=open?'✕':'☰';
    burger.setAttribute('aria-expanded',open?'true':'false');
    if(!open)closeDropdown();
  });
  navLinks.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click',()=>{
      navLinks.classList.remove('open');
      burger.textContent='☰';
      burger.setAttribute('aria-expanded','false');
    });
  });
}
function makeMegaMenu(){
  if(!panel||panel.dataset.megaReady==='1')return;
  const originalLevels=[...panel.querySelectorAll('.dd-level')];
  const review=panel.querySelector('.dd-review-link');
  const levels=originalLevels.filter(level=>{
    const badge=level.querySelector('.dd-level-badge')?.textContent?.trim()||'';
    return /^[1-6]$/.test(badge);
  });
  if(!levels.length)return;

  panel.innerHTML='';
  panel.classList.add('hsk-mega-panel');
  const levelCol=document.createElement('div');
  levelCol.className='hsk-mega-levels';
  const detail=document.createElement('section');
  detail.className='hsk-mega-detail';
  detail.setAttribute('aria-live','polite');
  detail.setAttribute('aria-label','Chương trình cấp HSK đang chọn');

  const makeDetail=(level,index)=>{
    const badge=level.querySelector('.dd-level-badge')?.textContent?.trim()||'';
    const title=level.querySelector('.dd-level-name')?.textContent?.trim()||('HSK '+badge);
    const lessons=[...level.querySelectorAll('.dd-level-lessons a')];
    const soon=!!level.querySelector('.dd-level-soon');
    detail.innerHTML='';
    const head=document.createElement('div');
    head.className='hsk-mega-detail-head';
    const badgeEl=document.createElement('div');
    badgeEl.className='hsk-mega-detail-badge';
    badgeEl.textContent=badge;
    badgeEl.setAttribute('aria-hidden','true');
    const headText=document.createElement('div');
    const kicker=document.createElement('div');
    kicker.className='hsk-mega-detail-kicker';
    kicker.textContent='LỘ TRÌNH HSK';
    const titleEl=document.createElement('h3');
    titleEl.className='hsk-mega-detail-title';
    titleEl.textContent=title;
    const sub=document.createElement('p');
    sub.className='hsk-mega-detail-sub';
    sub.textContent=lessons.length
      ? 'Chọn bài học để mở trực tiếp chương trình cấp này.'
      : (soon?'Chương trình đang được chuẩn bị.':'Chưa có bài học được công bố.');
    headText.append(kicker,titleEl,sub);
    head.append(badgeEl,headText);
    detail.appendChild(head);

    if(lessons.length){
      const list=document.createElement('div');
      list.className='hsk-mega-detail-list';
      lessons.forEach(a=>{
        const clone=a.cloneNode(true);
        list.appendChild(clone);
      });
      detail.appendChild(list);
    }else{
      const empty=document.createElement('div');
      empty.className='hsk-mega-detail-empty';
      empty.innerHTML='<div><strong>HSK '+badge+'</strong>Chương trình sẽ được bổ sung vào lộ trình chung.</div>';
      detail.appendChild(empty);
    }
    levelCol.querySelectorAll('.dd-level').forEach(x=>x.classList.remove('active'));
    levelCol.querySelectorAll('.dd-level-head').forEach(x=>x.setAttribute('aria-expanded','false'));
    const visibleLevel=levelCol.querySelector('[data-level-index="'+index+'"]');
    visibleLevel?.classList.add('active');
    visibleLevel?.querySelector('.dd-level-head')?.setAttribute('aria-expanded','true');
  };

  levels.forEach((level,index)=>{
    const copy=level.cloneNode(true);
    copy.querySelector('.dd-level-lessons')?.remove();
    copy.classList.add('dd-level');
    copy.setAttribute('data-level-index',String(index));
    const head=copy.querySelector('.dd-level-head');
    if(!head)return;
    head.setAttribute('role','button');
    head.setAttribute('tabindex','0');
    head.setAttribute('aria-expanded','false');
    const badge=copy.querySelector('.dd-level-badge')?.textContent?.trim()||'';
    head.setAttribute('aria-label','Xem chương trình HSK '+badge);
    levelCol.appendChild(copy);

    const activate=()=>makeDetail(level,index);
    copy.addEventListener('mouseenter',()=>{
      if(window.matchMedia('(hover: hover)').matches)activate();
    });
    copy.addEventListener('focusin',activate);
    head.addEventListener('click',e=>{
      e.preventDefault();
      if(!window.matchMedia('(hover: hover)').matches)activate();
    });
    head.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}
      if(e.key==='ArrowDown'){
        e.preventDefault();
        levels[Math.min(index+1,levels.length-1)].querySelector('.dd-level-head')?.focus();
      }
      if(e.key==='ArrowUp'){
        e.preventDefault();
        levels[Math.max(index-1,0)].querySelector('.dd-level-head')?.focus();
      }
    });
  });

  if(review){
    const reviewClone=review.cloneNode(true);
    reviewClone.className='dd-review-link hsk-mega-review';
    panel.append(levelCol,detail,reviewClone);
  }else{
    panel.append(levelCol,detail);
  }
  panel.dataset.megaReady='1';
  makeDetail(levels[0],0);
}
function initHskMegaMenu(){
  if(!panel||!dropdown)return;
  panel.style.maxHeight='calc(100dvh - 92px)';
  makeMegaMenu();
  dropdownBtn?.addEventListener('click',e=>{
    e.stopPropagation();
    dropdown.classList.contains('open')?closeDropdown():openDropdown();
    if(dropdown.classList.contains('open')){
      const active=panel.querySelector('.dd-level.active .dd-level-head')||panel.querySelector('.dd-level-head');
      active?.focus({preventScroll:true});
    }
  });
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
setupMobileNav();
initHskMegaMenu();
})();
