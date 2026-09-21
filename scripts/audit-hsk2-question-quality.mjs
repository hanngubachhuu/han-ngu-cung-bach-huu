import fs from "node:fs";
import vm from "node:vm";

const root = process.cwd();
const revision = fs.readFileSync("data/lessons/hsk2/exercise-revision-v2.js", "utf8");
const expected = { vocabulary:16, grammar:10, listening:8, reading:12, writing:14, translation:10, mixed:0 };
const forbiddenPromptTerms = /结果补语|补语|语法|定语|介词|连词|量词|词类|结构/;
const errors = [];

for(let no=8; no<=15; no+=1){
  const window = { HAN_NGU_DATA:{lessons:{},register(lesson){this.lessons[lesson.id]=lesson;}} };
  vm.runInNewContext(revision,{window},{filename:"exercise-revision-v2.js"});
  vm.runInNewContext(fs.readFileSync(`data/lessons/hsk2/bai${no}.js`,"utf8"),{window},{filename:`bai${no}.js`});
  const lesson=Object.values(window.HAN_NGU_DATA.lessons)[0];
  const c=lesson.content, all=c.exercises.all;
  const fail=message=>errors.push(`Bài ${no}: ${message}`);
  if(all.length!==70) fail(`cần 70 câu, đang có ${all.length}.`);
  for(const [section,count] of Object.entries(expected)) if(c.skills?.[section]?.length!==count) fail(`${section} cần ${count} câu.`);
  if(c.coverage?.exercises!=="gold_template_v3") fail("chưa dùng ngân hàng câu hỏi v3.");
  const answers={A:0,B:0,C:0,D:0};
  all.forEach(q=>{
    if(!q.quality?.checked?.includes("single_answer")) fail(`${q.id} thiếu hồ sơ kiểm tra một đáp án.`);
    const promptText=String(q.prompt||"");
    const hasOnlyLabelColon=/^[^:\n：]+[：:]\n[\s\S]+$/u.test(promptText);
    if((promptText.includes(":") || promptText.includes("：")) && !hasOnlyLabelColon) fail(`${q.id} còn dấu hai chấm trong đề bài.`);
    if(forbiddenPromptTerms.test(String(q.prompt||""))) fail(`${q.id} hỏi trực tiếp thuật ngữ ngữ pháp.`);
    if(q.type==="mcq" || q.type==="listening"){
      if(!Array.isArray(q.options) || q.options.length!==4) fail(`${q.id} không có đúng 4 lựa chọn.`);
      if(new Set((q.options||[]).map(option=>option.t)).size!==4) fail(`${q.id} có lựa chọn trùng.`);
      if(!q.options?.some(option=>option.k===q.answer)) fail(`${q.id} không có đáp án đúng trong lựa chọn.`);
      if(!Array.isArray(q.distractorProfiles) || q.distractorProfiles.length!==3 || q.distractorProfiles.some(item=>!/^N\d\d$/.test(item.code||""))) fail(`${q.id} thiếu ba hồ sơ nhiễu N01–N25.`);
      answers[q.answer]=(answers[q.answer]||0)+1;
    }
    if(q.type==="listening" && (!q.audioText || !q.audioSrc || q.audioStatus!=="awaiting_recording")) fail(`${q.id} thiếu kịch bản hoặc trạng thái audio.`);
    if(q.section==="reading" && !q.passageId) fail(`${q.id} không gắn đoạn đọc.`);
    if((q.type==="self_check" || q.type==="retell") && !q.rubric) fail(`${q.id} thiếu rubric tự chấm.`);
  });
  if(Object.values(answers).some(total=>total<8)) fail("phân bố A/B/C/D lệch quá mức.");
  const readingPassages=c.passages||[];
  if(readingPassages.length!==3 || new Set(readingPassages.map(p=>p.text)).size!==3) fail("phải có ba đoạn đọc khác nhau, không lặp văn bản.");
  const retell=all.filter(q=>q.type==="retell");
  if(retell.length!==1 || retell[0].readSeconds!==60) fail("cần đúng một bài đọc-kể lại tự động 60 giây.");
}

if(errors.length){ console.error(errors.join("\n")); process.exit(1); }
console.log("OK · Bài 8–15 đạt ma trận 70 câu, ôn từ xoắn ốc, một đáp án, nhiễu N01–N25, đoạn đọc không lặp, nghe có kịch bản và rubric viết.");
