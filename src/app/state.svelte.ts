// 앱 전역 상태: 데이터, 백업, 설정, 화면 이동
import { defaultOutfitCardId, type SearchMode } from '../engine/context';
import { challengeSongIds, currentEvent, isActive } from '../engine/events';
import type { Card, ChartMeta, GameEvent } from '../engine/types';
import { effectiveGrowth, type GrowthOverrides, type StoredBackup } from './lib/backup';
import { loadAppData, type AppData, type LoadProgress } from './lib/data';
import { idbGet, idbPut } from './lib/idb';

export type Tab = 'home' | 'recommend' | 'schedule' | 'data';
export type RecommendView = 'conditions' | 'results' | 'detail';

export interface Prefs {
  /** exact 워커 수. 0이면 자동 */
  concurrency: number;
}

/** 추천 조건 화면의 입력값 */
export interface Conditions {
  mode: SearchMode;
  songId: string;
  difficulty: string;
  leaderCharacterId: string;
  leaderOutfitCardId: string;
  ownedCardsOnly: boolean;
  excludeComboConditionCards: boolean;
  fixedCardIds: string[];
}

export const app = $state({
  status: 'loading' as 'loading' | 'ready' | 'error',
  progress: null as LoadProgress | null,
  error: '',
  /** 데이터 갱신 실패 (저장된 데이터로 계속 쓸 수 있을 때) */
  updateError: '',
  backup: null as StoredBackup | null,
  overrides: {} as GrowthOverrides,
  prefs: { concurrency: 0 } as Prefs,
  now: Date.now(),
});

// 마스터 데이터는 크고 바뀌지 않으므로 반응형 프록시로 감싸지 않는다
let data: AppData | null = null;
/** 데이터가 바뀔 때마다 늘어난다 (화면이 다시 그려지게) */
export const dataVersion = $state({ n: 0 });
const cardIndex = new Map<string, Card>();
function setData(d: AppData) {
  data = d;
  cardIndex.clear();
  dataVersion.n++;
}
/** 화면의 $derived 안에서 부르면 데이터가 바뀔 때 다시 계산된다 */
export function getData(): AppData {
  void dataVersion.n;
  if (!data) throw new Error('데이터가 아직 준비되지 않았습니다.');
  return data;
}

export const nav = $state({
  tab: 'home' as Tab,
  view: 'conditions' as RecommendView,
  detailIndex: 0,
});

export const cond = $state<Conditions>({
  mode: 'event-pt',
  songId: '',
  difficulty: 'expert',
  leaderCharacterId: '',
  leaderOutfitCardId: '',
  ownedCardsOnly: false,
  excludeComboConditionCards: false,
  fixedCardIds: [],
});

export async function initApp(): Promise<void> {
  app.status = 'loading';
  app.error = '';
  try {
    const [backup, overrides, prefs] = await Promise.all([
      idbGet<StoredBackup>('kv', 'backup'),
      idbGet<GrowthOverrides>('kv', 'overrides'),
      idbGet<Prefs>('kv', 'prefs'),
    ]);
    app.backup = backup ?? null;
    app.overrides = overrides ?? {};
    app.prefs = { concurrency: 0, ...prefs };
    const r = await loadAppData((p) => { app.progress = p; });
    setData(r.data);
    app.updateError = r.updateError ?? '';
    resetConditions('event-pt');
    app.status = 'ready';
  } catch (e) {
    app.error = (e as Error).message;
    app.status = 'error';
  }
}

export async function refreshData(): Promise<void> {
  const r = await loadAppData((p) => { app.progress = p; });
  setData(r.data);
  app.updateError = r.updateError ?? '';
  if (r.updateError) throw new Error(r.updateError);
}

export async function saveBackup(b: StoredBackup | null) {
  app.backup = b;
  await idbPut('kv', 'backup', $state.snapshot(b));
}

export async function saveOverrides(o: GrowthOverrides) {
  app.overrides = o;
  await idbPut('kv', 'overrides', $state.snapshot(o));
}

export async function savePrefs(p: Prefs) {
  app.prefs = p;
  await idbPut('kv', 'prefs', $state.snapshot(p));
}

export const growth = () => effectiveGrowth(app.backup, app.overrides);

// ---- 이벤트·곡·카드 조회 ----

export const activeEvent = (now = app.now): GameEvent | null => currentEvent(getData().master.events, now);

/** 챕터를 덮어쓰기 전의 이벤트 (챕터 목록·종류 표시용) */
export const baseEvent = (now = app.now): GameEvent | null => getData().master.events.find((e) => isActive(e, now)) ?? null;

export function nextEvent(now = app.now): GameEvent | null {
  return getData().master.events
    .filter((e) => Date.parse(e.calculatorStartsAt ?? e.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
}

export function cardById(id: string): Card | undefined {
  if (cardIndex.size === 0) for (const c of getData().master.cards) cardIndex.set(c.id, c);
  return cardIndex.get(id);
}
export const cardLabel = (c: Card | undefined) => (c ? (c.versionName ? `${c.name} · ${c.versionName}` : c.name) : '알 수 없는 카드');

export interface Member {
  id: string;
  name: string;
  order: number;
}
export const members = (): Member[] =>
  [...((getData().master.boards as { members: Member[] }).members)].sort((a, b) => a.order - b.order);

export interface Song {
  songId: string;
  title: string;
  releaseTime: number;
  difficulties: string[];
}

/** 곡 목록 (공개된 곡, 최신순). 과제곡은 공개 전이어도 포함 */
export function songs(now = app.now): Song[] {
  const challenge = new Set(challengeSongIds(activeEvent(now)));
  const bySong = new Map<string, Song>();
  for (const c of getData().master.charts as ChartMeta[]) {
    const s = bySong.get(c.songId) ?? { songId: c.songId, title: c.title, releaseTime: c.releaseTime ?? 0, difficulties: [] };
    s.difficulties.push(c.difficulty);
    s.releaseTime = Math.min(s.releaseTime, c.releaseTime ?? 0);
    bySong.set(c.songId, s);
  }
  return [...bySong.values()]
    .filter((s) => s.releaseTime <= now || challenge.has(s.songId))
    .sort((a, b) => b.releaseTime - a.releaseTime || a.songId.localeCompare(b.songId));
}

export const chartMeta = (songId: string, difficulty: string) =>
  (getData().master.charts as ChartMeta[]).find((c) => c.songId === songId && c.difficulty === difficulty);

/** 추천 조건을 모드에 맞는 기본값으로 (곡은 첫 과제곡, 리더는 갤산기 기본) */
export function resetConditions(mode: SearchMode) {
  const { cards } = getData().master;
  const event = activeEvent();
  const challenge = challengeSongIds(event);
  const leader = cards.find((c) => c.rarity === 5);
  cond.mode = event ? mode : 'normal';
  cond.songId = challenge[0] ?? songs()[0]?.songId ?? '';
  cond.difficulty = 'expert';
  cond.leaderCharacterId = leader?.characterId ?? '';
  cond.leaderOutfitCardId = leader?.id ?? '';
  cond.ownedCardsOnly = app.backup !== null;
  cond.excludeComboConditionCards = false;
  cond.fixedCardIds = [];
}

export function setLeader(characterId: string) {
  cond.leaderCharacterId = characterId;
  cond.leaderOutfitCardId = defaultOutfitCardId(getData().master.cards, characterId);
}

export function openRecommend(mode: SearchMode) {
  resetConditions(mode);
  nav.tab = 'recommend';
  nav.view = 'conditions';
}
