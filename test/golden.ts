// 골든 픽스처(tools/capture-snippet.js로 기록한 갤산기 워커 메시지) 읽기·비교 도우미
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildPrepareContext, defaultSettings, growthFromBackup, type SearchMode } from '../src/engine/context';
import type { WorkerFactory, WorkerLike } from '../src/engine/search';
import type { MasterData, PrepareContext } from '../src/engine/types';

export interface Message {
  worker: number;
  dir: 'in' | 'out';
  data: any;
}

export interface Capture {
  file: string;
  capturedAt: string;
  now: number;
  appScript?: string;
  messages: Message[];
}

const GOLDEN_DIR = 'fixtures/golden';

export function loadCaptures(): Capture[] {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  return fs.readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf8')) }));
}

export const bundleHashOf = (c: Capture) => c.appScript?.match(/v=([0-9a-f]+)/)?.[1] ?? null;

export function modeOf(context: PrepareContext): SearchMode {
  return context.eventPtMode ? 'event-pt' : context.eventMode ? 'event-score' : 'normal';
}

const PROGRESS = new Set(['progress', 'preparation-progress', 'achievement-progress']);
const omit = (obj: Record<string, unknown>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** 메시지 기록을 탐색 단계별로 나눈다. 갤산기 기록과 앱 기록을 같은 모양으로 비교하기 위함 */
export function phases(messages: Message[]) {
  const isIn = (type: string) => (m: Message) => m.dir === 'in' && m.data?.type === type;
  const isOut = (type: string, pass?: string) => (m: Message) =>
    m.dir === 'out' && m.data?.type === type && (pass === undefined || m.data.pass === pass);
  const refineAt = messages.findIndex(isIn('prepare-refinement'));
  const before = refineAt < 0 ? messages : messages.slice(0, refineAt);
  const after = refineAt < 0 ? [] : messages.slice(refineAt);
  const exactMessages = (ms: Message[]) => ms.filter(isIn('optimize-combinations')).map((m) => omit(m.data, 'operationId'));
  const exactResults = (ms: Message[]) => ms.filter(isOut('combination-result')).map((m) => omit(m.data, 'operationId'));
  return {
    context: messages.find(isIn('prepare-search'))?.data.context as PrepareContext,
    primaryFinalists: messages.find(isOut('preparation-result', 'primary'))?.data.finalists,
    screenedCount: messages.find(isOut('preparation-result', 'primary'))?.data.screenedCount,
    primaryExact: exactMessages(before),
    primaryResult: exactResults(before),
    primaryWorkers: new Set(before.filter(isIn('optimize-combinations')).map((m) => m.worker)).size,
    refinement: refineAt < 0 ? undefined : omit(messages[refineAt].data, 'requestId'),
    refinedFinalists: messages.find(isOut('preparation-result', 'refinement'))?.data.finalists,
    refinedExact: exactMessages(after),
    refinedResult: exactResults(after),
    estimate: messages.find(isIn('estimate-achievement'))?.data,
    final: messages.find(isOut('achievement-result'))?.data.rankings,
    errors: messages.filter((m) => m.data?.type === 'error').map((m) => m.data.message),
  };
}

// 키를 정렬해 직렬화한 SHA-256 앞 16자리. 갤산기 페이지에서도 같은 함수로 계산해 대조했다 (test/fixtures/*.json)
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().filter((k) => (v as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(',')}}`
      : String(JSON.stringify(v));
const digest = (v: unknown) => crypto.createHash('sha256').update(canon(v)).digest('hex').slice(0, 16);

const DIGEST_KEYS = ['context', 'primaryFinalists', 'primaryExact', 'primaryResult', 'refinement', 'refinedFinalists', 'refinedExact', 'refinedResult', 'estimate', 'final'] as const;

/** 단계별 해시. 비어 있는 단계는 null */
export function phaseDigests(messages: Message[]): Record<(typeof DIGEST_KEYS)[number], string | null> {
  const p = phases(messages);
  return Object.fromEntries(DIGEST_KEYS.map((k) => {
    const v = p[k];
    return [k, v === undefined || (Array.isArray(v) && v.length === 0) ? null : digest(v)];
  })) as Record<(typeof DIGEST_KEYS)[number], string | null>;
}

/** 골든과 같은 조건으로 연결 코드가 만든 context (설정값은 사용자가 화면에서 고른 것을 그대로 씀) */
export function rebuildContext(capture: Capture, data: MasterData, backup: Record<string, unknown>): PrepareContext {
  const captured = phases(capture.messages).context;
  const { songId, difficulty } = captured.chartMetadata;
  const chart = data.charts.find((c) => c.songId === songId && c.difficulty === difficulty);
  if (!chart) throw new Error(`채보 없음: ${songId}.${difficulty}`);
  return buildPrepareContext({
    data,
    growth: growthFromBackup(backup),
    chart,
    settings: captured.settings,
    mode: modeOf(captured),
    now: capture.now,
  });
}

/** 저장소에 커밋한 갤산기 해시 기록 (사용자 데이터 없이 기록한 것만) */
export interface DigestFixture {
  file: string;
  bundleHash: string;
  now: number;
  mode: SearchMode;
  songId: string;
  difficulty: string;
  concurrency: number;
  resultLimit: number;
  sampleCount: number;
  digests: ReturnType<typeof phaseDigests>;
  top: { order: string; expectedScore: number; theoreticalMaxScore: number; eventBonusPercent?: number; pt?: number }[];
}

export function loadDigestFixtures(): DigestFixture[] {
  const dir = 'test/fixtures';
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('doricalc-') && f.endsWith('.json'))
    .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

/** 해시 기록과 같은 조건(빈 사용자 데이터 + 갤산기 기본 조건)의 context */
export function digestFixtureContext(f: DigestFixture, data: MasterData): PrepareContext {
  const chart = data.charts.find((c) => c.songId === f.songId && c.difficulty === f.difficulty);
  if (!chart) throw new Error(`채보 없음: ${f.songId}.${f.difficulty}`);
  return buildPrepareContext({ data, growth: growthFromBackup({}), chart, settings: defaultSettings(data.cards, f.mode), mode: f.mode, now: f.now });
}

/** 워커가 주고받는 메시지를 골든과 같은 형식으로 기록하는 팩토리 */
export function recordingFactory(inner: WorkerFactory, log: Message[]): WorkerFactory {
  let seq = 0;
  const wrap = (w: WorkerLike): WorkerLike => {
    const id = ++seq;
    const proxy: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        log.push({ worker: id, dir: 'in', data: structuredClone(message) });
        w.postMessage(message);
      },
      terminate: () => w.terminate(),
    };
    w.onmessage = (ev) => {
      if (!PROGRESS.has(ev.data?.type)) log.push({ worker: id, dir: 'out', data: ev.data });
      proxy.onmessage?.(ev);
    };
    w.onerror = (e) => proxy.onerror?.(e);
    return proxy;
  };
  return { prepare: () => wrap(inner.prepare()), exact: () => wrap(inner.exact()) };
}
