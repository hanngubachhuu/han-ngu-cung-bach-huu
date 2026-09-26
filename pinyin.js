/* Pronunciation workspace: local media, basic sounds, syllable chart and listening practice. */
(()=>{'use strict';
const D=window.HNBH_PINYIN,A=window.HNBH_PINYIN_AUDIO,B=window.HNBH_PINYIN_BASICS,$=id=>document.getElementById(id);
if(!D||!A||!B){$('chartSummary').textContent='Bảng âm chưa tải được. Hãy tải lại trang.';return;}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const basicById=new Map(B.sounds.map(s=>[s.id,s]));
const byBase=new Map(D.syllables.map(s=>[s.base,s]));
const key=(base,tone)=>base.replace(/ü/g,'v')+tone;
const hasAudio=(base,tone)=>Boolean(A[key(base,tone)]);
const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const storeKey='hnbh_pinyin_v1';let stored={},storageOK=true;
function storageWarning(){storageOK=false;$('storageNote').hidden=false;$('storageNote').textContent='Trình duyệt đang chặn lưu dữ liệu. Em vẫn học được trong phiên này; âm đã đánh dấu và kết quả có thể mất khi đóng trang.';}
try{const value=JSON.parse(localStorage.getItem(storeKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))stored=value;}catch{storageWarning();}
const saved=new Set((Array.isArray(stored.saved)?stored.saved:[]).filter(x=>byBase.has(x)));
const basicSaved=new Set((Array.isArray(stored.basicSaved)?stored.basicSaved:[]).filter(id=>basicById.has(id)));
const best={};
for(const mode of ['tones',...D.contrastGroups.map(g=>g.id)])if(Number.isInteger(stored.best?.[mode])&&stored.best[mode]>=0&&stored.best[mode]<=10)best[mode]=stored.best[mode];
function persist(){if(!storageOK)return;try{localStorage.setItem(storeKey,JSON.stringify({version:1,saved:[...saved],basicSaved:[...basicSaved],best}));}catch{storageWarning();}}

// One player and cancellable queue prevent overlapping samples when changing tones or views.
const audio=document.createElement('audio');audio.id='pinyinSample';audio.preload='none';audio.hidden=true;document.body.append(audio);
let playback=0,cancelStep=null,playStatus=null;
function stopPlayback(message=''){
 playback++;if(cancelStep){cancelStep();cancelStep=null;}audio.pause();audio.removeAttribute('src');audio.load();
 if(playStatus&&message)playStatus(message);playStatus=null;
}
function waitGap(ms,ticket){return new Promise(resolve=>{const timer=setTimeout(()=>{cancelStep=null;resolve(ticket===playback);},ms);cancelStep=()=>{clearTimeout(timer);resolve(false);};});}
function playOne(src,ticket,speed){return new Promise(resolve=>{
 let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);audio.onended=null;audio.onerror=null;cancelStep=null;resolve(value);};
 const timer=setTimeout(()=>finish('error'),20000);cancelStep=()=>finish('cancelled');
 audio.onended=()=>finish('ended');audio.onerror=()=>finish('error');
 audio.src=src;audio.playbackRate=speed;audio.preservesPitch=true;
 try{const request=audio.play();if(request)request.catch(()=>finish(ticket===playback?'error':'cancelled'));}catch{finish('error');}
});}
async function playQueue(keys,{status,speed=1,onComplete}={}){
 stopPlayback('Đã dừng âm trước.');stopBasic();const ticket=playback;playStatus=status;
 for(let i=0;i<keys.length;i++){
  if(ticket!==playback)return false;
  const src=A[keys[i]];if(!src){status?.('Chưa có bản thu của âm này.');playStatus=null;return false;}
  status?.(keys.length>1?`Đang nghe mẫu ${i+1}/${keys.length}…`:'Đang nghe âm mẫu…');
  const result=await playOne(src,ticket,speed);
  if(ticket!==playback||result==='cancelled')return false;
  if(result==='error'){audio.pause();status?.('Không phát được âm thanh. Kiểm tra kết nối rồi bấm nghe lại.');playStatus=null;return false;}
  if(i<keys.length-1&&!await waitGap(450,ticket))return false;
 }
 if(ticket!==playback)return false;status?.('Đã nghe xong.');playStatus=null;onComplete?.();return true;
}

let initial='all',view=matchMedia('(max-width:600px)').matches?'cards':'table',visible=[],selected=null,tone=1,dialogTrigger=null,pendingBasic=null;
$('chartSummary').textContent=`${D.syllables.length} âm tiết trong bảng học. Chọn một ô để nghe từng thanh, xem cách ghép và lưu âm cần luyện.`;
$('initialFilters').innerHTML=[['all','Tất cả'],...Object.keys(D.rows).map(x=>[x,x])].map(([v,t])=>`<button type="button" data-initial="${v}" aria-pressed="${v===initial}">${t}</button>`).join('');
function matchesGroup(final,group){return group==='all'||(group==='open'?!/^[iuü]/.test(final):final.startsWith(group));}
function syllableButton(s){const favorite=saved.has(s.base);return `<button type="button" data-syllable="${escape(s.base)}" class="${favorite?'saved':''}" aria-label="Âm ${escape(s.base)}${favorite?', cần luyện thêm':''}">${escape(s.base)}</button>`;}
function renderChart(){
 const query=D.normalize($('syllableSearch').value),group=$('finalFilter').value;
 visible=D.syllables.filter(s=>(initial==='all'||initial===s.initial)&&(!query||s.base.includes(query))&&matchesGroup(s.final,group)&&(!$('onlySaved').checked||saved.has(s.base)));
 $('savedCount').textContent=saved.size;$('filterCount').textContent=`${visible.length} / ${D.syllables.length} âm tiết${$('onlySaved').checked?' · đã đánh dấu':''}`;
 for(const b of $('initialFilters').children)b.setAttribute('aria-pressed',String(b.dataset.initial===initial));
 $('tableView').setAttribute('aria-pressed',String(view==='table'));$('cardsView').setAttribute('aria-pressed',String(view==='cards'));
 $('matrixWrap').hidden=view!=='table'||!visible.length;$('syllableCards').hidden=view!=='cards'||!visible.length;$('noResults').hidden=Boolean(visible.length);
 if(view==='cards'){$('syllableCards').innerHTML=visible.map(syllableButton).join('');return;}
 const columns=D.finals.filter(f=>visible.some(s=>s.final===f)),rowKeys=Object.keys(D.rows).filter(r=>visible.some(s=>s.initial===r));
 const cells=new Map(visible.map(s=>[s.initial+'|'+s.final,s]));
 $('matrix').innerHTML=`<table class="pinyin-matrix"><caption>Bảng ghép thanh mẫu và vận mẫu. Chọn âm tiết để nghe.</caption><thead><tr><th scope="col">声 / 韵</th>${columns.map(f=>`<th scope="col">${f}</th>`).join('')}</tr></thead><tbody>${rowKeys.map(r=>`<tr><th scope="row">${r}</th>${columns.map(f=>{const s=cells.get(r+'|'+f);return s?`<td>${syllableButton(s)}</td>`:'<td class="empty" aria-label="Không ghép">·</td>';}).join('')}</tr>`).join('')}</tbody></table>`;
}
function searchTone(){const v=$('syllableSearch').value;const digit=v.match(/[1-5]$/);if(digit)return Number(digit[0]);for(const [i,marks]of ['āēīōūǖ','áéíóúǘ','ǎěǐǒǔǚ','àèìòùǜ'].entries())if([...v].some(c=>marks.includes(c)))return i+1;return 1;}
$('initialFilters').addEventListener('click',e=>{const b=e.target.closest('[data-initial]');if(b){initial=b.dataset.initial;renderChart();}});
for(const id of ['syllableSearch','finalFilter','onlySaved'])$(id).addEventListener(id==='syllableSearch'?'input':'change',renderChart);
for(const v of ['table','cards'])$(v+'View').addEventListener('click',()=>{view=v;renderChart();});
$('resetFilters').addEventListener('click',()=>{initial='all';$('syllableSearch').value='';$('finalFilter').value='all';$('onlySaved').checked=false;renderChart();});
for(const id of ['matrix','syllableCards'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-syllable]');if(b)openSyllable(b.dataset.syllable,searchTone(),b);});
function spellingFor(s){
 if(s.final==='-i')return 'Chữ i ở đây ghi nguyên âm khác với i trong yi, bi, mi. Hãy giữ vị trí lưỡi của thanh mẫu khi nghe và đọc theo.';
 if(s.final.startsWith('ü')&&/^[jqxy]/.test(s.base))return 'Quy tắc viết: ü bỏ hai chấm sau j, q, x và trong nhóm yu. Vị trí lưỡi vẫn thuộc nhóm ü.';
 if(s.initial==='∅'&&/^[yw]/.test(s.base))return 'Quy tắc viết: âm tiết không có thanh mẫu dùng y hoặc w theo quy định chính tả. Ví dụ i → yi, ian → yan, u → wu, uei → wei.';
 if(['iou','uei','uen'].includes(s.final))return `Sau thanh mẫu, ${s.final} viết rút gọn thành ${{iou:'iu',uei:'ui',uen:'un'}[s.final]}. Chú ý cách đặt dấu trong ${D.toned(s.base,2)}.`;
 if(s.base.includes('ü'))return 'Giữ hai chấm của ü sau n và l, kể cả khi thêm dấu thanh: nǚ, lǜ. Hai chấm giúp phân biệt với nu, lu.';
 return 'Nghe cả âm tiết trong một nhịp; không chèn thêm nguyên âm giữa thanh mẫu và vận mẫu.';
}
function renderTone(){
 if(!selected)return;const s=selected;$('syllableTitle').textContent=D.toned(s.base,tone);
 $('syllableParts').textContent=`Thanh mẫu: ${s.initial==='∅'?'∅ (âm đầu rỗng)':s.initial} · Vận mẫu: ${s.final}`;
 $('toneOptions').innerHTML=[1,2,3,4,5].map(n=>`<button type="button" data-tone="${n}" aria-pressed="${n===tone}">${D.toned(s.base,n)}<small>${n===5?'Thanh nhẹ':'Thanh '+n}</small></button>`).join('');
 $('toneDescription').textContent=tone===5?'Thanh nhẹ đọc ngắn, nhẹ; độ cao phụ thuộc âm đứng trước. Hãy luyện trong từ như māma (妈妈), nǐmen (你们), không đọc thành một thanh cố định.':D.tones[tone-1].description;
 $('playSyllable').disabled=!hasAudio(s.base,tone);$('playAllTones').disabled=![1,2,3,4].every(n=>hasAudio(s.base,n));
 $('audioStatus').textContent=tone===5?'Chưa có mẫu thanh nhẹ trong từ hoặc câu ở mục này.':!hasAudio(s.base,tone)?'Chưa có bản thu cho âm + thanh này. Em có thể xem video hướng dẫn.':'';
 $('initialTip').textContent=D.initialTips[s.initial];$('finalTip').textContent=D.finalTip(s.final);$('spellingNote').textContent=spellingFor(s);
 const favorite=saved.has(s.base);$('saveSyllable').setAttribute('aria-pressed',String(favorite));$('saveSyllable').textContent=favorite?'★ Đã lưu để luyện':'☆ Cần luyện thêm';
 const related=[...new Set([s.initial,({iou:'iu',uei:'ui',uen:'un',ü:'v',üe:'ve',ün:'vn'})[s.final]||s.final])].filter(id=>basicById.has(id));
 $('dialogRelated').innerHTML=related.map(id=>`<button type="button" class="button secondary" data-related="${id}">${basicById.get(id).video?'Khẩu hình':'Nghe âm'} ${escape(basicById.get(id).symbol)}</button>`).join('');
}
function openSyllable(base,n=1,trigger=document.activeElement){
 const s=byBase.get(base);if(!s)return;stopPlayback('Đã dừng.');stopBasic();selected=s;tone=n;dialogTrigger=trigger;renderTone();
 if(!$('syllableDialog').open)$('syllableDialog').showModal();$('closeDialog').focus();
}
function playSelected(all=false){if(!selected)return;const keys=all?[1,2,3,4].map(n=>key(selected.base,n)):Array($('repeatAudio').checked?3:1).fill(key(selected.base,tone));playQueue(keys,{status:message=>$('audioStatus').textContent=message,speed:Number($('audioSpeed').value)});}
$('toneOptions').addEventListener('click',e=>{const b=e.target.closest('[data-tone]');if(!b)return;stopPlayback();tone=Number(b.dataset.tone);renderTone();$('toneOptions').querySelector(`[data-tone="${tone}"]`).focus();if(hasAudio(selected.base,tone))playSelected();});
$('playSyllable').addEventListener('click',()=>playSelected());$('playAllTones').addEventListener('click',()=>playSelected(true));
$('stopAudio').addEventListener('click',()=>stopPlayback('Đã dừng âm thanh.'));
$('audioSpeed').addEventListener('change',()=>{audio.playbackRate=Number($('audioSpeed').value);});
$('saveSyllable').addEventListener('click',()=>{if(!selected)return;if(saved.has(selected.base))saved.delete(selected.base);else saved.add(selected.base);persist();renderTone();renderChart();});
$('closeDialog').addEventListener('click',()=>$('syllableDialog').close());
$('syllableDialog').addEventListener('close',()=>{
 stopPlayback();
 if(pendingBasic){const id=pendingBasic;pendingBasic=null;switchPanel('basics');openBasic(id,true);return;}
 if(dialogTrigger?.isConnected)dialogTrigger.focus();else $('syllableSearch').focus();
});
$('toneCards').innerHTML=D.tones.map(t=>`<button class="tone-card" type="button" data-ma="${t.n}" aria-label="Nghe ${D.toned('ma',t.n)}, ${t.name}"><h3>${t.name}</h3><svg viewBox="0 0 120 90" aria-hidden="true"><path class="curve-guide" d="M 10 12 H 110 M 10 42 H 110 M 10 72 H 110"/><path class="curve" d="${t.path}"/></svg><span class="tone-symbol">${D.toned('ma',t.n)} <small>${t.contour}</small></span><p>${t.description}</p><small>▷ Nghe âm mẫu</small></button>`).join('');
$('toneCards').addEventListener('click',e=>{const b=e.target.closest('[data-ma]');if(b){openSyllable('ma',Number(b.dataset.ma),b);playSelected();}});
$('compareMa').addEventListener('click',e=>{openSyllable('ma',1,e.currentTarget);playSelected(true);});

// Basic sounds use one local video and one audio element, with a single active media run.
const basicVideo=$('basicVideo'),basicAudio=document.createElement('audio');
basicAudio.id='basicAudio';basicAudio.preload='none';basicAudio.hidden=true;document.body.append(basicAudio);
const smallScreen=matchMedia('(max-width:850px)');
let basicCurrent=basicById.get('a'),basicGroup='all',basicVisible=[...B.sounds],basicTrigger=null;
let basicRun=0,basicTimer=null,basicActive=null,basicRepeats=0,videoFailed=false;
function stopBasic(){
 basicRun++;clearTimeout(basicTimer);basicTimer=null;basicActive=null;basicRepeats=0;
 basicVideo.pause();basicAudio.pause();
 basicPlayLabel(false);
}
function basicPlayLabel(playing){$('playBasic').innerHTML=playing?'<span aria-hidden="true">Ⅱ</span> Tạm dừng':'<span aria-hidden="true">▷</span> Phát mẫu';}
function basicTip(s){
 if(s.group==='initials')return D.initialTips[s.id];
 if(s.group==='spelling')return s.id==='y'?'Nghe cách đọc trong yi. Khi viết âm tiết, nhóm i/ü có các dạng bắt đầu bằng y.':'Nghe cách đọc trong wu. Khi viết âm tiết, nhóm u có các dạng bắt đầu bằng w.';
 return D.finalTip(s.final);
}
function mediaIcon(video){return video?'<svg class="media-mark" viewBox="0 0 10 10" aria-hidden="true"><path fill="currentColor" d="M2 1 9 5 2 9Z"/></svg>':'<svg class="media-mark" viewBox="0 0 10 10" aria-hidden="true"><path fill="none" stroke="currentColor" d="M1 6V5a4 4 0 0 1 8 0v1M1 5v4h2V5ZM7 5v4h2V5Z"/></svg>';}
function renderBasicGrid(){
 const q=D.normalize($('basicSearch').value);
 basicVisible=B.sounds.filter(s=>(basicGroup==='all'||s.group===basicGroup)&&(!q||D.normalize(s.symbol).includes(q))&&(!$('basicOnlySaved').checked||basicSaved.has(s.id)));
 const ids=new Set(basicVisible.map(s=>s.id));
 $('basicSavedCount').textContent=basicSaved.size;
 $('basicResultCount').textContent=`${basicVisible.length} âm phù hợp`;
 $('basicEmpty').hidden=basicVisible.length>0;
 $('soundGroups').innerHTML=B.groups.filter(g=>basicVisible.some(s=>s.group===g.id)).map(g=>`<section class="sound-section sound-section--${g.id}" aria-labelledby="group-${g.id}"><header class="sound-section-heading"><h3 id="group-${g.id}">${g.title}</h3><p>${g.subtitle}</p></header><div class="family-grid">${g.families.map(f=>{const sounds=f.ids.split(' ').filter(id=>ids.has(id)).map(id=>basicById.get(id));return !sounds.length?'':`<div class="sound-row"><span class="family-label">${f.title}</span><div class="sound-tiles">${sounds.map(s=>`<button type="button" class="sound-tile" data-basic="${s.id}" aria-pressed="${s.id===basicCurrent.id}" aria-label="Âm ${escape(s.symbol)} · ${s.video?'video khẩu hình':'nghe '+s.audioLabel}${basicSaved.has(s.id)?' · cần luyện thêm':''}">${escape(s.symbol)}${mediaIcon(s.video)}${basicSaved.has(s.id)?'<span class="saved-mark" aria-hidden="true">★</span>':''}</button>`).join('')}</div></div>`;}).join('')}</div></section>`).join('');
 for(const button of $('basicFilters').children)button.setAttribute('aria-pressed',String(button.dataset.group===basicGroup));
 updateBasicPosition();
}
function updateBasicPosition(){
 const i=basicVisible.findIndex(s=>s.id===basicCurrent.id);
 $('basicPosition').textContent=i<0?'':`${i+1} / ${basicVisible.length}`;
 $('previousBasic').disabled=$('nextBasic').disabled=basicVisible.length<2;
}
function updateBasicSaved(){
 const value=basicSaved.has(basicCurrent.id);
 $('saveBasic').setAttribute('aria-pressed',String(value));$('saveBasic').textContent=value?'★':'☆';
 $('saveBasic').setAttribute('aria-label',`${value?'Bỏ lưu':'Lưu'} âm ${basicCurrent.symbol}${value?'':' để luyện thêm'}`);
}
function renderBasicPlayer(){
 const s=basicCurrent;videoFailed=false;
 $('basicTitle').textContent=s.symbol;$('basicFamily').textContent=s.family;
 $('basicTip').textContent=basicTip(s);$('basicNote').textContent=s.note;$('basicNote').hidden=!s.note;
 basicVideo.removeAttribute('src');basicVideo.load();basicAudio.removeAttribute('src');basicAudio.load();
 basicVideo.hidden=!s.video;$('basicAudioView').hidden=Boolean(s.video);
 if(s.video){basicVideo.src=s.video;basicVideo.poster=s.poster;}else basicVideo.removeAttribute('poster');
 basicVideo.setAttribute('aria-label',`Video khẩu hình âm ${s.symbol}`);
 $('basicAudioLabel').textContent=s.audioLabel;
 $('listenBasic').hidden=!s.video;
 $('basicStatus').textContent=s.video?'Bấm phát mẫu để bắt đầu.':`Nghe ${s.symbol} trong âm tiết ${s.audioLabel}.`;
 updateBasicSaved();updateBasicPosition();
}
function showBasicPlayer(){
 if(smallScreen.matches){
  $('basicDialog').append($('basicPlayer'));
  if(!$('basicDialog').open)$('basicDialog').showModal();
  $('closeBasicDialog').focus({preventScroll:true});
 }
}
function openBasic(id,autoplay=true,trigger=document.activeElement){
 const s=basicById.get(id);if(!s)return;
 stopPlayback();stopBasic();basicCurrent=s;basicTrigger=trigger;renderBasicPlayer();
 for(const button of $('soundGroups').querySelectorAll('[data-basic]'))button.setAttribute('aria-pressed',String(button.dataset.basic===id));
 showBasicPlayer();if(autoplay)playBasic(false);
}
function playBasic(audioOnly=false){
 stopPlayback();stopBasic();const ticket=basicRun;
 const useAudio=audioOnly||!basicCurrent.video||videoFailed;
 const media=useAudio?basicAudio:basicVideo;
 if(useAudio)basicAudio.src=basicCurrent.audio;
 media.currentTime=0;media.playbackRate=Number($('basicSpeed').value);media.preservesPitch=true;
 basicActive=media;basicRepeats=$('basicRepeat').checked?2:0;
 $('basicStatus').textContent=useAudio?'Đang tải âm mẫu…':'Đang tải video…';
 media.play().catch(()=>{if(ticket===basicRun)$('basicStatus').textContent='Bấm Phát mẫu để nghe lại. Nếu video chưa tải được, chọn Chỉ nghe âm.';});
}
for(const media of [basicVideo,basicAudio]){
 media.addEventListener('play',()=>{
  stopPlayback();const other=media===basicVideo?basicAudio:basicVideo;other.pause();
  basicActive=media;$('basicStatus').textContent=media===basicVideo?'Đang phát khẩu hình và âm mẫu.':'Đang nghe âm mẫu.';
  basicPlayLabel(true);
 });
 media.addEventListener('pause',()=>{if(basicActive===media&&!media.ended&&!basicTimer){basicPlayLabel(false);$('basicStatus').textContent='Đã tạm dừng.';}});
 media.addEventListener('ended',()=>{
  if(basicActive!==media)return;
  if(basicRepeats>0){
   const ticket=basicRun;basicRepeats--;$('basicStatus').textContent='Chuẩn bị nghe lại…';
   basicTimer=setTimeout(()=>{basicTimer=null;if(ticket!==basicRun)return;media.currentTime=0;media.play().catch(()=>{if(ticket===basicRun)$('basicStatus').textContent='Bấm Phát mẫu để nghe lại.';});},650);
  }else{basicActive=null;basicPlayLabel(false);$('basicStatus').textContent='Đã nghe xong. Giờ hãy đọc theo một lần.';}
 });
}
basicVideo.addEventListener('error',()=>{
 if(!basicCurrent.video||!basicVideo.getAttribute('src'))return;
 const requested=basicActive===basicVideo;stopBasic();videoFailed=true;basicVideo.hidden=true;$('basicAudioView').hidden=false;
 $('basicStatus').textContent='Video chưa tải được. Em vẫn có thể nghe bản thu của âm này.';
 if(requested)playBasic(true);
});
basicAudio.addEventListener('error',()=>{if(!basicAudio.getAttribute('src'))return;stopBasic();$('basicStatus').textContent='Chưa tải được âm thanh. Kiểm tra kết nối rồi bấm Phát mẫu để thử lại.';});
$('soundGroups').addEventListener('click',event=>{const b=event.target.closest('[data-basic]');if(b)openBasic(b.dataset.basic,true,b);});
$('basicFilters').addEventListener('click',event=>{const b=event.target.closest('[data-group]');if(b){basicGroup=b.dataset.group;renderBasicGrid();}});
$('basicSearch').addEventListener('input',renderBasicGrid);$('basicOnlySaved').addEventListener('change',renderBasicGrid);
$('basicReset').addEventListener('click',()=>{basicGroup='all';$('basicSearch').value='';$('basicOnlySaved').checked=false;renderBasicGrid();$('basicSearch').focus();});
$('saveBasic').addEventListener('click',()=>{if(basicSaved.has(basicCurrent.id))basicSaved.delete(basicCurrent.id);else basicSaved.add(basicCurrent.id);persist();updateBasicSaved();renderBasicGrid();});
$('playBasic').addEventListener('click',()=>{if(basicActive&&(!basicActive.paused||basicTimer)){stopBasic();$('basicStatus').textContent='Đã tạm dừng.';}else playBasic(false);});
$('listenBasic').addEventListener('click',()=>playBasic(true));
$('basicSpeed').addEventListener('change',()=>{basicVideo.playbackRate=basicAudio.playbackRate=Number($('basicSpeed').value);});
$('basicRepeat').addEventListener('change',()=>{if(basicActive)basicRepeats=$('basicRepeat').checked?2:0;});
for(const [id,delta]of [['previousBasic',-1],['nextBasic',1]])$(id).addEventListener('click',()=>{
 if(!basicVisible.length)return;let i=basicVisible.findIndex(s=>s.id===basicCurrent.id);i=i<0?0:(i+delta+basicVisible.length)%basicVisible.length;openBasic(basicVisible[i].id,true,basicTrigger);
});
$('closeBasicDialog').addEventListener('click',()=>{stopBasic();$('basicDialog').close();});
$('basicDialog').addEventListener('cancel',stopBasic);
$('basicDialog').addEventListener('close',()=>{
 stopBasic();$('basicPlayerHome').append($('basicPlayer'));
 const currentTile=$('soundGroups').querySelector(`[data-basic="${basicCurrent.id}"]`);
 if(smallScreen.matches&&!$('basics').hidden)(currentTile||$('basicSearch')).focus({preventScroll:true});
});
$('basicDialog').addEventListener('click',e=>{if(e.target===$('basicDialog')){const r=$('basicDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){stopBasic();$('basicDialog').close();}}});
smallScreen.addEventListener('change',()=>{stopBasic();if($('basicDialog').open)$('basicDialog').close();else $('basicPlayerHome').append($('basicPlayer'));});
$('dialogRelated').addEventListener('click',e=>{const b=e.target.closest('[data-related]');if(b){pendingBasic=b.dataset.related;$('syllableDialog').close();}});

// One public entry page. Old hashes (including #videos) continue to reach the right tool.
function switchPanel(id,writeHash=true){
 if(id==='videos')id='basics';if(!['basics','chart','tones','practice'].includes(id))id='basics';
 stopPlayback();stopBasic();if($('basicDialog').open)$('basicDialog').close();
 for(const p of document.querySelectorAll('.study-panel'))p.hidden=p.id!==id;
 for(const link of document.querySelectorAll('.study-tabs a')){if(link.hash==='#'+id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 if(writeHash)window.history.replaceState(null,'','#'+id);
}
document.querySelector('.study-tabs').addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();switchPanel(a.hash.slice(1));}});
window.addEventListener('hashchange',()=>switchPanel(location.hash.slice(1),false));

let round=null;
function makePool(mode){
 const pool=[];
 if(mode==='tones')for(const base of ['ma','ba','da','mi','shi','hao','li','lu','lü','ni','ge','qi']){
  if(![1,2,3,4].every(n=>hasAudio(base,n)))continue;
  for(let n=1;n<=4;n++)pool.push({id:`${base}:${n}`,base,tone:n,choices:[1,2,3,4].map(t=>({base,tone:t})),tip:D.tones[n-1].description});
 }else{
  const group=D.contrastGroups.find(g=>g.id===mode);if(!group)return [];
  for(const pair of group.pairs)for(let n=1;n<=4;n++){
   if(!pair.every(base=>hasAudio(base,n)))continue;
   for(const base of pair)pool.push({id:`${pair.join('/')}:${base}:${n}`,base,tone:n,choices:pair.map(b=>({base:b,tone:n})),tip:group.tip});
  }
 }
 return pool;
}
function history(){const value=best[$('practiceMode').value];$('practiceHistory').textContent=Number.isInteger(value)?`Tốt nhất trên trình duyệt này: ${value}/10`:'';}
function startRound(retry){
 stopPlayback();stopBasic();const mode=$('practiceMode').value,pool=retry||shuffle(makePool(mode)).slice(0,10);
 if(!pool.length){$('practiceArea').textContent='Chưa có đủ âm mẫu cho nhóm này.';return;}
 round={mode,questions:pool.map(q=>({...q,choices:shuffle(q.choices)})),index:0,score:0,wrong:[],heard:false,answered:false,retry:Boolean(retry)};renderQuestion();
}
function renderQuestion(){
 const q=round.questions[round.index];round.heard=false;round.answered=false;
 $('practiceArea').innerHTML=`<div class="quiz-top"><span>Câu ${round.index+1} / ${round.questions.length}</span><span>Đúng: ${round.score}</span></div><div class="quiz-main"><h3 tabindex="-1" id="quizPrompt">Em nghe thấy âm nào?</h3><button type="button" class="button primary" data-action="listen">▷ Nghe âm mẫu</button><p class="quiz-status muted" id="quizStatus" role="status" aria-live="polite">Nghe hết âm mẫu để mở các lựa chọn.</p></div><div class="quiz-options ${q.choices.length===2?'two':''}" role="group" aria-label="Chọn âm nghe được">${q.choices.map((c,i)=>`<button type="button" data-answer="${i}" disabled>${D.toned(c.base,c.tone)}</button>`).join('')}</div><div id="quizFeedback" aria-live="polite"></div>`;
 $('quizPrompt').focus({preventScroll:true});
}
function listenQuestion(){const active=round,index=round.index,q=round.questions[index];playQueue([key(q.base,q.tone)],{
 status:message=>{if(round===active&&round.index===index&&$('quizStatus'))$('quizStatus').textContent=message;},
 onComplete:()=>{if(round!==active||round.index!==index||round.answered)return;round.heard=true;$('quizStatus').textContent='Đã nghe xong. Chọn âm em vừa nghe.';for(const b of $('practiceArea').querySelectorAll('[data-answer]'))b.disabled=false;}
});}
function answerQuestion(index){
 if(!round||!round.heard||round.answered)return;const q=round.questions[round.index],chosen=q.choices[index];if(!chosen)return;
 stopPlayback();round.answered=true;const correct=chosen.base===q.base&&chosen.tone===q.tone;
 if(correct)round.score++;else round.wrong.push({...q,chosen});
 for(const b of $('practiceArea').querySelectorAll('[data-answer]')){b.disabled=true;const c=q.choices[Number(b.dataset.answer)];if(c.base===q.base&&c.tone===q.tone)b.classList.add('correct');else if(Number(b.dataset.answer)===index)b.classList.add('wrong');}
 $('quizFeedback').innerHTML=`<div class="quiz-feedback"><h3>${correct?'Đúng rồi.':'Âm mẫu là '+D.toned(q.base,q.tone)+'.'}</h3><p>${correct?`Em đã nhận ra ${D.toned(q.base,q.tone)}. `:`Em chọn ${D.toned(chosen.base,chosen.tone)}. `}${escape(q.tip)}</p><div class="actions"><button type="button" class="button secondary" data-action="listen">Nghe lại ${D.toned(q.base,q.tone)}</button>${correct?'':`<button type="button" class="button secondary" data-action="compare">So sánh ${D.toned(chosen.base,chosen.tone)}</button>`}<button type="button" class="button primary" data-action="next">${round.index+1===round.questions.length?'Xem kết quả':'Câu tiếp theo →'}</button></div></div>`;
 round.chosen=chosen;$('practiceArea').querySelector('[data-action="next"]').focus({preventScroll:true});
}
function finishRound(){
 stopPlayback();if(!round.retry&&round.questions.length===10){best[round.mode]=Math.max(best[round.mode]||0,round.score);persist();history();}
 $('practiceArea').innerHTML=`<h3>Kết quả lượt luyện</h3><p class="results-score">${round.score} / ${round.questions.length}</p><p>${round.wrong.length?'Nghe lại các cặp dưới đây, rồi luyện một lượt các âm còn nhầm.':'Em đã nhận ra tất cả âm trong lượt này. Hãy đọc theo từng mẫu và thử một lượt khác.'}</p>${round.wrong.length?`<ul class="review-list">${round.wrong.map((q,i)=>`<li><span>Mẫu <b>${D.toned(q.base,q.tone)}</b> · đã chọn ${D.toned(q.chosen.base,q.chosen.tone)}</span><button class="text-button" type="button" data-review="${i}">Nghe hai âm</button></li>`).join('')}</ul>`:''}<p id="reviewStatus" class="quiz-status" role="status"></p><div class="results-actions">${round.wrong.length?'<button type="button" class="button primary" data-action="retry">Luyện lại các câu sai</button><button type="button" class="button secondary" data-action="save-wrong">Lưu âm còn nhầm</button>':''}<button type="button" class="button secondary" data-action="restart">Lượt mới · 10 câu</button></div>`;
}
$('practiceArea').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled||!round)return;
 if(b.dataset.answer!==undefined){answerQuestion(Number(b.dataset.answer));return;}
 if(b.dataset.review!==undefined){const q=round.wrong[Number(b.dataset.review)];if(q)playQueue([key(q.base,q.tone),key(q.chosen.base,q.chosen.tone)],{status:message=>{if($('reviewStatus'))$('reviewStatus').textContent=message;}});return;}
 switch(b.dataset.action){
  case 'listen':listenQuestion();break;
  case 'compare':playQueue([key(round.chosen.base,round.chosen.tone)],{status:message=>{if($('quizStatus'))$('quizStatus').textContent=message;}});break;
  case 'next':if(!round.answered)return;stopPlayback();round.index++;if(round.index>=round.questions.length)finishRound();else renderQuestion();break;
  case 'retry':startRound(round.wrong);break;
  case 'restart':startRound();break;
  case 'save-wrong':for(const q of round.wrong){saved.add(q.base);saved.add(q.chosen.base);}persist();renderChart();b.textContent='Đã lưu vào âm cần luyện';b.disabled=true;break;
 }
});
$('startPractice').addEventListener('click',()=>startRound());
$('practiceMode').addEventListener('change',()=>{stopPlayback();round=null;history();$('practiceArea').innerHTML='<div class="practice-empty"><h3>Đã chọn nhóm luyện mới</h3><p>Bấm “Bắt đầu lượt luyện” để nghe 10 câu của nhóm này.</p></div>';});
window.addEventListener('pagehide',()=>{stopPlayback();stopBasic();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlayback('Đã dừng khi rời trang.');stopBasic();}});
renderChart();renderBasicGrid();renderBasicPlayer();history();switchPanel(location.hash.slice(1),false);
})();
