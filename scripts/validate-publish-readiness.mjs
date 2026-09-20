import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "data", "lesson-manifest.js");
const text = fs.readFileSync(MANIFEST, "utf8");
const match = text.match(/manifest\s*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error("Không đọc được lesson manifest.");

const context = vm.createContext({window:{HAN_NGU_DATA:{lessons:{},register(lesson){this.lessons[lesson.id]=lesson;}}}});
const manifest = vm.runInContext("(" + match[1] + ")", context);
const errors = [];

for (const item of manifest) {
  const file = path.join(ROOT, item.data);
  const source = fs.readFileSync(file, "utf8");
  vm.runInContext(source, context, {filename:item.data});
  const lesson = context.window.HAN_NGU_DATA.lessons[item.id];
  const c = lesson?.content || {};
  const status = c.meta?.publishStatus || "draft";

  if (status === "published" || status === "review") {
    if (!Array.isArray(c.hanzi) || c.hanzi.length === 0) errors.push(item.id + ": publish readiness yêu cầu hanzi không rỗng");
    for (const h of c.hanzi || []) {
      for (const field of ["char","pinyin","hanViet","meaning","radical","structure","strokes","sourceRefs","readingProfile","deepProfile"]) {
        if (h[field] == null || (Array.isArray(h[field]) && h[field].length === 0)) errors.push(item.id + ": hanzi " + (h.char || "unknown") + " thiếu " + field);
      }
      if (h.deepProfile?.formation?.confidence === "uncertain") errors.push(item.id + ": hanzi " + (h.char || "unknown") + " có formation chưa đủ độ tin cậy");
    }
    for (const ex of c.exampleSentences || []) if (!ex.pinyin || !ex.vi) errors.push(item.id + ": example " + (ex.id || "unknown") + " thiếu pinyin/vi");
    if (!Array.isArray(c.sources) || c.sources.length === 0) errors.push(item.id + ": review/published lesson phải có sources");
  }
}

if (errors.length) {
  console.error(errors.map((x,i)=>(i+1)+". "+x).join("\n"));
  process.exit(1);
}
console.log("OK · Publish readiness đạt cho các lesson đang ở review/published.");