// 라이브 부스트·패스포트 (사용자 확인 2026-11-12, 갤산기에는 없는 값 — SPEC 2.4)
//   한 판 PT = 기본 PT(점수·보너스 등 합산) × 부스트 배율 × 패스포트 2배(맨 마지막에 전체에 적용)

/** 쓴 불 수(0~10)별 배율. 0불은 불을 다 썼을 때만 가능하며 ×1 */
export const BOOST_MULTIPLIER = [1, 8, 16, 24, 30, 37, 42, 46, 50, 53, 56] as const;
export const MAX_BOOST = BOOST_MULTIPLIER.length - 1;
export const PASSPORT_MULTIPLIER = 2;

/** 불 1개 회복 시간 (분). 패스포트가 있으면 45분, 없으면 90분 */
export const flameRecoveryMinutes = (passport: boolean) => (passport ? 45 : 90);

const multiplier = (boost: number, passport: boolean) =>
  BOOST_MULTIPLIER[Math.max(0, Math.min(MAX_BOOST, Math.trunc(boost)))] * (passport ? PASSPORT_MULTIPLIER : 1);

/** 실제로 받은 한 판의 PT에서 부스트·패스포트를 걷어낸 기본 PT */
export function basePt(samplePt: number, sampleBoost: number, passport: boolean): number {
  return samplePt / multiplier(sampleBoost, passport);
}

/** 기본 PT로 n불 한 판의 PT */
export function playPt(base: number, boost: number, passport: boolean): number {
  return Math.round(base * multiplier(boost, passport));
}
