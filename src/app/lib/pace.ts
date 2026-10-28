// 목표 PT 진행 계산 (화면·알림 공통, 순수 함수).
// 이벤트 PT는 이벤트 시작 시각에 0에서 출발한다고 보고, 시작 시점을 기록의 원점으로 쓴다.

export interface PtEntry {
  /** 기록한 시각 (ms) */
  at: number;
  pt: number;
}

/** 진행 중인 이벤트 하나의 기록. 새 이벤트가 시작되면 통째로 버린다 (지난 이벤트 기록은 보관하지 않음) */
export interface PtLog {
  eventId: string;
  goal: number | null;
  /** 한 판에 얻는 실제 PT (직접 입력). 부스트 배율 계산은 실제 값을 확인한 뒤 추가 */
  perPlay: number | null;
  entries: PtEntry[];
}

export const emptyLog = (eventId: string): PtLog => ({ eventId, goal: null, perPlay: null, entries: [] });

/** 시각 순으로 정렬한 기록 (같은 시각이면 나중에 넣은 값) */
export function sortedEntries(log: PtLog): PtEntry[] {
  return [...log.entries].sort((a, b) => a.at - b.at);
}

export interface Pace {
  current: number;
  remainingPt: number | null;
  remainingMs: number;
  /** 남은 기간에 하루 평균 필요한 PT. 하루 미만이 남았으면 남은 시간 전체에 필요한 양과 같다 */
  dailyNeeded: number | null;
  /** 시작부터 지금까지 평균 속도 (PT/시간) */
  ratePerHour: number | null;
  /** 지금 평균 속도를 유지했을 때 종료 시 예상 PT */
  projectedFinal: number | null;
  /** 목표까지 필요한 플레이 횟수 (1회당 PT를 입력했을 때만) */
  playsNeeded: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function pace(log: PtLog, event: { startsAt: string; endsAt: string }, now: number): Pace {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const entries = sortedEntries(log);
  const last = entries.at(-1);
  const current = last?.pt ?? 0;
  const remainingMs = Math.max(0, end - now);
  const remainingPt = log.goal === null ? null : Math.max(0, log.goal - current);

  let ratePerHour: number | null = null;
  let projectedFinal: number | null = null;
  if (last && last.at > start) {
    ratePerHour = (last.pt / (last.at - start)) * HOUR;
    projectedFinal = Math.round(last.pt + (ratePerHour / HOUR) * Math.max(0, end - last.at));
  }

  const dailyNeeded = remainingPt === null ? null : Math.ceil(remainingPt / Math.max(1, remainingMs / DAY));
  const playsNeeded = remainingPt !== null && log.perPlay && log.perPlay > 0 ? Math.ceil(remainingPt / log.perPlay) : null;
  return { current, remainingPt, remainingMs, dailyNeeded, ratePerHour, projectedFinal, playsNeeded };
}
