(()=>{'use strict';
const S={d:{lessons:[],vocab:[],grammar:[],hanzi:[],questions:[]},tab:'overview',level:'all',lesson:'all',q:'',fc:{items:[],i:0,flip:false,known:{}},quiz:{pool:[],i:0,a:{},done:false}};
const $=x=>document.getElementById(x), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), uniq=(a,k)=>{let z=new Set(),o=[];for(const x of a){let v=k(x);if(!z.has(v)){z.add(v);o.push(x)}}return o};
const chars=s=>Array.from(String(s||'')).filter(c=>/[\u3400-\u9fff]/.test(c));
function stat(t,ok=false){let e=$('syncStatus');if(e){e.textContent=t;e.style.color=ok?'var(--green)':'var(--muted)'}}
async function load(){
 stat('Đang đọc kho dữ liệu bài học…');
 const raw=await window.HAN_NGU_DATA.loadAll();
 const ls=raw.map(window.HAN_NGU_DATA.prepare).sort((a,b)=>{
   const av=a.content?.course?.level||99,bv=b.content?.course?.level||99;
   const an=a.content?.course?.lessonNo||99,bn=b.content?.course?.lessonNo||99;
   return av-bv||an-bn;
 });
 if(!ls.length)throw Error('No lesson');
 S.d=agg(ls);
 filters();stats();render();
 stat('Đã đồng bộ '+ls.length+' bài học từ lesson registry.',true);
}
bind();load().catch(e=>{stat('Không đồng bộ được dữ liệu bài học. Kiểm tra cấu trúc LESSON của các trang bài.',false)});
})();