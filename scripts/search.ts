// 사용자 백업으로 조합 탐색을 실행해 결과를 출력한다 (갤산기 화면과 눈으로 대조할 때)
// 사용법: npx vite-node scripts/search.ts -- [event-pt|event-score|normal] [songId] [difficulty] [now ISO]
import { buildPrepareContext, defaultSettings, growthFromBackup, type SearchMode } from '../src/engine/context';
import { challengeSongIds } from '../src/engine/events';
import { loadBackup, loadChart, loadMasterData } from '../src/engine/node-data';
import { nodeWorkerFactory } from '../src/engine/node-worker';
import { eventPt } from '../src/engine/ranking';
import { searchCombinations } from '../src/engine/search';

const args = process.argv.slice(2).filter((a) => a !== '--');
const mode = (args[0] ?? 'event-pt') as SearchMode;
const now = args[3] ? Date.parse(args[3]) : Date.now();
const data = loadMasterData();
const backup = loadBackup();
if (!backup) throw new Error('fixtures/에 갤산기 백업이 없습니다.');

const settings = defaultSettings(data.cards, mode);
const probe = buildPrepareContext({ data, growth: growthFromBackup(backup), chart: data.charts[0], settings, mode, now });
const songId = args[1] ?? challengeSongIds(probe.currentEvent)[0] ?? 'm0367';
const difficulty = args[2] ?? 'expert';
const chartMeta = data.charts.find((c) => c.songId === songId && c.difficulty === difficulty);
if (!chartMeta) throw new Error(`채보 없음: ${songId}.${difficulty}`);
const context = buildPrepareContext({ data, growth: growthFromBackup(backup), chart: chartMeta, settings, mode, now });

console.log(`모드 ${mode} · ${chartMeta.title} ${difficulty} · 이벤트 ${context.currentEvent?.name ?? '없음'} · 번들 ${data.bundleHash}`);
const t0 = Date.now();
let last = '';
const result = await searchCombinations({
  context,
  chart: loadChart(songId, difficulty),
  workers: nodeWorkerFactory('.data'),
  onProgress: (p) => {
    const line = `${p.phase} ${Math.floor((p.completed / Math.max(1, p.total)) * 100)}%`;
    if (line !== last) process.stderr.write(`\r${(last = line).padEnd(24)}`);
  },
});
console.error(`\n${((Date.now() - t0) / 1000).toFixed(1)}초 · 선별 ${result.screenedCount} · 정밀 ${result.exactCount}`);

const name = (id: string) => {
  const c = data.cards.find((x) => x.id === id);
  return c ? `${c.name}${c.versionName ? '·' + c.versionName : ''}` : id;
};
result.rankings.forEach((r, i) => {
  const pt = r.eventBonusPercent === undefined ? '' : ` PT ${eventPt(r.result.expectedScore, r.eventBonusPercent)} (+${r.eventBonusPercent}%)`;
  console.log(`${i + 1}. 예상 ${Math.round(r.result.expectedScore)} 최대 ${Math.round(r.result.theoreticalMaxScore)}${pt} | ${r.result.order.map(name).join(', ')}`);
});
