<script lang="ts">
  import { isActive } from '../../engine/events';
  import { dateTime } from '../lib/format';
  import { app, baseEvent } from '../state.svelte';

  const event = $derived(baseEvent(app.now));
</script>

<main class="page">
  <h1>스케줄</h1>
  <section class="card">
    <p class="muted">챕터 타임라인·목표 PT·알림은 다음 단계(Phase 4)에서 추가됩니다.</p>
  </section>
  {#if event?.chapters}
    <section class="card">
      <h2>{event.name}</h2>
      {#each event.chapters as c (c.id)}
        {@const active = isActive(c, app.now)}
        <div class="kv" class:accent={active}>
          <span>{c.name}{active ? ' (진행 중)' : ''}</span>
          <span class="small num">{dateTime(c.startsAt)} ~ {dateTime(c.endsAt)}</span>
        </div>
      {/each}
    </section>
  {/if}
</main>
