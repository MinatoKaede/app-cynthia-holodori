// 이벤트 규칙. 갤산기 코드를 그대로 옮겼다 (괄호 안은 2026-10-27 번들 c30f45fe의 함수명).
import type { Card, GameEvent, Rarity } from './types';

const startOf = (x: { startsAt: string; calculatorStartsAt?: string }) => Date.parse(x.calculatorStartsAt ?? x.startsAt);
export const isActive = (x: { startsAt: string; calculatorStartsAt?: string; endsAt: string }, now: number) =>
  startOf(x) <= now && now <= Date.parse(x.endsAt);

/**
 * 진행 중인 이벤트 (mp). 배열 순서상 첫 번째로 기간에 든 이벤트를 고르고,
 * 챕터가 있으면 기간에 든 챕터 중 가장 늦게 시작한 것을 덮어쓴다. 챕터가 하나도 기간에 없으면 null.
 */
export function currentEvent(events: GameEvent[], now: number): GameEvent | null {
  const event = events.find((e) => isActive(e, now));
  if (!event) return null;
  if (!event.chapters) return event;
  const chapter = event.chapters
    .filter((c) => isActive(c, now))
    .sort((a, b) => startOf(b) - startOf(a))[0];
  return chapter ? { ...event, ...chapter, name: `${event.name} · ${chapter.name}` } : null;
}

/** 이벤트 모드 후보 카드 (fp, pp): 5성·4성 전부 + 보너스 멤버의 3성 */
export function eventCandidateCards(cards: Card[], event: GameEvent | null): Card[] {
  const bonus = new Set(event?.bonusCharacterIds ?? []);
  return cards.filter((c) => c.rarity === 5 || c.rarity === 4 || bonus.has(c.characterId));
}

export interface EventBonus {
  formationPercent: number;
  featuredCardPercent: number;
  awakeningPercent: number;
  totalPercent: number;
}

/** 이벤트 보너스% 내역 (prepare-search 워커의 j). 개화는 0~5로 잘라 쓴다. */
export function eventBonus(event: GameEvent, cards: Card[], awakeningOf: (card: Card) => number): EventBonus {
  const bonusMembers = new Set(event.bonusCharacterIds);
  const featured = new Set(event.featuredCardIds);
  let formationPercent = 0;
  let featuredCardPercent = 0;
  let awakeningPercent = 0;
  for (const card of cards) {
    if (bonusMembers.has(card.characterId)) formationPercent += event.formationBonusPercent;
    if (featured.has(card.id)) featuredCardPercent += event.featuredCardBonusPercent;
    const awakening = Math.max(0, Math.min(5, Math.trunc(awakeningOf(card))));
    awakeningPercent += event.awakeningBonusPercentByRarity[card.rarity as Rarity]?.[awakening] ?? 0;
  }
  return { formationPercent, featuredCardPercent, awakeningPercent, totalPercent: formationPercent + featuredCardPercent + awakeningPercent };
}

/** 과제곡 점수 보너스% (prepare-search 워커의 oe): 해당 곡의 대상 카드가 한 장이라도 있으면 적용, 중복 없음 */
export function challengeSongBonusPercent(event: GameEvent, songId: string, cardIds: string[]): number {
  const targets = new Set(event.challengeSongBonusCardIds[songId] ?? []);
  return cardIds.some((id) => targets.has(id)) ? event.challengeSongScoreBonusPercent : 0;
}

/** 이벤트의 과제곡 ID 목록 (갤산기 이벤트 점수 모드의 곡 선택지) */
export function challengeSongIds(event: GameEvent | null): string[] {
  return Object.keys(event?.challengeSongBonusCardIds ?? {});
}
