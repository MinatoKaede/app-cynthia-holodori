// 목표 PT 진행 계산 (화면·알림 공통, 순수 함수).
// 이벤트 PT는 이벤트 시작 시각에 0에서 출발한다고 보고, 시작 시점을 기록의 원점으로 쓴다.
import { basePt, flameRecoveryMinutes, playPt } from './boost';

export interface PtEntry {
  /** 기록한 시각 (ms) */
  at: number;
  pt: number;
}

/** 진행 중인 이벤트 하나의 기록. 새 이벤트가 시작되면 통째로 버린다 (지난 이벤트 기록은 보관하지 않음) */
export interface PtLog {
  eventId: string;
  goal: number | null;
  /** 기준 플레이: 실제로 받은 한 판의 PT와 그때 쓴 불 수. 다른 불 수의 한 판 PT를 배율로 환산한다 */
  sample: { pt: number; boost: number } | null;
  /** 지금 가진 불과 입력한 시각 (남은 기간에 쓸 수 있는 불 계산용) */
  flames: { count: number; at: number } | null;
  entries: PtEntry[];
}

/** 이벤트와 상관없이 유지하는 플레이 방식 */
export interface PlayPrefs {
  passport: boolean;
  /** 한 판에 쓸 불 (0~10) */
  boost: number;
}

export const DEFAULT_PLAY: PlayPrefs = { passport: true, boost: 10 };

export const emptyLog = (eventId: string): PtLog => ({ eventId, goal: null, sample: null, flames: null, entries: [] });

/** 예전 버전 기록(perPlay 등)을 지금 형식으로 */
export function normalizeLog(log: Partial<PtLog> & { eventId: string }): PtLog {
  return { ...emptyLog(log.eventId), goal: log.goal ?? null, sample: log.sample ?? null, flames: log.flames ?? null, entries: log.entries ?? [] };
}

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
  /** 정한 불 수로 한 판 PT (기준 플레이를 입력했을 때만) */
  perPlay: number | null;
  /** 목표까지 필요한 플레이 횟수 */
  playsNeeded: number | null;
  /** 목표까지 필요한 불 */
  flamesNeeded: number | null;
  /** 종료까지 쓸 수 있는 불 = 가진 불 + 회복될 불 */
  flamesAvailable: number;
  /** 쓸 수 있는 불을 정한 불 수로 다 쓰면 도달하는 PT */
  reachablePt: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function pace(log: PtLog, event: { startsAt: string; endsAt: string }, now: number, play: PlayPrefs = DEFAULT_PLAY): Pace {
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

  const perPlay = log.sample && log.sample.pt > 0 ? playPt(basePt(log.sample.pt, log.sample.boost, play.passport), play.boost, play.passport) : null;
  const playsNeeded = remainingPt !== null && perPlay ? Math.ceil(remainingPt / perPlay) : null;
  const flamesNeeded = playsNeeded !== null ? playsNeeded * play.boost : null;

  // 가진 불(입력한 시각 기준) + 그 시각부터 종료까지 회복될 불. 입력이 없으면 지금부터 회복될 불만
  const interval = flameRecoveryMinutes(play.passport) * 60_000;
  const from = Math.min(log.flames?.at ?? now, end);
  const flamesAvailable = (log.flames?.count ?? 0) + Math.floor(Math.max(0, end - from) / interval);
  const reachablePt = perPlay && play.boost > 0 ? current + Math.floor(flamesAvailable / play.boost) * perPlay : null;

  return { current, remainingPt, remainingMs, dailyNeeded, ratePerHour, projectedFinal, perPlay, playsNeeded, flamesNeeded, flamesAvailable, reachablePt };
}
