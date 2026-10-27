// 갤산기 백업 가져오기. 계산에 쓰는 5개 항목만 저장하고 나머지(저장 덱, 필터 등)는 버린다.
import { growthFromBackup } from '../../engine/context';
import type { Growth } from '../../engine/types';

export interface StoredBackup {
  fileName: string;
  importedAt: string;
  /** 백업 파일의 updatedAt (갤산기에서 마지막으로 바꾼 시각) */
  updatedAt: string | null;
  growth: Growth;
}

/** 메모리 수·강화율을 앱에서 직접 고친 값. 없으면 백업 값을 쓴다 */
export interface GrowthOverrides {
  memoryCount?: number;
  memberPowerUpPercent?: number;
}

export const MAX_POWER_UP_PERCENT = 50;

export function parseBackup(text: string, fileName: string): StoredBackup {
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일이 아닙니다. 갤산기에서 백업으로 저장한 파일을 골라 주세요.');
  }
  if (!v || typeof v !== 'object' || v.schemaVersion === undefined) throw new Error('갤산기 백업 파일이 아닙니다.');
  if (v.schemaVersion !== 1) throw new Error(`지원하지 않는 백업 형식입니다 (schemaVersion ${v.schemaVersion}).`);
  if (!v.collection || typeof v.collection !== 'object') throw new Error('백업에 보유 카드 정보(collection)가 없습니다.');
  return {
    fileName,
    importedAt: new Date().toISOString(),
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
    growth: growthFromBackup(v),
  };
}

export function backupSummary(b: StoredBackup) {
  return {
    ownedCards: Object.values(b.growth.collection).filter((c) => c?.owned).length,
    boardMembers: Object.values(b.growth.memberBoards).filter((nodes) => Array.isArray(nodes) && nodes.length > 0).length,
    boardCards: Object.keys(b.growth.boardCards).length,
  };
}

/** 계산에 넘길 성장 정보: 백업 + 직접 입력값. 백업이 없으면 갤산기 빈 상태와 같다 */
export function effectiveGrowth(b: StoredBackup | null, o: GrowthOverrides): Growth {
  return growthFromBackup((b?.growth ?? {}) as unknown as Record<string, unknown>, o);
}
