<script lang="ts">
  // 카드 세로 일러 (0.7:1). 이미지가 없거나 받는 중이면 멤버 이름 프레임(SPEC 3. 대체 규칙)
  import type { Card } from '../../engine/types';
  import { imageUrl } from '../lib/images';
  import CachedImage from './CachedImage.svelte';

  let {
    card,
    featured = false,
    leader = false,
    caption = false,
  }: { card: Card | undefined; featured?: boolean; leader?: boolean; caption?: boolean } = $props();
</script>

<figure>
  <div class="frame" class:featured title={card ? `${card.name} ${card.versionName}` : ''}>
    <CachedImage url={card ? imageUrl.cardVert(card.id) : null} alt={card ? `${card.name} ${card.versionName}` : ''}>
      {#snippet fallback()}
        <div class="placeholder">
          <span class="stars">{'★'.repeat(card?.rarity ?? 0)}</span>
          <!-- 아래에서부터 쌓는다: 캐릭터 이름은 항상 맨 아래 같은 자리, 이격 이름은 그 위 -->
          {#if card?.versionName}<span class="version">{card.versionName}</span>{/if}
          <span class="name">{card?.name ?? '?'}</span>
        </div>
      {/snippet}
    </CachedImage>
    {#if leader}<span class="badge">L</span>{/if}
  </div>
  {#if caption && card}
    <figcaption>
      {#if card.versionName}<span class="version">{card.versionName}</span>{/if}
      <span class="name">{card.name}</span>
    </figcaption>
  {/if}
</figure>

<style>
  figure { margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .frame {
    position: relative;
    aspect-ratio: 0.7;
    border-radius: var(--r-art);
    background: var(--placeholder);
    border: 2px solid transparent;
    overflow: hidden;
  }
  .featured { border-color: var(--accent); }
  .placeholder { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; padding: 4px; }
  .stars { position: absolute; top: 4px; right: 4px; font-size: 7px; letter-spacing: -1px; color: var(--muted); }
  .badge {
    position: absolute; top: 3px; left: 3px;
    font-size: 10px; font-weight: 700; line-height: 16px; width: 16px; text-align: center;
    border-radius: 4px; background: rgb(30 26 36 / 0.85); color: #fff;
  }
  .name, .version { display: block; font-size: 11px; line-height: 1.25; word-break: keep-all; overflow-wrap: anywhere; }
  .name { font-weight: 600; color: var(--text); }
  .version { color: var(--muted); font-size: 10px; }
  figcaption { text-align: center; }
</style>
