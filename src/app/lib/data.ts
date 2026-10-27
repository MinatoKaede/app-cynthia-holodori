// 공개 추출본(GitHub Pages) 받기·검증·캐시.
// 처음 실행 때 계산에 필요한 파일만 받고, 채보 본문은 곡을 고를 때 받는다.
// 새 버전은 필요한 파일을 모두 받아 해시를 확인한 뒤 한 번에 바꾼다 — 중간에 실패하면 이전 버전을 그대로 쓴다.
import type { MasterData } from '../../engine/types';
import { idbGet, idbPut, idbPutAll } from './idb';

export const DATA_BASE = 'https://minatokaede.github.io/app-cynthia-holodori/';

export interface Manifest {
  schemaVersion: number;
  extractedAt: string;
  source: { site: string; bundleHash: string; masterDataVersion: string };
  stats: Record<string, number>;
  files: Record<string, { sha256: string; bytes: number }>;
}

export interface AppData {
  manifest: Manifest;
  master: MasterData & { bundleHash: string };
  workerSources: { prepare: string; exact: string };
}

interface StoredFile {
  sha256: string;
  text: string;
}

const CORE = [
  'events.json',
  'cards.json',
  'boards.json',
  'memory.json',
  'charts/index.json',
  'workers/prepare-search.js',
  'workers/exact.js',
] as const;

export type LoadProgress = { message: string; completed: number; total: number };

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchText(path: string, timeoutMs = 30000): Promise<string> {
  const res = await fetch(DATA_BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** 저장된 파일이 manifest의 해시와 같으면 그것을, 아니면 받아서 검증한 내용을 돌려준다 (저장은 하지 않음) */
async function resolveFile(manifest: Manifest, path: string): Promise<{ text: string; fresh: boolean }> {
  const want = manifest.files[path]?.sha256;
  if (!want) throw new Error(`manifest에 ${path}가 없습니다.`);
  const stored = await idbGet<StoredFile>('files', path);
  if (stored?.sha256 === want) return { text: stored.text, fresh: false };
  const text = await fetchText(path);
  const got = await sha256Hex(text);
  if (got !== want) throw new Error(`${path}: 해시가 manifest와 다릅니다.`);
  return { text, fresh: true };
}

async function installVersion(manifest: Manifest, onProgress?: (p: LoadProgress) => void): Promise<AppData> {
  const texts: Record<string, string> = {};
  const fresh: [string, StoredFile][] = [];
  let completed = 0;
  onProgress?.({ message: '계산 데이터 확인 중', completed, total: CORE.length });
  await Promise.all(CORE.map(async (path) => {
    const r = await resolveFile(manifest, path);
    texts[path] = r.text;
    if (r.fresh) fresh.push([path, { sha256: manifest.files[path].sha256, text: r.text }]);
    onProgress?.({ message: '계산 데이터 받는 중', completed: ++completed, total: CORE.length });
  }));
  if (fresh.length > 0) await idbPutAll('files', fresh);
  await idbPut('kv', 'manifest', manifest);
  const json = (p: string) => JSON.parse(texts[p]);
  return {
    manifest,
    master: {
      events: json('events.json'),
      cards: json('cards.json').cards,
      boards: json('boards.json'),
      memoryEffects: json('memory.json').effects,
      charts: json('charts/index.json').charts,
      bundleHash: manifest.source.bundleHash,
    },
    workerSources: { prepare: texts['workers/prepare-search.js'], exact: texts['workers/exact.js'] },
  };
}

/**
 * 앱 시작 시 데이터 준비. 인터넷이 되면 새 manifest를 확인하고, 안 되면 저장된 버전으로 시작한다.
 * 새 버전 설치에 실패해도 저장된 버전이 있으면 그것을 쓴다.
 */
export async function loadAppData(onProgress?: (p: LoadProgress) => void): Promise<{ data: AppData; updateError?: string }> {
  const stored = await idbGet<Manifest>('kv', 'manifest');
  let remote: Manifest | undefined;
  let updateError: string | undefined;
  try {
    onProgress?.({ message: '갤산기 데이터 버전 확인 중', completed: 0, total: 1 });
    remote = JSON.parse(await fetchText('manifest.json', 10000));
  } catch (e) {
    updateError = `데이터 서버에 연결하지 못했습니다 (${(e as Error).message})`;
  }
  if (remote && remote.files) {
    try {
      return { data: await installVersion(remote, onProgress), updateError };
    } catch (e) {
      updateError = `새 데이터를 받지 못했습니다 (${(e as Error).message})`;
    }
  }
  if (!stored) throw new Error(updateError ?? '데이터가 없습니다.');
  return { data: await installVersion(stored, onProgress), updateError };
}

export const chartPath = (songId: string, difficulty: string) => `charts/${songId}.${difficulty}.json`;

/** 채보 본문 (처음 고른 곡이면 받아서 저장) */
export async function loadChart(manifest: Manifest, songId: string, difficulty: string): Promise<unknown> {
  const path = chartPath(songId, difficulty);
  const r = await resolveFile(manifest, path);
  if (r.fresh) await idbPut('files', path, { sha256: manifest.files[path].sha256, text: r.text } satisfies StoredFile);
  return JSON.parse(r.text);
}
