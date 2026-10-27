<script lang="ts">
  // 멤버 미니 아이콘. 없으면 이름 첫 글자
  import { imageUrl } from '../lib/images';
  import CachedImage from './CachedImage.svelte';

  let { id, name, size = 24 }: { id: string; name: string; size?: number } = $props();
</script>

<span class="icon" style:width="{size}px" style:height="{size}px" title={name}>
  <CachedImage url={imageUrl.memberIcon(id)} alt={name}>
    {#snippet fallback()}<span class="initial" style:font-size="{Math.round(size * 0.45)}px">{name.slice(0, 1)}</span>{/snippet}
  </CachedImage>
</span>

<style>
  .icon { display: inline-block; flex: none; border-radius: 50%; overflow: hidden; background: var(--surface-2); vertical-align: middle; }
  .initial { display: grid; place-items: center; width: 100%; height: 100%; font-weight: 700; color: var(--text-2); }
</style>
