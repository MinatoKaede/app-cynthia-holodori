// 화면 표시용 서식
const nf = new Intl.NumberFormat('ko-KR');

export const num = (n: number) => nf.format(Math.round(n));
export const pct = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;

const dtf = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const df = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });

export const dateTime = (iso: string | number) => dtf.format(new Date(iso));
export const date = (iso: string | number) => df.format(new Date(iso));

/** "3일 4시간 남음" / "2시간 15분 남음" */
export function remaining(endsAt: string, now: number): string {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return '종료';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}일 ${h}시간 남음`;
  return `${h}시간 ${m % 60}분 남음`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export const DIFFICULTY_LABEL: Record<string, string> = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', expert: 'EXPERT' };

/** 이벤트 ID 앞부분으로 종류를 표시 (갤산기 임시 ID notice-…는 종류를 알 수 없음) */
export function eventKind(id: string): string | null {
  if (id.startsWith('marathon_event-relay')) return '릴레이 이벤트';
  if (id.startsWith('marathon_event-normal')) return '마라톤 이벤트';
  return null;
}
