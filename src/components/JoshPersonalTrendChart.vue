<script setup lang="ts">
/**
 * Josh Personal — reusable trend chart with hover + experiment overlay.
 *
 * Used by the Trends page for weight, sleep, HRV, steps, etc. Hover
 * tracks the nearest non-null data point and shows a value+date tooltip.
 * Optional `experiments` prop renders shaded vertical bands for the
 * date ranges they covered, with a small marker at the verdict point.
 */
import { computed, ref } from 'vue'

interface Point { day: string; value: number | null }
interface ExperimentSpan {
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'abandoned'
  verdict?: 'confirmed' | 'partial' | 'refuted' | 'inconclusive' | 'pending' | null
  title: string
}

const props = defineProps<{
  /** Daily series, oldest first. Each entry: { day, value or null } */
  series: Point[]
  unit?: string                  // e.g. 'lbs', 'h', 'ms'
  targetLine?: number | null     // optional dashed reference (e.g. 10000 for steps)
  targetLabel?: string | null    // text for the dashed line
  experiments?: ExperimentSpan[] // shaded bands on the chart
  ariaLabel?: string
}>()

const W = 600
const H = 140
const PAD_X = 32
const PAD_TOP = 10
const PAD_BOT = 20

const svgRef = ref<SVGSVGElement | null>(null)
const hoveredIdx = ref<number | null>(null)

const validPoints = computed(() => {
  const out: { x: number; y: number; date: string }[] = []
  props.series.forEach((p, idx) => {
    if (p.value !== null && Number.isFinite(p.value)) out.push({ x: idx, y: p.value as number, date: p.day })
  })
  return out
})

const seriesLen = computed(() => Math.max(props.series.length - 1, 1))

const yMin = computed(() => {
  if (validPoints.value.length === 0) return 0
  const vals = validPoints.value.map((p) => p.y)
  if (props.targetLine != null) vals.push(props.targetLine)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  // Add 5% padding so the line doesn't kiss the edges
  const pad = Math.max(1, (hi - lo) * 0.08)
  return Math.floor(lo - pad)
})

const yMax = computed(() => {
  if (validPoints.value.length === 0) return 1
  const vals = validPoints.value.map((p) => p.y)
  if (props.targetLine != null) vals.push(props.targetLine)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = Math.max(1, (hi - lo) * 0.08)
  return Math.ceil(hi + pad)
})

function xCoord(idx: number): number {
  return PAD_X + (idx / seriesLen.value) * (W - PAD_X * 2)
}
function yCoord(val: number): number {
  const range = yMax.value - yMin.value || 1
  return PAD_TOP + (1 - (val - yMin.value) / range) * (H - PAD_TOP - PAD_BOT)
}

const linePath = computed(() => {
  if (validPoints.value.length === 0) return ''
  return validPoints.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(p.x).toFixed(1)} ${yCoord(p.y).toFixed(1)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (validPoints.value.length < 2) return ''
  const baselineY = H - PAD_BOT
  const start = `M ${xCoord(validPoints.value[0].x).toFixed(1)} ${baselineY}`
  const line = validPoints.value
    .map((p) => `L ${xCoord(p.x).toFixed(1)} ${yCoord(p.y).toFixed(1)}`)
    .join(' ')
  const end = `L ${xCoord(validPoints.value[validPoints.value.length - 1].x).toFixed(1)} ${baselineY} Z`
  return start + ' ' + line + ' ' + end
})

const targetY = computed(() => props.targetLine != null ? yCoord(props.targetLine) : null)

// X-axis ticks: first / mid / last date
function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const xTicks = computed(() => {
  if (props.series.length === 0) return []
  const last = props.series.length - 1
  const out: { label: string; x: number }[] = [
    { label: shortDate(props.series[0].day), x: xCoord(0) },
  ]
  if (last >= 4) out.push({ label: shortDate(props.series[Math.floor(last / 2)].day), x: xCoord(Math.floor(last / 2)) })
  out.push({ label: shortDate(props.series[last].day), x: xCoord(last) })
  return out
})

// Y-axis ticks: high + low of the visible series
const yTicks = computed(() => {
  if (validPoints.value.length === 0) return []
  const vals = validPoints.value.map((p) => p.y)
  const hi = Math.max(...vals)
  const lo = Math.min(...vals)
  return [
    { value: roundForUnit(hi), y: yCoord(hi) },
    { value: roundForUnit(lo), y: yCoord(lo) },
  ]
})
function roundForUnit(n: number): string {
  if (props.unit === 'lbs' || props.unit === 'h') return n.toFixed(1)
  return Math.round(n).toString()
}

// Experiment bands — only render those whose date range overlaps the series window
const VERDICT_COLOR: Record<string, string> = {
  confirmed: '#10b981',
  partial: '#0ea5e9',
  refuted: '#ef4444',
  inconclusive: '#94a3b8',
  pending: '#94a3b8',
}
const experimentBands = computed(() => {
  if (!props.experiments || props.series.length === 0) return []
  const windowStart = props.series[0].day
  const windowEnd = props.series[props.series.length - 1].day
  function dayIdx(iso: string): number {
    const idx = props.series.findIndex((p) => p.day === iso)
    return idx >= 0 ? idx : -1
  }
  return props.experiments
    .filter((e) => e.end_date >= windowStart && e.start_date <= windowEnd)
    .map((e) => {
      const startIdx = Math.max(0, dayIdx(e.start_date) >= 0 ? dayIdx(e.start_date) : 0)
      const endIdx = dayIdx(e.end_date) >= 0 ? dayIdx(e.end_date) : props.series.length - 1
      const x1 = xCoord(startIdx)
      const x2 = xCoord(endIdx)
      const verdictColor = e.status === 'completed' && e.verdict ? (VERDICT_COLOR[e.verdict] ?? '#94a3b8') : '#0ea5e9'
      return { e, x1, x2, verdictColor }
    })
})

// Hover handling
function onMove(evt: MouseEvent) {
  if (!svgRef.value || validPoints.value.length === 0) return
  const rect = svgRef.value.getBoundingClientRect()
  const svgX = ((evt.clientX - rect.left) / rect.width) * W
  let bestI = 0
  let bestDist = Infinity
  for (let i = 0; i < validPoints.value.length; i++) {
    const px = xCoord(validPoints.value[i].x)
    const d = Math.abs(px - svgX)
    if (d < bestDist) { bestDist = d; bestI = i }
  }
  hoveredIdx.value = bestI
}
function onLeave() { hoveredIdx.value = null }
const hovered = computed(() => hoveredIdx.value !== null ? validPoints.value[hoveredIdx.value] : null)
const hoveredX = computed(() => hovered.value ? xCoord(hovered.value.x) : null)
const hoveredY = computed(() => hovered.value ? yCoord(hovered.value.y) : null)
const hoveredDateLabel = computed(() => {
  if (!hovered.value) return ''
  const d = new Date(hovered.value.date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
})

const tooltipStyle = computed(() => {
  if (hoveredX.value === null) return {}
  const leftPct = (hoveredX.value / W) * 100
  const flip = leftPct > 70
  return {
    left: `${leftPct}%`,
    transform: flip ? 'translate(-100%, -100%) translateY(-8px) translateX(-6px)' : 'translate(0, -100%) translateY(-8px) translateX(6px)',
  } as Record<string, string>
})
</script>

<template>
  <div class="relative">
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      class="w-full h-32 cursor-crosshair"
      :aria-label="ariaLabel"
      @mousemove="onMove"
      @mouseleave="onLeave"
    >
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(var(--color-brand))" stop-opacity="0.16" />
          <stop offset="100%" stop-color="rgb(var(--color-brand))" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Experiment bands — drawn first so the line + dots layer on top -->
      <template v-for="(b, i) in experimentBands" :key="`exp-${i}`">
        <rect
          :x="b.x1" :y="PAD_TOP"
          :width="Math.max(2, b.x2 - b.x1)" :height="H - PAD_TOP - PAD_BOT"
          :fill="b.verdictColor"
          fill-opacity="0.07"
        />
        <line
          v-if="b.e.status === 'completed'"
          :x1="b.x2" :y1="PAD_TOP" :x2="b.x2" :y2="H - PAD_BOT"
          :stroke="b.verdictColor"
          stroke-width="1.5"
        />
        <title v-if="b.e.title">{{ b.e.title }}{{ b.e.verdict ? ` (${b.e.verdict})` : '' }}</title>
      </template>

      <!-- Y ticks + gridlines -->
      <template v-for="(t, i) in yTicks" :key="`yt-${i}`">
        <line :x1="PAD_X - 4" :y1="t.y" :x2="W - PAD_X" :y2="t.y"
          stroke="rgb(var(--color-divider, 226 232 240))" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.5" />
        <text :x="PAD_X - 6" :y="t.y + 3" text-anchor="end"
          class="fill-current text-ink-muted" style="font-size: 9px;">{{ t.value }}</text>
      </template>

      <!-- Optional target line -->
      <template v-if="targetY !== null">
        <line :x1="PAD_X" :y1="targetY!" :x2="W - PAD_X" :y2="targetY!"
          stroke="rgb(var(--color-warn))" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" />
        <text v-if="targetLabel" :x="W - PAD_X - 4" :y="targetY! - 4"
          text-anchor="end" class="fill-warn"
          style="font-size: 9px; font-weight: 600; opacity: 0.7;">{{ targetLabel }}</text>
      </template>

      <!-- Area + line -->
      <path v-if="validPoints.length > 1" :d="areaPath" fill="url(#trend-area)" />
      <path v-if="validPoints.length > 0" :d="linePath" fill="none"
        stroke="rgb(var(--color-brand))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Hover guide + dot -->
      <template v-if="hovered && hoveredX !== null && hoveredY !== null">
        <line :x1="hoveredX" :y1="PAD_TOP" :x2="hoveredX" :y2="H - PAD_BOT"
          stroke="rgb(var(--color-brand))" stroke-width="1" opacity="0.4" />
        <circle :cx="hoveredX" :cy="hoveredY" r="4.5"
          fill="rgb(var(--color-brand))" stroke="rgb(var(--color-surface, 255 255 255))" stroke-width="2" />
      </template>

      <!-- X ticks -->
      <text v-for="(t, i) in xTicks" :key="`xt-${i}`"
        :x="t.x" :y="H - 4" text-anchor="middle"
        class="fill-current text-ink-muted" style="font-size: 9px;">{{ t.label }}</text>
    </svg>

    <div
      v-if="hovered"
      class="absolute pointer-events-none rounded-md bg-ink text-white px-2 py-1.5 text-[11px] leading-tight shadow-lg z-10 tabular-nums"
      :style="tooltipStyle"
    >
      <div class="font-semibold">{{ hovered.y.toFixed(unit === 'h' || unit === 'lbs' ? 1 : 0) }}{{ unit ? ` ${unit}` : '' }}</div>
      <div class="opacity-70">{{ hoveredDateLabel }}</div>
    </div>

    <div v-if="validPoints.length === 0" class="absolute inset-0 flex items-center justify-center text-xs text-ink-disabled">
      No data yet
    </div>
  </div>
</template>
