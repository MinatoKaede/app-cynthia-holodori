<script lang="ts">
  // 스케줄 (Phase 4): 이벤트 타임라인, 목표 PT·기록·그래프, 알림 설정
  import type { EventSchedule } from '../../engine/types';
  import EventTimeline from '../components/EventTimeline.svelte';
  import PtChart from '../components/PtChart.svelte';
  import { dateTime, num, remaining } from '../lib/format';
  import { notificationPermission, type NotifyPrefs, type PermissionState } from '../lib/notify';
  import { pace } from '../lib/pace';
  import { isNative } from '../lib/platform';
  import { addEntry, removeEntry, saveNotify, schedule, updateLog } from '../schedule.svelte';
  import { search, startSearch } from '../search.svelte';
  import { app, baseEvent, cond, nextEvent, showDefaultResults } from '../state.svelte';

  const event = $derived(baseEvent(app.now));
  const next = $derived(event ? null : nextEvent(app.now));
  const log = $derived(schedule.log && event && schedule.log.eventId === event.id ? schedule.log : null);
  const p = $derived(log && event ? pace(log, event, app.now) : null);
  const entriesDesc = $derived(log ? [...log.entries].sort((a, b) => b.at - a.at) : []);

  // 입력칸 (숫자만, 쉼표 허용)
  const parse = (s: string) => {
    const v = Number(s.replace(/[,\s]/g, ''));
    return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  };
  let goalText = $state('');
  let perPlayText = $state('');
  let ptText = $state('');
  let inputError = $state('');
  $effect(() => {
    goalText = log?.goal != null ? num(log.goal) : '';
    perPlayText = log?.perPlay != null ? num(log.perPlay) : '';
  });

  function saveGoal() {
    const v = goalText.trim() === '' ? null : parse(goalText);
    if (goalText.trim() !== '' && v === null) return (inputError = '목표 PT는 0 이상의 숫자로 입력해 주세요.');
    inputError = '';
    void updateLog({ goal: v });
  }
  function savePerPlay() {
    const v = perPlayText.trim() === '' ? null : parse(perPlayText);
    if (perPlayText.trim() !== '' && (v === null || v === 0)) return (inputError = '1회당 PT는 1 이상의 숫자로 입력해 주세요.');
    inputError = '';
    void updateLog({ perPlay: v });
  }
  function record() {
    const v = parse(ptText);
    if (v === null) return (inputError = '현재 PT를 숫자로 입력해 주세요.');
    inputError = '';
    ptText = '';
    void addEntry(v);
  }

  // 다음 챕터 미리 찾기: 그 챕터가 시작된 직후 시각을 기준으로 기본 조건 탐색
  async function preSearch(c: EventSchedule) {
    const at = Date.parse(c.calculatorStartsAt ?? c.startsAt) + 60_000;
    showDefaultResults('event-pt', at);
    await startSearch(cond, { at });
  }

  // 알림
  let permission: PermissionState = $state('unsupported');
  $effect(() => {
    void notificationPermission().then((s) => (permission = s));
  });
  async function setNotify(change: Partial<NotifyPrefs>) {
    const nextPrefs = { ...schedule.notify, ...change };
    if (Object.values(change).includes(true) && permission === 'prompt') permission = await notificationPermission(true);
    await saveNotify(nextPrefs);
  }
  const toggles: { key: 'chapter' | 'end3h' | 'end1h' | 'daily'; label: string }[] = [
    { key: 'chapter', label: '챕터 전환' },
    { key: 'end3h', label: '이벤트 종료 3시간 전' },
    { key: 'end1h', label: '이벤트 종료 1시간 전' },
    { key: 'daily', label: '매일 진행 체크' },
  ];
</script>

<main class="page">
  <h1>스케줄</h1>

  {#if !event}
    <section class="card">
      <h2>진행 중인 이벤트 없음</h2>
      {#if next}
        <p class="small">다음 이벤트: <b>{next.name}</b> <span class="muted num">({dateTime(next.calculatorStartsAt ?? next.startsAt)} 시작)</span></p>
      {:else}
        <p class="small muted">갤산기에 다음 이벤트가 올라오면 여기에 표시됩니다.</p>
      {/if}
    </section>
  {:else}
    <section class="card">
      <h2>{event.name}</h2>
      <EventTimeline {event} now={app.now} searching={search.status === 'running'} onPreSearch={preSearch} />
      {#if event.chapters?.some((c) => Date.parse(c.calculatorStartsAt ?? c.startsAt) > app.now)}
        <p class="small muted">미리 찾기는 그 챕터의 보너스 멤버·과제곡과 기본 조건(보유 카드만, 기본 리더)으로 계산해 저장합니다. 챕터가 시작된 뒤 같은 조건으로 찾으면 바로 나옵니다.</p>
      {/if}
    </section>

    {#if log && p}
      <section class="card">
        <h2>목표 PT</h2>
        <div class="split">
          <label class="field">
            <span class="label">목표 PT</span>
            <input class="input num" inputmode="numeric" placeholder="예: 3,000,000" bind:value={goalText} onchange={saveGoal} />
          </label>
          <label class="field">
            <span class="label">1회당 PT</span>
            <input class="input num" inputmode="numeric" placeholder="한 판 실제 PT" bind:value={perPlayText} onchange={savePerPlay} />
          </label>
        </div>
        <p class="small muted">1회당 PT는 한 판에 실제로 얻은 PT를 넣어 주세요. 라이브 부스트별 자동 계산은 실제 배율을 확인한 뒤 추가됩니다.</p>

        <div class="row">
          <input class="input num grow" inputmode="numeric" placeholder="지금 PT 입력" bind:value={ptText} onkeydown={(e) => e.key === 'Enter' && record()} />
          <button class="btn primary" onclick={record}>기록</button>
        </div>
        {#if inputError}<p class="notice error">{inputError}</p>{/if}

        <div class="stats small num">
          <div class="kv"><span class="muted">현재 PT</span><b>{num(p.current)}{entriesDesc[0] ? ` (${dateTime(entriesDesc[0].at)})` : ''}</b></div>
          {#if p.remainingPt !== null}
            <div class="kv"><span class="muted">남은 PT</span><b class:accent={p.remainingPt > 0}>{p.remainingPt > 0 ? num(p.remainingPt) : '목표 달성'}</b></div>
            {#if p.remainingPt > 0 && p.dailyNeeded !== null}
              <div class="kv"><span class="muted">{p.remainingMs < 86_400_000 ? '남은 시간 동안 필요' : '하루 평균 필요'}</span><b>{num(p.dailyNeeded)}</b></div>
            {/if}
          {/if}
          <div class="kv"><span class="muted">남은 시간</span><span>{remaining(event.endsAt, app.now)}</span></div>
          {#if p.ratePerHour !== null}
            <div class="kv"><span class="muted">평균 속도 (시작부터)</span><span>시간당 {num(p.ratePerHour)}</span></div>
            <div class="kv">
              <span class="muted">이 속도면 종료 시</span>
              <span>{num(p.projectedFinal ?? 0)}{#if log.goal !== null}<span class:accent={(p.projectedFinal ?? 0) < log.goal}> ({(p.projectedFinal ?? 0) >= log.goal ? '목표 달성 예상' : `${num(log.goal - (p.projectedFinal ?? 0))} 부족`})</span>{/if}</span>
            </div>
          {/if}
          {#if p.playsNeeded !== null && p.remainingPt}
            <div class="kv"><span class="muted">필요 플레이 (참고)</span><span>약 {num(p.playsNeeded)}판</span></div>
          {/if}
        </div>

        <PtChart {event} {log} now={app.now} />

        {#if entriesDesc.length > 0}
          <details>
            <summary class="small">기록 {entriesDesc.length}개 보기</summary>
            <table class="small num">
              <thead><tr><th>시각</th><th>PT</th><th></th></tr></thead>
              <tbody>
                {#each entriesDesc as e (e.at)}
                  <tr>
                    <td>{dateTime(e.at)}</td>
                    <td>{num(e.pt)}</td>
                    <td><button class="btn ghost" onclick={() => removeEntry(e.at)} aria-label="이 기록 지우기">지우기</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        {/if}
        <p class="small muted">기록은 이 기기에만 저장되고, 다음 이벤트가 시작되면 지워집니다.</p>
      </section>
    {/if}
  {/if}

  <section class="card">
    <h2>알림</h2>
    {#each toggles as t (t.key)}
      <label class="check">
        <input type="checkbox" checked={schedule.notify[t.key]} onchange={(e) => setNotify({ [t.key]: e.currentTarget.checked })} />
        <span class="grow">{t.label}</span>
        {#if t.key === 'daily'}
          <input class="input time num" type="time" value={schedule.notify.dailyTime} disabled={!schedule.notify.daily}
            onchange={(e) => setNotify({ dailyTime: e.currentTarget.value || '21:00' })} />
        {/if}
      </label>
    {/each}
    {#if !isNative}
      <p class="small muted">알림은 안드로이드 앱에서만 울립니다.</p>
    {:else if permission === 'denied'}
      <p class="notice warn">알림 권한이 꺼져 있습니다. 안드로이드 설정 → 앱 → 홀로도리 덱 추천 → 알림에서 켜 주세요.</p>
    {/if}
    {#if schedule.notifyError}<p class="notice error">{schedule.notifyError}</p>{/if}
    <p class="small muted">알림은 기기에서 예약되며, 안드로이드 절전 정책에 따라 몇 분 늦게 올 수 있습니다.</p>
  </section>
</main>

<style>
  .stats { display: flex; flex-direction: column; gap: 4px; }
  .time { width: 148px; min-height: 36px; padding: 0 8px; }
  details summary { cursor: pointer; color: var(--accent-text); min-height: 32px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; color: var(--muted); font-weight: 500; }
  td, th { padding: 4px 0; border-bottom: 1px solid var(--border); }
  td:last-child { text-align: right; }
</style>
