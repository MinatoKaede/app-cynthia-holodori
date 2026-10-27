// 앱용 워커 팩토리: 추출한 워커 원문을 Blob URL로 띄운다 (갤산기와 같은 방식, 원문은 고치지 않는다)
import type { WorkerFactory, WorkerLike } from '../../engine/search';

export function browserWorkerFactory(sources: { prepare: string; exact: string }): WorkerFactory {
  const url = (source: string) => URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const prepare = url(sources.prepare);
  const exact = url(sources.exact);
  return {
    prepare: () => new Worker(prepare) as unknown as WorkerLike,
    exact: () => new Worker(exact) as unknown as WorkerLike,
  };
}

/** 자동 워커 수: 코어 하나는 화면용으로 남기고, 최대 8개 (실제 기기 측정 후 조정) */
export function autoConcurrency(): number {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(8, cores - 1));
}
