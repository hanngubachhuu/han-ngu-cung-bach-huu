/* HSK2 lesson adapter
 * Supabase stores normalized lesson data. The shared engine consumes a
 * small runtime shape. This file is the only compatibility layer between them.
 */
(()=>{'use strict';

function arr(v){ return Array.isArray(v) ? v : []; }

function normalizeQuestion(q){
  if(!q || typeof q !== 'object') return null;
  const out={...q};
  out.section = q.section || q.sectionId || q.section_id || '';
  out.explain = q.explain || q.explanation || '';
  if(out.answer === undefined && q.correct !== undefined) out.answer=q.correct;
  if(out.hint === undefined && q.tip !== undefined) out.hint=q.tip;
  return out;
}

function normalizePassage(p,index){
  if(!p || typeof p !== 'object') return null;
  return {
    ...p,
    label: p.label || p.title || ('Đoạn '+(index+1)),
    text: p.text || p.content || ''
  };
}

function buildSections(payload, source, questions){
  const rawSections =
    arr(payload.exerciseSections).length ? payload.exerciseSections :
    arr(source.exerciseSections).length ? source.exerciseSections :
    arr(payload.sections).length ? payload.sections :
    arr(source.sections);

  const qBySection={};
  questions.forEach(q=>{
    const sid=q.section || q.sectionId || '';
    (qBySection[sid] ||= []).push(q);
  });

  const sections=rawSections.map((s,index)=>{
    const sid=s.id || s.sectionId || ('section_'+(index+1));
    const passages=arr(s.passages).map(normalizePassage).filter(Boolean);
    return {
      id:sid,
      title:s.title || s.name || sid,
      skill:s.skill || 'mixed',
      instruction:s.instruction || '',
      passages,
      questions:qBySection[sid] || []
    };
  });

  // Nếu dữ liệu có câu nhưng section metadata thiếu, không làm mất câu.
  const known=new Set(sections.map(s=>s.id));
  Object.keys(qBySection).filter(Boolean).forEach(sid=>{
    if(known.has(sid)) return;
    sections.push({
      id:sid,
      title:sid,
      skill:'mixed',
      instruction:'',
      passages:[],
      questions:qBySection[sid]
    });
  });
  return sections;
}

function buildSkills(sections){
  const skills={};
  sections.forEach(s=>{
    const key=s.skill || 'mixed';
    if(!skills[key]) skills[key]={label:key};
  });
  return skills;
}

function parsePayload(value){
  if(typeof value==='string'){
    try{return JSON.parse(value);}catch{return null;}
  }
  if(Array.isArray(value)){
    if(value.length!==1) return null;
    return parsePayload(value[0]);
  }
  return value && typeof value==='object' ? value : null;
}

function adapt(payload){
  payload=parsePayload(payload);
  if(!payload) throw new Error('Dữ liệu bài học HSK2 không hợp lệ.');

  if(typeof payload.content==='string'){
    const parsed=parsePayload(payload.content);
    if(parsed) payload={...payload,content:parsed};
  }

  // Bài 5–9: payload.content là normalized source.
  // Bài 10–15: payload chính là normalized source.
  // Bài 4: payload.content là normalized source, còn section metadata ở payload.sections.
  const envelope = payload.content && typeof payload.content==='object' && !Array.isArray(payload.content)
    ? payload.content
    : payload;

  // The private RPC returns lesson_content.content as an envelope whose
  // normalized lesson source is nested under envelope.content.
  const source = envelope.content && typeof envelope.content==='object' && !Array.isArray(envelope.content)
    ? envelope.content
    : envelope;

  const course=source.course || {};
  const ui=payload.ui || envelope.ui || {};
  // Bài 4 có một payload.questions đầy đủ hơn bản exercises.all bên trong
  // (đặc biệt dialog_fill / matching). Nếu có bản ngoài thì ưu tiên bản đó.
  const questionsSource =
    arr(payload.questions).length ? payload.questions :
    arr(source.exercises?.all);

  const questions=questionsSource.map(normalizeQuestion).filter(Boolean);
  const sections=buildSections(payload,source,questions);

  // Gắn passage theo sectionId/passageId để engine không phải biết schema DB.
  const passageMap={};
  sections.forEach(s=>s.passages.forEach(p=>{ passageMap[p.id]=p; }));
  questions.forEach(q=>{
    if(q.passageId && passageMap[q.passageId] && !q._passage) q._passage=passageMap[q.passageId];
  });

  const vocab=arr(source.vocabulary).map(v=>({
    ...v,
    nghia:v.nghia || v.meaning || v.meanings?.find(m=>m.is_primary)?.vi || v.meanings?.[0]?.vi || ''
  }));

  const grammar=arr(source.grammar).map(g=>({
    ...g,
    desc:g.desc || g.explanation || g.functions?.join('; ') || '',
    example:g.example || g.examples?.[0] || ''
  }));

  const lessonNo=course.lessonNo;
  const title=course.titleZh || payload.zhTitle || ui.heroTitle || payload.heroTitle || source.id || 'HSK 2';
  const titleVi=course.titleVi || payload.viSubtitle || ui.heroDescription || '';
  const detailMeta=source.meta || {};
  const timeLimitMinutes=Number(
    detailMeta.timeLimitMinutes ||
    payload.timeLimitMinutes ||
    75
  );

  const displayMeta=[
    'HSK 2 · Giáo trình chuẩn',
    lessonNo ? ('Bài '+lessonNo) : null,
    vocab.length+' từ',
    questions.length+' câu'
  ].filter(Boolean);

  return {
    id:payload.id || source.meta?.lessonId || source.id || '',
    title,
    subtitle:titleVi,
    meta:displayMeta,
    timeLimitMinutes,
    vocab,
    grammar,
    skills:buildSkills(sections),
    sections,
    content:source
  };
}

window.HAN_NGU_HSK2_ADAPTER={adapt};
})();