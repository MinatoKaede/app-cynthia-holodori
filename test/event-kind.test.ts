// 이벤트 종류 (게임 정식 명칭): 갤산기 ID와 출처 메모로 구분한다
import { describe, expect, it } from 'vitest';
import { eventKind, isScoreChallenge } from '../src/app/lib/format';
import { loadMasterData } from '../src/engine/node-data';

describe('eventKind', () => {
  it('ID 형식으로 포인트 랠리·스포트라이트', () => {
    expect(eventKind({ id: 'marathon_event-normal-008' })).toBe('포인트 랠리 이벤트');
    expect(eventKind({ id: 'marathon_event-relay-003' })).toBe('스포트라이트 이벤트');
    expect(eventKind({ id: 'notice-sunshine-jamboree-2026-10-15' })).toBeNull();
  });

  it('ID가 포인트 랠리 형식이어도 출처 메모에 score challenge가 있으면 스코어 챌린지', () => {
    const e = { id: 'marathon_event-normal-009', source: { scope: 'Manual configuration. Score challenge event (ranking by challenge-song high scores).' } };
    expect(isScoreChallenge(e)).toBe(true);
    expect(eventKind(e)).toBe('스코어 챌린지 이벤트');
    expect(isScoreChallenge({ source: { scope: 'live bonuses' } })).toBe(false);
    expect(isScoreChallenge(null)).toBe(false);
  });

  const events = (() => {
    try {
      return loadMasterData().events;
    } catch {
      return null;
    }
  })();
  it.skipIf(!events?.some((e) => e.id === 'marathon_event-normal-009'))('실제 데이터: 2026-11 가을밤 이벤트만 스코어 챌린지', () => {
    const kinds = Object.fromEntries(events!.map((e) => [e.id, eventKind(e)]));
    expect(kinds['marathon_event-normal-009']).toBe('스코어 챌린지 이벤트');
    expect(kinds['marathon_event-normal-008']).toBe('포인트 랠리 이벤트');
    expect(kinds['marathon_event-relay-003']).toBe('스포트라이트 이벤트');
  });
});
