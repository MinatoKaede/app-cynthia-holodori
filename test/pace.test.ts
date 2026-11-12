// 목표 PT 진행 계산, 라이브 부스트·패스포트 환산
import { describe, expect, it } from 'vitest';
import { basePt, flameRecoveryMinutes, playPt } from '../src/app/lib/boost';
import { emptyLog, normalizeLog, pace, type PtLog } from '../src/app/lib/pace';

const event = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-08T00:00:00.000Z' };
const t = (iso: string) => Date.parse(iso);
const log = (over: Partial<PtLog>): PtLog => ({ ...emptyLog('e'), ...over });

describe('라이브 부스트·패스포트', () => {
  it('패스포트는 부스트까지 곱한 전체에 마지막으로 2배', () => {
    // 3불(×24)·패스포트로 72,000 → 기본 1,500
    expect(basePt(72_000, 3, true)).toBe(1_500);
    expect(playPt(1_500, 10, true)).toBe(168_000);
    expect(playPt(1_500, 10, false)).toBe(84_000);
    expect(playPt(1_500, 0, true)).toBe(3_000);
  });

  it('불 회복: 패스포트 45분, 없으면 90분', () => {
    expect(flameRecoveryMinutes(true)).toBe(45);
    expect(flameRecoveryMinutes(false)).toBe(90);
  });
});

describe('pace', () => {
  it('기록이 없으면 현재 0, 목표가 없으면 남은 PT도 없음', () => {
    const p = pace(emptyLog('e'), event, t('2026-11-02T00:00:00Z'));
    expect(p).toMatchObject({ current: 0, remainingPt: null, dailyNeeded: null, ratePerHour: null, projectedFinal: null, perPlay: null, playsNeeded: null });
    expect(p.remainingMs).toBe(6 * 24 * 3600_000);
  });

  it('시작 시점을 원점으로 평균 속도와 예상 최종 PT를 낸다', () => {
    const p = pace(log({ goal: 1_000_000, entries: [{ at: t('2026-11-02T00:00:00Z'), pt: 100_000 }] }), event, t('2026-11-02T00:00:00Z'));
    expect(p.ratePerHour).toBeCloseTo(100_000 / 24);
    expect(p.projectedFinal).toBe(700_000);
    expect(p.remainingPt).toBe(900_000);
    expect(p.dailyNeeded).toBe(150_000);
  });

  it('기록 순서와 상관없이 가장 늦은 기록이 현재 PT', () => {
    const l = log({ goal: 500_000, entries: [{ at: t('2026-11-03T00:00:00Z'), pt: 300_000 }, { at: t('2026-11-02T00:00:00Z'), pt: 120_000 }] });
    expect(pace(l, event, t('2026-11-03T12:00:00Z'))).toMatchObject({ current: 300_000, remainingPt: 200_000 });
  });

  it('목표를 넘기면 남은 PT 0, 하루 미만이 남으면 남은 양 전체가 하루 필요량', () => {
    expect(pace(log({ goal: 100, entries: [{ at: t('2026-11-02T00:00:00Z'), pt: 150 }] }), event, t('2026-11-02T00:00:00Z')).remainingPt).toBe(0);
    const late = log({ goal: 1000, entries: [{ at: t('2026-11-07T20:00:00Z'), pt: 400 }] });
    expect(pace(late, event, t('2026-11-07T20:00:00Z')).dailyNeeded).toBe(600);
  });

  it('기준 플레이로 한 판 PT·필요 판수·필요 불, 남은 기간 불로 도달 가능한 PT', () => {
    // 3불·패스포트 72,000 → 10불 168,000. 남은 300,000 → 2판, 20불
    const l = log({ goal: 400_000, sample: { pt: 72_000, boost: 3 }, entries: [{ at: t('2026-11-07T00:00:00Z'), pt: 100_000 }] });
    const p = pace(l, event, t('2026-11-07T00:00:00Z'), { passport: true, boost: 10 });
    expect(p).toMatchObject({ perPlay: 168_000, playsNeeded: 2, flamesNeeded: 20 });
    // 남은 24시간 / 45분 = 32불 → 10불 3판 → 100,000 + 504,000
    expect(p.flamesAvailable).toBe(32);
    expect(p.reachablePt).toBe(604_000);
    // 지금 가진 불 5개를 입력하면 더해진다, 패스포트가 없으면 회복 90분
    const withStock = pace({ ...l, flames: { count: 5, at: t('2026-11-07T00:00:00Z') } }, event, t('2026-11-07T00:00:00Z'), { passport: false, boost: 10 });
    expect(withStock.flamesAvailable).toBe(5 + 16);
    expect(withStock.perPlay).toBe(84_000 * 2); // 기준 플레이도 패스포트 없이 받은 것으로 환산
  });

  it('예전 형식(perPlay) 기록을 읽어도 깨지지 않는다', () => {
    const old = { eventId: 'e', goal: 10, perPlay: 5, entries: [] } as unknown as PtLog;
    expect(normalizeLog(old)).toEqual({ eventId: 'e', goal: 10, sample: null, flames: null, entries: [] });
  });
});
