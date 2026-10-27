<script lang="ts">
  import { challengeSongIds } from '../../engine/events';
  import CachedImage from '../components/CachedImage.svelte';
  import CardFrame from '../components/CardFrame.svelte';
  import MemberIcon from '../components/MemberIcon.svelte';
  import { imageUrl } from '../lib/images';
  import { backupSummary } from '../lib/backup';
  import { date, dateTime, eventKind, remaining } from '../lib/format';
  import { activeEvent, app, baseEvent, cardById, getData, members, nav, nextEvent, openRecommend, songs } from '../state.svelte';

  const event = $derived(activeEvent(app.now));
  const base = $derived(baseEvent(app.now));
  const next = $derived(event ? null : nextEvent(app.now));
  const chapter = $derived(base?.chapters?.find((c) => event && event.id === c.id) ?? null);
  const memberName = $derived.by(() => {
    const m = new Map(members().map((x) => [x.id, x.name]));
    return (id: string) => m.get(id) ?? id;
  });
  const challengeTitles = $derived.by(() => {
    const all = songs(app.now);
    return challengeSongIds(event).map((id) => all.find((s) => s.songId === id)?.title ?? id);
  });
  const summary = $derived(app.backup ? backupSummary(app.backup) : null);
  const manifest = $derived(getData().manifest);
</script>

<main class="page">
  <h1>홀로도리 덱 추천</h1>

  {#if event && base}
    <section class="card">
      <!-- 배너 오른쪽 위 저작권 표기·왼쪽 아래 로고는 가리지 않는다. 남은 시간은 왼쪽 위 -->
      <div class="banner">
        <CachedImage url={imageUrl.banner(base.id)} alt={base.name} fit="contain">
          {#snippet fallback()}<span class="banner-name">{base.name}</span>{/snippet}
        </CachedImage>
        <span class="badge num">{remaining(base.endsAt, app.now)}</span>
      </div>
      <div class="row wrap">
        {#if eventKind(base.id)}<span class="chip">{eventKind(base.id)}</span>{/if}
        {#if chapter}<span class="chip on">{chapter.name}</span>{/if}
      </div>
      <h2>{base.name}</h2>
      <div class="small muted num">
        {#if chapter && chapter.endsAt !== base.endsAt}챕터 종료 {dateTime(chapter.endsAt)} · {/if}이벤트 종료 {dateTime(base.endsAt)}
      </div>
      <ul class="bonus small">
        <li>
          {chapter ? '챕터 멤버' : '보너스 멤버'} <b class="accent">+{event.formationBonusPercent}%</b>
          <span class="members">
            {#each event.bonusCharacterIds as id (id)}
              <span class="member"><MemberIcon {id} name={memberName(id)} size={22} /> {memberName(id)}</span>
            {/each}
          </span>
        </li>
        <li>대상 카드 장당 <b class="accent">+{event.featuredCardBonusPercent}%</b></li>
        {#if challengeTitles.length > 0}
          <li>과제곡 점수 <b class="accent">+{event.challengeSongScoreBonusPercent}%</b> <span class="muted">· {challengeTitles.join(', ')}</span></li>
        {/if}
      </ul>
      {#if event.bonusAssumptionNotice}<p class="notice warn">{event.bonusAssumptionNotice}</p>{/if}

      {#if event.featuredCardIds.length > 0}
        <h3>이벤트 대상 카드</h3>
        <div class="grid">
          {#each event.featuredCardIds as id (id)}
            <CardFrame card={cardById(id)} featured caption />
          {/each}
        </div>
      {/if}

      <div class="split">
        <button class="btn primary" onclick={() => openRecommend('event-pt')}>이벤트 PT 덱</button>
        <button class="btn soft" onclick={() => openRecommend('event-score')}>과제곡 점수 덱</button>
      </div>
    </section>
  {:else}
    <section class="card">
      <h2>진행 중인 이벤트 없음</h2>
      {#if next}
        <div class="banner">
          <CachedImage url={imageUrl.banner(next.id)} alt={next.name} fit="contain">
            {#snippet fallback()}<span class="banner-name">{next.name}</span>{/snippet}
          </CachedImage>
        </div>
        <p class="small">다음 이벤트: <b>{next.name}</b></p>
        <p class="small muted num">{dateTime(next.calculatorStartsAt ?? next.startsAt)} 시작</p>
      {/if}
      <button class="btn soft" onclick={() => openRecommend('normal')}>점수 덱 찾기</button>
    </section>
  {/if}

  <section class="card">
    <div class="row">
      <h3 class="grow">내 데이터</h3>
      <button class="btn ghost" onclick={() => (nav.tab = 'data')}>갱신</button>
    </div>
    {#if summary && app.backup}
      <p class="small num">
        보유 카드 {summary.ownedCards}장 · 보드 {summary.boardMembers}명 · 백업 {date(app.backup.updatedAt ?? app.backup.importedAt)}
      </p>
    {:else}
      <p class="small">갤산기 백업을 아직 가져오지 않았습니다. <span class="muted">(모든 카드를 기준으로 계산합니다)</span></p>
    {/if}
    <p class="small muted num">갤산기 데이터 {dateTime(manifest.extractedAt)} 기준</p>
    {#if app.updateError}<p class="notice warn">{app.updateError} — 저장된 데이터로 계산합니다.</p>{/if}
  </section>
</main>

<style>
  .banner {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--accent-soft), var(--surface-2));
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; text-align: center;
  }
  .banner-name { padding: 24px; font-size: 18px; font-weight: 700; color: var(--accent-text); word-break: keep-all; }
  .badge {
    position: absolute; top: 10px; left: 10px;
    font-size: 12px; font-weight: 600;
    background: rgb(30 26 36 / 0.78); color: #fff;
    border-radius: 999px; padding: 3px 10px;
  }
  .wrap { flex-wrap: wrap; }
  .bonus { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .members { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; }
  .member { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); }
</style>
