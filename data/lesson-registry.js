/* Hán Ngữ Cùng Bách Hữu · Lesson Registry
 * Canonical lesson data lives in data/lessons/**. UI pages consume it through this layer.
 * Do not duplicate vocabulary/grammar/exercise content in HTML pages.
 */
(function(global){
  const R = global.HAN_NGU_DATA || {};
  R.SCHEMA_VERSION = 1;
  R.lessons = R.lessons || {};
  R.manifest = R.manifest || [];
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
  R.loadScript = src => new Promise((resolve,reject)=>{
    const found = [...document.scripts].find(s=>s.dataset.hnLesson===src);
    if(found){resolve();return;}
    const s=document.createElement("script");
    s.src=src; s.dataset.hnLesson=src; s.onload=resolve; s.onerror=()=>reject(new Error("Cannot load "+src));
    document.head.appendChild(s);
  });
  R.loadAll = async () => {
    if(!Array.isArray(R.manifest)) return [];
    await Promise.all(R.manifest.map(x=>R.loadScript(x.data)));
    return R.manifest.map(x=>R.lessons[x.id]).filter(Boolean);
  };
  global.HAN_NGU_DATA = R;
})(window);
