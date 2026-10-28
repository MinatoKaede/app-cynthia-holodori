<script lang="ts">
  import { onMount } from 'svelte';
  import { eventPt } from '../../engine/ranking';
  import type { Ranking } from '../../engine/types';
  import CardFrame from '../components/CardFrame.svelte';
  import { DIFFICULTY_LABEL, dateTime, duration, num } from '../lib/format';
  import { PHASE_LABEL, cancelSearch, formation, remainingMs, search, startSearch } from '../search.svelte';
  import { cardById, nav } from '../state.svelte';

  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const run = $derived(search.run);
  const ptMode = $derived(run?.mode === 'event-pt');
  const featured = $derived(new Set(run?.event?.featuredCardIds ?? []));

  type SortKey = 'default' | 'expected';
  let sort: SortKey = $state('default');
  const sorted = $derived.by(() => {
    const list = search.rankings.map((r, i) => ({ r, i }));
    if (sort === 'expected') list.sort((a, b) => b.r.result.expectedScore - a.r.result.expectedScore || a.i - b.i);
    return list;
  });

  const pt = (r: Ranking) => eventPt(r.result.expectedScore, r.eventBonusPercent ?? 0);
  const percent = $derived(Math.floor((search.completed / Math.max(1, search.total)) * 100));
  const eta = $derived(search.status === 'running' ? remainingMs(now) : null);
  const modeLabel = $derived(run?.mode === 'event-pt' ? '이벤트 PT' : run?.mode === 'event-score' ? '과제곡 점수' : '최고 점수');

  function open(i: number, rank: number) {
    nav.detailIndex = i;
    nav.detailRank = rank;
    nav.view = 'detail';
  }
</script>

<main class="page">
  <div class="row">
    <button class="btn ghost back" onclick={() => (nav.view = 'conditions')}>‹ 조건</button>
    <h1 class="grow">추천 결과</h1>
  </div>

  {#if run}
    <section class="card summary small">
      <div><b>{modeLabel}</b> · {run.songTitle} {DIFFICULTY_LABEL[run.conditions.difficulty]}</div>
      <div class="muted">
        {run.event?.name ?? '이벤트 없음'}{run.conditions.ownedCardsOnly ? ' · 보유 카드만' : ''}{run.conditions.excludeComboConditionCards ? ' · 콤보 조건 제외' : ''}{run.conditions.fixedCardIds.length ? ` · 고정 ${run.conditions.fixedCardIds.length}장` : ''}
      </div>
      {#if run.at && run.at > Date.now()}
        <div class="accent">미리 찾기 — {dateTime(run.at)} 챕터 시작 기준</div>
      {/if}
    </section>
  {/if}

  {#if search.status === 'running'}
    <section class="card">
      <div class="row">
        <b class="grow">{PHASE_LABEL[search.phase]}</b>
        <span class="num">{percent}%</span>
      </div>
      <progress max={Math.max(1, search.total)} value={search.completed}></progress>
      <div class="small muted num">
        경과 {duration(now - search.startedAt)}{eta !== null ? ` · 남은 시간 약 ${duration(eta)}` : ''} · 워커 {search.workers}개
      </div>
      <button class="btn block" onclick={cancelSearch}>취소</button>
    </section>
  {:else if search.status === 'cancelled'}
    <p class="notice">탐색을 취소했습니다.</p>
    <button class="btn primary block" onclick={() => run && startSearch(run.conditions, { at: run.at })}>다시 찾기</button>
  {:else if search.status === 'error'}
    <p class="notice error">{search.error}</p>
    <button class="btn primary block" onclick={() => run && startSearch(run.conditions, { at: run.at })}>다시 찾기</button>
  {:else if search.status === 'done'}
    {#if search.cachedAt}
      <div class="notice row">
        <span class="grow">{dateTime(search.cachedAt)}에 계산한 결과입니다.</span>
        <button class="btn ghost" onclick={() => run && startSearch(run.conditions, { useCache: false, at: run.at })}>다시 계산</button>
      </div>
    {/if}

    <div class="segment">
      <button class:on={sort === 'default'} onclick={() => (sort = 'default')}>{ptMode ? '예상 PT순' : '최대 점수순'}</button>
      <button class:on={sort === 'expected'} onclick={() => (sort = 'expected')}>예상 점수순</button>
    </div>

    {#each sorted as { r, i }, rank (i)}
      <button class="card deck" onclick={() => open(i, rank + 1)}>
        <div class="row">
          <span class="rank num">{rank + 1}</span>
          <div class="grow stats num">
            {#if ptMode}
              <div><span class="muted small">예상 PT</span> <b class="big">{num(pt(r))}</b></div>
              <div class="small">예상 {num(r.result.expectedScore)} · 최대 {num(r.result.theoreticalMaxScore)} · 보너스 <b class="accent">+{r.eventBonusPercent}%</b></div>
            {:else}
              <div><span class="muted small">최대 점수</span> <b class="big">{num(r.result.theoreticalMaxScore)}</b></div>
              <div class="small">예상 {num(r.result.expectedScore)}{#if r.finalScoreBonusPercent} · 과제곡 보너스 <b class="accent">+{r.finalScoreBonusPercent}%</b>{/if}</div>
            {/if}
          </div>
        </div>
        <div class="cards">
          {#each formation(r) as id, k (id)}
            <CardFrame card={cardById(id)} featured={featured.has(id)} leader={k === 0} />
          {/each}
        </div>
      </button>
    {:else}
      <p class="notice">조건에 맞는 덱이 없습니다.</p>
    {/each}

    <p class="small muted num">
      {search.cachedAt ? '당시 ' : ''}계산 {duration(search.elapsedMs)} · 워커 {search.workers}개 · 후보 {num(search.screenedCount)}개 중 {num(search.exactCount)}개 정밀 평가
    </p>
    <p class="small muted">예상 PT는 갤산기 기준 지표입니다. 점수는 공식 기반 추정치이며 실제 결과와 다를 수 있습니다.</p>
  {:else}
    <p class="notice">아직 찾은 결과가 없습니다.</p>
  {/if}
</main>

<style>
  .back { margin-left: -8px; }
  progress { width: 100%; height: 8px; accent-color: var(--accent); }
  .deck { text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .rank { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-weight: 700; display: grid; place-items: center; flex: none; }
  .big { font-size: 20px; }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
</style>
