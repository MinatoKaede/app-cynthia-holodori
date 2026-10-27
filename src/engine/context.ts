// prepare-search 워커 입력(context) 만들기
import { currentEvent } from './events';
import type { Card, ChartMeta, Growth, MasterData, PrepareContext, SearchSettings } from './types';

/** 갤산기 조합 탐색 화면의 세 가지 모드 */
export type SearchMode = 'event-pt' | 'event-score' | 'normal';

/**
 * 백업에서 계산용 5개 항목을 꺼낸다 (갤산기 pt()와 같은 기본값).
 * 메모리 수·강화율은 앱에서 직접 고친 값이 있으면 그것을 쓴다.
 */
export function growthFromBackup(
  backup: Record<string, unknown>,
  overrides: { memoryCount?: number; memberPowerUpPercent?: number } = {},
): Growth {
  const obj = <T>(v: unknown) => (v && typeof v === 'object' ? v : {}) as T;
  const num = (v: unknown) => (Number.isFinite(v) ? (v as number) : 0);
  return {
    collection: obj(backup.collection),
    memberBoards: obj(backup.memberBoards),
    boardCards: obj(backup.boardCards),
    memoryCount: overrides.memoryCount ?? num(backup.memoryCount),
    memberPowerUpPercent: overrides.memberPowerUpPercent ?? num(backup.memberPowerUpPercent),
  };
}

/** 갤산기 조합 탐색 화면을 처음 열었을 때의 조건 (sg 컴포넌트 초기값) */
export function defaultSettings(cards: Card[], mode: SearchMode): SearchSettings {
  const eventMode = mode !== 'normal';
  // 멤버별 첫 5성 카드 중 첫 번째가 기본 리더
  const firstLeader = cards.find((c) => c.rarity === 5);
  return {
    fixedCardIds: ['', '', '', ''],
    fixedAwakenings: eventMode ? [0, 0, 0, 0] : [5, 5, 5, 5],
    fixedCooldownReductions: [null, null, null, null],
    fixedAllBlueNodes: [false, false, false, false],
    leaderBoardCharacterId: '',
    fixedGenerationBonusOverrides: [null, null, null, null],
    candidateAwakening: eventMode ? 0 : 5,
    candidateGenerationBonus: null,
    songScoreBonusOverride: 10,
    ownedCardsOnly: false,
    regularCardsOnly: false,
    excludeComboConditionCards: false,
    maxMediumProbabilityCards: null,
    leaderCharacterId: firstLeader?.characterId ?? '',
    leaderOutfitCardId: firstLeader?.id ?? '',
  };
}

/** 리더를 바꿀 때 의상 기본값: 그 멤버의 의상 카드 중 첫 번째 (갤산기 zt) */
export function defaultOutfitCardId(cards: Card[], leaderCharacterId: string): string {
  return cards.find((c) => c.characterId === leaderCharacterId && c.details.costume)?.id ?? '';
}

export function buildPrepareContext(args: {
  data: MasterData;
  growth: Growth;
  chart: ChartMeta;
  settings: SearchSettings;
  mode: SearchMode;
  now: number;
}): PrepareContext {
  const { data, growth, chart, settings, mode, now } = args;
  const eventMode = mode !== 'normal';
  // 갤산기는 structuredClone한 값을 넘긴다 — 워커로 보낼 때 어차피 복제되므로 여기서는 참조만 모은다
  return {
    allCards: data.cards,
    boardSummary: data.boards,
    memoryEffects: data.memoryEffects,
    chartMetadata: chart,
    growth,
    settings,
    eventMode,
    eventPtMode: mode === 'event-pt',
    currentEvent: eventMode ? currentEvent(data.events, now) : null,
  };
}
