// 이미지 (cdn.holodori.dev, SPEC 3.). APK에는 넣지 않고, 받은 것은 기기(IndexedDB)에 캐시한다.
// 404·네트워크 오류면 null을 돌려 화면이 대체 표시를 쓰게 하고, 실패는 이번 실행 동안만 기억한다 (다음 실행 때 다시 시도).
import { CapacitorHttp } from '@capacitor/core';
import { idbDelete, idbEach, idbGet, idbPut } from './idb';
import { isNative } from './platform';

const CDN = 'https://cdn.holodori.dev/assets/assetbundles';
/** 이미지 캐시 상한. 넘으면 오래 안 쓴 것부터 지운다 */
const CACHE_LIMIT_BYTES = 100 * 1024 * 1024;
const MAX_PARALLEL = 4;

const cardKey = (cardId: string) => cardId.replace(/^card-/, '');
const asset = (name: string, file = name) => `${CDN}/${name}/${file}.webp`;

/** `_unsquished`가 정상 비율. 접미사 없는 원본은 텍스처 규격으로 늘어나 있다 */
export const imageUrl = {
  cardVert: (cardId: string) => asset(`img_card_vert_${cardKey(cardId)}`, `img_card_vert_${cardKey(cardId)}_unsquished`),
  cardFull: (cardId: string) => asset(`img_card_full_${cardKey(cardId)}`, `img_card_full_${cardKey(cardId)}_unsquished`),
  memberIcon: (characterId: string) => {
    const n = characterId.replace(/^chr-/, '');
    return asset(`img_chr_icon_mini_${n}`);
  },
  /** 갤산기 임시 ID(notice-…) 이벤트는 배너가 없다 */
  banner: (eventId: string) =>
    eventId.startsWith('notice-') ? null : asset(`img_banner_full_${eventId}`, `img_banner_full_${eventId}_unsquished`),
};

interface StoredImage {
  blob: Blob;
  bytes: number;
  usedAt: number;
}

/** 주소 → 화면에 쓸 주소(Blob URL 또는 원본 주소). null이면 대체 표시 */
const loaded = new Map<string, Promise<string | null>>();

// 동시에 받는 수 제한 (결과 화면에서 카드 50장을 한꺼번에 요청해도 순서대로)
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

class NotFound extends Error {}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** 앱: 네이티브 HTTP(CORS 무관). 브라우저: fetch, CORS로 막히면 원본 주소를 그대로 쓴다 */
async function download(url: string): Promise<Blob | 'direct'> {
  if (isNative) {
    const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 15000, readTimeout: 30000 });
    if (res.status === 404 || res.status === 403) throw new NotFound();
    if (res.status !== 200 || typeof res.data !== 'string') throw new Error(`HTTP ${res.status}`);
    return base64ToBlob(res.data, 'image/webp');
  }
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(30000) });
  } catch (e) {
    if (navigator.onLine === false) throw e;
    return 'direct';
  }
  if (res.status === 404 || res.status === 403) throw new NotFound();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new NotFound();
  return blob;
}

async function resolve(url: string): Promise<string | null> {
  const stored = await idbGet<StoredImage>('images', url).catch(() => undefined);
  if (stored) {
    void idbPut('images', url, { ...stored, usedAt: Date.now() }).catch(() => {});
    return URL.createObjectURL(stored.blob);
  }
  try {
    const got = await slot(() => download(url));
    if (got === 'direct') return url;
    if (got.size === 0) return null;
    await idbPut('images', url, { blob: got, bytes: got.size, usedAt: Date.now() } satisfies StoredImage);
    schedulePrune();
    return URL.createObjectURL(got);
  } catch {
    return null;
  }
}

/** 화면에 쓸 이미지 주소. 같은 주소는 한 번만 받는다 */
export function loadImage(url: string): Promise<string | null> {
  let p = loaded.get(url);
  if (!p) {
    p = resolve(url);
    loaded.set(url, p);
  }
  return p;
}

/** <img>가 표시에 실패한 경우 (원본 주소를 직접 쓴 브라우저 개발 환경 등) */
export function markFailed(url: string) {
  loaded.set(url, Promise.resolve(null));
}

let pruneTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePrune() {
  if (pruneTimer) return;
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    void pruneImages();
  }, 5000);
}

async function pruneImages(limit = CACHE_LIMIT_BYTES) {
  const entries: { key: string; bytes: number; usedAt: number }[] = [];
  await idbEach<StoredImage>('images', (key, v) => entries.push({ key, bytes: v.bytes, usedAt: v.usedAt }));
  let total = entries.reduce((s, e) => s + e.bytes, 0);
  if (total <= limit) return;
  entries.sort((a, b) => a.usedAt - b.usedAt);
  const drop: string[] = [];
  for (const e of entries) {
    if (total <= limit * 0.8) break;
    drop.push(e.key);
    total -= e.bytes;
  }
  await idbDelete('images', drop);
}

export async function imageCacheStats(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  await idbEach<StoredImage>('images', (_, v) => {
    count++;
    bytes += v.bytes;
  });
  return { count, bytes };
}

export async function clearImageCache(): Promise<void> {
  await pruneImages(0);
  loaded.clear();
}
