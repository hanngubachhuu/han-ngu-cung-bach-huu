(()=>{'use strict';
const S={d:{lessons:[],vocab:[],grammar:[],hanzi:[],questions:[]},tab:'overview',level:'all',lesson:'all',q:'',fc:{items:[],i:0,flip:false,known:{}},quiz:{pool:[],i:0,a:{},done:false}};
const $=x=>document.getElementById(x), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), uniq=(a,k)=>{let z=new Set(),o=[];for(const x of a){let v=k(x);if(!z.has(v)){z.add(v);o.push(x)}}return o};
const chars=s=>Array.from(String(s||'')).filter(c=>/[\u3400-\u9fff]/.test(c));
function stat(t,ok=false){let e=$('syncStatus');if(e){e.textContent=t;e.style.color=ok?'var(--green)':'var(--muted)'}}
function urls(h){return [...new Set(h.match(/(?:bvnh\d+-\d+|bai\d+_index)\.html/g)||[])]}
function lessonObj(h){
  let m=h.indexOf('const LESSON ='),st=h.indexOf('{',m),d=0,qu=null,es=false,lc=false,bc=false;
  if(m<0||st<0)throw Error('LESSON not found');
  for(let i=st;i<h.length;i++){let c=h[i],n=h[i+1];
    if(lc){if(c==='\n')lc=false;continue}
    if(bc){if(c==='*'&&n==='/'){bc=false;i++}continue}
    if(qu){if(es){es=false;continue}if(c==='\\'){es=true;continue}if(c===qu)qu=null;continue}
    if(c==='/'&&n==='/'){lc=true;i++;continue}if(c==='/'&&n==='*'){bc=true;i++;continue}
    if(c==='"'||c==="'"||c===String.fromCharCode(96)){qu=c;continue}
    if(c==='{')d++;else if(c==='}'){d--;if(d===0)return Function('"use strict";return ('+h.slice(st,i+1)+')')()}
  }throw Error('LESSON parse failed');
}
function lvl(l){let s=[l.title,l.zhTitle,l.titleVi,l.viSubtitle,l.subtitle,l.heroTitle,...(l.meta||[])].filter(Boolean).join(' '),m=s.match(/HSK\s*([1-9]\d?)/i);return m?'HSK '+m[1]:'Khác'}
function bn(l,u){let s=[l.id,l.title,l.zhTitle,l.viSubtitle,l.subtitle,...(l.meta||[]),u].filter(Boolean).join(' '),m=s.match(/(?:Bài|bai|hsk\d+_bai)[\s_-]?(\d+)/i);return m?+m[1]:(+(u.match(/bai(\d+)/i)||[])[1]||1)}
function qs(l,b,lv){
 let ss=Array.isArray(l.sections)?l.sections:[],map=Object.fromEntries(ss.map(x=>[x.id,x])),raw=[];
 if(Array.isArray(l.questions))raw.push(...l.questions.map(x=>({...x})));
 ss.forEach(s=>Array.isArray(s.questions)&&raw.push(...s.questions.map(x=>({...x,section:x.section||s.id,skill:x.skill||s.skill,sectionTitle:x.sectionTitle||s.title}))));
 return raw.map((x,i)=>({...x,id:String(x.id||'q'+i),bai:b,level:lv,skill:x.skill||map[x.section]?.skill||'Tổng hợp',sectionTitle:x.sectionTitle||map[x.section]?.title||'',answer:x.answer??x.correct}));
}
function vocab(l,qq,b){
 if(Array.isArray(l.vocab)&&l.vocab.length)return l.vocab.map(v=>({...v,bai:b}));
 let o=[];
 qq.forEach(x=>{
  const isVocab=String(x.skill||'').toLowerCase().includes('từ vựng');
  if(x.type==='matching'&&Array.isArray(x.terms)&&Array.isArray(x.optionsPool)&&x.correctMap){
   x.terms.forEach(t=>{let k=x.correctMap[t.id],op=x.optionsPool.find(a=>String(a.k)===String(k));if(t.zh&&op)o.push({han:t.zh,pinyin:'',nghia:op.t,bai:b,derived:true})});
  }
  if(x.type==='mcq'&&/nghĩa là gì/i.test(String(x.prompt||''))&&Array.isArray(x.options)){
   let m=String(x.prompt).match(/[\\u3400-\\u9fff]{1,12}/),a=x.answer??x.correct,op=x.options.find(o=>String(o.k)===String(a));if(m&&op)o.push({han:m[0],pinyin:'',nghia:op.t,bai:b,derived:true});
  }
  if(isVocab&&Array.isArray(x.options)){
   x.options.forEach(op=>{if(op&&typeof op.t==='string'&&/[\\u3400-\\u9fff]/.test(op.t))o.push({han:op.t.replace(/[^\\u3400-\\u9fff]/g,''),pinyin:'',nghia:'',bai:b,derived:true})});
  }
  if(isVocab&&Array.isArray(x.wordBank)){
   x.wordBank.forEach(w=>{if(typeof w==='string'&&/[\\u3400-\\u9fff]/.test(w))o.push({han:w,pinyin:'',nghia:'',bai:b,derived:true})});
  }
 });
 return uniq(o,v=>v.han+'|'+v.bai)
}
function norm(l,u){
 let b=bn(l,u),lv=lvl(l),title=l.zhTitle||l.title||u,c=l.content||{};
 let q=qs(l,b,lv);
 let v=Array.isArray(c.vocabulary)&&c.vocabulary.length?c.vocabulary.map(x=>({...x,bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title})):vocab(l,q,b).map(x=>({...x,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title}));
 let g=Array.isArray(c.grammar)&&c.grammar.length?c.grammar.map(x=>({...x,bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title})):Array.isArray(l.grammar)&&l.grammar.length?l.grammar.map(x=>({...x,bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title})):uniq((l.sections||[]).filter(s=>String(s.skill||'').toLowerCase().includes('ngữ pháp')).map(s=>({title:s.title||'Điểm ngữ pháp',desc:s.instruction||'',bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title,derived:true})),x=>x.title+'|'+x.bai);
 let hz=Array.isArray(c.hanzi)&&c.hanzi.length?c.hanzi.map(x=>({...x,bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title})):Array.isArray(l.hanzi)?l.hanzi.map(x=>({...x,bai:b,level:lv,lessonId:l.id||u,sourceHref:u,sourceTitle:title})):[];
 return {id:l.id||u,href:u,bai:b,level:lv,title,vi:l.titleVi||l.viSubtitle||l.subtitle||'',vocab:v,grammar:g,hanzi:hz,exampleSentences:c.exampleSentences||[],commonErrors:c.commonErrors||[],exerciseGroups:c.exercises||{},coverage:c.coverage||{},questions:q,content:c};
}
async function get(u){let r=await fetch(u+'?review='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(u);return norm(lessonObj(await r.text()),u)}
function agg(ls){
 let v=uniq(ls.flatMap(x=>x.vocab),x=>x.level+'|'+x.bai+'|'+x.han),g=uniq(ls.flatMap(x=>x.grammar),x=>x.level+'|'+x.bai+'|'+x.title),q=ls.flatMap(x=>x.questions),hm=new Map();
 ls.flatMap(x=>x.hanzi||[]).forEach(x=>{if(!x.char)return;hm.set(x.char,{...x,words:Array.isArray(x.words)?[...x.words]:[],levels:new Set([x.level]),bais:new Set([x.bai])})});
 v.forEach(x=>chars(x.han).forEach(c=>{if(!hm.has(c))hm.set(c,{char:c,words:[],levels:new Set(),bais:new Set()});let h=hm.get(c);if(!h.words.includes(x.han))h.words.push(x.han);h.levels.add(x.level);h.bais.add(x.bai)}));
 let h=[...hm.values()].map(x=>({...x,levels:[...x.levels],bais:[...x.bais]}));return{lessons:ls,vocab:v,grammar:g,questions:q,hanzi:h}
}
function filt(x){return(S.level==='all'||x.level===S.level)&&(S.lesson==='all'||x.lessonId===S.lesson)&&(!S.q||JSON.stringify(x).toLowerCase().includes(S.q.toLowerCase()))}
function stats(){[['statLessons',S.d.lessons.length],['statVocab',S.d.vocab.length],['statGrammar',S.d.grammar.length],['statHanzi',S.d.hanzi.length],['statQuestions',S.d.questions.length]].forEach(a=>$(a[0]).textContent=a[1])}
function filters(){let lv=uniq(S.d.lessons.map(x=>x.level),x=>x).sort();$('levelFilter').innerHTML='<option value="all">Tất cả cấp độ</option>'+lv.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');let l=S.d.lessons.filter(x=>S.level==='all'||x.level===S.level);$('lessonFilter').innerHTML='<option value="all">Tất cả bài học</option>'+l.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.level+' · Bài '+x.bai+' · '+x.title)+'</option>').join('');$('lessonFilter').value=S.lesson}
function overview(){let p=$('panel-overview'),ls=S.d.lessons.filter(x=>S.level==='all'||x.level);p.innerHTML='<div class="card"><h2>Kho ôn tập dùng chung</h2><p>Phần này không còn thuộc riêng HSK 2. Nó gom từ vựng, ngữ pháp, chữ Hán và bài tập từ các bài học thành một kho chung.</p><p><b>Luồng:</b> Bài học → dữ liệu LESSON → Ôn tập chung. Khi bài mới được thêm vào lộ trình trên trang chủ, hệ thống tự phát hiện và đọc dữ liệu bài đó.</p></div><div class="card"><h2>Các bài đang có</h2><div class="lesson-list">'+ls.map(x=>'<a class="lesson-link" href="'+esc(x.href)+'"><span><b>'+esc(x.level+' · Bài '+x.bai+' · '+x.title)+'</b><br><span class="mini">'+esc(x.vi)+' · '+x.questions.length+' câu</span></span><span>→</span></a>').join('')+'</div></div>'}
function vocabPanel(){let p=$('panel-vocab'),a=S.d.vocab.filter(filt);S.fc.items=a;if(S.fc.i>=a.length)S.fc.i=0;p.innerHTML='<div class="action-row"><button class="chip active">Thẻ từ vựng</button></div>'+(a.length?'<div id="flash"></div><div class="vocab-grid">'+a.map(x=>'<div class="item"><span class="tag">'+esc(x.level+' · Bài '+x.bai)+'</span><div class="han">'+esc(x.han)+'</div><div class="pin">'+esc(x.pinyin||'')+'</div><div class="meaning">'+esc(x.nghia||'')+'</div></div>').join('')+'</div>':'<div class="empty">Không có từ phù hợp.</div>');flash()}
function flash(){let p=$('flash'),a=S.fc.items;if(!p||!a.length)return;let v=a[S.fc.i%a.length],k=v.level+'|'+v.bai+'|'+v.han;p.innerHTML='<div class="fc"><div class="fc-count">'+(S.fc.i+1)+' / '+a.length+'</div><div class="fc-card '+(S.fc.flip?'flipped':'')+'" id="fcCard"><div class="fc-front"><div class="han">'+esc(v.han)+'</div><div class="pin">'+esc(v.pinyin||'Chưa có pinyin')+'</div><div class="mini">Chạm để lật thẻ</div></div><div class="fc-back"><div class="meaning">'+esc(v.nghia||'Chưa có nghĩa chuẩn hóa')+'</div><div class="mini">'+esc(v.level+' · Bài '+v.bai+' · '+v.sourceTitle)+'</div></div></div><div class="fc-actions"><button class="btn" id="fp">←</button><button class="btn btn-green" id="fk">'+(S.fc.known[k]?'✓ Đã nhớ':'✓ Đánh dấu đã nhớ')+'</button><button class="btn btn-primary" id="fn">→</button></div></div>';$('fcCard').onclick=()=>{S.fc.flip=!S.fc.flip;flash()};$('fp').onclick=()=>{S.fc.i=(S.fc.i-1+a.length)%a.length;S.fc.flip=false;flash()};$('fn').onclick=()=>{S.fc.i=(S.fc.i+1)%a.length;S.fc.flip=false;flash()};$('fk').onclick=()=>{S.fc.known[k]=!S.fc.known[k];localStorage.setItem('common_review_known',JSON.stringify(S.fc.known));flash()}}
function grammarPanel(){let p=$('panel-grammar'),a=S.d.grammar.filter(filt);p.innerHTML=a.length?a.map(x=>'<div class="item" style="margin-bottom:10px"><span class="tag">'+esc(x.level+' · Bài '+x.bai)+'</span><h3>'+esc(x.title)+'</h3><p>'+esc(x.desc||'')+'</p>'+(x.example?'<div style="background:var(--primary-soft);padding:9px;border-radius:8px">'+esc(x.example)+'</div>':'')+'</div>').join(''):'<div class="empty">Chưa có điểm ngữ pháp phù hợp.</div>'}
function hanziPanel(){let p=$('panel-hanzi'),b=S.d.lessons.find(x=>x.id===S.lesson)?.bai,a=S.d.hanzi.filter(x=>(S.level==='all'||x.levels.includes(S.level))&&(S.lesson==='all'||x.bais.includes(b))&&(!S.q||(x.char+' '+x.words.join(' ')+' '+(x.notes||'')).toLowerCase().includes(S.q.toLowerCase())));p.innerHTML='<div class="card"><p>Chữ Hán được tổng hợp từ từ vựng. Nhấn vào chữ đã có trang chi tiết để xem pinyin, bộ thủ, cấu tạo, thứ tự nét, nghĩa, từ ví dụ và ghi chú mở rộng.</p></div>'+(a.length?'<div class="hanzi-grid">'+a.map(x=>{let inner='<div class="item hanzi"><div class="char">'+esc(x.char)+'</div>'+(x.pinyin?'<div class="pin">'+esc(x.pinyin)+'</div>':'')+(x.meaning?'<div class="meaning">'+esc(x.meaning)+'</div>':'')+(x.radical||x.structure?'<div class="meta">'+esc([x.radical?'Bộ: '+x.radical:'',x.structure?'Cấu tạo: '+x.structure:''].filter(Boolean).join(' · '))+'</div>':'')+'<div class="meta">Từ: '+esc(x.words?.slice(0,4).join(' · ')||'')+(x.words&&x.words.length>4?' …':'')+'<br>'+esc(x.levels.join(' · '))+'</div>'+(x.notes?'<div class="meta" style="margin-top:6px">'+esc(x.notes)+'</div>':'')+'</div>';return x.char==='明'?'<a href="chu-han-ming.html" style="text-decoration:none;color:inherit">'+inner+'</a>':inner}).join('')+'</div>':'<div class="empty">Không có chữ Hán phù hợp.</div>')}
function ans(q){if(q.type==='mcq')return((q.options||[]).find(x=>String(x.k)===String(q.answer))||{}).t||String(q.answer||'');if(Array.isArray(q.answer))return q.answer.join(' / ');if(q.correctMap)return JSON.stringify(q.correctMap);return String(q.answer||'')}
function exercisePanel(){let p=$('panel-exercises'),a=S.d.questions.filter(filt).slice(0,100);p.innerHTML=a.length?'<div class="card"><p>Ngân hàng này lấy câu hỏi trực tiếp từ các bài học. Các dạng mở, dịch, giao tiếp hoặc chưa có bộ chấm riêng vẫn được giữ lại để xem đề và giải thích.</p></div>'+a.map(x=>'<div class="exercise"><div><span class="tag">'+esc(x.level+' · Bài '+x.bai)+'</span><span class="tag">'+esc(x.skill)+'</span></div><div class="prompt">'+esc(x.prompt||x.title||'')+'</div><button class="btn" type="button">Xem đáp án / giải thích</button><div class="answer"><b>Đáp án:</b> '+esc(ans(x))+(x.explain?'<br><br>'+esc(String(x.explain).replace(/<[^>]+>/g,' ')):'')+'</div></div>').join(''):'<div class="empty">Không có bài tập phù hợp.</div>';p.querySelectorAll('.exercise button').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'))}
function quizSetup(){let p=$('panel-quiz'),a=S.d.questions.filter(x=>filt(x)&&['mcq','text_fill'].includes(x.type));p.innerHTML='<div class="card quiz"><h2>Kiểm tra tổng hợp</h2><p>Trộn câu hỏi từ các bài học hiện có và chấm tự động.</p><button class="btn btn-primary" id="start">Bắt đầu 10 câu →</button><p class="mini">Có '+a.length+' câu đủ dữ liệu để chấm theo bộ lọc hiện tại.</p></div>';$('start').onclick=()=>{S.quiz.pool=a.sort(()=>Math.random()-.5).slice(0,Math.min(10,a.length));S.quiz.i=0;S.quiz.a={};S.quiz.done=false;qview()}}
function qview(){let p=$('panel-quiz'),q=S.quiz.pool[S.quiz.i];if(!q)return qresult();let h='<div class="card quiz"><div class="mini">Câu '+(S.quiz.i+1)+' / '+S.quiz.pool.length+' · '+esc(q.level+' · Bài '+q.bai)+' · '+esc(q.skill)+'</div><h2>'+esc(q.prompt||'')+'</h2>';if(q.type==='mcq')h+=(q.options||[]).map(o=>'<button class="quiz-opt '+(S.quiz.a[S.quiz.i]===o.k?'selected':'')+'" data-k="'+esc(o.k)+'">'+esc(o.k+'. '+o.t)+'</button>').join('');else h+='<input id="qi" class="quiz-input" value="'+esc(S.quiz.a[S.quiz.i]||'')+'" placeholder="Nhập câu trả lời…">';h+='<div class="action-row"><button class="btn btn-primary" id="qn">'+(S.quiz.i===S.quiz.pool.length-1?'Nộp bài':'Câu tiếp theo →')+'</button></div></div>';p.innerHTML=h;p.querySelectorAll('.quiz-opt').forEach(b=>b.onclick=()=>{S.quiz.a[S.quiz.i]=b.dataset.k;p.querySelectorAll('.quiz-opt').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')});let inp=$('qi');if(inp)inp.oninput=()=>S.quiz.a[S.quiz.i]=inp.value;$('qn').onclick=()=>{if(S.quiz.i<S.quiz.pool.length-1){S.quiz.i++;qview()}else{S.quiz.done=true;qresult()}}}
function grade(q,a){if(a==null)return false;if(q.type==='mcq')return String(a)===String(q.answer);if(q.type==='text_fill'){let n=s=>String(s||'').trim().toLowerCase();return(Array.isArray(q.answer)?q.answer:[q.answer]).some(x=>n(x)===n(a))}return false}
function qresult(){let c=0;S.quiz.pool.forEach((q,i)=>{if(grade(q,S.quiz.a[i]))c++});let p=$('panel-quiz'),pct=S.quiz.pool.length?Math.round(c*100/S.quiz.pool.length):0;p.innerHTML='<div class="result"><b>'+pct+'%</b><div>Đúng '+c+'/'+S.quiz.pool.length+' câu</div></div><button class="btn" id="retry">Làm lượt mới</button>';$('retry').onclick=quizSetup}
function render(){overview();vocabPanel();grammarPanel();hanziPanel();exercisePanel();if(S.tab==='quiz')quizSetup()}
function tab(t){S.tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+t));if(t==='quiz')quizSetup();window.scrollTo({top:0,behavior:'smooth'})}
function bind(){
 try{S.fc.known=JSON.parse(localStorage.getItem('common_review_known')||'{}')}catch(e){}
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 $('search').oninput=e=>{S.q=e.target.value.trim();render()};$('levelFilter').onchange=e=>{S.level=e.target.value;S.lesson='all';filters();render()};$('lessonFilter').onchange=e=>{S.lesson=e.target.value;render()};
 let b=$('siteNavBurger'),l=$('siteNavLinks'),dd=$('hskDropdown'),db=$('hskDropdownBtn');if(db&&dd)db.onclick=e=>{e.stopPropagation();let o=dd.classList.toggle('open');db.setAttribute('aria-expanded',o?'true':'false')};document.addEventListener('click',e=>{if(dd&&dd.classList.contains('open')&&!dd.contains(e.target)){dd.classList.remove('open');if(db)db.setAttribute('aria-expanded','false')}});if(b&&l)b.onclick=()=>{let o=l.classList.toggle('open');b.textContent=o?'✕':'☰';b.setAttribute('aria-expanded',o?'true':'false')};$('footerYear').textContent=new Date().getFullYear();let bt=$('siteBackTop');addEventListener('scroll',()=>bt.classList.toggle('visible',scrollY>400));bt.onclick=()=>scrollTo({top:0,behavior:'smooth'})
}
async function load(){
 stat('Đang đọc danh sách bài học…');let home=await(await fetch('trang-chu.html?review_manifest='+Date.now(),{cache:'no-store'})).text(),m=home.match(/<img[^>]+src="([^"]+)"[^>]*alt="Logo Hán Ngữ Cùng Bách Hữu"/);$('navLogo').innerHTML=m?'<img src="'+m[1]+'" alt="Hán Ngữ Cùng Bách Hữu" class="site-nav-logo-img">':'Hán Ngữ <span class="site-nav-brand-accent">Cùng Bách Hữu</span>';let r=await Promise.allSettled(urls(home).map(get)),ls=r.filter(x=>x.status==='fulfilled').map(x=>x.value).sort((a,b)=>a.bai-b.bai);if(!ls.length)throw Error('No lesson');S.d=agg(ls);filters();stats();render();stat('Đã đồng bộ '+ls.length+' bài học. Bài mới khi được thêm vào lộ trình trên trang chủ sẽ tự được đưa vào kho ôn tập.',true)
}
bind();load().catch(e=>{stat('Không đồng bộ được dữ liệu bài học. Kiểm tra cấu trúc LESSON của các trang bài.',false)});
})();