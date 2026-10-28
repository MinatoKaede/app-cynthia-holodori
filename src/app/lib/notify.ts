// 스케줄 알림. 이벤트·챕터 시각은 미리 알 수 있으므로 서버 없이 기기에서 예약한다.
// 무엇을 언제 보낼지(planNotifications)는 순수 함수로 두고, 실제 예약은 앱에서만 한다.
import { LocalNotifications } from '@capacitor/local-notifications';
import type { EventSchedule, GameEvent } from '../../engine/types';
import { num } from './format';
import { pace, type PtLog } from './pace';
import { isNative } from './platform';

export interface NotifyPrefs {
  chapter: boolean;
  end3h: boolean;
  end1h: boolean;
  daily: boolean;
  /** 매일 진행 체크 시각 "HH:MM" (기기 현지 시각) */
  dailyTime: string;
}

export const DEFAULT_NOTIFY: NotifyPrefs = { chapter: true, end3h: true, end1h: true, daily: false, dailyTime: '21:00' };

export interface PlannedNotification {
  id: number;
  at: number;
  title: string;
  body: string;
  /** 알림을 눌렀을 때 할 일 */
  extra: { action: 'chapter'; chapterId: string } | { action: 'schedule' };
}

const HOUR = 3_600_000;
const startOf = (x: EventSchedule) => Date.parse(x.calculatorStartsAt ?? x.startsAt);

/** 이 앱이 쓰는 알림 ID 범위 (다시 예약할 때 이 범위만 지운다) */
const ID = { chapter: 1000, end3h: 2001, end1h: 2002, daily: 3000 };

export function planNotifications(event: GameEvent | null, prefs: NotifyPrefs, log: PtLog | null, now: number): PlannedNotification[] {
  if (!event) return [];
  const end = Date.parse(event.endsAt);
  if (end <= now) return [];
  const out: PlannedNotification[] = [];

  if (prefs.chapter) {
    (event.chapters ?? []).forEach((c, i) => {
      const at = startOf(c);
      if (at > now) {
        out.push({
          id: ID.chapter + i,
          at,
          title: `새 챕터 시작: ${c.name}`,
          body: '보너스 멤버가 바뀌었어요. 눌러서 이 챕터의 덱을 확인하세요.',
          extra: { action: 'chapter', chapterId: c.id },
        });
      }
    });
  }

  for (const [key, hours] of [['end3h', 3], ['end1h', 1]] as const) {
    const at = end - hours * HOUR;
    if (prefs[key] && at > now) {
      out.push({ id: ID[key], at, title: `이벤트 종료 ${hours}시간 전`, body: `${event.name} — 마무리 플레이를 잊지 마세요.`, extra: { action: 'schedule' } });
    }
  }

  if (prefs.daily) {
    const [h, m] = prefs.dailyTime.split(':').map(Number);
    const p = log && log.eventId === event.id ? pace(log, event, now) : null;
    const body = p?.remainingPt != null
      ? `목표까지 ${num(p.remainingPt)} PT 남음 (마지막 기록 기준). 오늘 PT를 기록해 페이스를 확인하세요.`
      : '오늘 PT를 기록하고 목표 페이스를 확인하세요.';
    const day = new Date(now);
    day.setHours(h, m, 0, 0);
    for (let k = 0; day.getTime() < end && k < 60; k++) {
      if (day.getTime() > now) out.push({ id: ID.daily + k, at: day.getTime(), title: '오늘의 이벤트 진행 체크', body, extra: { action: 'schedule' } });
      day.setDate(day.getDate() + 1);
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function notificationPermission(request = false): Promise<PermissionState> {
  if (!isNative) return 'unsupported';
  try {
    const s = request ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
    return s.display === 'granted' ? 'granted' : s.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** 이 앱의 예약 알림을 모두 지우고 다시 예약한다 (데이터·설정·PT 기록이 바뀔 때마다) */
export async function reschedule(planned: PlannedNotification[]): Promise<void> {
  if (!isNative) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  if (planned.length === 0) return;
  if ((await notificationPermission()) !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: planned.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      largeBody: n.body,
      schedule: { at: new Date(n.at), allowWhileIdle: true },
      extra: n.extra,
      autoCancel: true,
    })),
  });
}

/** 알림을 눌렀을 때 */
export function onNotificationTap(handler: (extra: PlannedNotification['extra']) => void): void {
  if (!isNative) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    if (a.notification.extra?.action) handler(a.notification.extra);
  });
}
