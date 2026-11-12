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

/**
 * 스코어 챌린지 이벤트 (PT가 아니라 지정곡 하이스코어 합계로 순위). 갤산기 ID는 포인트 랠리와 같은
 * marathon_event-normal-*이고 구분 필드가 없어, 출처 메모(source)의 "Score challenge event" 문구로 판단한다.
 */
export function isScoreChallenge(event: { source?: unknown } | null | undefined): boolean {
  return !!event?.source && /score challenge event/i.test(JSON.stringify(event.source));
}

/** 게임 속 정식 명칭 (갤산기 임시 ID notice-…는 종류를 알 수 없음) */
export function eventKind(event: { id: string; source?: unknown }): string | null {
  if (isScoreChallenge(event)) return '스코어 챌린지 이벤트';
  if (event.id.startsWith('marathon_event-relay')) return '스포트라이트 이벤트';
  if (event.id.startsWith('marathon_event-normal')) return '포인트 랠리 이벤트';
  return null;
}
