// 추출한 갤산기 워커를 Node에서 실제로 돌려 연결 코드와 대조한다 (fixtures/ 백업 필요)
import { describe, expect, it } from 'vitest';
import { buildPrepareContext, defaultSettings, growthFromBackup, type SearchMode } from '../src/engine/context';
import { challengeSongBonusPercent, eventBonus } from '../src/engine/events';
import { loadBackup, loadChart, loadMasterData } from '../src/engine/node-data';
import { nodeWorkerFactory } from '../src/engine/node-worker';
import { SearchCancelledError, searchCombinations } from '../src/engine/search';
import type { Finalist, Growth } from '../src/engine/types';

const data = loadMasterData();
const backup = loadBackup();
const workers = nodeWorkerFactory('.data');
const now = Date.parse('2026-10-26T00:00:00Z'); // 릴레이 3 · 챕터 4 (과제곡 m0367)
const chart = data.charts.find((c) => c.songId === 'm0367' && c.difficulty === 'expert')!;

function contextFor(mode: SearchMode, growth: Growth) {
  const settings = { ...defaultSettings(data.cards, mode), ownedCardsOnly: true };
  return buildPrepareContext({ data, growth, chart, settings, mode, now });
}

function prepare(context: ReturnType<typeof contextFor>): Promise<Finalist[]> {
  const w = workers.prepare();
  return new Promise((resolve, reject) => {
    w.onmessage = ({ data: d }) => {
      if (d.type === 'error') reject(new Error(d.message));
      if (d.type === 'preparation-result') resolve(d.finalists);
    };
    w.postMessage({ type: 'prepare-search', requestId: 1, context });
  }).finally(() => w.terminate()) as Promise<Finalist[]>;
}

describe.skipIf(!backup)('갤산기 워커 대조 (사용자 백업)', () => {
  const growth = growthFromBackup(backup ?? {});
  const awakeningOf = (id: string) => growth.collection[id]?.awakening ?? 0;

  it('이벤트 PT: 후보마다 워커의 보너스% = 연결 코드의 eventBonus, 배율 = 1 + 보너스%/100', async () => {
    const context = contextFor('event-pt', growth);
    const finalists = await prepare(context);
    expect(finalists.length).toBeGreaterThan(0);
    for (const f of finalists) {
      const ids = (f.cards as { id: string }[]).map((c) => c.id);
      const cards = ids.map((id) => data.cards.find((c) => c.id === id)!);
      const bonus = eventBonus(context.currentEvent!, cards, (c) => awakeningOf(c.id));
      expect(f.eventBonusPercent).toBe(bonus.totalPercent);
      expect(f.rankingMultiplier).toBe(1 + bonus.totalPercent / 100);
      expect(f.finalScoreBonusPercent).toBe(challengeSongBonusPercent(context.currentEvent!, 'm0367', ids));
      expect(f.optimizationObjective).toBe('expected');
    }
  }, 60_000);

  it('이벤트 점수: 보너스%는 기록하되 PT 배율 없이 최대 점수 목표', async () => {
    const finalists = await prepare(contextFor('event-score', growth));
    expect(finalists.length).toBeGreaterThan(0);
    for (const f of finalists) {
      expect(f.eventBonusPercent).toBeTypeOf('number');
      expect(f.rankingMultiplier).toBeUndefined();
      expect(f.optimizationObjective).toBe('maximum');
    }
  }, 60_000);

  it('백업의 메모리 수·강화율은 앱에서 덮어쓸 수 있다', () => {
    const g = growthFromBackup(backup ?? {}, { memoryCount: 12, memberPowerUpPercent: 30 });
    expect(g).toMatchObject({ memoryCount: 12, memberPowerUpPercent: 30 });
    expect(g.collection).toBe(growth.collection);
  });

  it('취소하면 SearchCancelledError로 끝나고 워커를 모두 종료한다', async () => {
    const controller = new AbortController();
    const spawned: { terminated: boolean }[] = [];
    const tracking = {
      prepare: () => track(workers.prepare()),
      exact: () => track(workers.exact()),
    };
    function track<T extends { terminate(): void }>(w: T): T {
      const state = { terminated: false };
      spawned.push(state);
      const original = w.terminate.bind(w);
      w.terminate = () => { state.terminated = true; original(); };
      return w;
    }
    const search = searchCombinations({
      context: contextFor('event-pt', growth),
      chart: loadChart('m0367', 'expert'),
      workers: tracking,
      onProgress: (p) => { if (p.phase === 'exact') controller.abort(); },
      signal: controller.signal,
    });
    await expect(search).rejects.toBeInstanceOf(SearchCancelledError);
    expect(spawned.length).toBeGreaterThanOrEqual(2);
    expect(spawned.every((s) => s.terminated)).toBe(true);
  }, 60_000);
});
