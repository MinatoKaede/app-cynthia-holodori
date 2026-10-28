<script lang="ts">
  import { MAX_POWER_UP_PERCENT, backupSummary, parseBackup, type StoredBackup } from '../lib/backup';
  import { dateTime } from '../lib/format';
  import { idbDelete, idbKeys } from '../lib/idb';
  import { clearImageCache, imageCacheStats } from '../lib/images';
  import { autoConcurrency } from '../lib/workers';
  import { refreshSchedule } from '../schedule.svelte';
  import { app, getData, refreshData, saveBackup, saveOverrides, savePrefs } from '../state.svelte';

  let images = $state<{ count: number; bytes: number } | null>(null);
  const refreshImageStats = () => imageCacheStats().then((s) => (images = s)).catch(() => {});
  $effect(() => {
    void refreshImageStats();
  });

  async function clearImages() {
    await clearImageCache();
    await refreshImageStats();
  }

  let pending: StoredBackup | null = $state(null);
  let fileError = $state('');
  let memoryCount = $state(app.overrides.memoryCount ?? app.backup?.growth.memoryCount ?? 0);
  let powerUp = $state(app.overrides.memberPowerUpPercent ?? app.backup?.growth.memberPowerUpPercent ?? 0);
  let saved = $state('');
  let updating = $state(false);
  let updateMessage = $state('');

  const manifest = $derived(getData().manifest);
  const shown = $derived(pending ?? app.backup);
  const summary = $derived(shown ? backupSummary(shown) : null);
  const powerUpValid = $derived(Number.isFinite(powerUp) && powerUp >= 0 && powerUp <= MAX_POWER_UP_PERCENT);
  const memoryValid = $derived(Number.isInteger(memoryCount) && memoryCount >= 0);

  async function pick(e: Event & { currentTarget: HTMLInputElement }) {
    fileError = '';
    saved = '';
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      pending = parseBackup(await file.text(), file.name);
      memoryCount = pending.growth.memoryCount;
      powerUp = pending.growth.memberPowerUpPercent;
    } catch (err) {
      pending = null;
      fileError = (err as Error).message;
    }
  }

  async function save() {
    if (!memoryValid || !powerUpValid) return;
    if (pending) await saveBackup(pending);
    pending = null;
    const base = app.backup?.growth;
    // 백업 값과 같으면 직접 입력값을 두지 않는다 (다음 백업을 가져올 때 백업 값이 쓰이도록)
    await saveOverrides({
      memoryCount: memoryCount === (base?.memoryCount ?? 0) ? undefined : memoryCount,
      memberPowerUpPercent: powerUp === (base?.memberPowerUpPercent ?? 0) ? undefined : powerUp,
    });
    saved = '저장했습니다.';
  }

  async function removeBackup() {
    if (!confirm('가져온 백업을 이 기기에서 지울까요?')) return;
    await saveBackup(null);
    await saveOverrides({});
    memoryCount = 0;
    powerUp = 0;
  }

  async function update() {
    updating = true;
    updateMessage = '';
    try {
      const before = getData().manifest.source.bundleHash;
      await refreshData();
      await refreshSchedule();
      updateMessage = getData().manifest.source.bundleHash === before ? '최신 데이터입니다.' : '새 데이터로 바꿨습니다.';
    } catch (e) {
      updateMessage = (e as Error).message;
    } finally {
      updating = false;
    }
  }

  async function clearResults() {
    await idbDelete('results', await idbKeys('results'));
    saved = '저장된 결과를 지웠습니다.';
  }
</script>

<main class="page">
  <h1>데이터</h1>

  <section class="card">
    <h2>갤산기 백업</h2>
    <label class="btn soft block file">
      백업 파일 선택
      <input type="file" accept=".json,application/json" onchange={pick} />
    </label>
    {#if fileError}<p class="notice error">{fileError}</p>{/if}

    {#if shown && summary}
      {#if pending}<p class="notice">아래 내용으로 가져옵니다. 저장을 눌러야 반영됩니다.</p>{/if}
      <div class="small num">
        <div class="kv"><span class="muted">파일</span><span>{shown.fileName}</span></div>
        {#if shown.updatedAt}<div class="kv"><span class="muted">백업 시각</span><span>{dateTime(shown.updatedAt)}</span></div>{/if}
        <div class="kv"><span class="muted">보유 카드</span><span>{summary.ownedCards}장</span></div>
        <div class="kv"><span class="muted">보드 등록 멤버</span><span>{summary.boardMembers}명</span></div>
        <div class="kv"><span class="muted">보드 커넥트</span><span>{summary.boardCards}개</span></div>
      </div>
    {:else}
      <p class="small muted">갤산기에서 내보낸 백업(.json)을 고르세요. 백업은 이 기기에만 저장되고 어디로도 보내지 않습니다.</p>
    {/if}

    <div class="split">
      <label class="field">
        <span class="label">보유 메모리 수</span>
        <input class="input num" type="number" min="0" step="1" inputmode="numeric" bind:value={memoryCount} />
      </label>
      <label class="field">
        <span class="label">멤버 강화율 (0~{MAX_POWER_UP_PERCENT}%)</span>
        <input class="input num" type="number" min="0" max={MAX_POWER_UP_PERCENT} step="1" inputmode="decimal" bind:value={powerUp} />
      </label>
    </div>
    {#if !memoryValid || !powerUpValid}<p class="notice error">메모리 수는 0 이상의 정수, 강화율은 0~{MAX_POWER_UP_PERCENT}% 사이로 입력해 주세요.</p>{/if}
    <div class="row">
      {#if app.backup && !pending}<button class="btn ghost" onclick={removeBackup}>백업 지우기</button>{/if}
      <span class="grow small accent">{saved}</span>
      <button class="btn primary" onclick={save} disabled={!memoryValid || !powerUpValid}>저장</button>
    </div>
  </section>

  <section class="card small num">
    <h2>갤산기 데이터</h2>
    <div class="kv"><span class="muted">추출 시각</span><span>{dateTime(manifest.extractedAt)}</span></div>
    <div class="kv"><span class="muted">갤산기 버전</span><span>{manifest.source.bundleHash}</span></div>
    <div class="kv"><span class="muted">카드 · 이벤트 · 채보</span><span>{manifest.stats.cards} · {manifest.stats.events} · {manifest.stats.chartFiles}</span></div>
    {#if app.updateError}<p class="notice warn">{app.updateError}</p>{/if}
    <div class="row">
      <span class="grow">{updateMessage}</span>
      <button class="btn soft" onclick={update} disabled={updating}>{updating ? '확인 중…' : '업데이트 확인'}</button>
    </div>
  </section>

  <section class="card">
    <h2>계산</h2>
    <label class="field">
      <span class="label">계산 워커 수</span>
      <select class="input" value={String(app.prefs.concurrency)} onchange={(e) => savePrefs({ ...app.prefs, concurrency: Number(e.currentTarget.value) })}>
        <option value="0">자동 ({autoConcurrency()}개)</option>
        {#each [1, 2, 3, 4, 6, 8] as n (n)}<option value={String(n)}>{n}개</option>{/each}
      </select>
    </label>
    <p class="small muted">워커 수는 계산 속도만 바꾸고 결과는 같습니다. 기기가 뜨거워지면 줄여 보세요.</p>
    <button class="btn block" onclick={clearResults}>저장된 결과 지우기</button>
  </section>

  <section class="card">
    <h2>이미지</h2>
    <p class="small muted num">
      카드 일러·배너·멤버 아이콘은 처음 볼 때 받아 이 기기에 저장합니다{images ? ` (현재 ${images.count}개, ${(images.bytes / 1024 / 1024).toFixed(1)}MB)` : ''}.
      100MB를 넘으면 오래 안 본 것부터 지웁니다.
    </p>
    <button class="btn block" onclick={clearImages}>이미지 캐시 지우기</button>
  </section>

  <p class="small muted">
    계산 엔진과 데이터: 갤산기(doricalc.cc) — 제작자의 허락을 받아 그대로 사용합니다.
    이미지: holodori.best 공개 저장소(cdn.holodori.dev). © COVER / © QualiArts
  </p>
</main>

<style>
  .file { position: relative; overflow: hidden; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
</style>
