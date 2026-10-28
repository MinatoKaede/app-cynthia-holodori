<script lang="ts">
  // 이벤트 기간 막대 + 챕터 구간. 아직 시작 안 한 챕터는 "미리 찾기"로 그 챕터 기준 덱을 계산해 둘 수 있다
  import { isActive } from '../../engine/events';
  import type { EventSchedule, GameEvent } from '../../engine/types';
  import { dateTime, remaining } from '../lib/format';
  import { members, songs } from '../state.svelte';
  import MemberIcon from './MemberIcon.svelte';

  let {
    event,
    now,
    searching = false,
    onPreSearch,
  }: { event: GameEvent; now: number; searching?: boolean; onPreSearch?: (chapter: EventSchedule) => void } = $props();

  const startOf = (x: EventSchedule) => Date.parse(x.calculatorStartsAt ?? x.startsAt);
  const start = $derived(startOf(event));
  const end = $derived(Date.parse(event.endsAt));
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%`;
  const memberName = $derived.by(() => {
    const m = new Map(members().map((x) => [x.id, x.name]));
    return (id: string) => m.get(id) ?? id;
  });
  const songTitle = $derived.by(() => {
    const m = new Map(songs(Number.MAX_SAFE_INTEGER).map((s) => [s.songId, s.title]));
    return (id: string) => m.get(id) ?? id;
  });
  const chapters = $derived(event.chapters ?? []);
</script>

<div class="bar" role="img" aria-label="이벤트 기간 중 현재 위치">
  {#each chapters as c, i (c.id)}
    {#if i > 0}<span class="boundary" style:left={pos(startOf(c))}></span>{/if}
  {/each}
  <span class="done" style:width={pos(now)}></span>
  {#if now >= start && now <= end}<span class="now" style:left={pos(now)}></span>{/if}
</div>
<div class="row small muted num">
  <span class="grow">{dateTime(event.calculatorStartsAt ?? event.startsAt)}</span>
  <b class="accent">{remaining(event.endsAt, now)}</b>
  <span class="grow end">{dateTime(event.endsAt)}</span>
</div>

{#if chapters.length > 0}
  <ol class="chapters">
    {#each chapters as c (c.id)}
      {@const state = isActive(c, now) ? 'active' : startOf(c) > now ? 'upcoming' : 'past'}
      <li class={state}>
        <div class="row">
          <b class="grow">{c.name}</b>
          {#if state === 'active'}<span class="chip on">진행 중</span>{:else if state === 'past'}<span class="small muted">종료</span>{/if}
        </div>
        <div class="small muted num">{dateTime(c.calculatorStartsAt ?? c.startsAt)} 시작</div>
        <div class="row wrap small">
          {#each c.bonusCharacterIds as id (id)}
            <span class="member"><MemberIcon {id} name={memberName(id)} size={20} /> {memberName(id)}</span>
          {/each}
        </div>
        {#if Object.keys(c.challengeSongBonusCardIds).length > 0}
          <div class="small">과제곡 · {Object.keys(c.challengeSongBonusCardIds).map(songTitle).join(', ')}</div>
        {/if}
        {#if state === 'upcoming' && onPreSearch}
          <button class="btn soft" disabled={searching} onclick={() => onPreSearch(c)}>이 챕터 덱 미리 찾기</button>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .bar { position: relative; height: 10px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
  .done { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); }
  .now { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: var(--accent); border-radius: 2px; }
  .boundary { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--surface); z-index: 1; }
  .end { text-align: right; }
  .chapters { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .chapters li { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .chapters li.active { border-color: var(--accent); }
  .chapters li.past { opacity: 0.55; }
  .wrap { flex-wrap: wrap; gap: 4px 10px; }
  .member { display: inline-flex; align-items: center; gap: 4px; }
  .chapters .btn { align-self: flex-start; margin-top: 4px; }
</style>
