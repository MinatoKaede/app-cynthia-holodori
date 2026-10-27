// 조합 순위 정렬. 갤산기 조합 탐색 화면의 함수를 그대로 옮겼다 (괄호 안은 번들 c30f45fe의 함수명).
import type { Ranking } from './types';

/** 예상 PT (hp) = round(예상 점수 × (1 + 이벤트 보너스%/100)) */
export function eventPt(expectedScore: number, eventBonusPercent: number): number {
  return Math.round(expectedScore * (1 + eventBonusPercent / 100));
}

const ptOf = (r: Ranking) => eventPt(r.result.expectedScore, r.eventBonusPercent ?? 0);

/** 화면 정렬 (Vt, gp, Bt): 이벤트 PT 모드는 예상 PT, 그 외는 이론상 최대 점수 우선 */
export function compareRankings(a: Ranking, b: Ranking, eventPtMode: boolean): number {
  if (eventPtMode) return ptOf(b) - ptOf(a) || b.result.expectedScore - a.result.expectedScore;
  return (
    b.result.theoreticalMaxScore - a.result.theoreticalMaxScore ||
    b.result.expectedScore - a.result.expectedScore ||
    b.result.theoreticalMaxScore - a.result.theoreticalMaxScore
  );
}

/** exact 워커 풀의 병합 정렬 기준 (gh, _h) */
function poolScore(r: Ranking): number {
  return (r.rankingMultiplier === undefined ? r.result.theoreticalMaxScore : r.result.expectedScore) * (r.rankingMultiplier ?? 1);
}
export function comparePool(a: Ranking, b: Ranking): number {
  return (
    poolScore(b) - poolScore(a) ||
    b.result.expectedScore - a.result.expectedScore ||
    b.result.theoreticalMaxScore - a.result.theoreticalMaxScore
  );
}

/** 같은 카드 구성(순서 무관)은 가장 좋은 것 하나만 남기고 정렬 후 limit개 (Kt) */
export function dedupeRankings(rankings: Ranking[], eventPtMode: boolean, limit: number): Ranking[] {
  const best = new Map<string, Ranking>();
  for (const r of rankings) {
    const key = [...r.result.order].sort().join('|');
    const prev = best.get(key);
    if (!prev || compareRankings(r, prev, eventPtMode) < 0) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => compareRankings(a, b, eventPtMode)).slice(0, limit);
}
