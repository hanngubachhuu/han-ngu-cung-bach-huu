/* Hán Ngữ Cùng Bách Hữu · Lesson Registry
 * Canonical lesson data lives in data/lessons/**. UI pages consume it through this layer.
 * Data files are fetched and evaluated explicitly so the common-review page does not
 * silently fail when a dynamically inserted <script> is cached or skipped.
 */
(function(global){
  const R = global.HAN_NGU_DATA || {};
  R.SCHEMA_VERSION = 1;
  R.lessons = R.lessons || {};
  R.manifest = R.manifest || [];
  R.loadErrors = [];

  R.register = lesson => {
    if(!lesson || !lesson.id) throw new Error("Lesson must have id");
    R.lessons[lesson.id] = lesson;
    return lesson;
  };

  R.getRaw = id => R.lessons[id] || null;

  R.prepare = lesson => {
    const c = lesson?.content || {};
    const course = c.course || {};
    const meta = c.meta || {};
    return {
      ...lesson,
      id: lesson.id || meta.lessonId,
      zhTitle: course.titleZh || "",
      viSubtitle: course.titleVi || "",
      heroTitle: c.ui?.heroTitle || ("Bài tập về nhà — " + (course.titleVi || "")),
      heroDescription: c.ui?.heroDescription || "",
      timeLimitMinutes: meta.timeLimitMinutes || 45,
      version: meta.version || 1,
      meta,
      sections: lesson.exerciseSections || [],
      questions: Array.isArray(c.exercises?.all) ? c.exercises.all : [],
      passages: c.passages || {},
      content: c
    };
  };

  R.validate = lesson => {
    const c = lesson?.content || {};
    const errors = [];
    if(!lesson?.id) errors.push("missing id");
    if(!c.course?.titleZh) errors.push("missing course.titleZh");
    if(!c.meta?.lessonId) errors.push("missing meta.lessonId");
    if(!Array.isArray(c.vocabulary)) errors.push("content.vocabulary must be array");
    if(!Array.isArray(c.grammar)) errors.push("content.grammar must be array");
    if(!Array.isArray(c.hanzi)) errors.push("content.hanzi must be array");
    if(!Array.isArray(c.exercises?.all)) errors.push("content.exercises.all must be array");
    if(!Array.isArray(lesson.exerciseSections)) errors.push("exerciseSections must be array");
    const qs = c.exercises?.all || [];
    const ids = qs.map(x=>x.id).filter(Boolean);
    if(new Set(ids).size !== ids.length) errors.push("duplicate exercise ids");
    return {ok:errors.length===0, errors};
  };

  R.loadScript = async src => {
    const url = new URL(src, document.baseURI).href;
    const response = await fetch(url, {cache:"no-store"});
    if(!response.ok) throw new Error("HTTP " + response.status + " khi tải " + src);
    const code = await response.text();
    const run = new Function("window", code);
    run(global);
    return src;
  };

  R.loadAll = async () => {
    if(!Array.isArray(R.manifest)) return [];
    R.loadErrors = [];
    // Nạp bộ tái cấu trúc Bài 8–15 trước. Bài 1–7 không bị tác động.
    try{
      await R.loadScript("data/lessons/hsk2/exercise-revision-v2.js");
    }catch(error){
      R.loadErrors.push({
        id:"hsk2_exercise_revision_v2",
        data:"data/lessons/hsk2/exercise-revision-v2.js",
        message:error?.message || String(error)
      });
    }
    const results = await Promise.all(R.manifest.map(async item => {
      try{
        await R.loadScript(item.data);
        const lesson = R.lessons[item.id];
        if(!lesson) throw new Error("File đã tải nhưng không đăng ký lesson " + item.id);
        return {...lesson,__href:item.href,__data:item.data};
      }catch(error){
        R.loadErrors.push({
          id:item.id,
          data:item.data,
          message:error?.message || String(error)
        });
        return null;
      }
    }));
    return results.filter(Boolean);
  };

  global.HAN_NGU_DATA = R;
})(window);
