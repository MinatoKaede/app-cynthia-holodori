// 갤산기 조합 탐색의 워커 메시지 기록기 (골든 픽스처용)
//
// 사용법
//   1. https://doricalc.cc/#/event 를 연다 (사용자 데이터가 불러와진 상태)
//   2. F12 → Console에 이 파일 전체를 붙여 넣고 Enter
//   3. 조건을 정하고 "탐색"을 누른 뒤 결과가 나올 때까지 기다린다
//   4. 자동으로 doricalc-capture-<시각>.json 파일이 내려받아진다 → fixtures/golden/에 넣는다
//   (탐색을 여러 번 하면 탐색마다 파일 하나씩)
//
// 진행률 메시지는 양이 많아 개수만 센다. 워커 생성 전에 붙여 넣어야 하므로 탐색 버튼보다 먼저 실행할 것.
(() => {
  if (window.__doricalcCapture) return console.log('[capture] 이미 설치됨');
  const Original = window.Worker;
  const progressTypes = new Set(['progress', 'preparation-progress', 'achievement-progress']);
  let run = null;
  let workerSeq = 0;

  const start = () => {
    run = { capturedAt: new Date().toISOString(), now: Date.now(), page: location.href, appScript: document.querySelector('script[src*="app.js"]')?.getAttribute('src'), progressCount: 0, messages: [] };
    console.log('[capture] 탐색 기록 시작');
  };
  const finish = () => {
    const blob = new Blob([JSON.stringify(run)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doricalc-capture-${run.capturedAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    console.log(`[capture] 저장: ${a.download} (${(blob.size / 1e6).toFixed(1)}MB, 메시지 ${run.messages.length}개)`);
    run = null;
  };
  const record = (worker, dir, data) => {
    if (dir === 'in' && data?.type === 'prepare-search') start();
    if (!run) return;
    if (progressTypes.has(data?.type)) { run.progressCount++; return; }
    run.messages.push({ t: Math.round(Date.now() - run.now), worker, dir, data: structuredClone(data) });
    if (dir === 'out' && (data?.type === 'achievement-result' || data?.type === 'error')) finish();
  };

  window.Worker = class extends Original {
    constructor(url, options) {
      super(url, options);
      this.__id = ++workerSeq;
      this.addEventListener('message', (e) => record(this.__id, 'out', e.data));
    }
    postMessage(message, ...rest) {
      record(this.__id, 'in', message);
      return super.postMessage(message, ...rest);
    }
  };
  window.__doricalcCapture = { get run() { return run; } };
  console.log('[capture] 설치 완료 — 이제 "탐색"을 누르세요');
})();
