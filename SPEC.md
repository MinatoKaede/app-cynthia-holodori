# 홀로도리 이벤트 덱 추천 앱 — 개발 스펙

안드로이드 앱(APK). 갤산기(doricalc.cc)의 데이터와 계산 엔진을 그대로 가져와서,
사용자의 갤산기 백업 파일을 기준으로 **진행 중인 이벤트의 PT 덱**과 **과제곡 최고 점수 덱**을 추천한다.
갤산기는 PC 중심이라 모바일에서 쓰기 불편하다는 점을 보완하는 것이 목적이다.

- 허가: 갤산기 제작자에게 데이터·계산 로직을 사이트에서 그대로 가져다 쓰는 것과 앱 제작·배포를 허가받음.
- 플랫폼: 안드로이드만. PC는 갤산기를 쓰면 되므로 대응하지 않는다. iOS는 대상 아님.
- 함께 받은 파일:
  - `tools/extract.mjs` — 갤산기 번들 → 앱용 데이터 추출기 (2026-10-26 동작 확인)
  - `tools/smoke-analysis.mjs` — 추출한 분석 워커를 Node에서 실행하는 테스트 (동작 확인)
  - `tools/package.json` — 추출기 의존성 (acorn, acorn-walk)
- 사용자 본인의 갤산기 백업 파일을 `fixtures/`에 두고 테스트에 쓴다 (저장소에 커밋하지 말 것 — `.gitignore`).

---

## 1. 전체 구조

```
[GitHub Actions, 3시간마다]
  doricalc.cc/index.html 확인 (0.5KB)
   └ app.js 버전 해시가 바뀌었을 때만 app.js(약 36MB) 다운로드
       └ tools/extract.mjs → 검증 → GitHub Pages에 공개
            manifest.json, events.json, cards.json, boards.json, memory.json,
            charts/index.json, charts/<songId>.<difficulty>.json, workers/*.js

[앱]
  실행 시 manifest.json 확인 → 바뀐 파일만 다운로드·캐시
  채보는 필요한 곡만 그때그때 다운로드
  사용자 데이터 = 갤산기 백업 파일 (기기 안에만 저장)
  계산 = 추출한 갤산기 워커를 수정 없이 Web Worker로 실행
  이미지 = cdn.holodori.dev에서 필요할 때 받아 캐시 (APK에 넣지 않음)
```

원칙
- 계산 공식을 다시 짜지 않는다. 갤산기 워커를 그대로 쓰고, 앱은 입력을 만들고 결과를 보여 주는 "연결 코드"만 가진다.
- 갤산기 데이터를 앱 안에 고정하지 않는다. 항상 공개된 추출본을 받는다 (오프라인 시 마지막 캐시 사용).
- 축소된 변수명에 의존하지 않는다 (빌드마다 바뀜). 속성 이름·고유 문자열로 찾는다 — `extract.mjs`가 이미 그렇게 되어 있다.

---

## 2. 갤산기 분석 결과 (2026-10-26, app.js 버전 `81eee88acece44b7`)

### 2.1 데이터 (모두 app.js 안에 내장)
| 데이터 | 찾는 기준 | 현재 값 |
|---|---|---|
| 이벤트 | `bonusCharacterIds`를 가진 객체 + 스프레드로 합친 최종 배열. 일부는 코드(`.map`, 변수 참조)로 만들어지므로 **AST로 선언을 찾아 vm에서 평가**한다 | 6개 (릴레이 챕터 포함) |
| 카드 | `{masterDataVersion, cards[]}` | 196장 |
| 보드 구조 | `{members, models, nodeGroups}` | 멤버 54, 레이아웃 4, 노드 154 |
| 메모리 효과표 | `{maxCount, effects}` | 50단계 |
| 채보 목록 | `{charts[], masterDataSource}` — 곡명·난이도·`scoreRatio`·공개 시각 등 | 880 |
| 채보 본문 | `"../static/data/charts/mXXXX.<difficulty>.json"` 키의 JSON 문자열 | 880개, 합계 약 34MB |

이벤트 객체 주요 필드: `id, name, startsAt, calculatorStartsAt?, endsAt, exchangeEndsAt, bonusCharacterIds, featuredCardIds, formationBonusPercent, featuredCardBonusPercent, awakeningBonusPercentByRarity{3,4,5:[개화0..5]}, challengeSongBonusCardIds{songId:[cardId]}, challengeSongScoreBonusPercent, chapters?[{id,name,startsAt,calculatorStartsAt?,endsAt,bonusCharacterIds,challengeSongBonusCardIds}]`

### 2.2 계산 워커 (모두 문자열로 내장, Blob/data URL로 Worker 생성)
| 파일 (추출 후 이름) | 식별 문자열 | 역할 |
|---|---|---|
| `analysis.js` (44KB) | `이 패키지에 없는 채보` | **완결형 분석 엔진.** 입력 `{backup, request, data, charts}` → 결과 1회 응답. 보드 효과·커넥트 카드·의상·메모리·멤버 강화·스페셜 순서·쿨감 최적화·빔 탐색까지 포함. 갤산기 "AI 연결" 기능용. **이벤트 보너스는 없음.** |
| `prepare-search.js` (23KB) | ``type===`prepare-search` `` | 조합 탐색 1단계. `eventMode`, `eventPtMode`, `currentEvent`를 받아 이벤트 보너스(편성·대상 카드·개화)와 과제곡 보너스를 반영한 후보 선별. |
| `exact.js` (24KB) | ``type===`optimize-exact` `` | 정밀 최적화, 달성 확률, 조합 순위(`rankingMultiplier` = 1 + 이벤트 보너스%). |
| `connection.js` (577KB) | ``type===`connection` `` | 커넥트 카드 자동 배치 (MVP에서는 사용 안 함). |

#### analysis.js 입력 (확인됨)
```js
worker.postMessage({
  backup,            // 갤산기 백업 JSON "객체" (문자열 아님)
  request: {
    schemaVersion: 1,
    operation: 'analyze' | 'compare' | 'search',
    charts: [{ songId, difficulty }],      // 1~8개
    objective: 'expected' | 'maximum',     // 기본 expected
    ownedOnly: true,
    probabilitySamples,                    // 0~25000, 선택
    teams: [...],                          // analyze/compare 전용 (스키마는 번들의 요청 스키마 정의 참고)
    search: { candidateCardIds, fixedCardIds, leaderCharacterId, leaderOutfitCardId, beamWidth(1~64), maxTeams(1~8) }
  },
  data: { cards, boards, memoryEffects: memory.effects, charts: chartIndex.charts },
  charts: [ /* request.charts에 해당하는 채보 본문 객체들 */ ]
});
// 응답: { status: 'complete', result } | { status: 'error', message }
// result: { ranking[], results[]{cardIds, awakenings, leaderCharacterId, leaderOutfitCardId,
//           power{overallPower, boardTotal, outfitTotal, memoryTotal, ...}, expectedScore,
//           theoreticalMaxScore, order, cooldownReductions, scoreCalibrationSource, ...},
//           search{method:'heuristic-beam-shortlist', globallyOptimal:false, ...}, assumptions[] }
```
팀별 `scenario`(가정)로 `awakeningByCardId, memoryCount, memberPowerUpPercent, memberBoards, boardCards`를 덮어쓸 수 있다.

#### prepare-search.js 입력 (확인됨, 갤산기 조합 탐색 화면과 동일)
```js
{ type: 'prepare-search', requestId, context: {
    allCards, boardSummary /* boards.json */, memoryEffects, chartMetadata /* 채보 목록의 해당 항목 */,
    growth: { collection, memberBoards, boardCards, memoryCount, memberPowerUpPercent },  // 백업의 5개 항목
    settings: { fixedCardIds, fixedAwakenings, fixedCooldownReductions, fixedAllBlueNodes, leaderBoardCharacterId,
                fixedGenerationBonusOverrides, candidateAwakening, candidateGenerationBonus, songScoreBonusOverride,
                ownedCardsOnly, regularCardsOnly, excludeComboConditionCards, maxMediumProbabilityCards,
                leaderCharacterId, leaderOutfitCardId },
    eventMode, eventPtMode, currentEvent } }
// → preparation-progress …, preparation-result { finalists, screenedCount } → 이후 exact.js 단계
```
**확정 (2026-10-27, 번들 `c30f45fe5d0c0266` 분석) — 갤산기 본체의 연결 순서.** 구현: `src/engine/search.ts`
1. prepare 워커 ← `{type:'prepare-search', requestId, context}` → `preparation-result{pass:'primary', finalists, screenedCount}`
2. exact 워커 풀(기본 1개, "최대 컴퓨팅 자원 활용" 시 min(32, 후보 수, 코어 수)) — 후보를 번갈아 나눠
   ← `{type:'optimize-combinations', candidates, chart, returnAllRankings:false, resultLimit, withInputIndices:true, operationId}` → `combination-result{rankings, indices}`.
   합친 뒤 `rankingMultiplier` 기준 정렬, 상위 resultLimit개.
3. 같은 prepare 워커 ← `{type:'prepare-refinement', requestId, rankings:[{result:{order}}]}` → `preparation-result{pass:'refinement', finalists}` (스페셜 순서 기반 추가 후보)
4. 추가 후보가 있으면 2와 같이 정밀 평가
5. 1·2차 결과를 합쳐 같은 카드 구성은 하나만 남기고 정렬 (이벤트 PT 모드: 예상 PT, 점수 모드: 이론상 최대 점수), 상위 resultLimit개
6. 별도 exact 워커 ← `{type:'estimate-achievement', rankings, chart, sampleCount:25000}` → `achievement-result{rankings}` (확률은 시드 고정이라 결정적)
- 모드: 이벤트 PT = `eventMode && !eventScoreMode`, 이벤트 점수 = 둘 다 true (과제곡만 선택 가능, 보너스%는 계산하지만 `rankingMultiplier` 없이 최대 점수 목표).
- 갤산기 페이지: `https://doricalc.cc/#/event` (PT / 스코어 탭). 기록 스니펫: `tools/capture-snippet.js`.

### 2.3 엔진 사용 방침
| 앱 기능 | 사용 엔진 |
|---|---|
| 이벤트 PT 덱 추천 | `prepare-search.js` → `exact.js` (이벤트 모드). 갤산기 "이벤트 PT 비교"와 같은 결과여야 함 |
| 과제곡 최고 점수 덱 | 이벤트 모드 파이프라인(과제곡 점수 보너스 반영). 이벤트가 없거나 일반 곡이면 `analysis.js`의 `search` |
| 덱 상세 재계산·비교 | `analysis.js`의 `analyze` / `compare` |
| 테스트 오라클 | `analysis.js` (Node에서 실행 가능 — `tools/smoke-analysis.mjs`) |

### 2.4 이벤트 관련 규칙 (갤산기 코드 그대로)
- 현재 이벤트: `(calculatorStartsAt ?? startsAt) <= now <= endsAt`인 이벤트. 챕터가 있으면 같은 조건의 챕터 중 가장 최근 시작 것을 골라 이벤트 필드에 덮어쓰고 이름을 `이벤트명 · 챕터명`으로 만든다.
- 이벤트 보너스% = Σ(보너스 멤버면 `formationBonusPercent`) + Σ(대상 카드면 `featuredCardBonusPercent`) + Σ `awakeningBonusPercentByRarity[레어도][개화]`.
- 과제곡 점수 보너스 = 해당 곡의 `challengeSongBonusCardIds`에 있는 카드를 편성하면 `challengeSongScoreBonusPercent` (중복 없음).
- 이벤트 PT 지표 = `round(예상 점수 × (1 + 이벤트 보너스%/100))`. 갤산기와 같은 값이며, 화면에는 "예상 PT (갤산기 기준)"으로 표기. 실제 게임 PT 공식과의 일치 여부는 별도 확인 대상.
- 이벤트 모드 후보 카드: 5성·4성 전부 + 보너스 멤버의 3성.

### 2.5 사용자 데이터 (갤산기 백업)
- 형식: `schemaVersion: 1`. 앱이 쓰는 항목은 `collection`, `memberBoards`, `boardCards`, `memoryCount`, `memberPowerUpPercent` 다섯 개. 나머지(저장 덱, 필터 등)는 무시.
- 메모리 수·강화율은 앱에서 직접 수정 가능 (처음엔 백업 값). 계산 시 백업 객체의 해당 값을 바꿔 워커에 넘긴다.
- 기기 안(앱 저장소)에만 저장. 서버로 보내지 않는다.

---

## 3. 이미지 (cdn.holodori.dev)

holodori.best가 운영하는 공개 저장소. 로그인·봇 확인 없이 받아짐 (2026-10-26, 갤산기 카드 196장 전부 확인).
사용자 확인: holodori.best의 봇 확인은 DDoS 대비용이며 데이터를 가져다 쓰는 것은 괜찮음. 다만 앱이 이미지를 직접 불러오게 되므로 배포 전 운영자에게 한 번 알리는 것을 권장.

| 용도 | 주소 (`{K}` = 카드 ID에서 `card-` 제거, 예: `04014-5-uniq-0094-00`) | 크기 |
|---|---|---|
| 카드 세로 일러 (목록·덱) | `https://cdn.holodori.dev/assets/assetbundles/img_card_vert_{K}/img_card_vert_{K}_unsquished.webp` | 256×363 |
| 카드 가로 일러 (상세 상단) | `…/img_card_full_{K}/img_card_full_{K}_unsquished.webp` | 1820×1024 |
| 멤버 미니 아이콘 | `…/img_chr_icon_mini_{N}/img_chr_icon_mini_{N}.webp` (`{N}` = `chr-00001` → `00001`) | — |
| 이벤트 배너 | `…/img_banner_full_{이벤트ID}/img_banner_full_{이벤트ID}_unsquished.webp` | 1820×1024 (16:9) |

- `_unsquished`가 정상 비율 버전이다. 접미사 없는 원본은 텍스처 규격으로 늘어나 있음(세로 256×512, 가로 2048×1024) — 쓰지 말 것.
- 배너 문구는 일본어판이다(한국어판 `_lang-ko`는 저장소에 없음). 배너 아래 한국어 이벤트명을 항상 같이 표시.
- 배너 오른쪽 위 저작권 표기(© COVER / © QualiArts)를 가리거나 잘라내지 않는다. 남은 시간 배지는 왼쪽 위, 배너 왼쪽 아래(이벤트 로고)도 가리지 않는다.
- 대체 규칙: 404·네트워크 오류면 카드는 "멤버 이름이 들어간 프레임", 배너는 "이벤트명 텍스트 카드"로 표시하고, 다음 실행 때 다시 시도.
  - 갤산기가 임시 ID(`notice-…`)를 쓰는 이벤트는 배너가 없다 (예: 선샤인 잼버리 = 실제로는 `marathon_event-normal-007`).
  - 새 카드·이벤트 이미지가 아직 저장소에 없을 수 있다.
- 받은 이미지는 기기에 캐시. **APK에 이미지 파일을 포함하지 않는다.**

---

## 4. 화면 (목업: 사용자 확인 완료, 라이트 테마)

하단 메뉴 4개: 홈 / 덱 추천 / 스케줄 / 데이터. 기준 화면 390×844.

1. **홈**
   - 진행 중인 이벤트 카드 1개만: 16:9 배너(왼쪽 위에 "N일 N시간 남음" 배지) → 이벤트 종류·챕터 칩 → 한국어 이벤트명 → 종료 시각 → 보너스 한 줄 요약(챕터 멤버 +%, 대상 카드 장당 +%, 과제곡과 점수 보너스).
   - 이벤트 대상 카드: 세로 일러 4열(0.7:1 프레임, 분홍 테두리) + 멤버 이름.
   - 버튼 2개 나란히: "이벤트 PT 덱"(주), "과제곡 점수 덱"(보조) → 추천 조건 화면(모드 선택된 상태로).
   - "내 데이터" 줄: 보유 카드 수·보드 등록 멤버 수·백업 날짜, 갤산기 데이터 갱신일, "갱신" → 데이터 화면.
   - 진행 중 이벤트가 없으면 "진행 중인 이벤트 없음" + 다음 이벤트(있으면).
2. **데이터 가져오기**: 파일 선택(안드로이드 파일 선택기) → 파일명·백업 시각 → 가져온 항목(카드 N장, 보드 N명, 커넥트 N개) → 직접 입력(보유 메모리 수, 멤버 강화율 0~50%) → 저장.
3. **추천 조건**: 목표 세그먼트(이벤트 PT / 과제곡 점수) → 곡(기본 과제곡, 변경 가능) + 난이도 4개 → 리더 멤버·리더 의상 → 보유 카드만 / 콤보 조건 카드 제외 / 고정 카드 → 안내 문구 → "덱 찾기".
4. **추천 결과**: 조건 요약, 정렬(예상 PT순 / 예상 점수순), 덱 카드(순위, 세로 일러 5장 — 맨 앞 리더, 대상 카드 분홍 테두리, 예상 PT·예상 점수·이벤트 보너스%). 계산 중에는 진행률과 취소 버튼.
5. **덱 상세**: 예상 PT·예상 점수·최대 점수, 카드 5장(개화·쿨감·태그), 이벤트 보너스 내역(편성/대상 카드/개화/합계, 과제곡 보너스 적용 여부), 스페셜 순서, 최대 점수 달성 확률(99.5/99/95%), "조건 바꿔 다시 찾기".
   - 채보의 `scoreCalibrationSource`가 실측이 아니면 갤산기처럼 "추정 점수" 경고 표시.
6. **스케줄러 (Phase 4, 구상안)**: 챕터 타임라인, 목표 PT 진행, 알림(챕터 전환, 종료 3시간 전, 매일 진행 체크).

### 디자인 토큰 (라이트)
| 토큰 | 값 | 용도 |
|---|---|---|
| bg | `#F6F4F8` | 화면 배경 |
| surface | `#FFFFFF` | 카드·하단 메뉴·입력칸 |
| surface-2 | `#F0EDF3` | 보조 면 |
| placeholder | `#ECE8F0` | 이미지 대체 프레임 |
| border | `#E3DFE8` | 구분선·테두리 |
| border-strong | `#B9B3C2` | 점선·지난 구간 |
| text | `#1E1A24` | 본문 |
| text-2 | `#4A4553` | 보조 본문 |
| muted | `#6B6577` | 라벨·설명 |
| accent | `#C9306D` | 주 버튼 배경(글자 흰색), 활성 메뉴, 대상 카드 테두리 |
| accent-text | `#A4255A` | 분홍 글자 |
| accent-soft | `#FCE4EE` | 선택 칩 배경 |
- 글꼴: IBM Plex Sans KR (400/500/600/700). 숫자는 `tabular-nums`.
- 모서리: 카드 18px, 버튼 14px, 칩 999px, 카드 일러 6~8px. 터치 영역 최소 44px.
- 글자 대비 4.5:1 이상 유지 (위 조합은 충족).

---

## 5. 기술 스택
- Vite + TypeScript + (Svelte 또는 React — 가벼운 쪽 권장) + **Capacitor**(안드로이드).
- 계산: 추출한 워커 문자열을 Blob URL로 `new Worker()` — 갤산기와 같은 방식. 메인 스레드에서 계산 금지.
- 저장: WebView IndexedDB 하나로 통일 (백업, 설정, 데이터 캐시, 결과 캐시). 플러그인 없이 브라우저 개발 환경과 앱에서 똑같이 동작하고, 수 MB 문자열을 네이티브 브리지로 넘기지 않아도 된다. 안드로이드 앱 저장소 안이라 OS가 임의로 지우지 않는다. 이미지 캐시(Phase 3)는 그때 다시 정한다.
- 파일 선택: `<input type="file">` (Capacitor WebView가 안드로이드 문서 선택기를 띄운다 — 플러그인 불필요).
- 화면: Svelte 5. 버전은 Capacitor 8 (JDK 21, compileSdk 36, minSdk 24).
- 알림(Phase 4): Capacitor Local Notifications.
- 배포: 서명된 APK를 커뮤니티에 직접 배포 (Play 스토어는 추후).

## 6. 성능 주의
- 클라우드 서버 Node에서 `analysis.js`의 `search`(기본 빔)로 한 곡을 계산하는 데 약 165초 걸렸다. 휴대폰은 더 느릴 수 있다.
- 2026-10-27 PC(16코어) Node, exact 워커 1개: 이벤트 PT 조합 탐색(보유 제한 없음, m0367 EXPERT) 617초. 후보 선별은 약 2초, 대부분이 exact 정밀 평가. 워커 수를 늘리면 거의 비례해 줄어든다.
- 2026-10-27 같은 PC, exact 워커 8개: 사용자 백업 이벤트 PT(보유 카드만) 602초 → 109초, 스코어 71초 → 33초(브라우저 29초). 최종 순위·점수·달성 확률은 워커 1개와 완전히 같다 (`test/concurrency.slow.test.ts`) — 워커 수는 속도만 바꾼다. 앱 기본값은 `코어 수 − 1`(최대 8).
- 대책: 진행률 표시·취소 버튼 필수, 빔 폭·`probabilitySamples` 기본값을 낮추고 상세 화면에서만 확률 계산, 결과 캐시(같은 입력이면 재사용).
- Phase 2에서 실제 기기(중급 안드로이드)로 측정하고 기본값을 정한다.

---

## 7. 진행 단계와 완료 기준

**Phase 0 — 데이터 파이프라인**
- `tools/extract.mjs`를 저장소에 넣고 GitHub Actions(3시간 주기 + 수동 실행)로 실행, GitHub Pages에 공개.
- index.html의 `app.js?v=` 해시가 그대로면 아무것도 하지 않는다.
- 검증 실패 시 이전 공개본을 유지하고 워크플로를 실패로 끝내 알림을 받는다.
- 완료 기준: manifest.json과 모든 파일이 공개 주소로 받아지고, 해시 변경 시 자동 갱신됨.

**Phase 1 — 엔진 연결 (Node 테스트 우선)**
- 브라우저에서 갤산기 조합 탐색(이벤트 PT 모드)의 워커 메시지를 기록 → 골든 픽스처.
- 앱 연결 코드(입력 생성, `prepare-search` → `exact` 순서)를 구현하고, Node에서 골든과 같은 메시지·같은 결과가 나오는지 테스트.
- 현재 이벤트·챕터 선택, 이벤트 보너스% 계산을 갤산기와 대조하는 테스트.
- 완료 기준: 사용자 백업으로 같은 조건을 넣었을 때 갤산기 화면과 순위·점수·PT가 일치.

**Phase 2 — 앱 MVP**: 화면 1~5, 백업 가져오기, 데이터 다운로드·캐시, 계산 진행률·취소, 라이트 테마. 실제 기기 성능 측정.

**Phase 3 — 이미지**: 카드 일러·배너·멤버 아이콘, 캐시, 대체 규칙.

**Phase 4 — 스케줄러**: 사용자와 기능 확정 후 진행.

## 8. 미확정 사항
- 앱 이름.
- ~~exact.js 단계 메시지 형식~~ → 2.2에 확정.
- ~~곡 공개 시각 보정표~~ → 2026-10-27 기준 채보 880개 모두 `releaseTime`이 있어 곡 선택 목록(최신순 정렬·미공개 곡 숨김)에는 필요 없다. 1시간 차이는 공개 직후 한 시간만 영향. `releaseTime` 없는 곡이 생기면 다시 검토.
- 곡 점수 보너스: 워커 결과의 `directSongScoreBonusPercent`는 갤산기 설정 `songScoreBonusOverride`(기본 10%)로 모든 덱에 같고, 과제곡 보너스는 `finalScoreBonusPercent`에 들어간다. 앱은 후자만 "과제곡 보너스"로 표시.
- 실제 게임 이벤트 PT 공식과 갤산기 지표의 관계.
- 스케줄러 세부 기능.
- holodori.best 측에 이미지 직접 불러오기 사용 고지.
