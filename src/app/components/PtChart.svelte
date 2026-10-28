<script lang="ts">
  // 이벤트 기간 동안의 PT 기록 꺾은선. 계열은 "내 PT" 하나라 범례 없이, 기준선(목표·필요 페이스·지금)에 직접 이름을 붙인다.
  // 점을 누르거나 가리키면 그 기록의 시각과 PT를 보여준다. 표 보기는 화면의 기록 목록이 대신한다.
  import type { EventSchedule, GameEvent } from '../../engine/types';
  import { dateTime, num } from '../lib/format';
  import { sortedEntries, type PtLog } from '../lib/pace';

  let { event, log, now }: { event: GameEvent; log: PtLog; now: number } = $props();

  const W = 340;
  const H = 210;
  const M = { top: 18, right: 14, bottom: 26, left: 44 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const startOf = (x: EventSchedule) => Date.parse(x.calculatorStartsAt ?? x.startsAt);
  const start = $derived(startOf(event));
  const end = $derived(Date.parse(event.endsAt));
  const entries = $derived(sortedEntries(log));
  const points = $derived([{ at: start, pt: 0 }, ...entries.filter((e) => e.at >= start)]);

  // y 범위: 목표·기록 중 큰 값 위로 여유를 두고, 눈금 4칸이 1·2·2.5·5×10ⁿ 단위로 떨어지게
  const yMax = $derived.by(() => {
    const raw = (Math.max(log.goal ?? 0, ...entries.map((e) => e.pt), 1) * 1.08) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag) * 4;
  });
  const x = (t: number) => M.left + ((Math.min(Math.max(t, start), end) - start) / (end - start)) * iw;
  const y = (v: number) => M.top + ih - (v / yMax) * ih;

  const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
  const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax));
  // x 눈금: 날짜가 바뀌는 자정마다 (8일 넘으면 이틀마다)
  const xTicks = $derived.by(() => {
    const d = new Date(start);
    d.setHours(24, 0, 0, 0);
    const days: number[] = [];
    for (; d.getTime() < end; d.setDate(d.getDate() + 1)) days.push(d.getTime());
    return days.length > 8 ? days.filter((_, i) => i % 2 === 0) : days;
  });
  const dayLabel = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;

  const linePath = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.pt).toFixed(1)}`).join(''));
  const last = $derived(points.at(-1)!);
  const showPace = $derived(log.goal !== null && last.pt < log.goal && last.at < end);

  let hover: number | null = $state(null);
  function pick(e: PointerEvent) {
    if (entries.length === 0) return;
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    entries.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(entries[best].at) - px)) best = i;
    });
    hover = best;
  }
  const tip = $derived(hover !== null ? entries[hover] : null);
</script>

<figure>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="이벤트 기간 PT 기록 그래프" onpointermove={pick} onpointerdown={pick} onpointerleave={() => (hover = null)}>
    {#each yTicks as v (v)}
      <line class="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
      <text class="tick" x={M.left - 6} y={y(v) + 4} text-anchor="end">{compact.format(v)}</text>
    {/each}
    {#each xTicks as t (t)}
      <text class="tick" x={x(t)} y={H - 8} text-anchor="middle">{dayLabel(t)}</text>
    {/each}
    {#each (event.chapters ?? []).slice(1) as c (c.id)}
      <line class="chapter" x1={x(startOf(c))} x2={x(startOf(c))} y1={M.top} y2={M.top + ih} />
    {/each}

    {#if log.goal !== null}
      <line class="goal" x1={M.left} x2={W - M.right} y1={y(log.goal)} y2={y(log.goal)} />
      <text class="ref" x={W - M.right} y={y(log.goal) - 5} text-anchor="end">목표 {compact.format(log.goal)}</text>
    {/if}
    {#if showPace && log.goal !== null}
      <line class="pace" x1={x(last.at)} y1={y(last.pt)} x2={x(end)} y2={y(log.goal)} />
      <text class="ref" x={(x(last.at) + x(end)) / 2 + 4} y={(y(last.pt) + y(log.goal)) / 2 + 14}>필요 페이스</text>
    {/if}
    {#if now > start && now < end}
      <line class="now" x1={x(now)} x2={x(now)} y1={M.top} y2={M.top + ih} />
      <text class="ref now-label" x={x(now)} y={M.top - 6} text-anchor="middle">지금</text>
    {/if}

    <path class="series" d={linePath} />
    {#each entries as p, i (p.at)}
      <circle class="dot" class:active={hover === i} cx={x(p.at)} cy={y(p.pt)} r={hover === i ? 5.5 : 4} />
    {/each}
  </svg>
  {#if tip}
    <figcaption class="tip num"><b>{num(tip.pt)} PT</b> · {dateTime(tip.at)}</figcaption>
  {:else}
    <figcaption class="tip muted">{entries.length ? '점을 누르면 기록이 보입니다' : 'PT를 기록하면 그래프가 그려집니다'}</figcaption>
  {/if}
</figure>

<style>
  figure { margin: 0; }
  svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { font-size: 10px; fill: var(--muted); font-variant-numeric: tabular-nums; }
  .chapter { stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 2 3; }
  .goal { stroke: var(--text-2); stroke-width: 1.5; stroke-dasharray: 6 4; }
  .pace { stroke: var(--border-strong); stroke-width: 1.5; stroke-dasharray: 4 4; }
  .now { stroke: var(--muted); stroke-width: 1; }
  .ref { font-size: 10px; fill: var(--text-2); font-weight: 600; }
  .now-label { fill: var(--muted); }
  .series { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
  .tip { font-size: 13px; min-height: 20px; text-align: center; margin-top: 2px; }
</style>
