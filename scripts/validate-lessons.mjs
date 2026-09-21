import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "data", "lesson-manifest.js");
const QUESTION_REVISION = path.join(ROOT, "data", "lessons", "hsk2", "exercise-revision-v2.js");
const manifests = fs.readFileSync(MANIFEST, "utf8");
const manifestMatch = manifests.match(/manifest\s*=\s*(\[[\s\S]*?\]);/);
if (!manifestMatch) throw new Error("Không đọc được lesson manifest.");

const context = vm.createContext({
  window: { HAN_NGU_DATA: { lessons: {}, register(lesson){ this.lessons[lesson.id] = lesson; } } }
});
vm.runInContext(fs.readFileSync(QUESTION_REVISION, "utf8"), context, { filename: QUESTION_REVISION });

const manifest = vm.runInContext("(" + manifestMatch[1] + ")", context);
const errors = [];
const seenIds = new Set();

for (const item of manifest) {
  if (!item.id || !item.data || !item.href) {
    errors.push(`Manifest thiếu id/data/href: ${JSON.stringify(item)}`);
    continue;
  }
  if (seenIds.has(item.id)) errors.push(`Trùng lesson id: ${item.id}`);
  seenIds.add(item.id);

  const file = path.join(ROOT, item.data);
  if (!fs.existsSync(file)) {
    errors.push(`Không tồn tại file dữ liệu: ${item.data}`);
    continue;
  }

  const source = fs.readFileSync(file, "utf8");
  vm.runInContext(source, context, { filename: item.data });
  const lesson = context.window.HAN_NGU_DATA.lessons[item.id];
  if (!lesson) {
    errors.push(`File không register lesson ${item.id}: ${item.data}`);
    continue;
  }

  const c = lesson.content || {};
  const fail = (msg) => errors.push(`${item.id}: ${msg}`);
  if (lesson.schemaVersion !== 5) fail("schemaVersion phải là 5");
  if (!c.course?.titleZh) fail("thiếu content.course.titleZh");
  if (c.meta?.lessonId !== item.id) fail("content.meta.lessonId không khớp manifest");
  if (!Array.isArray(c.vocabulary)) fail("content.vocabulary phải là array");
  if (!Array.isArray(c.grammar)) fail("content.grammar phải là array");
  if (!Array.isArray(c.hanzi)) fail("content.hanzi phải là array");
  if (!Array.isArray(c.exampleSentences)) fail("content.exampleSentences phải là array");
  if (!Array.isArray(c.commonErrors)) fail("content.commonErrors phải là array");
  if (!Array.isArray(c.exercises?.all)) fail("content.exercises.all phải là array");
  if (!Array.isArray(lesson.exerciseSections)) fail("exerciseSections phải là array");

  const ids = (c.exercises?.all || []).map(q => q.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) fail("trùng exercise id");

  const sectionIds = new Set((lesson.exerciseSections || []).map(s => s.id));
  for (const q of c.exercises?.all || []) {
    if (!q.id) fail("exercise thiếu id");
    if (!q.section || !sectionIds.has(q.section)) fail(`exercise ${q.id} có section không tồn tại: ${q.section}`);
    if (!q.type) fail(`exercise ${q.id} thiếu type`);
    if (q.type !== "self_check" && q.type !== "retell" && q.answer === undefined) fail(`exercise ${q.id} cần answer cho type ${q.type}`);
  }

  for (const v of c.vocabulary || []) {
    if (!v.han || !v.pinyin || !v.meaning) fail(`vocabulary thiếu trường cơ bản: ${v.id || "unknown"}`);
    if (!v.detail?.collocations || !v.detail?.usageNotes) fail(`vocabulary chưa có detail đầy đủ: ${v.han}`);
  }

  for (const h of c.hanzi || []) {
    if (!h.char || !h.pinyin || h.strokes == null) fail(`hanzi thiếu dữ liệu cơ bản: ${h.char || "unknown"}`);
    if (!h.readingProfile) fail(`hanzi thiếu readingProfile: ${h.char}`);
    if (!h.deepProfile) fail(`hanzi thiếu deepProfile: ${h.char}`);
  }

  const test = lesson.content?.coverage?.exercises;
  if (test && test !== "gold_template_v1" && test !== "gold_template_v2") fail("coverage.exercises phải là gold_template_v1 hoặc gold_template_v2 khi đã chuẩn hóa");
}

if (errors.length) {
  console.error(errors.map((x,i)=>`${i+1}. ${x}`).join("\n"));
  process.exit(1);
}
console.log(`OK · Đã kiểm tra ${manifest.length} bài học canonical.`);
