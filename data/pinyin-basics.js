/* Canonical basic-sound inventory. Source and author records live in admin/.
   46 owner-provided videos + the missing initial x demonstrated in xī.
   y/w are spelling letters, not extra members of the 21 Mandarin initials. */
(()=>{'use strict';
 const groups=[
  {id:'initials',title:'Thanh mẫu',subtitle:'21 âm đầu',families:[
   {title:'Môi',ids:'b p m f'}, {title:'Đầu lưỡi',ids:'d t n l'},
   {title:'Gốc lưỡi',ids:'g k h'}, {title:'Mặt lưỡi',ids:'j q x'},
   {title:'Đầu lưỡi sau',ids:'zh ch sh r'}, {title:'Đầu lưỡi trước',ids:'z c s'}]},
  {id:'finals',title:'Vận mẫu',subtitle:'24 vận mẫu trong bộ nhập môn',families:[
   {title:'Vận mẫu đơn',ids:'a o e i u v'},
   {title:'Vận mẫu kép',ids:'ai ei ui ao ou iu ie ve'},
   {title:'Đuôi -n',ids:'an en in un vn'},
   {title:'Đuôi -ng',ids:'ang eng ing ong'},
   {title:'Vận mẫu riêng',ids:'er'}]},
  {id:'spelling',title:'Chữ y và w',subtitle:'Cách ghi âm tiết không có thanh mẫu',families:[{title:'Chính tả',ids:'y w'}]}
 ];
 const symbols={v:'ü',ve:'üe',vn:'ün'};
 const fullFinals={iu:'iou',ui:'uei',un:'uen'};
 const notes={
  i:'Khi đứng thành âm tiết, i viết thành yi. i trong zhi, chi, shi, ri và zi, ci, si có cách đọc khác.',
  u:'Khi đứng thành âm tiết, u viết thành wu. So sánh u với ü: cùng tròn môi, khác vị trí lưỡi.',
  v:'Trên bàn phím có thể gõ v để tìm ü. Sau j, q, x và y, ü được viết bỏ hai chấm.',
  ve:'Viết üe sau n/l (nüe, lüe); viết ue sau j/q/x/y (jue, que, xue, yue).',
  vn:'ün viết thành un sau j/q/x và y, như jun, qun, xun, yun. Khác un trong lun, dun.',
  iu:'Dạng đầy đủ iou; sau thanh mẫu viết iu, như liú. Đặt dấu thanh trên u.',
  ui:'Dạng đầy đủ uei; sau thanh mẫu viết ui, như guī. Đặt dấu thanh trên i.',
  un:'Dạng đầy đủ uen; sau thanh mẫu viết un, như lùn. Không đọc như ün trong jūn.',
  x:'Chưa có video riêng cho x. Mẫu nghe minh họa x trong âm tiết xī; hãy chú ý phần âm đầu.',
  y:'y là chữ ghi chính tả ở đầu âm tiết nhóm i/ü, như yi, ya, yu. Không tính y là thanh mẫu thứ 22.',
  w:'w là chữ ghi chính tả ở đầu âm tiết nhóm u, như wu, wa, wei. Không tính w là một thanh mẫu riêng.'
 };
 const sounds=groups.flatMap(group=>group.families.flatMap(family=>family.ids.split(' ').map(id=>({
  id,symbol:symbols[id]||id,group:group.id,family:family.title,
  final:fullFinals[id]||symbols[id]||id,
  video:id==='x'?null:`media/pinyin/${id}.mp4`,
  audio:id==='x'?'audio/pinyin/xi1.mp3':`media/pinyin/${id}.mp3`,
  poster:id==='x'?null:`media/pinyin/${id}.webp`,
  audioLabel:id==='x'?'xī':symbols[id]||id,
  note:notes[id]||''
 }))));
 window.HNBH_PINYIN_BASICS={version:1,groups,sounds};
})();
