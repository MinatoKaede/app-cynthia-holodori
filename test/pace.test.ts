// 목표 PT 진행 계산
import { describe, expect, it } from 'vitest';
import { emptyLog, pace, type PtLog } from '../src/app/lib/pace';

const event = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-08T00:00:00.000Z' };
const t = (iso: string) => Date.parse(iso);

describe('pace', () => {
  it('기록이 없으면 현재 0, 목표가 없으면 남은 PT도 없음', () => {
    const p = pace(emptyLog('e'), event, t('2026-11-02T00:00:00Z'));
    expect(p).toMatchObject({ current: 0, remainingPt: null, dailyNeeded: null, ratePerHour: null, projectedFinal: null, playsNeeded: null });
    expect(p.remainingMs).toBe(6 * 24 * 3600_000);
  });

  it('시작 시점을 원점으로 평균 속도와 예상 최종 PT를 낸다', () => {
    const log: PtLog = { eventId: 'e', goal: 1_000_000, perPlay: null, entries: [{ at: t('2026-11-02T00:00:00Z'), pt: 100_000 }] };
    const p = pace(log, event, t('2026-11-02T00:00:00Z'));
    expect(p.ratePerHour).toBeCloseTo(100_000 / 24);
    expect(p.projectedFinal).toBe(700_000);
    expect(p.remainingPt).toBe(900_000);
    expect(p.dailyNeeded).toBe(150_000);
  });

  it('기록 순서와 상관없이 가장 늦은 기록이 현재 PT', () => {
    const log: PtLog = {
      eventId: 'e', goal: 500_000, perPlay: 12_000,
      entries: [{ at: t('2026-11-03T00:00:00Z'), pt: 300_000 }, { at: t('2026-11-02T00:00:00Z'), pt: 120_000 }],
    };
    const p = pace(log, event, t('2026-11-03T12:00:00Z'));
    expect(p.current).toBe(300_000);
    expect(p.remainingPt).toBe(200_000);
    expect(p.playsNeeded).toBe(17);
  });

  it('목표를 넘기면 남은 PT 0, 하루 미만이 남으면 남은 양 전체가 하루 필요량', () => {
    const over: PtLog = { eventId: 'e', goal: 100, perPlay: 10, entries: [{ at: t('2026-11-02T00:00:00Z'), pt: 150 }] };
    expect(pace(over, event, t('2026-11-02T00:00:00Z'))).toMatchObject({ remainingPt: 0, playsNeeded: 0 });
    const late: PtLog = { eventId: 'e', goal: 1000, perPlay: null, entries: [{ at: t('2026-11-07T20:00:00Z'), pt: 400 }] };
    expect(pace(late, event, t('2026-11-07T20:00:00Z')).dailyNeeded).toBe(600);
  });
});
