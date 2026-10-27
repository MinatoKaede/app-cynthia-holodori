import { describe, expect, it } from 'vitest';
import { compareRankings, dedupeRankings, eventPt } from '../src/engine/ranking';
import type { Ranking } from '../src/engine/types';

const r = (order: string[], expectedScore: number, theoreticalMaxScore: number, eventBonusPercent?: number): Ranking => ({
  result: { order, expectedScore, theoreticalMaxScore },
  eventBonusPercent,
});

describe('ranking', () => {
  it('예상 PT = round(예상 점수 × (1 + 보너스%/100))', () => {
    expect(eventPt(2201021.4, 260)).toBe(Math.round(2201021.4 * 3.6));
    expect(eventPt(1000, 0)).toBe(1000);
  });

  it('이벤트 PT 모드는 PT 우선, 그 외는 최대 점수 우선', () => {
    const highPt = r(['a'], 1_000_000, 1_100_000, 200); // PT 3,000,000
    const highScore = r(['b'], 2_000_000, 2_200_000, 0); // PT 2,000,000
    expect([highScore, highPt].sort((a, b) => compareRankings(a, b, true))[0]).toBe(highPt);
    expect([highPt, highScore].sort((a, b) => compareRankings(a, b, false))[0]).toBe(highScore);
  });

  it('같은 카드 구성(순서 무관)은 가장 좋은 것만 남긴다', () => {
    const a = r(['x', 'y'], 100, 120, 0);
    const b = r(['y', 'x'], 110, 120, 0);
    const c = r(['z', 'y'], 90, 130, 0);
    expect(dedupeRankings([a, b, c], true, 10)).toEqual([b, c]);
    expect(dedupeRankings([a, b, c], false, 1)).toEqual([c]);
  });
});
