// Node(테스트)에서 추출한 워커 문자열을 수정 없이 실행하는 어댑터. 앱에서는 Blob URL Worker를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { WorkerFactory, WorkerLike } from './search';

// 브라우저 Worker 전역(self, postMessage, onmessage)을 흉내 낸 뒤 워커 원문을 평가한다
const BOOT = `
const { parentPort, workerData } = require('node:worker_threads');
globalThis.self = globalThis;
globalThis.postMessage = (m) => parentPort.postMessage(m);
parentPort.on('message', (data) => globalThis.onmessage?.({ data }));
(0, eval)(workerData.source);
`;

export class NodeWorker implements WorkerLike {
  onmessage: ((ev: { data: any }) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  private worker: Worker;

  constructor(source: string) {
    this.worker = new Worker(BOOT, { eval: true, workerData: { source } });
    this.worker.on('message', (data) => this.onmessage?.({ data }));
    this.worker.on('error', (e) => this.onerror?.(e));
  }

  postMessage(message: unknown) {
    this.worker.postMessage(message);
  }

  terminate() {
    void this.worker.terminate();
  }
}

/** 추출 폴더(workers/*.js)에서 워커 팩토리를 만든다 */
export function nodeWorkerFactory(dataDir: string): WorkerFactory {
  const read = (f: string) => fs.readFileSync(path.join(dataDir, 'workers', f), 'utf8');
  const prepare = read('prepare-search.js');
  const exact = read('exact.js');
  return { prepare: () => new NodeWorker(prepare), exact: () => new NodeWorker(exact) };
}
