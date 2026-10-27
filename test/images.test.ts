// 이미지 주소 규칙 (SPEC 3.): _unsquished 버전, 카드 ID에서 card- 제거, 임시 이벤트 ID는 배너 없음
import { describe, expect, it } from 'vitest';
import { imageUrl } from '../src/app/lib/images';

const CDN = 'https://cdn.holodori.dev/assets/assetbundles';

describe('imageUrl', () => {
  it('카드 세로·가로 일러', () => {
    expect(imageUrl.cardVert('card-04014-5-uniq-0094-00')).toBe(
      `${CDN}/img_card_vert_04014-5-uniq-0094-00/img_card_vert_04014-5-uniq-0094-00_unsquished.webp`,
    );
    expect(imageUrl.cardFull('card-04014-5-uniq-0094-00')).toBe(
      `${CDN}/img_card_full_04014-5-uniq-0094-00/img_card_full_04014-5-uniq-0094-00_unsquished.webp`,
    );
  });

  it('멤버 아이콘', () => {
    expect(imageUrl.memberIcon('chr-00001')).toBe(`${CDN}/img_chr_icon_mini_00001/img_chr_icon_mini_00001.webp`);
  });

  it('이벤트 배너 (갤산기 임시 ID는 없음)', () => {
    expect(imageUrl.banner('marathon_event-relay-003')).toBe(
      `${CDN}/img_banner_full_marathon_event-relay-003/img_banner_full_marathon_event-relay-003_unsquished.webp`,
    );
    expect(imageUrl.banner('notice-sunshine-jamboree-2026-10-15')).toBeNull();
  });
});
