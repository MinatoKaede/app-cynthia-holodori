// 골든 (빠른 검사): 연결 코드가 만든 prepare-search 입력이 갤산기가 보낸 것과 같은지
// 골든이 없으면 건너뛴다. 기록 방법은 tools/capture-snippet.js 참고.
import { describe, expect, it } from 'vitest';
import { loadBackup, loadMasterData } from '../src/engine/node-data';
import { bundleHashOf, digestFixtureContext, loadCaptures, loadDigestFixtures, phaseDigests, phases, rebuildContext } from './golden';

const data = loadMasterData();
const backup = loadBackup();
const captures = loadCaptures();

describe('갤산기 해시 기록: prepare-search 입력 (사용자 데이터 없음)', () => {
  for (const f of loadDigestFixtures()) {
    it.skipIf(f.bundleHash !== data.bundleHash)(`${f.file} (번들 ${f.bundleHash})`, () => {
      const context = digestFixtureContext(f, data);
      const d = phaseDigests([{ worker: 1, dir: 'in', data: { type: 'prepare-search', requestId: 1, context } }]);
      expect(d.context).toBe(f.digests.context);
    });
  }
});

describe.skipIf(!backup || captures.length === 0)('골든: prepare-search 입력', () => {
  for (const capture of captures) {
    const sameBundle = bundleHashOf(capture) === data.bundleHash;
    describe(capture.file, () => {
      it.skipIf(!sameBundle)(`번들 ${bundleHashOf(capture)}로 기록 — 현재 데이터와 같은 번들`, () => {
        const captured = phases(capture.messages);
        expect(captured.errors).toEqual([]);
        const ours = rebuildContext(capture, data, backup!);
        // 항목별로 나눠 비교해야 어긋난 곳이 바로 보인다
        expect(ours.growth, '갤산기에 저장된 사용자 데이터와 fixtures 백업이 다릅니다').toEqual(captured.context.growth);
        expect(ours.eventMode).toBe(captured.context.eventMode);
        expect(ours.eventPtMode).toBe(captured.context.eventPtMode);
        expect(ours.currentEvent).toEqual(captured.context.currentEvent);
        expect(ours.chartMetadata).toEqual(captured.context.chartMetadata);
        expect(ours.allCards).toEqual(captured.context.allCards);
        expect(ours.boardSummary).toEqual(captured.context.boardSummary);
        expect(ours.memoryEffects).toEqual(captured.context.memoryEffects);
        expect(ours).toEqual(captured.context);
      });
    });
  }
});
