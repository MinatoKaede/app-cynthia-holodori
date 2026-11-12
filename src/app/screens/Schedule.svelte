<script lang="ts">
  // 스케줄 (Phase 4): 이벤트 타임라인, 목표 PT·기록·그래프, 알림 설정
  import type { EventSchedule } from '../../engine/types';
  import EventTimeline from '../components/EventTimeline.svelte';
  import PtChart from '../components/PtChart.svelte';
  import { BOOST_MULTIPLIER, basePt, flameRecoveryMinutes, playPt } from '../lib/boost';
  import { dateTime, isScoreChallenge, num, remaining } from '../lib/format';
  import { notificationPermission, type NotifyPrefs, type PermissionState } from '../lib/notify';
  import { pace, type PlayPrefs } from '../lib/pace';
  import { isNative } from '../lib/platform';
  import { addEntry, removeEntry, saveNotify, savePlay, schedule, updateLog } from '../schedule.svelte';
  import { search, startSearch } from '../search.svelte';
  import { app, baseEvent, cond, nextEvent, openRecommend, showDefaultResults } from '../state.svelte';

  const event = $derived(baseEvent(app.now));
  const scoreChallenge = $derived(isScoreChallenge(event));
  const next = $derived(event ? null : nextEvent(app.now));
  const log = $derived(schedule.log && event && schedule.log.eventId === event.id ? schedule.log : null);
  const p = $derived(log && event ? pace(log, event, app.now, schedule.play) : null);
  const entriesDesc = $derived(log ? [...log.entries].sort((a, b) => b.at - a.at) : []);
  const boosts = BOOST_MULTIPLIER.map((m, n) => ({ n, m }));
  // 불별 한 판 PT (기준 플레이가 있을 때)
  const perBoost = $derived(
    log?.sample ? boosts.map(({ n, m }) => ({ n, m, pt: playPt(basePt(log.sample!.pt, log.sample!.boost, schedule.play.passport), n, schedule.play.passport) })) : [],
  );

  // 입력칸 (숫자만, 쉼표 허용)
  const parse = (s: string) => {
    const v = Number(s.replace(/[,\s]/g, ''));
    return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  };
  let goalText = $state('');
  let samplePtText = $state('');
  let flamesText = $state('');
  let ptText = $state('');
  let inputError = $state('');
  $effect(() => {
    goalText = log?.goal != null ? num(log.goal) : '';
    samplePtText = log?.sample ? num(log.sample.pt) : '';
    flamesText = log?.flames ? String(log.flames.count) : '';
  });

  function saveGoal() {
    const v = goalText.trim() === '' ? null : parse(goalText);
    if (goalText.trim() !== '' && v === null) return (inputError = '목표 PT는 0 이상의 숫자로 입력해 주세요.');
    inputError = '';
    void updateLog({ goal: v });
  }
  function saveSample(boost = log?.sample?.boost ?? schedule.play.boost) {
    const v = samplePtText.trim() === '' ? null : parse(samplePtText);
    if (samplePtText.trim() !== '' && !v) return (inputError = '한 판에 받은 PT를 1 이상의 숫자로 입력해 주세요.');
    inputError = '';
    void updateLog({ sample: v ? { pt: v, boost } : null });
  }
  function saveFlames() {
    const v = flamesText.trim() === '' ? null : parse(flamesText);
    if (flamesText.trim() !== '' && v === null) return (inputError = '가진 불은 0 이상의 숫자로 입력해 주세요.');
    inputError = '';
    void updateLog({ flames: v === null ? null : { count: v, at: Date.now() } });
  }
  const setPlay = (change: Partial<PlayPrefs>) => savePlay({ ...schedule.play, ...change });
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

    {#if scoreChallenge}
      <section class="card">
        <h2>스코어 챌린지</h2>
        <p class="small">이 이벤트는 PT 대신 과제곡 하이스코어의 합계로 순위가 정해져, 목표 PT 기록은 쓰지 않습니다. 과제곡마다 최고 점수 덱을 찾아 보세요.</p>
        <button class="btn primary" onclick={() => openRecommend('event-score')}>과제곡 점수 덱</button>
      </section>
    {:else if log && p}
      <section class="card">
        <h2>목표 PT</h2>
        <label class="field">
          <span class="label">목표 PT</span>
          <input class="input num" inputmode="numeric" placeholder="예: 3,000,000" bind:value={goalText} onchange={saveGoal} />
        </label>

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

      <section class="card">
        <h2>한 판 PT · 라이브 부스트</h2>
        <label class="check">
          <input type="checkbox" checked={schedule.play.passport} onchange={(e) => setPlay({ passport: e.currentTarget.checked })} />
          <span class="grow">패스포트 <span class="small muted">(PT ×2, 불 회복 {flameRecoveryMinutes(schedule.play.passport)}분에 1개)</span></span>
        </label>

        <div class="field">
          <span class="label">기준 플레이 — 실제로 한 판에 받은 PT와 그때 쓴 불</span>
          <div class="row">
            <input class="input num grow" inputmode="numeric" placeholder="받은 PT" bind:value={samplePtText} onchange={() => saveSample()} />
            <select class="input boost" value={String(log.sample?.boost ?? schedule.play.boost)} onchange={(e) => saveSample(Number(e.currentTarget.value))}>
              {#each boosts as b (b.n)}<option value={String(b.n)}>{b.n}불</option>{/each}
            </select>
          </div>
          <p class="small muted">주로 하는 곡·덱으로 한 판 한 결과를 넣으면, 다른 불 수의 한 판 PT를 배율(1불 ×8 … 10불 ×56, 0불 ×1)로 환산합니다. 패스포트는 지금 설정과 같았다고 봅니다.</p>
        </div>

        <div class="split">
          <label class="field">
            <span class="label">한 판에 쓸 불</span>
            <select class="input" value={String(schedule.play.boost)} onchange={(e) => setPlay({ boost: Number(e.currentTarget.value) })}>
              {#each boosts as b (b.n)}<option value={String(b.n)}>{b.n}불 (×{b.m})</option>{/each}
            </select>
          </label>
          <label class="field">
            <span class="label">지금 가진 불 (선택)</span>
            <input class="input num" inputmode="numeric" placeholder="예: 12" bind:value={flamesText} onchange={saveFlames} />
          </label>
        </div>
        {#if inputError}<p class="notice error">{inputError}</p>{/if}

        <div class="stats small num">
          {#if p.perPlay !== null}
            <div class="kv"><span class="muted">한 판 PT ({schedule.play.boost}불)</span><b>{num(p.perPlay)}</b></div>
            {#if p.playsNeeded !== null && p.remainingPt}
              <div class="kv"><span class="muted">목표까지</span><b>{num(p.playsNeeded)}판{schedule.play.boost > 0 ? ` · 불 ${num(p.flamesNeeded ?? 0)}개` : ''}</b></div>
            {/if}
          {/if}
          <div class="kv">
            <span class="muted">종료까지 쓸 수 있는 불</span>
            <span>{num(p.flamesAvailable)}개{log.flames ? ` (가진 ${log.flames.count} + 회복)` : ' (회복분만)'}</span>
          </div>
          {#if p.reachablePt !== null}
            <div class="kv">
              <span class="muted">그 불을 {schedule.play.boost}불씩 다 쓰면</span>
              <span>{num(p.reachablePt)}{#if log.goal !== null}<span class:accent={p.reachablePt < log.goal}> ({p.reachablePt >= log.goal ? '목표 달성 가능' : `${num(log.goal - p.reachablePt)} 부족 — 0불 플레이로 채워야 함`})</span>{/if}</span>
            </div>
          {/if}
        </div>

        {#if perBoost.length > 0}
          <details>
            <summary class="small">불 수별 한 판 PT 보기</summary>
            <table class="small num">
              <thead><tr><th>불</th><th>배율</th><th>한 판 PT</th><th>불 1개당</th></tr></thead>
              <tbody>
                {#each perBoost as b (b.n)}
                  <tr class:accent={b.n === schedule.play.boost}>
                    <td>{b.n}불</td><td>×{b.m}</td><td>{num(b.pt)}</td><td>{b.n ? num(b.pt / b.n) : '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <p class="small muted">불 1개당 PT는 적은 불로 여러 판 할수록 높고, 많은 불을 한 번에 쓸수록 플레이 횟수가 줄어듭니다.</p>
          </details>
        {/if}
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
  .boost { width: 92px; flex: none; }
  details summary { cursor: pointer; color: var(--accent-text); min-height: 32px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; color: var(--muted); font-weight: 500; }
  td, th { padding: 4px 0; border-bottom: 1px solid var(--border); }
  td:last-child { text-align: right; }
</style>
