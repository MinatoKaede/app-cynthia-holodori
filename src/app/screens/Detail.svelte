<script lang="ts">
  import { challengeSongBonusPercent, eventBonus } from '../../engine/events';
  import { eventPt } from '../../engine/ranking';
  import type { Card } from '../../engine/types';
  import CardFrame from '../components/CardFrame.svelte';
  import { num, pct } from '../lib/format';
  import { buildSettings, formation, search } from '../search.svelte';
  import { cardById, cardLabel, chartMeta, cond, growth, nav } from '../state.svelte';

  const r = $derived(search.rankings[nav.detailIndex]);
  const run = $derived(search.run);
  const event = $derived(run?.event ?? null);
  const ids = $derived(r ? formation(r) : []);
  const cards = $derived(ids.map((id) => cardById(id)).filter((c): c is Card => !!c));
  const meta = $derived(run ? chartMeta(run.conditions.songId, run.conditions.difficulty) : undefined);

  // 탐색에 쓴 개화 수: 보유 카드는 백업 값, 고정 카드는 고정 개화, 나머지는 갤산기 후보 기본값
  const awakeningOf = $derived.by(() => {
    if (!run) return () => 0;
    const g = growth();
    const s = buildSettings(run.conditions, g);
    return (c: Card) => {
      const owned = g.collection[c.id];
      if (owned?.owned && Number.isFinite(owned.awakening)) return owned.awakening as number;
      const fixedAt = s.fixedCardIds.indexOf(c.id);
      return fixedAt >= 0 ? s.fixedAwakenings[fixedAt] : s.candidateAwakening;
    };
  });

  const bonus = $derived(event && cards.length === ids.length ? eventBonus(event, cards, awakeningOf) : null);
  const bonusMatches = $derived(bonus !== null && bonus.totalPercent === r?.eventBonusPercent);
  const challengeApplied = $derived(event && run ? challengeSongBonusPercent(event, run.conditions.songId, ids) : 0);
  const isChallengeSong = $derived(!!event && !!run && run.conditions.songId in event.challengeSongBonusCardIds);
  const probs = $derived(r?.achievementProbabilities as
    | { maximum: number; atLeast995Percent: number; atLeast99Percent: number; atLeast95Percent: number; samples: number }
    | undefined);
  const cooldowns = $derived((r?.result.cooldownReductions ?? {}) as Record<string, number>);

  function tags(c: Card, k: number): string[] {
    const t: string[] = [];
    if (k === 0) t.push('리더');
    if (event?.featuredCardIds.includes(c.id)) t.push('대상 카드');
    if (event?.bonusCharacterIds.includes(c.characterId)) t.push('보너스 멤버');
    if (run && event?.challengeSongBonusCardIds[run.conditions.songId]?.includes(c.id)) t.push('과제곡');
    if (typeof c.type === 'string') t.push(c.type);
    return t;
  }

  function retry() {
    if (run) Object.assign(cond, structuredClone(run.conditions));
    nav.view = 'conditions';
  }
</script>

<main class="page">
  <div class="row">
    <button class="btn ghost back" onclick={() => (nav.view = 'results')}>‹ 결과</button>
    <h1 class="grow">{nav.detailIndex + 1}위 덱</h1>
  </div>

  {#if r}
    <section class="card num">
      {#if r.eventBonusPercent !== undefined && run?.mode === 'event-pt'}
        <div class="kv"><span class="muted">예상 PT <span class="small">(갤산기 기준)</span></span><b class="big">{num(eventPt(r.result.expectedScore, r.eventBonusPercent))}</b></div>
      {/if}
      <div class="kv"><span class="muted">예상 점수</span><b>{num(r.result.expectedScore)}</b></div>
      <div class="kv"><span class="muted">최대 점수</span><b>{num(r.result.theoreticalMaxScore)}</b></div>
      {#if meta && meta.scoreCalibrationSource !== 'measured'}
        <p class="notice warn">추정 점수: 이 곡은 실측 보정 없이 공식({meta.scoreCalibrationSource})으로 계산했습니다.</p>
      {/if}
    </section>

    <section class="card">
      <h2>카드</h2>
      {#each cards as c, k (c.id)}
        <div class="row card-row">
          <div class="thumb"><CardFrame card={c} featured={event?.featuredCardIds.includes(c.id)} leader={k === 0} /></div>
          <div class="grow">
            <div><b>{cardLabel(c)}</b> <span class="muted small">★{c.rarity}</span></div>
            <div class="small num">개화 {awakeningOf(c)} · 쿨감 {cooldowns[c.id] ?? 0}</div>
            <div class="row wrap">{#each tags(c, k) as t (t)}<span class="chip" class:on={t === '대상 카드' || t === '과제곡'}>{t}</span>{/each}</div>
          </div>
        </div>
      {/each}
    </section>

    {#if event}
      <section class="card num">
        <h2>이벤트 보너스</h2>
        {#if bonus && bonusMatches}
          <div class="kv"><span>편성 (보너스 멤버)</span><span>+{bonus.formationPercent}%</span></div>
          <div class="kv"><span>대상 카드</span><span>+{bonus.featuredCardPercent}%</span></div>
          <div class="kv"><span>개화</span><span>+{bonus.awakeningPercent}%</span></div>
          <div class="divider"></div>
        {/if}
        <div class="kv"><b>합계</b><b class="accent">+{r.eventBonusPercent ?? 0}%</b></div>
        {#if bonus && !bonusMatches}<p class="small muted">백업이 바뀌어 내역을 다시 계산할 수 없어 합계만 표시합니다.</p>{/if}
        {#if isChallengeSong}
          <div class="kv"><span>과제곡 점수 보너스</span><span>{challengeApplied ? `적용 +${challengeApplied}%` : '미적용 (대상 카드 없음)'}</span></div>
        {/if}
      </section>
    {/if}

    <section class="card">
      <h2>스페셜 순서</h2>
      <ol class="order">
        {#each r.result.order as id (id)}<li>{cardLabel(cardById(id))}</li>{/each}
      </ol>
    </section>

    {#if probs}
      <section class="card num">
        <h2>최대 점수 달성 확률</h2>
        <div class="kv"><span>최대 점수</span><span>{pct(probs.maximum, 2)}</span></div>
        <div class="kv"><span>99.5% 이상</span><span>{pct(probs.atLeast995Percent)}</span></div>
        <div class="kv"><span>99% 이상</span><span>{pct(probs.atLeast99Percent)}</span></div>
        <div class="kv"><span>95% 이상</span><span>{pct(probs.atLeast95Percent)}</span></div>
        <p class="small muted">{num(probs.samples)}회 시뮬레이션</p>
      </section>
    {/if}

    <button class="btn soft block" onclick={retry}>조건 바꿔 다시 찾기</button>
  {:else}
    <p class="notice">결과가 없습니다.</p>
  {/if}
</main>

<style>
  .back { margin-left: -8px; }
  .big { font-size: 22px; }
  .card-row { align-items: flex-start; gap: 12px; }
  .thumb { width: 56px; flex: none; }
  .wrap { flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .order { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 4px; }
</style>
