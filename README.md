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

## 엔진 연결 (Phase 1)

`src/engine/`이 갤산기 워커에 보낼 입력을 만들고 탐색 순서를 그대로 따른다. 워커 원문은 고치지 않는다.

```
npm run data          # 공개 추출본을 .data/에 받기 (테스트용)
npm test              # 빠른 테스트
npm run test:golden   # 갤산기 기록과 전체 비교 (수 분~수십 분)
```

`fixtures/`(사용자 백업·골든 기록)는 커밋하지 않는다. 기록 방법은 `tools/capture-snippet.js` 참고.

## 앱 (Phase 2)

Vite + Svelte 5 + Capacitor 8. 화면 코드는 `src/app/`, 안드로이드 프로젝트는 `android/`.

```
npm run dev           # 브라우저에서 개발 (http://localhost:5173)
npm run typecheck
npm run apk           # 디버그 APK → out/holodori-<버전>-debug.apk
```

APK 빌드에는 JDK 21(`JAVA_HOME`)과 Android SDK(`ANDROID_HOME`, platform 36)가 필요하다.
