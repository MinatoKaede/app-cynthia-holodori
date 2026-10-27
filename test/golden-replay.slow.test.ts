// 골든 (느린 검사, npm run test:golden): 탐색 전체를 Node에서 다시 돌려
// 워커에 보내는 메시지와 최종 순위가 갤산기 기록과 완전히 같은지 확인한다.
// exact 워커 수는 기록과 같게 맞춘다 (후보 분배가 같아야 메시지가 같다). 워커 1개면 10분 이상 걸린다.
import { describe, expect, it } from 'vitest';
import { loadBackup, loadChart, loadMasterData } from '../src/engine/node-data';
import { nodeWorkerFactory } from '../src/engine/node-worker';
import { eventPt } from '../src/engine/ranking';
import { searchCombinations } from '../src/engine/search';
import { bundleHashOf, loadCaptures, phases, rebuildContext, recordingFactory, type Message } from './golden';

const data = loadMasterData();
const backup = loadBackup();
const captures = loadCaptures().filter((c) => bundleHashOf(c) === data.bundleHash);

describe.skipIf(!backup || captures.length === 0)('골든: 탐색 전체 재현', () => {
  for (const capture of captures) {
    it(capture.file, async () => {
      const golden = phases(capture.messages);
      const context = rebuildContext(capture, data, backup!);
      const log: Message[] = [];
      const t0 = Date.now();
      const result = await searchCombinations({
        context,
        chart: loadChart(context.chartMetadata.songId, context.chartMetadata.difficulty),
        workers: recordingFactory(nodeWorkerFactory('.data'), log),
        resultLimit: golden.primaryExact[0]?.resultLimit as number,
        concurrency: golden.primaryWorkers,
        sampleCount: golden.estimate?.sampleCount ?? 0,
      });
      const ours = phases(log);
      console.log(`${capture.file}: ${((Date.now() - t0) / 1000).toFixed(0)}초, exact 워커 ${golden.primaryWorkers}개`);

      expect(ours.context).toEqual(golden.context);
      expect(ours.screenedCount).toBe(golden.screenedCount);
      expect(ours.primaryFinalists).toEqual(golden.primaryFinalists);
      expect(ours.primaryExact).toEqual(golden.primaryExact);
      expect(ours.refinement).toEqual(golden.refinement);
      expect(ours.refinedFinalists).toEqual(golden.refinedFinalists);
      expect(ours.refinedExact).toEqual(golden.refinedExact);
      expect(ours.estimate).toEqual(golden.estimate);
      expect(result.rankings).toEqual(golden.final);

      // 화면 값(순위·점수·PT) 요약 — 실패 시 비교가 쉽도록
      const summary = (rs: typeof result.rankings) => rs.map((r, i) => ({
        rank: i + 1,
        cards: r.result.order.join(','),
        expected: Math.round(r.result.expectedScore),
        max: Math.round(r.result.theoreticalMaxScore),
        pt: r.eventBonusPercent === undefined ? null : eventPt(r.result.expectedScore, r.eventBonusPercent),
      }));
      expect(summary(result.rankings)).toEqual(summary(golden.final));
    }, 60 * 60 * 1000);
  }
});
