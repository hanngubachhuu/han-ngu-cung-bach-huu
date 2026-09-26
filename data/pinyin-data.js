/* Pronunciation data authored for Vietnamese beginners. See docs/pinyin/SOURCES.md.
   Syllables are a curated common-learning inventory, not every dialectal/interjection form.
   Four-tone recordings are articulation drills; not every combination is a lexical word. */
(()=>{'use strict';
const rows={
 '∅':'a o e ai ei ao ou an en ang eng er yi ya ye yao you yan yin yang ying yong wu wa wo wai wei wan wen wang weng yu yue yuan yun',
 b:'ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu',
 p:'pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu',
 m:'ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu',
 f:'fa fo fei fou fan fen fang feng fu',
 d:'da de dai dei dao dou dan den dang deng dong di die diao diu dian ding du duo dui duan dun',
 t:'ta te tai tao tou tan tang teng tong ti tie tiao tian ting tu tuo tui tuan tun',
 n:'na ne nai nei nao nou nan nen nang neng nong ni nie niao niu nian nin niang ning nu nuo nuan nü nüe',
 l:'la le lai lei lao lou lan lang leng long li lia lie liao liu lian lin liang ling lu luo luan lun lü lüe',
 g:'ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang',
 k:'ka ke kai kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang',
 h:'ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang',
 j:'ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun',
 q:'qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun',
 x:'xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun',
 zh:'zha zhe zhai zhei zhao zhou zhan zhen zhang zheng zhong zhi zhu zhua zhuo zhuai zhui zhuan zhun zhuang',
 ch:'cha che chai chao chou chan chen chang cheng chong chi chu chua chuo chuai chui chuan chun chuang',
 sh:'sha she shai shei shao shou shan shen shang sheng shi shu shua shuo shuai shui shuan shun shuang',
 r:'re rao rou ran ren rang reng rong ri ru ruo rui ruan run',
 z:'za ze zai zei zao zou zan zen zang zeng zong zi zu zuo zui zuan zun',
 c:'ca ce cai cao cou can cen cang ceng cong ci cu cuo cui cuan cun',
 s:'sa se sai sao sou san sen sang seng song si su suo sui suan sun'
};
const zero={yi:'i',ya:'ia',ye:'ie',yao:'iao',you:'iou',yan:'ian',yin:'in',yang:'iang',ying:'ing',yong:'iong',wu:'u',wa:'ua',wo:'uo',wai:'uai',wei:'uei',wan:'uan',wen:'uen',wang:'uang',weng:'ueng',yu:'ü',yue:'üe',yuan:'üan',yun:'ün'};
const finals='a o e -i er ai ei ao ou an en ang eng ong i ia ie iao iou ian in iang ing iong u ua uo uai uei uan uen uang ueng ü üe üan ün'.split(' ');
const initialTips={
 '∅':'Không có thanh mẫu. y và w trong các âm tiết này làm nhiệm vụ ghi chính tả; không tính thêm vào 21 thanh mẫu.',
 b:'Khép hai môi rồi mở nhanh, không bật hơi. Luồng hơi yếu hơn p; đừng đọc thành b hữu thanh của tiếng Việt.',
 p:'Khép hai môi rồi mở với luồng hơi rõ. Đặt một mảnh giấy trước miệng để so sánh p với b.',
 m:'Khép hai môi, để hơi đi qua mũi. Khi nối sang vận mẫu, mở môi tự nhiên.',
 f:'Răng trên chạm nhẹ môi dưới; đẩy hơi qua khe hẹp. Không khép cả hai môi như b hoặc p.',
 d:'Đầu lưỡi chạm vùng ngay sau răng trên rồi nhả nhanh, không bật hơi. Đừng đồng nhất với đ của tiếng Việt.',
 t:'Cùng vị trí đầu lưỡi với d nhưng bật hơi rõ hơn. Giữ nguyên vận mẫu khi so sánh d và t.',
 n:'Đầu lưỡi chạm vùng sau răng trên; hơi đi qua mũi. Phân biệt với l bằng đường thoát của luồng hơi.',
 l:'Đầu lưỡi chạm vùng sau răng trên; hơi thoát qua hai bên lưỡi. Giữ đầu lưỡi rõ, tránh lẫn với n.',
 g:'Phần sau lưỡi chạm ngạc mềm rồi nhả ra, không bật hơi. So sánh với luồng hơi rõ hơn của k.',
 k:'Vị trí gần g nhưng bật hơi rõ. Luyện cùng vận mẫu: gē – kē.',
 h:'Nâng phần sau lưỡi gần ngạc mềm để tạo khe cho hơi đi qua. Không thêm một nguyên âm trước h.',
 j:'Đầu lưỡi để gần răng dưới, mặt trước lưỡi nâng gần ngạc cứng. Chặn rồi nhả qua khe hẹp, không bật hơi; không cuộn đầu lưỡi như zh.',
 q:'Vị trí lưỡi như j nhưng bật hơi rõ. Giữ đầu lưỡi gần răng dưới; đừng đổi thành ch.',
 x:'Đầu lưỡi gần răng dưới, mặt trước lưỡi nâng gần ngạc cứng; hơi xát qua khe. Khác vị trí đầu lưỡi của s và sh.',
 zh:'Đầu lưỡi nâng về vùng sau lợi trên rồi nhả ra, không bật hơi. Không cuộn lưỡi quá mức.',
 ch:'Vị trí đầu lưỡi như zh nhưng bật hơi rõ. So sánh zhī – chī với cùng một thanh điệu.',
 sh:'Đầu lưỡi nâng về phía sau lợi trên; để hơi xát qua khe. Khác s ở vị trí lưỡi.',
 r:'Đầu lưỡi nâng hơi về sau, có tiếng rung của dây thanh. Không rung đầu lưỡi liên tiếp như một số cách đọc r tiếng Việt.',
 z:'Đầu lưỡi ở phía trước, gần mặt sau răng trên; chặn rồi nhả qua khe hẹp, không bật hơi. So sánh với c.',
 c:'Vị trí như z nhưng bật hơi rõ. Phân biệt c với ch ở vị trí lưỡi, c với z ở luồng hơi.',
 s:'Đầu lưỡi ở phía trước, hơi xát qua khe gần răng. Không lùi đầu lưỡi về sau như sh.'
};
const finalTips={
 a:'Mở miệng khá rộng, lưỡi hạ tự nhiên. Giữ chất âm khi đổi thanh.',o:'Môi tròn, miệng mở vừa. Trong bo, po, mo, fo, chú ý nghe mẫu và chuyển động môi.',e:'Môi không tròn, phần sau lưỡi nâng vừa. Không đọc giống nguyên âm e tiếng Việt.',
 i:'Miệng hơi dẹt, mặt trước lưỡi nâng cao. Âm i này khác i trong zhi/chi/shi/ri và zi/ci/si.',
 '-i':'Giữ tư thế lưỡi của thanh mẫu khi ngân phần sau. i trong zhi/chi/shi/ri, zi/ci/si không đọc như i trong mi.',
 u:'Môi tròn, phần sau lưỡi nâng cao. Phân biệt với ü ở vị trí lưỡi.',
 ü:'Đặt lưỡi như khi đọc i rồi tròn môi. Sau j/q/x và trong yu, hai chấm được bỏ trên chữ viết nhưng âm vẫn thuộc nhóm ü.',
 ie:'Chuyển liền từ i sang nguyên âm mở hơn; không tách thành hai âm tiết.',
 üe:'Bắt đầu bằng ü rồi mở dần. Sau j/q/x và y viết ue nhưng không đọc thành u + e.',
 ian:'Phần giữa gần âm e mở hơn là a; nghe kỹ xiān, không ghép cơ học i + an.',
 üan:'Bắt đầu bằng ü; phần giữa gần e mở, kết thúc bằng n. Khác uan trong guān.',
 iou:'Sau thanh mẫu, iou được viết rút gọn thành iu, như liu. Khi thêm dấu, đặt trên u: liú.',
 uei:'Sau thanh mẫu, uei viết thành ui, như gui. Khi thêm dấu, đặt trên i: guī.',
 uen:'Sau thanh mẫu, uen viết thành un, như lun. jun/qun/xun là nhóm ün, không phải uen.',
 er:'Vận mẫu riêng có sắc thái uốn lưỡi. er đứng riêng khác đuôi -r trong hiện tượng nhi hóa.'
};
function finalFor(base,initial){if(initial==='∅')return zero[base]||base;let f=base.slice(initial.length);if(f==='i'&&['zh','ch','sh','r','z','c','s'].includes(initial))return '-i';if(['j','q','x'].includes(initial)&&f.startsWith('u'))return 'ü'+f.slice(1);return {iu:'iou',ui:'uei',un:'uen'}[f]||f;}
function finalTip(final){if(finalTips[final])return finalTips[final];if(final.endsWith('ng'))return 'Kết thúc bằng -ng: nâng phần sau lưỡi về ngạc mềm, hơi đi qua mũi. Không đổi đuôi này thành -n.';if(final.endsWith('n'))return 'Kết thúc bằng -n: đầu lưỡi chạm vùng sau răng trên, hơi đi qua mũi. Không thêm một nguyên âm sau -n.';return 'Nối các phần của vận mẫu trong một âm tiết. Giữ chuyển động môi/lưỡi liền mạch, nghe mẫu rồi đọc theo.';}
const syllables=Object.entries(rows).flatMap(([initial,list])=>list.split(' ').map(base=>({base,initial,final:finalFor(base,initial)})));
const marks={a:'āáǎà',e:'ēéěè',i:'īíǐì',o:'ōóǒò',u:'ūúǔù',ü:'ǖǘǚǜ'};
function toned(base,tone){if(tone===5)return base;const index=base.includes('a')?base.indexOf('a'):base.includes('e')?base.indexOf('e'):base.includes('ou')?base.indexOf('o'):Math.max(...Array.from(base).map((c,i)=>marks[c]?i:-1));if(index<0)return base;return base.slice(0,index)+marks[base[index]][tone-1]+base.slice(index+1);}
function normalize(value){return String(value).trim().toLowerCase().replace(/u:|v/g,'ü').normalize('NFD').replace(/[\u0300\u0301\u0304\u030c]/g,'').normalize('NFC').replace(/[1-5\s']/g,'');}
const tones=[
 {n:1,name:'Thanh 1 · Âm bình',contour:'55',description:'Giữ giọng cao và bằng trong quãng giọng thoải mái.',path:'M 10 12 L 110 12'},
 {n:2,name:'Thanh 2 · Dương bình',contour:'35',description:'Bắt đầu ở khoảng giữa rồi đi lên rõ.',path:'M 10 42 L 110 12'},
 {n:3,name:'Thanh 3 · Thượng thanh',contour:'214',description:'Khi đọc riêng: xuống thấp rồi lên. Trong lời nói liền, thường chỉ giữ phần thấp.',path:'M 10 56 Q 48 86 62 67 L 110 28'},
 {n:4,name:'Thanh 4 · Khứ thanh',contour:'51',description:'Bắt đầu cao rồi đi xuống nhanh, dứt khoát.',path:'M 10 12 L 110 72'}
];
const contrastGroups=[
 {id:'air',title:'Bật hơi',tip:'Giữ cùng thanh và vận mẫu; chú ý luồng hơi mạnh hơn ở p, t, k, q, ch, c.',pairs:[['ba','pa'],['da','ta'],['ge','ke'],['ji','qi'],['zhi','chi'],['zi','ci']]},
 {id:'tongue',title:'Vị trí lưỡi',tip:'So sánh âm đầu lưỡi ở phía trước với âm đầu lưỡi nâng về sau; j/q/x giữ đầu lưỡi gần răng dưới.',pairs:[['zi','zhi'],['ci','chi'],['si','shi'],['ji','zhi'],['qi','chi'],['xi','shi']]},
 {id:'nasal',title:'Đuôi -n / -ng',tip:'-n kết thúc ở đầu lưỡi; -ng kết thúc ở phần sau lưỡi. Đừng thêm một âm g hay một nguyên âm riêng.',pairs:[['ban','bang'],['fan','fang'],['jin','jing'],['xin','xing'],['chen','cheng'],['lin','ling']]},
 {id:'round',title:'u / ü và n / l',tip:'ü: lưỡi ở phía trước như i, môi tròn. n thoát hơi qua mũi; l thoát hơi hai bên lưỡi.',pairs:[['lu','lü'],['nu','nü'],['na','la'],['ni','li'],['nü','lü']]}
];
window.HNBH_PINYIN={version:1,rows,finals,syllables,initialTips,finalTip,toned,normalize,tones,contrastGroups};
})();
