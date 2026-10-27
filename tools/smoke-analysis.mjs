// 추출한 분석 워커(workers/analysis.js)를 Node에서 그대로 실행해 보는 스모크 테스트
// 사용법: node smoke-analysis.mjs <갤산기 백업.json> [songId=m0367] [difficulty=expert] [추출 폴더=out]
// 2026-10-26 확인: 사용자 백업으로 m0367 EXPERT 탐색 → 최고 예상 점수 약 1.83M, 종합력 254,167
import fs from 'node:fs'; import vm from 'node:vm';
const dir=process.argv[5]||'out';
const cards=JSON.parse(fs.readFileSync(`${dir}/cards.json`)).cards;
const boards=JSON.parse(fs.readFileSync(`${dir}/boards.json`));
const memory=JSON.parse(fs.readFileSync(`${dir}/memory.json`));
const cat=JSON.parse(fs.readFileSync(`${dir}/charts/index.json`));
const backup=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const [songId,difficulty]=[process.argv[3]||'m0367',process.argv[4]||'expert'];
const chart=JSON.parse(fs.readFileSync(`${dir}/charts/${songId}.${difficulty}.json`));
let out=null; const self={postMessage:(m)=>{out=m}};
vm.runInNewContext(fs.readFileSync(`${dir}/workers/analysis.js`,'utf8'),{self,console,Math,JSON,Date,Map,Set,WeakMap,Array,Object,Number,String,Error,Infinity,NaN,Uint8Array,Float64Array,Int32Array,Uint32Array,structuredClone});
const t0=Date.now();
self.onmessage({data:{backup,request:{schemaVersion:1,operation:'search',charts:[{songId,difficulty}],objective:'expected',ownedOnly:true,search:{maxTeams:3,beamWidth:8}},data:{cards,boards,memoryEffects:memory.effects,charts:cat.charts},charts:[chart]}});
const ms=Date.now()-t0;
if(out.status!=='complete'){console.log(out);process.exit(1)}
const r=out.result; const name=id=>{const c=cards.find(x=>x.id===id);return `${c.name}${c.versionName?'·'+c.versionName:''}`};
console.log('elapsed ms',ms,'| keys',Object.keys(r));
for(const x of (r.ranking||r.results).slice(0,3)) console.log(JSON.stringify({rank:x.rank, song:x.title??x.songId, diff:x.difficulty, cards:(x.cardIds||[]).map(name), expected:x.expectedScore, max:x.theoreticalMaxScore, power:x.power?.overallPower}));
