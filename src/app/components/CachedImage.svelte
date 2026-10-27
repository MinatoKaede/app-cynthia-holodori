<script lang="ts">
  // 캐시를 거쳐 이미지를 보여준다. 받는 중이거나 실패하면 fallback(대체 표시)을 그린다
  import type { Snippet } from 'svelte';
  import { loadImage, markFailed } from '../lib/images';

  let { url, alt = '', fit = 'cover', fallback }: { url: string | null; alt?: string; fit?: 'cover' | 'contain'; fallback?: Snippet } = $props();

  let src: string | null = $state(null);

  $effect(() => {
    const target = url;
    src = null;
    if (!target) return;
    let alive = true;
    void loadImage(target).then((s) => {
      if (alive) src = s;
    });
    return () => {
      alive = false;
    };
  });

  function onerror() {
    if (url) markFailed(url);
    src = null;
  }
</script>

{#if src}
  <img {src} {alt} style:object-fit={fit} decoding="async" draggable="false" {onerror} />
{:else}
  {@render fallback?.()}
{/if}

<style>
  img { display: block; width: 100%; height: 100%; }
</style>
