// 공개된 추출본(GitHub Pages)을 .data/에 내려받는다. 테스트가 이 폴더를 읽는다.
// 사용법: node scripts/fetch-data.mjs [기준 주소]
// manifest의 sha256과 같은 파일은 건너뛴다 — 앱의 "바뀐 파일만 다운로드"와 같은 방식.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base = (process.argv[2] ?? 'https://minatokaede.github.io/app-cynthia-holodori').replace(/\/$/, '');
const dir = path.resolve('.data');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const manifestText = await (await fetch(`${base}/manifest.json`)).text();
const manifest = JSON.parse(manifestText);
const stale = Object.entries(manifest.files).filter(([rel, f]) => {
  const p = path.join(dir, rel);
  return !fs.existsSync(p) || sha(fs.readFileSync(p)) !== f.sha256;
});

for (let i = 0; i < stale.length; i += 32) {
  await Promise.all(stale.slice(i, i + 32).map(async ([rel, f]) => {
    const res = await fetch(`${base}/${rel}`);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha(buf) !== f.sha256) throw new Error(`${rel}: sha256 불일치`);
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), buf);
  }));
}
fs.writeFileSync(path.join(dir, 'manifest.json'), manifestText);
console.log(`번들 ${manifest.source.bundleHash}: ${stale.length}개 갱신, ${Object.keys(manifest.files).length - stale.length}개 그대로`);
