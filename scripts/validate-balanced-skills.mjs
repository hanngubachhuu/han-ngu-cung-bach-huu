import fs from "node:fs";
import vm from "node:vm";

const expected = { vocabulary:14, grammar:12, listening:8, reading:12, writing:10, translation:6, speaking:8, mixed:0 };
const errors = [];
for (const no of [8, 9, 10, 11]) {
  const source = fs.readFileSync(`data/lessons/hsk2/bai${no}.js`, "utf8");
  const window = { HAN_NGU_DATA: { lessons:{}, register(lesson){ this.lessons[lesson.id] = lesson; } } };
  vm.runInNewContext(source, { window }, { filename:`bai${no}.js` });
  const lesson = Object.values(window.HAN_NGU_DATA.lessons)[0];
  const c = lesson.content;
  if (c.exercises.all.length < 68 || c.exercises.all.length > 72) errors.push(`Bài ${no}: tổng câu phải nằm trong 68–72.`);
  for (const [skill, count] of Object.entries(expected)) {
    if (c.skills?.[skill]?.length !== count) errors.push(`Bài ${no}: ${skill} cần ${count} câu.`);
  }
  const listening = c.exercises.all.filter(q => q.type === "listening");
  if (listening.length !== 8 || listening.some(q => !q.audioText || q.options?.length !== 4)) errors.push(`Bài ${no}: 8 câu nghe phải có audioText và 4 lựa chọn.`);
  if (new Set(listening.map(q => q.answer)).size < 4) errors.push(`Bài ${no}: đáp án câu nghe phải phân bố ít nhất 4 vị trí.`);
  const reading = c.exercises.all.filter(q => q.section === "reading");
  if (reading.length !== 12 || reading.filter(q => q.passageId).length < 4) errors.push(`Bài ${no}: đọc hiểu cần 12 câu, tối thiểu 4 câu bám đoạn đọc.`);
  const missingExplain = c.exercises.all.filter(q => !q.explain).map(q => q.id);
  if (missingExplain.length) errors.push(`Bài ${no}: thiếu giải thích ở ${missingExplain.join(", ")}.`);
  if (!lesson.exerciseSections.some(s => s.id === "listening" && s.passages !== undefined)) errors.push(`Bài ${no}: thiếu section nghe hoặc metadata đoạn đọc.`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("OK · Ma trận Bài 8–11 đạt tiêu chí kỹ năng, đọc hiểu và nghe hiểu.");
