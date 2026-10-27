// 병렬 exact 워커 (느림, npm run test:golden): 워커 수를 늘려도 최종 순위·점수·확률이 워커 1개(갤산기 기본)와 같은지.
// 앱은 기기 코어 수에 맞춰 워커를 여러 개 쓰므로, 이 검사가 통과해야 갤산기 화면과 같은 결과를 보장할 수 있다.
import { describe, expect, it } from 'vitest';
import { loadBackup, loadChart, loadMasterData } from '../src/engine/node-data';
import { nodeWorkerFactory } from '../src/engine/node-worker';
import { searchCombinations } from '../src/engine/search';
import { bundleHashOf, digestFixtureContext, loadCaptures, loadDigestFixtures, phases, rebuildContext } from './golden';

const CONCURRENCY = 8;
const data = loadMasterData();
const backup = loadBackup();
const captures = loadCaptures().filter((c) => bundleHashOf(c) === data.bundleHash);

describe(`exact 워커 ${CONCURRENCY}개`, () => {
  for (const f of loadDigestFixtures()) {
    it.skipIf(f.bundleHash !== data.bundleHash)(f.file, async () => {
      const result = await searchCombinations({
        context: digestFixtureContext(f, data),
        chart: loadChart(f.songId, f.difficulty),
        workers: nodeWorkerFactory('.data'),
        resultLimit: f.resultLimit,
        concurrency: CONCURRENCY,
        sampleCount: f.sampleCount,
      });
      expect(result.rankings.slice(0, f.top.length).map((r) => ({
        order: r.result.order.join(','),
        expectedScore: r.result.expectedScore,
        theoreticalMaxScore: r.result.theoreticalMaxScore,
      }))).toEqual(f.top.map(({ order, expectedScore, theoreticalMaxScore }) => ({ order, expectedScore, theoreticalMaxScore })));
    });
  }

  for (const capture of backup ? captures : []) {
    it(capture.file, async () => {
      const golden = phases(capture.messages);
      const context = rebuildContext(capture, data, backup!);
      const result = await searchCombinations({
        context,
        chart: loadChart(context.chartMetadata.songId, context.chartMetadata.difficulty),
        workers: nodeWorkerFactory('.data'),
        resultLimit: golden.primaryExact[0]?.resultLimit as number,
        concurrency: CONCURRENCY,
        sampleCount: golden.estimate?.sampleCount ?? 0,
      });
      expect(result.rankings).toEqual(golden.final);
    });
  }
});
