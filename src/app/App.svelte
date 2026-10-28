<script lang="ts">
  import { onMount } from 'svelte';
  import BottomNav from './components/BottomNav.svelte';
  import { onNotificationTap } from './lib/notify';
  import { onBackButton } from './lib/platform';
  import { loadSchedule } from './schedule.svelte';
  import { startSearch } from './search.svelte';
  import DataScreen from './screens/DataScreen.svelte';
  import Home from './screens/Home.svelte';
  import Recommend from './screens/Recommend.svelte';
  import Schedule from './screens/Schedule.svelte';
  import { app, cond, initApp, nav, showDefaultResults } from './state.svelte';

  onMount(() => {
    app.now = Date.now();
    const ready = initApp().then(async () => {
      if (app.status === 'ready') await loadSchedule();
    });
    // 알림을 누르면: 챕터 전환은 기본 조건으로 덱 찾기(미리 찾아 두었으면 바로 나옴), 나머지는 스케줄 탭
    onNotificationTap(async (extra) => {
      await ready;
      if (app.status !== 'ready') return;
      if (extra.action === 'chapter') {
        showDefaultResults('event-pt');
        await startSearch(cond);
      } else nav.tab = 'schedule';
    });
    const timer = setInterval(() => (app.now = Date.now()), 30_000);
    // 뒤로 가기: 상세 → 결과 → 조건 → 홈 → 앱 내리기
    onBackButton(() => {
      if (nav.tab === 'recommend' && nav.view === 'detail') nav.view = 'results';
      else if (nav.tab === 'recommend' && nav.view === 'results') nav.view = 'conditions';
      else if (nav.tab !== 'home') nav.tab = 'home';
      else return false;
      return true;
    });
    return () => clearInterval(timer);
  });

  $effect(() => {
    // 탭·화면이 바뀌면 맨 위로
    void nav.tab;
    void nav.view;
    window.scrollTo(0, 0);
  });
</script>

{#if app.status === 'loading'}
  <main class="center">
    <h1>홀로도리 덱 추천</h1>
    <p class="muted">{app.progress?.message ?? '준비 중'}…</p>
    {#if app.progress && app.progress.total > 1}
      <progress max={app.progress.total} value={app.progress.completed}></progress>
    {/if}
  </main>
{:else if app.status === 'error'}
  <main class="center">
    <h1>데이터를 준비하지 못했습니다</h1>
    <p class="notice error">{app.error}</p>
    <p class="muted small">처음 실행할 때는 인터넷 연결이 필요합니다. 이후에는 저장된 데이터로 동작합니다.</p>
    <button class="btn primary" onclick={() => initApp()}>다시 시도</button>
  </main>
{:else}
  {#if nav.tab === 'home'}<Home />
  {:else if nav.tab === 'recommend'}<Recommend />
  {:else if nav.tab === 'schedule'}<Schedule />
  {:else}<DataScreen />{/if}
  <BottomNav />
{/if}

<style>
  .center {
    min-height: 100dvh; padding: 24px; max-width: 520px; margin: 0 auto;
    display: flex; flex-direction: column; justify-content: center; gap: 12px; text-align: center;
  }
  progress { width: 100%; accent-color: var(--accent); }
</style>
