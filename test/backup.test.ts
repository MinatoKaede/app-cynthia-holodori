// 백업 가져오기: 계산에 쓰는 5개 항목만 남기고, 직접 입력값이 백업 값보다 우선하는지
import { describe, expect, it } from 'vitest';
import { backupSummary, effectiveGrowth, parseBackup } from '../src/app/lib/backup';
import { growthFromBackup } from '../src/engine/context';
import { loadBackup } from '../src/engine/node-data';

const sample = {
  schemaVersion: 1,
  updatedAt: '2026-10-27T05:04:13.329Z',
  memoryCount: 120,
  memberPowerUpPercent: 12.5,
  collection: { 'card-a': { owned: true, awakening: 5 }, 'card-b': { owned: false } },
  memberBoards: { 'chr-00001': ['R-001'], 'chr-00002': [] },
  boardCards: { x: {} },
  savedDecks: [{ name: '버려야 할 항목' }],
  preferences: { theme: 'dark' },
};

describe('parseBackup', () => {
  it('계산에 쓰는 항목만 저장한다', () => {
    const b = parseBackup(JSON.stringify(sample), 'b.json');
    expect(b.fileName).toBe('b.json');
    expect(b.updatedAt).toBe(sample.updatedAt);
    expect(Object.keys(b.growth).sort()).toEqual(['boardCards', 'collection', 'memberBoards', 'memberPowerUpPercent', 'memoryCount']);
    expect(JSON.stringify(b)).not.toContain('버려야 할 항목');
    expect(backupSummary(b)).toEqual({ ownedCards: 1, boardMembers: 1, boardCards: 1 });
  });

  it('백업이 아닌 파일은 거절한다', () => {
    expect(() => parseBackup('not json', 'x')).toThrow('JSON');
    expect(() => parseBackup('{}', 'x')).toThrow('갤산기 백업');
    expect(() => parseBackup(JSON.stringify({ ...sample, schemaVersion: 2 }), 'x')).toThrow('schemaVersion 2');
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 1 }), 'x')).toThrow('collection');
  });

  it('직접 입력값이 있으면 백업 값 대신 쓴다', () => {
    const b = parseBackup(JSON.stringify(sample), 'b.json');
    expect(effectiveGrowth(b, {}).memoryCount).toBe(120);
    expect(effectiveGrowth(b, { memoryCount: 300 })).toMatchObject({ memoryCount: 300, memberPowerUpPercent: 12.5 });
    expect(effectiveGrowth(null, {})).toEqual(growthFromBackup({}));
  });

  const real = loadBackup();
  it.skipIf(!real)('실제 백업: 골든과 같은 계산 입력이 된다', () => {
    const b = parseBackup(JSON.stringify(real), 'real.json');
    expect(effectiveGrowth(b, {})).toEqual(growthFromBackup(real!));
  });
});
