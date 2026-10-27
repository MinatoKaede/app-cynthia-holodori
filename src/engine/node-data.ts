// Node(테스트·CLI)용: scripts/fetch-data.mjs가 받은 .data/ 폴더와 fixtures/의 백업을 읽는다
import fs from 'node:fs';
import path from 'node:path';
import type { MasterData } from './types';

const readJson = (dir: string, rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));

export function loadMasterData(dir = '.data'): MasterData & { bundleHash: string } {
  return {
    events: readJson(dir, 'events.json'),
    cards: readJson(dir, 'cards.json').cards,
    boards: readJson(dir, 'boards.json'),
    memoryEffects: readJson(dir, 'memory.json').effects,
    charts: readJson(dir, 'charts/index.json').charts,
    bundleHash: readJson(dir, 'manifest.json').source.bundleHash,
  };
}

export function loadChart(songId: string, difficulty: string, dir = '.data'): unknown {
  return readJson(dir, `charts/${songId}.${difficulty}.json`);
}

/** fixtures/ 안의 갤산기 백업 (schemaVersion 1). 없으면 null */
export function loadBackup(dir = 'fixtures'): Record<string, unknown> | null {
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const v = readJson(dir, f);
    if (v?.schemaVersion === 1 && v.collection) return v;
  }
  return null;
}
