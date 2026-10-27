// extract.mjs 출력 검증
// 사용법: node validate.mjs <출력 폴더> [이전 공개본 manifest.json 경로]
//
// 오류가 하나라도 있으면 종료 코드 1 → 워크플로가 배포 단계로 넘어가지 않아 이전 공개본이 유지된다.
// 경고는 배포를 막지 않는다 (Actions 화면에 표시만 함).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [, , dir, prevManifestPath] = process.argv;
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const read = (rel) => fs.readFileSync(path.join(dir, rel));
function json(rel) {
  try { return JSON.parse(read(rel)); } catch (e) { err(`${rel}: 읽기/파싱 실패 (${e.message})`); return null; }
}
const isTime = (v) => (typeof v === 'string' || typeof v === 'number') && !Number.isNaN(new Date(v).getTime());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- 1) manifest: 나열된 파일이 모두 있고 sha256이 맞는지, 나열되지 않은 파일은 없는지 ----
const manifest = json('manifest.json');
if (!manifest?.files) { console.error('manifest.json이 없거나 files가 없습니다.'); process.exit(1); }
for (const [rel, { sha256, bytes }] of Object.entries(manifest.files)) {
  let buf;
  try { buf = read(rel); } catch { err(`manifest에 있는 파일이 없음: ${rel}`); continue; }
  if (buf.length !== bytes) err(`${rel}: 크기 불일치 (${buf.length} ≠ ${bytes})`);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== sha256) err(`${rel}: sha256 불일치`);
}
const listed = new Set(Object.keys(manifest.files));
for (const rel of fs.readdirSync(dir, { recursive: true })) {
  const p = rel.split(path.sep).join('/');
  if (p !== 'manifest.json' && fs.statSync(path.join(dir, rel)).isFile() && !listed.has(p)) warn(`manifest에 없는 파일: ${p}`);
}
if (!/^[0-9a-f]{8,}$/.test(manifest.source?.bundleHash ?? '')) err('manifest.source.bundleHash가 비어 있거나 형식이 다름');

// ---- 2) 카드·보드·메모리 ----
const cardsDoc = json('cards.json');
const cards = cardsDoc?.cards ?? [];
if (cards.length === 0) err('카드 0장');
const cardIds = new Set();
for (const c of cards) {
  if (cardIds.has(c.id)) err(`중복 카드 ID: ${c.id}`);
  cardIds.add(c.id);
  if (typeof c.characterId !== 'string' || ![3, 4, 5].includes(c.rarity)) err(`카드 형식 이상: ${c.id}`);
}
const boards = json('boards.json');
const memberIds = new Set((boards?.members ?? []).map((m) => m.id));
if (memberIds.size === 0) err('보드 멤버 0명');
const memory = json('memory.json');
if (!isNum(memory?.maxCount) || !(memory?.effects?.length > 0)) err('메모리 효과표 형식 이상');

// ---- 3) 채보: 목록과 본문이 1:1로 맞는지 ----
const catalog = json('charts/index.json');
const chartKeys = new Set();
for (const c of catalog?.charts ?? []) {
  const key = `${c.songId}.${c.difficulty}`;
  if (chartKeys.has(key)) err(`채보 목록 중복: ${key}`);
  chartKeys.add(key);
  if (!listed.has(`charts/${key}.json`)) { err(`채보 본문 없음: ${key}`); continue; }
  if (!fs.existsSync(path.join(dir, 'charts', `${key}.json`))) continue; // 1)에서 이미 오류 처리
  const body = json(`charts/${key}.json`);
  if (body && (body.songId !== c.songId || body.difficulty !== c.difficulty || !(body.notes?.length > 0)))
    err(`채보 본문 내용 이상: ${key}`);
}
if (chartKeys.size === 0) err('채보 목록 0개');
for (const rel of listed) {
  const m = rel.match(/^charts\/(.+)\.json$/);
  if (m && m[1] !== 'index' && !chartKeys.has(m[1])) warn(`목록에 없는 채보 본문: ${m[1]}`);
}
const songIds = new Set([...chartKeys].map((k) => k.split('.')[0]));

// ---- 4) 이벤트 (챕터 포함) ----
function checkSchedule(label, x) {
  if (typeof x.id !== 'string' || typeof x.name !== 'string') err(`${label}: id/name 없음`);
  if (!isTime(x.startsAt) || !isTime(x.endsAt)) err(`${label}: startsAt/endsAt 형식 이상`);
  else if (new Date(x.startsAt) >= new Date(x.endsAt)) err(`${label}: 시작이 종료보다 늦음`);
  if (x.calculatorStartsAt != null && !isTime(x.calculatorStartsAt)) err(`${label}: calculatorStartsAt 형식 이상`);
  if (!Array.isArray(x.bonusCharacterIds)) err(`${label}: bonusCharacterIds 없음`);
  for (const id of x.bonusCharacterIds ?? []) if (!memberIds.has(id)) err(`${label}: 없는 보너스 멤버 ${id}`);
  for (const [songId, ids] of Object.entries(x.challengeSongBonusCardIds ?? {})) {
    if (!songIds.has(songId)) warn(`${label}: 채보 목록에 없는 과제곡 ${songId}`);
    for (const id of ids) if (!cardIds.has(id)) err(`${label}: 과제곡 보너스에 없는 카드 ${id}`);
  }
}
const events = json('events.json') ?? [];
if (!Array.isArray(events) || events.length === 0) err('이벤트 0개');
const eventIds = new Set();
for (const e of events) {
  const label = `이벤트 ${e.id}`;
  if (eventIds.has(e.id)) err(`중복 이벤트 ID: ${e.id}`);
  eventIds.add(e.id);
  checkSchedule(label, e);
  for (const k of ['formationBonusPercent', 'featuredCardBonusPercent']) if (!isNum(e[k])) err(`${label}: ${k} 없음`);
  if (e.challengeSongScoreBonusPercent != null && !isNum(e.challengeSongScoreBonusPercent)) err(`${label}: challengeSongScoreBonusPercent 형식 이상`);
  for (const id of e.featuredCardIds ?? []) if (!cardIds.has(id)) err(`${label}: 없는 대상 카드 ${id}`);
  for (const r of ['3', '4', '5']) {
    const row = e.awakeningBonusPercentByRarity?.[r];
    if (!Array.isArray(row) || row.length !== 6 || !row.every(isNum)) err(`${label}: awakeningBonusPercentByRarity[${r}] 형식 이상`);
  }
  for (const ch of e.chapters ?? []) checkSchedule(`${label} 챕터 ${ch.id}`, ch);
}

// ---- 5) 워커: 4개 모두 있고 고유 문자열 유지 ----
const workerSignatures = {
  'analysis.js': '이 패키지에 없는 채보',
  'prepare-search.js': 'type===`prepare-search`',
  'exact.js': 'type===`optimize-exact`',
  'connection.js': 'type===`connection`',
};
for (const [f, sig] of Object.entries(workerSignatures)) {
  if (!listed.has(`workers/${f}`)) { err(`워커 누락: ${f}`); continue; }
  const src = read(`workers/${f}`).toString('utf8');
  if (!src.includes('onmessage') || !src.includes(sig)) err(`워커 내용 이상: ${f}`);
}

// ---- 6) 이전 공개본과 개수 비교: 10% 넘게 줄면 오류, 조금이라도 줄면 경고 ----
if (prevManifestPath && fs.existsSync(prevManifestPath)) {
  const prev = JSON.parse(fs.readFileSync(prevManifestPath, 'utf8')).stats ?? {};
  for (const [k, now] of Object.entries(manifest.stats ?? {})) {
    const before = prev[k];
    if (!isNum(before) || now >= before) continue;
    (now < before * 0.9 ? err : warn)(`${k} 감소: ${before} → ${now}`);
  }
}

// ---- 결과 ----
const gha = !!process.env.GITHUB_ACTIONS;
for (const w of warnings) console.log(gha ? `::warning::${w}` : `경고: ${w}`);
for (const e of errors) console.log(gha ? `::error::${e}` : `오류: ${e}`);
console.log(`검증 ${errors.length ? '실패' : '통과'} — 오류 ${errors.length}, 경고 ${warnings.length}`, JSON.stringify(manifest.stats ?? {}));
process.exit(errors.length ? 1 : 0);
