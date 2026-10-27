// 이벤트 규칙 — 공개 추출본(.data/events.json, 번들 c30f45fe 기준)의 실제 일정으로 검증
import { describe, expect, it } from 'vitest';
import { challengeSongBonusPercent, challengeSongIds, currentEvent, eventBonus, eventCandidateCards } from '../src/engine/events';
import { loadMasterData } from '../src/engine/node-data';
import type { Card } from '../src/engine/types';

const data = loadMasterData();
const at = (iso: string) => currentEvent(data.events, Date.parse(iso));
const card = (id: string) => data.cards.find((c) => c.id === id)!;

describe('currentEvent (갤산기 mp)', () => {
  it('릴레이 이벤트는 기간 안의 챕터를 덮어쓰고 이름을 "이벤트 · 챕터"로 만든다', () => {
    const e = at('2026-10-26T00:00:00Z')!;
    expect(e.id).toBe('marathon_event-relay-003-chapter-04');
    expect(e.name).toBe('넘치는 빛과 물가의 드레스 코드 · 코세키 비쥬');
    expect(e.bonusCharacterIds).toEqual(['chr-04014']);
    expect(e.challengeSongBonusCardIds).toEqual({ m0367: ['card-04014-5-uniq-0094-00'] });
    // 챕터에 없는 필드는 이벤트 값 유지
    expect(e.featuredCardIds).toHaveLength(4);
    expect(e.formationBonusPercent).toBe(50);
  });

  it('챕터 기간이 겹치면 가장 늦게 시작한 챕터 (calculatorStartsAt 우선)', () => {
    // 챕터 3 종료(10:59:59) 전이지만 챕터 4 calculatorStartsAt(10:50:10)이 지남
    expect(at('2026-10-25T10:55:00Z')!.id).toBe('marathon_event-relay-003-chapter-04');
    expect(at('2026-10-25T10:50:00Z')!.id).toBe('marathon_event-relay-003-chapter-03');
  });

  it('calculatorStartsAt부터 시작, endsAt까지 포함', () => {
    expect(at('2026-10-19T09:59:59.999Z')).toBeNull();
    expect(at('2026-10-19T10:00:00Z')!.id).toBe('marathon_event-relay-003-chapter-01');
    expect(at('2026-10-27T10:59:59.999Z')!.id).toBe('marathon_event-relay-003-chapter-04');
    expect(at('2026-10-27T11:00:00Z')).toBeNull();
    expect(at('2026-10-14T02:00:00Z')!.id).toBe('notice-sunshine-jamboree-2026-10-15');
  });

  it('일반 이벤트는 원본 객체 그대로, 이벤트 사이 기간은 null', () => {
    const e = at('2026-10-01T00:00:00Z')!;
    expect(e).toBe(data.events.find((x) => x.id === 'marathon_event-normal-005'));
    expect(at('2026-10-18T00:00:00Z')).toBeNull();
  });
});

describe('eventCandidateCards (갤산기 pp)', () => {
  it('5성·4성 전부 + 보너스 멤버의 3성', () => {
    const e = at('2026-10-26T00:00:00Z')!;
    const got = eventCandidateCards(data.cards, e);
    const expected = data.cards.filter((c) => c.rarity >= 4 || (c.rarity === 3 && c.characterId === 'chr-04014'));
    expect(got).toEqual(expected);
    expect(eventCandidateCards(data.cards, null)).toEqual(data.cards.filter((c) => c.rarity >= 4));
  });
});

describe('eventBonus / challengeSongBonusPercent', () => {
  const e = at('2026-10-26T00:00:00Z')!;

  it('편성(보너스 멤버) + 대상 카드 + 개화 테이블', () => {
    const featured = card('card-04014-5-uniq-0094-00'); // 비쥬 수영복: 보너스 멤버 + 대상 카드
    const otherFeatured = card('card-00027-5-uniq-0092-00'); // 토와 수영복: 대상 카드만
    const four = data.cards.find((c) => c.rarity === 4 && c.characterId !== 'chr-04014')!;
    const awakening = new Map<Card, number>([[featured, 5], [otherFeatured, 2], [four, 9]]);
    const b = eventBonus(e, [featured, otherFeatured, four], (c) => awakening.get(c)!);
    expect(b).toEqual({
      formationPercent: 50,
      featuredCardPercent: 100,
      awakeningPercent: 30 + 18 + 10, // 5성 개화5, 5성 개화2, 4성 개화 9→5로 자름
      totalPercent: 208,
    });
  });

  it('과제곡 보너스는 대상 카드가 있을 때만, 중복 없음', () => {
    expect(challengeSongIds(e)).toEqual(['m0367']);
    expect(challengeSongBonusPercent(e, 'm0367', ['card-04014-5-uniq-0094-00', 'x'])).toBe(10);
    expect(challengeSongBonusPercent(e, 'm0367', ['card-00027-5-uniq-0092-00'])).toBe(0);
    expect(challengeSongBonusPercent(e, 'm0366', ['card-04014-5-uniq-0094-00'])).toBe(0);
  });
});
