<script lang="ts">
  // 카드 세로 일러 자리 (0.7:1). Phase 3에서 이미지로 바꾸고, 지금은 SPEC의 대체 표시(멤버 이름 프레임)만 쓴다
  import type { Card } from '../../engine/types';

  let { card, featured = false, leader = false }: { card: Card | undefined; featured?: boolean; leader?: boolean } = $props();
</script>

<div class="frame" class:featured title={card ? `${card.name} ${card.versionName}` : ''}>
  {#if leader}<span class="badge">L</span>{/if}
  <span class="stars">{'★'.repeat(card?.rarity ?? 0)}</span>
  <span class="name">{card?.name ?? '?'}</span>
  {#if card?.versionName}<span class="version">{card.versionName}</span>{/if}
</div>

<style>
  .frame {
    position: relative;
    aspect-ratio: 0.7;
    border-radius: var(--r-art);
    background: var(--placeholder);
    border: 2px solid transparent;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 4px;
    overflow: hidden;
    min-width: 0;
  }
  .featured { border-color: var(--accent); }
  .stars { position: absolute; top: 4px; right: 4px; font-size: 7px; letter-spacing: -1px; color: var(--muted); }
  .badge {
    position: absolute; top: 3px; left: 3px;
    font-size: 10px; font-weight: 700; line-height: 16px; width: 16px; text-align: center;
    border-radius: 4px; background: var(--text); color: #fff;
  }
  .name, .version { font-size: 11px; line-height: 1.25; word-break: keep-all; overflow-wrap: anywhere; }
  .name { font-weight: 600; color: var(--text); }
  .version { color: var(--muted); font-size: 10px; }
</style>
