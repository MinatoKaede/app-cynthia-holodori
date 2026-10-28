// 덱 찾기 실행: 조건 → prepare-search context → 워커 탐색. 진행률·취소·결과 캐시
import { buildPrepareContext, defaultSettings, type SearchMode } from '../engine/context';
import { SearchCancelledError, searchCombinations, type SearchPhase } from '../engine/search';
import type { GameEvent, Growth, Ranking, SearchSettings } from '../engine/types';
import { chartPath, loadChart } from './lib/data';
import { idbDelete, idbGet, idbKeys, idbPut } from './lib/idb';
import { keepScreenOn } from './lib/platform';
import { autoConcurrency, browserWorkerFactory } from './lib/workers';
import { app, chartMeta, getData, growth, type Conditions } from './state.svelte';

/** 갤산기 기본값 (결과 10개, 달성 확률 샘플 25000) */
const RESULT_LIMIT = 10;
const SAMPLE_COUNT = 25000;
const CACHE_SIZE = 20;

export interface SearchRun {
  conditions: Conditions;
  mode: SearchMode;
  /** 탐색 당시 이벤트 (챕터 반영) */
  event: GameEvent | null;
  songTitle: string;
  /** 미리 찾기의 기준 시각 (없으면 실행한 시각) */
  at?: number;
}

export const search = $state({
  status: 'idle' as 'idle' | 'running' | 'done' | 'error' | 'cancelled',
  run: null as SearchRun | null,
  phase: 'screening' as SearchPhase,
  completed: 0,
  total: 1,
  startedAt: 0,
  /** 정밀 평가 단계가 시작된 시각 (남은 시간 추정용) */
  exactStartedAt: 0,
  elapsedMs: 0,
  workers: 1,
  screenedCount: 0,
  exactCount: 0,
  rankings: [] as Ranking[],
  /** 저장된 결과를 보여주는 중이면 계산 시각 */
  cachedAt: null as string | null,
  error: '',
});

export const PHASE_LABEL: Record<SearchPhase, string> = {
  screening: '후보 조합 고르는 중',
  exact: '정밀 평가 중',
  refinement: '스페셜 순서 다듬는 중',
  probability: '달성 확률 계산 중',
};

let controller: AbortController | null = null;

export function concurrency(): number {
  return app.prefs.concurrency > 0 ? app.prefs.concurrency : autoConcurrency();
}

/** 조건 화면의 입력을 갤산기 settings로 */
export function buildSettings(c: Conditions, g: Growth): SearchSettings {
  const s = defaultSettings(getData().master.cards, c.mode);
  const fixed = [...c.fixedCardIds, '', '', '', ''].slice(0, 4) as SearchSettings['fixedCardIds'];
  return {
    ...s,
    fixedCardIds: fixed,
    // 고정 카드의 개화: 보유 중이면 백업 값, 아니면 갤산기 기본
    fixedAwakenings: fixed.map((id, i) => {
      const owned = id ? g.collection[id] : undefined;
      return owned?.owned && Number.isFinite(owned.awakening) ? (owned.awakening as number) : s.fixedAwakenings[i];
    }) as SearchSettings['fixedAwakenings'],
    leaderCharacterId: c.leaderCharacterId,
    leaderOutfitCardId: c.leaderOutfitCardId,
    ownedCardsOnly: c.ownedCardsOnly,
    excludeComboConditionCards: c.excludeComboConditionCards,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface CachedResult {
  createdAt: string;
  rankings: Ranking[];
  screenedCount: number;
  exactCount: number;
  elapsedMs: number;
  workers: number;
}

/** 캐시에 넣기 전에 화면에 쓰지 않는 큰 필드(노트별 점수 등)를 뺀다 */
function slim(r: Ranking): Ranking {
  const { notes, scoreBySecond, activeWindows, effectiveActiveWindows, ...result } = r.result as Record<string, unknown>;
  return { ...r, result: result as Ranking['result'] };
}

async function pruneCache() {
  const keys = await idbKeys('results');
  if (keys.length <= CACHE_SIZE) return;
  const entries = await Promise.all(keys.map(async (k) => [k, (await idbGet<CachedResult>('results', k))?.createdAt ?? ''] as const));
  entries.sort((a, b) => a[1].localeCompare(b[1]));
  await idbDelete('results', entries.slice(0, keys.length - CACHE_SIZE).map(([k]) => k));
}

export async function startSearch(conditions: Conditions, opts: { useCache?: boolean; at?: number } = {}): Promise<void> {
  if (search.status === 'running') return;
  const d = getData();
  const meta = chartMeta(conditions.songId, conditions.difficulty);
  if (!meta) throw new Error('곡을 골라 주세요.');
  // 기준 시각: 보통 지금. 다음 챕터 미리 찾기는 그 챕터 시작 시각 (그 시각의 이벤트·챕터 보너스로 계산)
  const now = opts.at ?? Date.now();
  // 워커로 보낼 값은 반응형 프록시가 아닌 일반 객체여야 복제된다
  const g = $state.snapshot(growth());
  const settings = $state.snapshot(buildSettings(conditions, g));
  const context = buildPrepareContext({ data: d.master, growth: g, chart: meta, settings, mode: conditions.mode, now });
  const workers = concurrency();

  Object.assign(search, {
    status: 'running',
    run: { conditions: $state.snapshot(conditions), mode: conditions.mode, event: context.currentEvent, songTitle: meta.title, at: opts.at },
    phase: 'screening',
    completed: 0,
    total: 1,
    startedAt: Date.now(),
    exactStartedAt: 0,
    elapsedMs: 0,
    workers,
    rankings: [],
    cachedAt: null,
    error: '',
  });

  // 같은 데이터 버전·같은 입력이면 저장된 결과를 쓴다 (워커 수는 결과에 영향 없음 — test/concurrency.slow.test.ts)
  const key = await sha256Hex(JSON.stringify({
    bundleHash: d.master.bundleHash,
    chart: d.manifest.files[chartPath(meta.songId, meta.difficulty)]?.sha256,
    mode: conditions.mode,
    event: context.currentEvent && { id: context.currentEvent.id, name: context.currentEvent.name },
    settings,
    growth: g,
    resultLimit: RESULT_LIMIT,
    sampleCount: SAMPLE_COUNT,
  }));
  if (opts.useCache !== false) {
    const cached = await idbGet<CachedResult>('results', key);
    if (cached) {
      Object.assign(search, {
        status: 'done',
        rankings: cached.rankings,
        screenedCount: cached.screenedCount,
        exactCount: cached.exactCount,
        elapsedMs: cached.elapsedMs,
        workers: cached.workers,
        cachedAt: cached.createdAt,
      });
      return;
    }
  }

  controller = new AbortController();
  await keepScreenOn(true);
  try {
    const chart = await loadChart(d.manifest, meta.songId, meta.difficulty);
    const result = await searchCombinations({
      context,
      chart,
      workers: browserWorkerFactory(d.workerSources),
      resultLimit: RESULT_LIMIT,
      concurrency: workers,
      sampleCount: SAMPLE_COUNT,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase === 'exact' && search.exactStartedAt === 0) search.exactStartedAt = Date.now();
        search.phase = p.phase;
        search.completed = p.completed;
        search.total = p.total;
      },
    });
    const rankings = result.rankings.map(slim);
    Object.assign(search, {
      status: 'done',
      rankings,
      screenedCount: result.screenedCount,
      exactCount: result.exactCount,
      elapsedMs: Date.now() - search.startedAt,
    });
    await idbPut('results', key, {
      createdAt: new Date().toISOString(),
      rankings,
      screenedCount: result.screenedCount,
      exactCount: result.exactCount,
      elapsedMs: search.elapsedMs,
      workers,
    } satisfies CachedResult);
    await pruneCache();
  } catch (e) {
    if (e instanceof SearchCancelledError) search.status = 'cancelled';
    else {
      search.status = 'error';
      search.error = (e as Error).message;
    }
  } finally {
    controller = null;
    await keepScreenOn(false);
  }
}

/** 덱 표시 순서 (편성 순서, 없으면 스페셜 순서) */
export const formation = (r: Ranking): string[] => (r.result.formationOrder as string[] | undefined) ?? r.result.order;

export function cancelSearch() {
  controller?.abort();
}

/** 정밀 평가 진행률로 남은 시간 추정 (정밀 평가가 전체 시간의 대부분) */
export function remainingMs(now: number): number | null {
  if (search.phase !== 'exact' || search.exactStartedAt === 0 || search.completed === 0) return null;
  const spent = now - search.exactStartedAt;
  return (spent / search.completed) * (search.total - search.completed);
}
