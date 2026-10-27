// 갤산기(doricalc.cc) 번들에서 앱용 데이터를 추출하는 스크립트 (시제품)
// 사용법: node --max-old-space-size=4096 extract.mjs <app.js 경로> <출력 폴더> [번들 해시]
//
// 출력:
//   events.json        이벤트 목록 (릴레이 챕터 포함, 계산된 최종 형태)
//   cards.json         카드 마스터 { schemaVersion, masterDataVersion, cards[] }
//   boards.json        보드 마스터 { members[], models{}, nodeGroups{} }
//   memory.json        메모리 효과표 { maxCount, effects[] }
//   charts/index.json  채보 목록(메타데이터) + 출처 정보
//   charts/<id>.<difficulty>.json  채보 본문
//   workers/*.js       계산 워커 원문 (수정 없이 그대로)
//   manifest.json      파일별 sha256, 버전, 추출 시각
//
// 원칙: 축소된 변수명은 빌드마다 바뀌므로 "속성 이름"과 "고유 문자열"로만 찾는다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const [, , src, outDir, bundleHash = null] = process.argv;
const code = fs.readFileSync(src, 'utf8');
fs.mkdirSync(path.join(outDir, 'charts'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'workers'), { recursive: true });

const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

// ---- 선언 수집 & 의존성 포함 평가 ----
const decls = new Map();
walk.simple(ast, {
  VariableDeclarator(n) {
    if (n.id.type === 'Identifier' && n.init && !decls.has(n.id.name)) decls.set(n.id.name, n.init);
  },
});
const hasProp = (obj, key) =>
  obj?.type === 'ObjectExpression' &&
  obj.properties.some((p) => p.type === 'Property' && (p.key.name === key || p.key.value === key));
const hasProps = (obj, keys) => keys.every((k) => hasProp(obj, k));

function evaluate(name, seen = new Set()) {
  if (seen.has(name)) throw new Error('cycle ' + name);
  seen.add(name);
  const node = decls.get(name);
  const deps = new Set();
  walk.full(node, (n) => {
    if (n.type === 'Identifier' && decls.has(n.name) && n.name !== name) deps.add(n.name);
  });
  const ctx = {};
  for (const d of deps) {
    try { ctx[d] = evaluate(d, new Set(seen)); } catch { /* 매개변수 등 해석 불가 식별자는 무시 */ }
  }
  return vm.runInNewContext('(' + code.slice(node.start, node.end) + ')', ctx, { timeout: 10000 });
}
function findOne(label, pred, pick) {
  const hits = [...decls].filter(([, init]) => pred(init));
  if (hits.length === 0) throw new Error(`추출 실패: ${label} — 갤산기 코드 구조가 바뀌었을 수 있습니다.`);
  // pick이 없는데 후보가 여럿이면 첫 번째를 쓰되, 구조 변화 신호이므로 경고를 남긴다
  if (hits.length > 1 && !pick) console.warn(`경고: ${label} 후보 ${hits.length}개 — 첫 번째를 사용`);
  let best = null;
  for (const [name] of hits) {
    const v = evaluate(name);
    best = best && pick ? pick(best, v) : best ?? v;
  }
  return best;
}

// ---- 1) 이벤트: bonusCharacterIds를 가진 객체 + 스프레드로 합쳐진 최종 배열 ----
const events = findOne('events',
  (i) => i.type === 'ArrayExpression' && i.elements.some((e) => e?.type === 'SpreadElement') &&
         i.elements.some((e) => hasProp(e, 'bonusCharacterIds')));

// ---- 2) 카드: {masterDataVersion, cards[]} 중 가장 큰 것 ----
const cardsDoc = findOne('cards', (i) => hasProps(i, ['cards', 'masterDataVersion']),
  (a, b) => (b.cards?.length ?? 0) > (a.cards?.length ?? 0) ? b : a);

// ---- 3) 보드 마스터: {members, models, nodeGroups} ----
const boards = findOne('boards', (i) => hasProps(i, ['members', 'models', 'nodeGroups']));

// ---- 4) 메모리 효과표: {maxCount, effects} ----
const memory = findOne('memory', (i) => hasProps(i, ['maxCount', 'effects']));

// ---- 5) 채보 목록: {charts[], masterDataSource} ----
const chartCatalog = findOne('chartCatalog', (i) => hasProps(i, ['charts', 'masterDataSource']));

// ---- 6) 채보 본문: "../static/data/charts/mXXXX.<difficulty>.json" 키의 JSON 문자열 ----
const charts = {};
const lit = (v) => (v.type === 'Literal' ? v.value : v.type === 'TemplateLiteral' && v.expressions.length === 0 ? v.quasis[0].value.cooked : null);
walk.simple(ast, {
  Property(n) {
    const k = n.key.value ?? n.key.name;
    const m = typeof k === 'string' && k.includes('charts/') && k.match(/(m\d{4}\.\w+\.json)$/);
    if (m) { const v = lit(n.value); if (typeof v === 'string') charts[m[1]] = v; }
  },
});

// ---- 7) 워커: onmessage를 포함한 문자열 리터럴을 고유 문자열로 분류 ----
const workerSignatures = [
  ['analysis.js', (v) => v.includes('이 패키지에 없는 채보')],   // 백업+요청을 받는 분석 엔진 (AI 연결용)
  ['prepare-search.js', (v) => v.includes('type===`prepare-search`')], // 조합 탐색 1단계 (이벤트 모드 지원)
  ['exact.js', (v) => v.includes('type===`optimize-exact`')],           // 정밀 최적화·확률·조합 순위
  ['connection.js', (v) => v.includes('type===`connection`')],          // 커넥트 카드 자동 배치
];
const workers = {};
walk.full(ast, (n) => {
  const v = n.type === 'Literal' && typeof n.value === 'string' ? n.value
    : n.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null;
  if (!v || v.length < 3000 || !v.includes('onmessage')) return;
  const hit = workerSignatures.find(([, f]) => f(v));
  if (hit && !workers[hit[0]]) workers[hit[0]] = v;
});

// ---- 검증 ----
const problems = [];
const cardIds = new Set(cardsDoc.cards.map((c) => c.id));
for (const e of events) {
  for (const id of e.featuredCardIds ?? []) if (!cardIds.has(id)) problems.push(`이벤트 ${e.id}: 없는 대상 카드 ${id}`);
}
if (Object.keys(charts).length === 0) problems.push('채보 본문 0개');
for (const [f] of workerSignatures) if (!workers[f]) problems.push(`워커 누락: ${f}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

// ---- 쓰기 ----
const files = {};
const put = (rel, text) => {
  fs.writeFileSync(path.join(outDir, rel), text);
  files[rel] = { sha256: crypto.createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) };
};
put('events.json', JSON.stringify(events));
put('cards.json', JSON.stringify(cardsDoc));
put('boards.json', JSON.stringify(boards));
put('memory.json', JSON.stringify(memory));
put('charts/index.json', JSON.stringify(chartCatalog));
for (const [k, v] of Object.entries(charts)) put(`charts/${k}`, v);
for (const [k, v] of Object.entries(workers)) put(`workers/${k}`, v);
// stats는 다음 추출 때 validate.mjs가 개수 급감을 감지하는 기준으로 쓴다
const stats = {
  events: events.length,
  cards: cardsDoc.cards.length,
  boardMembers: boards.members.length,
  boardModels: Object.keys(boards.models).length,
  nodeGroups: Object.keys(boards.nodeGroups).length,
  memoryEffects: memory.effects.length,
  chartCatalog: chartCatalog.charts.length,
  chartFiles: Object.keys(charts).length,
};
const manifest = {
  schemaVersion: 1,
  extractedAt: new Date().toISOString(),
  source: { site: 'https://doricalc.cc', bundleHash, masterDataVersion: cardsDoc.masterDataVersion },
  stats,
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({
  ...stats,
  events: events.map((e) => `${e.id} ${e.name}${e.chapters ? ` (챕터 ${e.chapters.length})` : ''}`),
  workers: Object.fromEntries(Object.entries(workers).map(([k, v]) => [k, v.length])),
  masterDataVersion: cardsDoc.masterDataVersion.slice(0, 12),
}, null, 2));
