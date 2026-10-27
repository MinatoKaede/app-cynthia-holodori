// 갤산기 데이터·워커 메시지 중 연결 코드가 직접 읽는 필드만 정의한다.
// 나머지는 워커가 해석하므로 그대로 통과시킨다 (공식을 다시 짜지 않는다).

export type Rarity = 3 | 4 | 5;

export interface Card {
  id: string;
  characterId: string;
  rarity: Rarity;
  name: string;
  versionName: string;
  details: { costume?: unknown; connect: unknown[]; [k: string]: unknown };
  [k: string]: unknown;
}

export interface EventSchedule {
  id: string;
  name: string;
  startsAt: string;
  calculatorStartsAt?: string;
  endsAt: string;
  bonusCharacterIds: string[];
  challengeSongBonusCardIds: Record<string, string[]>;
}

export interface GameEvent extends EventSchedule {
  exchangeEndsAt?: string;
  featuredCardIds: string[];
  formationBonusPercent: number;
  featuredCardBonusPercent: number;
  awakeningBonusPercentByRarity: Record<Rarity, number[]>;
  challengeSongScoreBonusPercent: number;
  bonusAssumptionNotice?: string;
  chapters?: EventSchedule[];
}

export interface ChartMeta {
  songId: string;
  title: string;
  difficulty: string;
  scoreRatio: number | null;
  scoreCalibrationSource: string;
  releaseTime?: number;
  [k: string]: unknown;
}

/** 공개 추출본에서 읽은 마스터 데이터 */
export interface MasterData {
  events: GameEvent[];
  cards: Card[];
  boards: unknown;
  memoryEffects: unknown[];
  charts: ChartMeta[];
}

/** 갤산기 백업에서 계산에 쓰는 5개 항목 */
export interface Growth {
  collection: Record<string, { owned?: boolean; awakening?: number }>;
  memberBoards: Record<string, string[]>;
  boardCards: Record<string, unknown>;
  memoryCount: number;
  memberPowerUpPercent: number;
}

type Four<T> = [T, T, T, T];

/** 갤산기 조합 탐색 화면의 조건 (prepare-search context.settings) */
export interface SearchSettings {
  fixedCardIds: Four<string>;
  fixedAwakenings: Four<number>;
  fixedCooldownReductions: Four<number | null>;
  fixedAllBlueNodes: Four<boolean>;
  leaderBoardCharacterId: string;
  fixedGenerationBonusOverrides: Four<number | null>;
  candidateAwakening: number;
  candidateGenerationBonus: number | null;
  songScoreBonusOverride: number | null;
  ownedCardsOnly: boolean;
  regularCardsOnly: boolean;
  excludeComboConditionCards: boolean;
  maxMediumProbabilityCards: number | null;
  leaderCharacterId: string;
  leaderOutfitCardId: string;
}

export interface PrepareContext {
  allCards: Card[];
  boardSummary: unknown;
  memoryEffects: unknown[];
  chartMetadata: ChartMeta;
  growth: Growth;
  settings: SearchSettings;
  eventMode: boolean;
  eventPtMode: boolean;
  currentEvent: GameEvent | null;
}

/** exact 워커가 돌려주는 조합 순위 항목 */
export interface Ranking {
  result: { expectedScore: number; theoreticalMaxScore: number; order: string[]; [k: string]: unknown };
  overallPower?: number;
  cards?: unknown[];
  directSongScoreBonusPercent?: number;
  finalScoreBonusPercent?: number;
  eventBonusPercent?: number;
  rankingMultiplier?: number;
  achievementProbabilities?: unknown;
  [k: string]: unknown;
}

/** prepare-search가 고른 후보 (exact 워커에 그대로 넘긴다) */
export interface Finalist {
  cards: unknown[];
  [k: string]: unknown;
}
