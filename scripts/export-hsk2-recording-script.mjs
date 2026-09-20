import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const lessonNumbers = [8, 9, 10, 11];

function loadLesson(number) {
  const context = vm.createContext({ window: { HAN_NGU_DATA: { lessons: {}, register(lesson) { this.lessons[lesson.id] = lesson; } } } });
  const file = path.join(ROOT, "data", "lessons", "hsk2", `bai${number}.js`);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return Object.values(context.window.HAN_NGU_DATA.lessons)[0];
}

const lines = [
  "# Kịch bản thu âm HSK 2 — Bài 8–11",
  "",
  "Mỗi mục thu thành một file MP3 mono, giọng Quan thoại phổ thông tự nhiên. Đọc một lần rõ ràng, tốc độ vừa phải; không đọc số câu, không đọc đáp án, không thêm nhạc nền.",
  "",
  "Sau khi thu, đặt đúng tên file dưới đây và gửi nguyên cấu trúc thư mục `audio/hsk2/` để có thể đưa thẳng vào web.",
  ""
];

for (const number of lessonNumbers) {
  const lesson = loadLesson(number);
  const questions = lesson.content.exercises.all.filter((question) => question.type === "listening");
  lines.push(`## Bài ${number}`, "");
  questions.forEach((question, index) => {
    lines.push(`${index + 1}. \`${question.audioSrc}\``, `   - Mã câu: \`${question.id}\``, `   - Lời đọc: ${question.audioText}`, "");
  });
}

console.log(lines.join("\n"));
