// 스케줄 상태: 진행 중인 이벤트의 목표·PT 기록, 알림 설정. 기기에만 저장한다.
import { idbGet, idbPut } from './lib/idb';
import { DEFAULT_NOTIFY, planNotifications, reschedule, type NotifyPrefs } from './lib/notify';
import { emptyLog, type PtLog } from './lib/pace';
import { baseEvent } from './state.svelte';

export const schedule = $state({
  log: null as PtLog | null,
  notify: { ...DEFAULT_NOTIFY } as NotifyPrefs,
  /** 알림 예약 실패 메시지 (권한 거부 등) */
  notifyError: '',
});

/** 저장된 기록이 지금 이벤트 것이 아니면 버린다 (지난 이벤트 기록은 보관하지 않음) */
function logFor(eventId: string | null, stored: PtLog | null | undefined): PtLog | null {
  if (!eventId) return null;
  return stored && stored.eventId === eventId ? stored : emptyLog(eventId);
}

export async function loadSchedule(): Promise<void> {
  const [log, notify] = await Promise.all([idbGet<PtLog>('kv', 'ptlog'), idbGet<NotifyPrefs>('kv', 'notify')]);
  schedule.notify = { ...DEFAULT_NOTIFY, ...notify };
  const fresh = logFor(baseEvent(Date.now())?.id ?? null, log);
  schedule.log = fresh;
  if (fresh && fresh !== log) await idbPut('kv', 'ptlog', fresh);
  await syncNotifications();
}

/** 데이터가 바뀌었을 때 (새 이벤트가 시작됐을 수 있음) */
export async function refreshSchedule(): Promise<void> {
  const eventId = baseEvent(Date.now())?.id ?? null;
  if (schedule.log?.eventId !== eventId) {
    schedule.log = logFor(eventId, null);
    await idbPut('kv', 'ptlog', $state.snapshot(schedule.log));
  }
  await syncNotifications();
}

async function saveLog(log: PtLog) {
  schedule.log = log;
  await idbPut('kv', 'ptlog', $state.snapshot(log));
  await syncNotifications();
}

export function updateLog(change: Partial<Pick<PtLog, 'goal' | 'perPlay'>>) {
  if (schedule.log) return saveLog({ ...$state.snapshot(schedule.log), ...change });
}

export function addEntry(pt: number, at = Date.now()) {
  if (schedule.log) return saveLog({ ...$state.snapshot(schedule.log), entries: [...schedule.log.entries, { at, pt }] });
}

export function removeEntry(at: number) {
  if (schedule.log) return saveLog({ ...$state.snapshot(schedule.log), entries: schedule.log.entries.filter((e) => e.at !== at) });
}

export async function saveNotify(prefs: NotifyPrefs) {
  schedule.notify = prefs;
  await idbPut('kv', 'notify', $state.snapshot(prefs));
  await syncNotifications();
}

export async function syncNotifications(): Promise<void> {
  try {
    const plan = planNotifications(baseEvent(Date.now()), $state.snapshot(schedule.notify), $state.snapshot(schedule.log), Date.now());
    await reschedule(plan);
    schedule.notifyError = '';
  } catch (e) {
    schedule.notifyError = `알림을 예약하지 못했습니다 (${(e as Error).message})`;
  }
}
