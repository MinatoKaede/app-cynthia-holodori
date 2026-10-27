// 조합 탐색 파이프라인: 갤산기 조합 탐색 화면(sg 컴포넌트의 Xt → Yt → Jt → qt)과 같은 순서로 워커를 돌린다.
//
//   1. prepare-search        prepare 워커가 후보(finalists)를 고른다
//   2. optimize-combinations exact 워커 풀이 후보를 나눠 정밀 평가 → 상위 resultLimit개
//   3. prepare-refinement    1차 순위의 스페셜 순서로 추가 후보를 고른다
//   4. optimize-combinations 추가 후보 정밀 평가
//   5. 1·3차 결과를 합쳐 같은 구성은 하나만 남기고 정렬
//   6. estimate-achievement  상위 조합의 최대 점수 달성 확률
import { comparePool, dedupeRankings } from './ranking';
import type { Finalist, PrepareContext, Ranking } from './types';

/** 브라우저 Worker와 Node 어댑터가 모두 만족하는 최소 인터페이스 */
export interface WorkerLike {
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev: any) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface WorkerFactory {
  prepare(): WorkerLike;
  exact(): WorkerLike;
}

export type SearchPhase = 'screening' | 'exact' | 'refinement' | 'probability';

export interface SearchProgress {
  phase: SearchPhase;
  completed: number;
  total: number;
}

export interface SearchOptions {
  context: PrepareContext;
  /** 채보 본문 (charts/<songId>.<difficulty>.json) */
  chart: unknown;
  workers: WorkerFactory;
  /** 결과 수. 갤산기 선택지는 10/20/30/50 */
  resultLimit?: number;
  /** exact 워커 수. 갤산기 기본 1, "최대 컴퓨팅 자원 활용" 시 min(32, 후보 수, 코어 수) */
  concurrency?: number;
  /** 달성 확률 샘플 수. 갤산기는 25000, 0이면 확률 계산을 건너뛴다 */
  sampleCount?: number;
  onProgress?: (p: SearchProgress) => void;
  signal?: AbortSignal;
}

export interface SearchResult {
  rankings: Ranking[];
  /** prepare-search가 걸러 본 조합 수 */
  screenedCount: number;
  /** exact 워커가 정밀 평가한 후보 수 (1·2차 합) */
  exactCount: number;
}

export class SearchCancelledError extends Error {
  constructor() {
    super('취소된 탐색입니다.');
    this.name = 'SearchCancelledError';
  }
}

/** 탐색 한 번이 쓰는 워커를 모아 두고, 끝나거나 취소되면 한꺼번에 종료한다 (갤산기 yh) */
class Session {
  private workers = new Set<WorkerLike>();
  private rejects = new Set<(e: Error) => void>();
  closed = false;

  constructor(signal?: AbortSignal) {
    signal?.addEventListener('abort', () => this.close(new SearchCancelledError()), { once: true });
    if (signal?.aborted) this.closed = true;
  }

  spawn(create: () => WorkerLike): WorkerLike {
    if (this.closed) throw new SearchCancelledError();
    const w = create();
    this.workers.add(w);
    return w;
  }

  /** 워커에 메시지 하나를 보내고, accept가 값을 돌려줄 때까지 기다린다 */
  request<T>(w: WorkerLike, message: unknown, accept: (data: any) => T | undefined): Promise<T> {
    if (this.closed) return Promise.reject(new SearchCancelledError());
    return new Promise<T>((resolve, reject) => {
      const done = (fn: () => void) => {
        this.rejects.delete(reject);
        w.onmessage = null;
        w.onerror = null;
        fn();
      };
      this.rejects.add(reject);
      w.onmessage = (ev) => {
        if (ev.data?.type === 'error') return done(() => reject(new Error(ev.data.message)));
        let value: T | undefined;
        try {
          value = accept(ev.data);
        } catch (e) {
          return done(() => reject(e));
        }
        if (value !== undefined) done(() => resolve(value as T));
      };
      w.onerror = (e) => done(() => reject(e instanceof Error ? e : new Error('Worker에서 오류가 발생했습니다.')));
      w.postMessage(message);
    });
  }

  close(reason: Error = new SearchCancelledError()) {
    if (this.closed && this.workers.size === 0) return;
    this.closed = true;
    for (const reject of this.rejects) reject(reason);
    this.rejects.clear();
    for (const w of this.workers) w.terminate();
    this.workers.clear();
  }
}

/** exact 워커 풀 (갤산기 vh): 후보를 워커 수만큼 번갈아 나누고, 결과를 합쳐 상위 limit개 */
class ExactPool {
  private workers: WorkerLike[] = [];
  private sequence = 0;
  exactCount = 0;

  constructor(private session: Session, factory: WorkerFactory, size: number) {
    const n = Math.max(1, Math.min(32, Number.isFinite(size) ? Math.floor(size) : 1));
    for (let i = 0; i < n; i++) this.workers.push(session.spawn(() => factory.exact()));
  }

  async run(finalists: Finalist[], chart: unknown, limit: number, onProgress: (completed: number, total: number) => void): Promise<Ranking[]> {
    const n = Math.min(this.workers.length, finalists.length);
    if (n === 0) return [];
    this.exactCount += finalists.length;
    const groups: { candidate: Finalist; index: number }[][] = Array.from({ length: n }, () => []);
    finalists.forEach((candidate, index) => groups[index % n].push({ candidate, index }));

    const progress = groups.map(() => ({ completed: 0, total: 0 }));
    const report = () => onProgress(
      progress.reduce((s, p) => s + p.completed, 0),
      progress.reduce((s, p) => s + p.total, 0),
    );
    const parts = await Promise.all(groups.map((group, k) => {
      const operationId = ++this.sequence;
      return this.session.request(this.workers[k], {
        type: 'optimize-combinations',
        candidates: group.map((g) => g.candidate),
        chart,
        returnAllRankings: false,
        resultLimit: limit,
        withInputIndices: true,
        operationId,
      }, (data) => {
        if (data.operationId !== operationId) return undefined;
        if (data.type === 'progress') {
          progress[k] = { completed: data.progress.evaluatedCandidates, total: data.progress.totalCandidates };
          report();
          return undefined;
        }
        if (data.type !== 'combination-result') return undefined;
        return (data.rankings as Ranking[]).map((ranking, i) => ({ index: group[data.indices[i]].index, ranking }));
      });
    }));
    return parts
      .flat()
      .sort((a, b) => comparePool(a.ranking, b.ranking) || a.index - b.index)
      .slice(0, limit)
      .map((x) => x.ranking);
  }
}

export async function searchCombinations(options: SearchOptions): Promise<SearchResult> {
  const { context, chart, workers } = options;
  const limit = options.resultLimit ?? 10;
  const sampleCount = options.sampleCount ?? 25000;
  const emit = (phase: SearchPhase, completed: number, total: number) => options.onProgress?.({ phase, completed, total });
  const session = new Session(options.signal);
  const requestId = 1;

  const preparation = (w: WorkerLike, message: Record<string, unknown>, pass: 'primary' | 'refinement') =>
    session.request<{ finalists: Finalist[]; screenedCount?: number }>(w, message, (data) => {
      if (data.requestId !== requestId || data.pass !== pass) return undefined;
      if (data.type === 'preparation-progress') emit('screening', data.completed, Math.max(1, data.total));
      return data.type === 'preparation-result' ? data : undefined;
    });

  try {
    // 1. 후보 선별
    emit('screening', 0, 1);
    const prepare = session.spawn(() => workers.prepare());
    const primary = await preparation(prepare, { type: 'prepare-search', requestId, context }, 'primary');
    if (primary.finalists.length === 0) throw new Error('조건에 맞는 카드 조합이 없습니다.');

    // 2. 1차 정밀 평가
    const pool = new ExactPool(session, workers, Math.min(options.concurrency ?? 1, primary.finalists.length));
    const primaryRankings = await pool.run(primary.finalists, chart, limit, (c, t) => emit('exact', c, t));

    // 3·4. 스페셜 순서 기반 추가 후보 → 정밀 평가
    emit('refinement', 0, 1);
    const refinement = await preparation(prepare, {
      type: 'prepare-refinement',
      requestId,
      rankings: primaryRankings.map((r) => ({ result: { order: r.result.order } })),
    }, 'refinement');
    const refinedRankings = refinement.finalists.length > 0
      ? await pool.run(refinement.finalists, chart, limit, (c, t) => emit('refinement', c, t))
      : primaryRankings;

    // 5. 합치기
    let rankings = dedupeRankings([...primaryRankings, ...refinedRankings], context.eventPtMode, limit);

    // 6. 달성 확률
    if (sampleCount > 0 && rankings.length > 0 && rankings.every((r) => r.cards)) {
      emit('probability', 0, rankings.length);
      const estimator = session.spawn(() => workers.exact());
      rankings = await session.request<Ranking[]>(estimator, {
        type: 'estimate-achievement',
        rankings,
        chart,
        sampleCount,
      }, (data) => {
        if (data.type === 'achievement-progress') emit('probability', data.progress.evaluatedCandidates, data.progress.totalCandidates);
        return data.type === 'achievement-result' ? data.rankings : undefined;
      });
    }

    return { rankings, screenedCount: primary.screenedCount ?? 0, exactCount: pool.exactCount };
  } finally {
    session.close();
  }
}
