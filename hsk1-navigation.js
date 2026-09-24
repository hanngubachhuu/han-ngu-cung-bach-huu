/* Add accessible HSK 1 and pronunciation navigation to existing menus. */
(()=>{'use strict';
const panel=document.getElementById('hskDropdownPanel');
if(!panel)return;
panel.style.maxHeight='calc(100dvh - 92px)';panel.style.overflowY='auto';
function enhance(){
  panel.querySelectorAll('.dd-level').forEach(level=>{
    const head=level.querySelector('.dd-level-head'),badge=level.querySelector('.dd-level-badge');
    if(head&&badge?.textContent.trim()==='PA'){
      const link=document.createElement('a');link.className='dd-level-head';link.href='pinyin.html';link.style.cssText='color:inherit;text-decoration:none';
      link.innerHTML='<span class="dd-level-name"><span class="dd-level-badge">PA</span>Phát âm</span><span class="dd-level-tag">Bảng Pinyin · Vào học →</span>';
      head.replaceWith(link);return;
    }
    if(!head||!level.querySelector('.dd-level-lessons'))return;
    head.setAttribute('role','button');head.tabIndex=0;head.setAttribute('aria-expanded',String(level.classList.contains('open')));
    if(badge?.textContent.trim()==='1'){
      level.dataset.level='hsk1';
      const list=level.querySelector('.dd-level-lessons');
      if(!list.querySelector('a[href="on-tap-hsk1.html"]')){const a=document.createElement('a');a.href='on-tap-hsk1.html';a.textContent='Ôn tập HSK 1 →';list.prepend(a);}
    }
  });
  document.querySelectorAll('#levelGrid .level-card').forEach(card=>{
    if(card.querySelector('.level-card-badge')?.textContent.trim()!=='PA')return;
    const head=card.querySelector('.level-card-head');if(!head)return;
    const link=document.createElement('a');link.className='level-card-head';link.href='pinyin.html';link.style.cssText='color:inherit;text-decoration:none';
    link.innerHTML='<span class="level-card-badge">PA</span><span class="level-card-info"><h3>Phát âm</h3><p>Bảng Pinyin · âm mẫu · khẩu hình</p></span><span class="level-card-meta">Vào học →</span>';
    head.replaceWith(link);card.classList.add('has-lessons');
  });
}
enhance();
function toggle(button,container){if(!container)return;const open=container.classList.toggle('open');button.setAttribute('aria-expanded',String(open));if(button.id==='siteNavBurger')button.textContent=open?'✕':'☰';}
// Capture avoids double toggles on pages with their own navigation listeners.
document.addEventListener('click',e=>{
  const button=e.target.closest?.('#hskDropdownBtn,#siteNavBurger,#hskDropdownPanel .dd-level-head');
  if(!button)return;
  if(button.classList.contains('dd-level-head')&&!button.parentElement.querySelector('.dd-level-lessons'))return;
  e.preventDefault();e.stopImmediatePropagation();
  toggle(button,button.id==='hskDropdownBtn'?document.getElementById('hskDropdown'):button.id==='siteNavBurger'?document.getElementById('siteNavLinks'):button.parentElement);
},true);
document.addEventListener('keydown',e=>{
  const head=e.target.closest?.('#hskDropdownPanel .dd-level-head');
  if(head&&head.parentElement.querySelector('.dd-level-lessons')&&['Enter',' '].includes(e.key)){e.preventDefault();head.click();}
  if(e.key==='Escape'){
    document.getElementById('hskDropdown')?.classList.remove('open');document.getElementById('hskDropdownBtn')?.setAttribute('aria-expanded','false');
    document.getElementById('siteNavLinks')?.classList.remove('open');const burger=document.getElementById('siteNavBurger');if(burger){burger.textContent='☰';burger.setAttribute('aria-expanded','false');}
  }
});
document.addEventListener('click',e=>{
  const dd=document.getElementById('hskDropdown');
  if(dd&&!dd.contains(e.target)){dd.classList.remove('open');document.getElementById('hskDropdownBtn')?.setAttribute('aria-expanded','false');}
});
})();
