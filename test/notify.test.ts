// 알림 계획: 켜 둔 종류만, 지난 시각은 빼고, 챕터·종료 임박·매일 체크 시각이 맞는지
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine/types';
import { DEFAULT_NOTIFY, planNotifications } from '../src/app/lib/notify';

const relay = {
  id: 'marathon_event-relay-009',
  name: '릴레이',
  startsAt: '2026-11-01T11:00:00.000Z',
  endsAt: '2026-11-09T10:59:59.999Z',
  chapters: [
    { id: 'c1', name: '챕터1', startsAt: '2026-11-01T11:00:00.000Z', endsAt: '2026-11-09T10:59:59.999Z' },
    { id: 'c2', name: '챕터2', startsAt: '2026-11-03T11:00:00.000Z', endsAt: '2026-11-09T10:59:59.999Z' },
    { id: 'c3', name: '챕터3', calculatorStartsAt: '2026-11-05T10:00:00.000Z', startsAt: '2026-11-05T11:00:00.000Z', endsAt: '2026-11-09T10:59:59.999Z' },
  ],
} as unknown as GameEvent;

const now = Date.parse('2026-11-02T00:00:00Z');

describe('planNotifications', () => {
  it('기본 설정: 앞으로 올 챕터 전환 + 종료 3시간·1시간 전', () => {
    const plan = planNotifications(relay, DEFAULT_NOTIFY, null, now);
    expect(plan.map((p) => [p.id, new Date(p.at).toISOString()])).toEqual([
      [1001, '2026-11-03T11:00:00.000Z'],
      [1002, '2026-11-05T10:00:00.000Z'],
      [2001, '2026-11-09T07:59:59.999Z'],
      [2002, '2026-11-09T09:59:59.999Z'],
    ]);
    expect(plan[0].extra).toEqual({ action: 'chapter', chapterId: 'c2' });
  });

  it('끈 알림은 빠지고, 지난 시각은 예약하지 않는다', () => {
    expect(planNotifications(relay, { ...DEFAULT_NOTIFY, chapter: false, end3h: false }, null, now).map((p) => p.id)).toEqual([2002]);
    expect(planNotifications(relay, DEFAULT_NOTIFY, null, Date.parse('2026-11-09T09:00:00Z')).map((p) => p.id)).toEqual([2002]);
    expect(planNotifications(relay, DEFAULT_NOTIFY, null, Date.parse('2026-11-10T00:00:00Z'))).toEqual([]);
    expect(planNotifications(null, DEFAULT_NOTIFY, null, now)).toEqual([]);
  });

  it('매일 체크: 정한 시각마다 종료 전까지, 목표가 있으면 남은 PT를 적는다', () => {
    const log = { eventId: relay.id, goal: 1_000_000, perPlay: null, entries: [{ at: now, pt: 250_000 }] };
    const plan = planNotifications(relay, { ...DEFAULT_NOTIFY, chapter: false, end3h: false, end1h: false, daily: true, dailyTime: '21:00' }, log, now);
    expect(plan.length).toBeGreaterThanOrEqual(7);
    for (const p of plan) {
      expect(new Date(p.at).getHours()).toBe(21);
      expect(p.at).toBeGreaterThan(now);
      expect(p.at).toBeLessThan(Date.parse(relay.endsAt));
    }
    expect(plan[0].body).toContain('750,000 PT');
  });
});
