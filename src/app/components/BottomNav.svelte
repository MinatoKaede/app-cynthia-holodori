<script lang="ts">
  import { nav, type Tab } from '../state.svelte';
  import { search } from '../search.svelte';

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: '홈', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    { id: 'recommend', label: '덱 추천', icon: 'M4 5h16M4 12h16M4 19h10' },
    { id: 'schedule', label: '스케줄', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
    { id: 'data', label: '데이터', icon: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  ];
</script>

<nav>
  {#each tabs as t (t.id)}
    <button class:on={nav.tab === t.id} onclick={() => (nav.tab = t.id)} aria-current={nav.tab === t.id ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={t.icon} /></svg>
      <span>{t.label}</span>
      {#if t.id === 'recommend' && search.status === 'running'}<i class="dot" aria-label="계산 중"></i>{/if}
    </button>
  {/each}
</nav>

<style>
  nav {
    position: fixed; left: 0; right: 0; bottom: 0;
    height: calc(var(--nav-h) + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
    display: grid; grid-template-columns: repeat(4, 1fr);
    z-index: 10;
  }
  button {
    position: relative;
    border: 0; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    font-size: 12px; font-weight: 500; color: var(--muted);
  }
  button.on { color: var(--accent); font-weight: 700; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .dot { position: absolute; top: 10px; left: calc(50% + 10px); width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
</style>
