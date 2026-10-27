// 앱 저장소 (WebView IndexedDB). 기기 안에만 저장되고 서버로 보내지 않는다.
//   files   공개 추출본 파일 (경로 → { sha256, text })
//   kv      백업, 직접 입력값, 설정, 현재 manifest
//   results 탐색 결과 캐시 (입력 해시 → 결과)
const DB_NAME = 'holodori';
const STORES = ['files', 'kv', 'results'] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  return done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

/** 여러 값을 한 트랜잭션으로 쓴다 (전부 쓰이거나 하나도 안 쓰인다) */
export async function idbPutAll(store: StoreName, entries: [string, unknown][]): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const [key, value] of entries) tx.objectStore(store).put(value, key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbPut = (store: StoreName, key: string, value: unknown) => idbPutAll(store, [[key, value]]);

export async function idbDelete(store: StoreName, keys: string[]): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const key of keys) tx.objectStore(store).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const db = await open();
  return (await done(db.transaction(store).objectStore(store).getAllKeys())) as string[];
}
