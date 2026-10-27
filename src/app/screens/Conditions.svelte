<script lang="ts">
  import type { SearchMode } from '../../engine/context';
  import { challengeSongIds, eventCandidateCards } from '../../engine/events';
  import { DIFFICULTIES, DIFFICULTY_LABEL } from '../lib/format';
  import { concurrency, search, startSearch } from '../search.svelte';
  import { activeEvent, app, cardById, cardLabel, chartMeta, cond, getData, members, nav, setLeader, songs } from '../state.svelte';

  const event = $derived(activeEvent(app.now));
  const allSongs = $derived(songs(app.now));
  const challenge = $derived(new Set(challengeSongIds(event)));
  const memberList = $derived(members());
  const outfits = $derived(getData().master.cards.filter((c) => c.characterId === cond.leaderCharacterId && c.details.costume));
  const meta = $derived(chartMeta(cond.songId, cond.difficulty));

  // 고정 카드 후보: 이벤트 모드면 갤산기 후보 범위, 보유 카드만이면 보유한 것만
  const fixable = $derived.by(() => {
    const { cards } = getData().master;
    const pool = cond.mode === 'normal' ? cards : eventCandidateCards(cards, event);
    const owned = app.backup?.growth.collection ?? {};
    return pool.filter((c) => !cond.fixedCardIds.includes(c.id) && (!cond.ownedCardsOnly || owned[c.id]?.owned));
  });

  const modes: { id: SearchMode; label: string }[] = $derived(
    event ? [{ id: 'event-pt', label: '이벤트 PT' }, { id: 'event-score', label: '과제곡 점수' }] : [{ id: 'normal', label: '최고 점수' }],
  );

  function setMode(m: SearchMode) {
    cond.mode = m;
    // 과제곡 점수 모드로 바꿀 때 과제곡이 아니면 첫 과제곡으로
    if (m === 'event-score' && !challenge.has(cond.songId)) cond.songId = [...challenge][0] ?? cond.songId;
  }

  function addFixed(id: string) {
    if (id && cond.fixedCardIds.length < 4) cond.fixedCardIds = [...cond.fixedCardIds, id];
  }

  async function run() {
    nav.view = 'results';
    await startSearch(cond);
  }
</script>

<main class="page">
  <h1>덱 추천</h1>

  {#if search.status === 'running' || search.status === 'done'}
    <button class="notice row" onclick={() => (nav.view = 'results')}>
      <span class="grow">{search.status === 'running' ? '계산 중인 탐색이 있습니다' : '최근 결과가 있습니다'}</span>
      <b class="accent">결과 보기 ›</b>
    </button>
  {/if}

  <section class="card">
    <div class="field">
      <span class="label">목표</span>
      <div class="segment">
        {#each modes as m (m.id)}
          <button class:on={cond.mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
        {/each}
      </div>
      {#if cond.mode === 'event-pt'}
        <p class="small muted">예상 PT(예상 점수 × 이벤트 보너스) 높은 순으로 찾습니다.</p>
      {:else if cond.mode === 'event-score'}
        <p class="small muted">과제곡 보너스를 반영해 최대 점수가 높은 순으로 찾습니다 (갤산기 스코어 탭과 같은 기준).</p>
      {:else}
        <p class="small muted">진행 중인 이벤트가 없어 이벤트 보너스 없이 최대 점수 순으로 찾습니다.</p>
      {/if}
    </div>

    <label class="field">
      <span class="label">곡</span>
      <select class="input" bind:value={cond.songId}>
        {#if challenge.size > 0}
          <optgroup label="과제곡">
            {#each allSongs.filter((s) => challenge.has(s.songId)) as s (s.songId)}
              <option value={s.songId}>{s.title}</option>
            {/each}
          </optgroup>
        {/if}
        <optgroup label="전체 곡 (최신순)">
          {#each allSongs.filter((s) => !challenge.has(s.songId)) as s (s.songId)}
            <option value={s.songId}>{s.title}</option>
          {/each}
        </optgroup>
      </select>
    </label>

    <div class="field">
      <span class="label">난이도</span>
      <div class="segment">
        {#each DIFFICULTIES as d (d)}
          <button class:on={cond.difficulty === d} onclick={() => (cond.difficulty = d)} disabled={!chartMeta(cond.songId, d)}>
            {DIFFICULTY_LABEL[d]}
          </button>
        {/each}
      </div>
      {#if meta}
        <p class="small muted num">Lv.{meta.difficultyLevel} · 노트 {meta.totalNotes} · {Math.round(Number(meta.durationSeconds))}초</p>
      {/if}
    </div>
  </section>

  <section class="card">
    <div class="split">
      <label class="field">
        <span class="label">리더 멤버</span>
        <select class="input" value={cond.leaderCharacterId} onchange={(e) => setLeader(e.currentTarget.value)}>
          {#each memberList as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span class="label">리더 의상</span>
        <select class="input" bind:value={cond.leaderOutfitCardId}>
          {#if outfits.length === 0}<option value="">기본</option>{/if}
          {#each outfits as c (c.id)}
            <option value={c.id}>{(c.details.costume as { name?: string })?.name ?? cardLabel(c)}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class="check">
      <input type="checkbox" bind:checked={cond.ownedCardsOnly} disabled={!app.backup} />
      <span class="grow">보유 카드만 {#if !app.backup}<span class="small muted">(백업을 가져오면 쓸 수 있어요)</span>{/if}</span>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={cond.excludeComboConditionCards} />
      <span>콤보 조건 카드 제외</span>
    </label>

    <div class="field">
      <span class="label">고정 카드 ({cond.fixedCardIds.length}/4)</span>
      {#each cond.fixedCardIds as id (id)}
        <div class="row">
          <span class="grow small">{cardLabel(cardById(id))} <span class="muted">★{cardById(id)?.rarity}</span></span>
          <button class="btn ghost" onclick={() => (cond.fixedCardIds = cond.fixedCardIds.filter((x) => x !== id))}>빼기</button>
        </div>
      {/each}
      {#if cond.fixedCardIds.length < 4}
        <select class="input" value="" onchange={(e) => { addFixed(e.currentTarget.value); e.currentTarget.value = ''; }}>
          <option value="">카드 추가…</option>
          {#each fixable as c (c.id)}<option value={c.id}>★{c.rarity} {cardLabel(c)}</option>{/each}
        </select>
      {/if}
    </div>
  </section>

  <p class="notice">
    계산은 이 기기에서 진행됩니다. 계산 워커 {concurrency()}개 기준 수 분 걸릴 수 있으며, 계산 중에는 화면이 꺼지지 않습니다.
    앱을 닫으면 계산이 멈춥니다. 같은 조건이면 저장된 결과를 바로 보여줍니다.
  </p>

  <button class="btn primary block" onclick={run} disabled={!meta || search.status === 'running'}>덱 찾기</button>
</main>

<style>
  button.notice { border: 0; text-align: left; cursor: pointer; min-height: var(--touch); }
</style>
