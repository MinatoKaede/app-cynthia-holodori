// 갤산기 해시 기록 재현 (느림, npm run test:golden): 사용자 데이터 없이 기록한 갤산기 탐색을 Node에서 다시 돌려
// 10단계 메시지 해시와 상위 순위가 모두 같은지 확인한다. 기록과 번들이 다르면 건너뛴다.
import { describe, expect, it } from 'vitest';
import { loadChart, loadMasterData } from '../src/engine/node-data';
import { nodeWorkerFactory } from '../src/engine/node-worker';
import { eventPt } from '../src/engine/ranking';
import { searchCombinations } from '../src/engine/search';
import { digestFixtureContext, loadDigestFixtures, phaseDigests, recordingFactory, type Message } from './golden';

const data = loadMasterData();

describe('갤산기 해시 기록: 탐색 전체 재현', () => {
  for (const f of loadDigestFixtures()) {
    it.skipIf(f.bundleHash !== data.bundleHash)(f.file, async () => {
      const log: Message[] = [];
      const result = await searchCombinations({
        context: digestFixtureContext(f, data),
        chart: loadChart(f.songId, f.difficulty),
        workers: recordingFactory(nodeWorkerFactory('.data'), log),
        resultLimit: f.resultLimit,
        concurrency: f.concurrency,
        sampleCount: f.sampleCount,
      });
      expect(phaseDigests(log)).toEqual(f.digests);
      expect(result.rankings.slice(0, f.top.length).map((r) => ({
        order: r.result.order.join(','),
        expectedScore: r.result.expectedScore,
        theoreticalMaxScore: r.result.theoreticalMaxScore,
        eventBonusPercent: r.eventBonusPercent,
        pt: eventPt(r.result.expectedScore, r.eventBonusPercent ?? 0),
      }))).toEqual(f.top);
    });
  }
});
