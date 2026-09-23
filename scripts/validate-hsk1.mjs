import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=process.cwd(),ctx=vm.createContext({window:{HAN_NGU_DATA:{lessons:{},register(l){this.lessons[l.id]=l;}}}});
const ids=new Set(),questions=[],stats={lessons:0,questions:0,automatic:0,manual:0,extension:0};
for(let i=1;i<=15;i++){
 const rel=`data/lessons/hsk1/bai${i}.js`;
 vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx);
 const l=ctx.window.HAN_NGU_DATA.lessons[`hsk1_bai${i}`],c=l.content;
 assert.equal(c.course.level,1);assert.equal(c.course.framework,'HSK 2.0');assert.equal(c.course.lessonNo,i);
 const sections=new Set(l.exerciseSections.map(s=>s.id));stats.lessons++;
 for(const q of c.exercises.all){
  assert(!ids.has(q.id),q.id+' duplicate');ids.add(q.id);questions.push(q);stats.questions++;
  assert(sections.has(q.section));
  for(const f of ['prompt','explain','tip','skill','knowledge_point','common_error'])assert(q[f],`${q.id} lacks ${f}`);
  assert(Array.isArray(q.sourceRefs)&&q.sourceRefs.length);
  if(['mcq','listening'].includes(q.type)){
   assert.equal(q.options.length,4);assert.equal(new Set(q.options.map(o=>o.t)).size,4);
   assert(q.options.some(o=>o.k===q.answer));assert.equal(q.distractorProfiles.length,3);
   assert.deepEqual(q.distractorProfiles.map(d=>d.option).sort(),q.options.map(o=>o.k).filter(k=>k!==q.answer).sort());
   for(const d of q.distractorProfiles){assert(/^N(0[1-9]|1\d|2[0-5])$/.test(d.code));assert(d.reason);assert(q.explain.includes(d.reason),q.id+' explanation differs from distractor rationale');}
  }
  if(q.type==='listening'){assert.equal(q.audioStatus,'ready');assert(q.audioText);assert(fs.existsSync(path.join(root,q.audioSrc)));}
  if(q.type==='self_check'){stats.manual++;for(const f of ['model','rubric','acceptanceCriteria','commonMistakes'])assert(q[f]);}
  else stats.automatic++;
  if(q.type==='reorder'){assert.deepEqual([...q.tokens].sort(),[...q.answer].sort());for(const a of q.acceptedAnswers||[])assert.deepEqual([...a].sort(),[...q.tokens].sort());}
  if(q.scope==='extension'){stats.extension++;assert.equal(q.countsTowardCore,false);for(const f of ['extension_items','extension_reason','learner_familiarity','support','assessment_role'])assert(q[f]);}
 }
 const html=fs.readFileSync(path.join(root,`hsk1_bai${i}_index.html`),'utf8');
 const htmlIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(htmlIds.length,new Set(htmlIds).size,'duplicate HTML id');
 assert(html.includes(`src="${rel}"`));assert(!html.includes('const LESSON ='),'lesson data must not be duplicated into HTML');
 for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const ref=m[1];if(/^(https?:|data:|mailto:|tel:|#)/.test(ref))continue;
  const local=decodeURIComponent(ref.split(/[?#]/)[0]);if(local)assert(fs.existsSync(path.join(root,local)),`broken reference ${ref}`);
 }
}
const audio=JSON.parse(fs.readFileSync(path.join(root,'docs/hsk1/audio-manifest.json'),'utf8'));
assert.equal(audio.length,45);
for(const a of audio){const bytes=fs.readFileSync(path.join(root,a.path));assert.equal(bytes.length,a.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);}
// Verify the exact functions used by the browser engine, not a second grading implementation.
const engine=fs.readFileSync(path.join(root,'hsk1-lesson-engine.js'),'utf8');
const functions=['isAnswered','gradeQuestion','computeFullResult'].map(n=>engine.match(new RegExp(`^function ${n}\\([^\\n]*\\)\\{[\\s\\S]*?^\\}`,'m'))?.[0]);
assert(functions.every(Boolean));
let cases=0;
for(const l of Object.values(ctx.window.HAN_NGU_DATA.lessons)){
 const qs=l.content.exercises.all.map(q=>({...q,_sectionId:q.section,_skill:q.skill}));
 const skills=Object.fromEntries(qs.map(q=>[q.skill,{label:q.skill}]));
 const state={answers:{},selfMarks:{}};
 const sandbox=vm.createContext({state,ALL_QUESTIONS:qs,LESSON:{sections:l.exerciseSections,skills}});
 vm.runInContext(functions.join('\n'),sandbox);
 for(const q of qs){
  if(q.type==='self_check'){
   state.selfMarks[q.id]=1;sandbox.q=q;assert.equal(vm.runInContext('gradeQuestion(q).score',sandbox),0,'blank response cannot earn self score');
   state.answers[q.id]=q.model;for(const bad of [-1,2,NaN]){state.selfMarks[q.id]=bad;assert.equal(vm.runInContext('gradeQuestion(q).score',sandbox),0);cases++;}state.selfMarks[q.id]=1;
  }else{state.answers[q.id]=q.type==='text_fill'?q.answer[0]:q.answer;}
  sandbox.q=q;assert.equal(vm.runInContext('gradeQuestion(q).score',sandbox),1,q.id+' correct response');cases++;
  if(q.acceptedAnswers?.length){state.answers[q.id]=q.acceptedAnswers[0];assert.equal(vm.runInContext('gradeQuestion(q).score',sandbox),1,q.id+' equivalent reorder');cases++;}
 }
 let result=vm.runInContext('computeFullResult()',sandbox);assert.equal(result.score,result.max);assert.equal(result.percentage,100);assert.equal(result.max,qs.filter(q=>q.countsTowardCore!==false).length);
 for(const q of qs){if(q.type==='self_check'){state.selfMarks[q.id]=0;}else{state.answers[q.id]=q.type==='reorder'?[]:'incorrect';}sandbox.q=q;assert.equal(vm.runInContext('gradeQuestion(q).score',sandbox),0,q.id+' wrong response');cases++;}
 result=vm.runInContext('computeFullResult()',sandbox);assert.equal(result.score,0);assert.equal(result.percentage,0);
 state.answers={};state.selfMarks={};result=vm.runInContext('computeFullResult()',sandbox);assert.equal(result.unanswered,result.max);assert.equal(result.score,0);
}
console.log(JSON.stringify({...stats,gradingAssertions:cases,audioFiles:audio.length,status:'passed'},null,2));
