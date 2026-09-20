import fs from "node:fs";
import vm from "node:vm";

function readCanonical(lessonNo) {
  const context = vm.createContext({
    window: { HAN_NGU_DATA: { lessons: {}, register(lesson) { this.lessons[lesson.id] = lesson; } } }
  });
  vm.runInContext(fs.readFileSync(`data/lessons/hsk2/bai${lessonNo}.js`, "utf8"), context);
  return Object.values(context.window.HAN_NGU_DATA.lessons)[0];
}

function readPageLesson(lessonNo) {
  const source = fs.readFileSync(`bai${lessonNo}_index.html`, "utf8");
  const marker = "const LESSON = ";
  const start = source.indexOf(marker) + marker.length;
  if (start < marker.length || source[start] !== "{") throw new Error(`Bài ${lessonNo}: không tìm thấy LESSON.`);
  let depth = 0;
  let end = start;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}" && --depth === 0) { end += 1; break; }
  }
  const context = vm.createContext({});
  vm.runInContext(`globalThis.lesson = ${source.slice(start, end)}`, context);
  return context.lesson;
}

const failures = [];
for (let lessonNo = 8; lessonNo <= 15; lessonNo += 1) {
  const canonical = readCanonical(lessonNo);
  const page = readPageLesson(lessonNo);
  const canonicalIds = canonical.content.exercises.all.map((q) => q.id);
  const pageIds = page.sections.flatMap((section) => section.questions.map((q) => q.id));
  if (canonicalIds.join("|") !== pageIds.join("|")) failures.push(`Bài ${lessonNo}: giao diện không khớp thứ tự/ID canonical.`);
  if (page.title !== canonical.content.course.titleZh) failures.push(`Bài ${lessonNo}: tiêu đề giao diện không khớp canonical.`);
  if (page.timeLimitMinutes !== canonical.content.meta.timeLimitMinutes) failures.push(`Bài ${lessonNo}: thời lượng giao diện không khớp canonical.`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("OK · Dữ liệu canonical và giao diện Bài 8–15 đang đồng bộ.");
