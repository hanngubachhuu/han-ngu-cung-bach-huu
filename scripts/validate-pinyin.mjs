import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={window:{}};vm.createContext(context);
for(const file of ['data/pinyin-data.js','data/pinyin-audio.js','data/pinyin-basics.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const D=context.window.HNBH_PINYIN,A=context.window.HNBH_PINYIN_AUDIO;
assert.equal(D.syllables.length,405);assert.equal(new Set(D.syllables.map(s=>s.base)).size,405);
assert.equal(Object.keys(D.rows).length,22);
assert.equal(new Set(D.syllables.map(s=>s.initial+'|'+s.final)).size,405,'No two bases may overwrite the same chart cell.');
for(const s of D.syllables){assert(D.finals.includes(s.final),s.base);assert(D.initialTips[s.initial]);}
// Orthography checks target common Vietnamese-learner confusion, including contracted finals.
for(const [base,tone,want] of [['ma',1,'mā'],['ma',2,'má'],['ma',3,'mǎ'],['ma',4,'mà'],['ma',5,'ma'],['liu',2,'liú'],['gui',4,'guì'],['lü',4,'lǜ'],['nüe',3,'nüě'],['shui',3,'shuǐ'],['you',3,'yǒu']])assert.equal(D.toned(base,tone),want);
for(const [query,want] of [['Lǜ','lü'],['lu:4','lü'],['NV3','nü'],['shǔi','shui']])assert.equal(D.normalize(query),want);
for(const [base,final] of [['ju','ü'],['jun','ün'],['juan','üan'],['you','iou'],['wen','uen'],['zhi','-i'],['mi','i'],['liu','iou'],['gui','uei'],['lun','uen']])assert.equal(D.syllables.find(s=>s.base===base).final,final);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/pinyin/audio-manifest.json'),'utf8'));
assert.equal(manifest.files.length,1620);assert.equal(Object.keys(A).length,1620);
let totalBytes=0;
for(const f of manifest.files){
 assert.equal(A[f.key],f.destination);const bytes=fs.readFileSync(path.join(root,f.destination));
 assert.equal(bytes.length,f.size,f.key);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256,f.key);
 assert.equal(crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),f.sha,f.key);
 totalBytes+=bytes.length;
}
const missing=[];
for(const s of D.syllables)for(let tone=1;tone<=4;tone++){const k=s.base.replace(/ü/g,'v')+tone;if(!A[k])missing.push(k);}
assert.deepEqual(missing,[]);
assert.equal(manifest.files.find(f=>f.key==='ju4').path,'64k/syllabs/cmn-jv4.mp3'); // Upstream uses v to represent ü in this filename.
assert(!Object.keys(A).some(k=>k.endsWith('5')),'Neutral tone must not silently reuse a full-tone sample.');
for(const g of D.contrastGroups)for(const pair of g.pairs){
 assert.equal(pair.length,2);assert.notEqual(pair[0],pair[1]);
 for(const base of pair){assert(D.syllables.some(s=>s.base===base));for(let t=1;t<=4;t++)assert(A[base.replace(/ü/g,'v')+t]);}
}
const B=context.window.HNBH_PINYIN_BASICS;
assert.equal(B.sounds.length,47);assert.equal(new Set(B.sounds.map(s=>s.id)).size,47);
assert.equal(B.sounds.filter(s=>s.video).length,46);
assert.equal(B.sounds.filter(s=>s.group==='initials').length,21);
assert.equal(B.sounds.filter(s=>s.group==='finals').length,24);
assert.equal(B.sounds.filter(s=>s.group==='spelling').length,2);
assert.equal(B.sounds.find(s=>s.id==='x').video,null);
assert.equal(B.sounds.find(s=>s.id==='x').audio,A.xi1);
const media=JSON.parse(fs.readFileSync(path.join(root,'docs/pinyin/basic-media-manifest.json'),'utf8'));
assert.equal(media.files.length,46);
vm.runInContext(fs.readFileSync(path.join(root,'admin/pinyin-sources-data.js'),'utf8'),context);
const sourceRegister=context.window.HNBH_PINYIN_SOURCES;
assert.equal(sourceRegister.videos.length,46);
assert.equal(new Set(sourceRegister.videos.map(v=>v.id)).size,46);
for(const s of B.sounds){
 assert(!s.author&&!s.source,'Source metadata belongs in the administrative review files.');
 assert(fs.existsSync(path.join(root,s.audio)),s.id);
 if(!s.video)continue;
 const m=media.files.find(f=>f.id===s.id);assert(m,s.id);
 const sourceRecord=sourceRegister.videos.find(v=>v.id==='local-'+s.id);
 assert(sourceRecord&&sourceRecord.local,'Each clip needs a local administrative source record: '+s.id);
 assert.equal(sourceRecord.original,m.sourceFile,s.id);
 assert.equal(sourceRecord.url,'../'+s.video,s.id);
 for(const type of ['video','audio','poster']){
  assert.equal(s[type],m[type].path,s.id);
  const bytes=fs.readFileSync(path.join(root,s[type]));
  assert.equal(bytes.length,m[type].bytes,s.id);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),m[type].sha256,s.id);
 }
}
for(const file of ['phat-am.html','pinyin.html','pinyin.js','data/pinyin-data.js','data/pinyin-basics.js']){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 assert(!/douyin\.com|7480865057459555595|7646738541879364883/.test(source),'Rejected videos must not remain in public code: '+file);
}
assert(fs.existsSync(path.join(root,'audio/pinyin/NOTICE.md')),'Audio attribution must travel with the assets.');
const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
assert(deploy.includes('--exclude="admin/"'),'Local administration must not be published as an unsecured admin site.');
console.log(JSON.stringify({syllables:405,samples:1620,bytes:totalBytes,knownMissing:missing,basicSounds:B.sounds.length,localVideos:46,audioOnly:'x in xī',status:'PASS'}));
