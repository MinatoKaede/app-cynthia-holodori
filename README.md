# app-cynthia-holodori

홀로도리 이벤트 덱 추천 안드로이드 앱. 개발 스펙은 [SPEC.md](SPEC.md).

## 데이터 파이프라인 (Phase 0)

`.github/workflows/extract.yml`이 3시간마다 갤산기(doricalc.cc) 번들 해시를 확인하고,
바뀌었을 때만 `tools/extract.mjs`로 추출 → `tools/validate.mjs`로 검증 → GitHub Pages에 공개한다.

공개 주소: https://minatokaede.github.io/app-cynthia-holodori/manifest.json

로컬에서 실행:

```
cd tools
npm ci
node --max-old-space-size=4096 extract.mjs <app.js 경로> ../out <번들 해시>
node validate.mjs ../out
```
