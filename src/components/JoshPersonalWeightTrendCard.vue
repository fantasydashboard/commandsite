<script setup lang="ts">
/**
 * Weight goal — line graph with target reference + hover readout.
 *
 * Shows the daily weight series with a dashed target line and a single
 * gradient-filled curve. Hover anywhere over the plot to see the value
 * + date for the nearest logged reading. Stat row beneath summarizes
 * current vs. target, recent pace, weeks left.
 */
import { computed, ref } from 'vue'

interface WeightPoint { day: string; value: number | null }

const props = defineProps<{
  current: number          // current weight in lbs
  target: number           // target weight in lbs
  series: WeightPoint[]    // daily series, oldest first
  targetDeadline?: string | null
  primaryGoal?: string     // 'cut' | 'bulk' | 'maintain'
  statusLabel: string
  statusBadgeClass: string
  detail: string
}>()

// Compact non-null values for the line + min/max for y-axis scaling
const points = computed(() => {
  const out: { x: number; y: number; date: string }[] = []
  props.series.forEach((p, idx) => {
    if (p.value !== null) out.push({ x: idx, y: p.value, date: p.day })
  })
  return out
})

const W = 600
const H = 140
const PAD_X = 36          // leaves room for left y-axis labels
const PAD_TOP = 10
const PAD_BOT = 20        // leaves room for x-axis date labels

const yMin = computed(() => {
  if (points.value.length === 0) return Math.min(props.target, props.current) - 5
  const vals = points.value.map((p) => p.y).concat([props.target, props.current])
  return Math.floor(Math.min(...vals) - 1)
})

const yMax = computed(() => {
  if (points.value.length === 0) return Math.max(props.target, props.current) + 5
  const vals = points.value.map((p) => p.y).concat([props.target, props.current])
  return Math.ceil(Math.max(...vals) + 1)
})

const seriesLen = computed(() => Math.max(props.series.length - 1, 1))

function xCoord(idx: number): number {
  return PAD_X + (idx / seriesLen.value) * (W - PAD_X * 2)
}

function yCoord(val: number): number {
  const range = yMax.value - yMin.value || 1
  return PAD_TOP + (1 - (val - yMin.value) / range) * (H - PAD_TOP - PAD_BOT)
}

const linePath = computed(() => {
  if (points.value.length === 0) return ''
  return points.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(p.x).toFixed(1)} ${yCoord(p.y).toFixed(1)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (points.value.length === 0) return ''
  const baselineY = H - PAD_BOT
  const start = `M ${xCoord(points.value[0].x).toFixed(1)} ${baselineY}`
  const line = points.value
    .map((p) => `L ${xCoord(p.x).toFixed(1)} ${yCoord(p.y).toFixed(1)}`)
    .join(' ')
  const end = `L ${xCoord(points.value[points.value.length - 1].x).toFixed(1)} ${baselineY} Z`
  return start + ' ' + line + ' ' + end
})

const targetY = computed(() => yCoord(props.target))
const currentY = computed(() => points.value.length > 0 ? yCoord(points.value[points.value.length - 1].y) : null)
const currentX = computed(() => points.value.length > 0 ? xCoord(points.value[points.value.length - 1].x) : null)

const gap = computed(() => Math.abs(props.current - props.target))
const direction = computed(() => props.current > props.target ? 'lose' : props.current < props.target ? 'gain' : 'maintain')

// 7-day vs prior 7-day trend
const trend7d = computed(() => {
  const pts = points.value
  if (pts.length < 14) return null
  const recent7 = pts.slice(-7).map((p) => p.y)
  const prior7 = pts.slice(-14, -7).map((p) => p.y)
  if (recent7.length === 0 || prior7.length === 0) return null
  const recentAvg = recent7.reduce((s, v) => s + v, 0) / recent7.length
  const priorAvg = prior7.reduce((s, v) => s + v, 0) / prior7.length
  return Number((recentAvg - priorAvg).toFixed(1))
})

// ── Axis labels ────────────────────────────────────────────────────
// Two y-ticks (min + max of the series), three x-ticks (start, mid, end)
// keep the chart legible without crowding.

const yTicks = computed(() => {
  if (points.value.length === 0) return []
  const vals = points.value.map((p) => p.y)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  return [
    { value: Math.round(hi * 10) / 10, y: yCoord(hi) },
    { value: Math.round(lo * 10) / 10, y: yCoord(lo) },
  ]
})

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const xTicks = computed(() => {
  if (points.value.length === 0) return []
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  const midIdx = Math.floor(points.value.length / 2)
  const mid = points.value[midIdx]
  const out: { label: string; x: number }[] = []
  out.push({ label: shortDate(first.date), x: xCoord(first.x) })
  if (points.value.length >= 3) out.push({ label: shortDate(mid.date), x: xCoord(mid.x) })
  out.push({ label: shortDate(last.date), x: xCoord(last.x) })
  return out
})

// ── Hover state ────────────────────────────────────────────────────

const svgRef = ref<SVGSVGElement | null>(null)
const hoveredIdx = ref<number | null>(null)

function onMove(e: MouseEvent) {
  if (!svgRef.value || points.value.length === 0) return
  const rect = svgRef.value.getBoundingClientRect()
  // Convert client pixel x → SVG viewBox x
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  // Find nearest point by xCoord(p.x)
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < points.value.length; i++) {
    const px = xCoord(points.value[i].x)
    const dist = Math.abs(px - svgX)
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }
  hoveredIdx.value = bestIdx
}
function onLeave() { hoveredIdx.value = null }

const hovered = computed(() => {
  if (hoveredIdx.value === null) return null
  return points.value[hoveredIdx.value] ?? null
})

const hoveredX = computed(() => hovered.value ? xCoord(hovered.value.x) : null)
const hoveredY = computed(() => hovered.value ? yCoord(hovered.value.y) : null)

// Tooltip positioning — keep it inside the chart, flip when near right edge
const tooltipStyle = computed(() => {
  if (hoveredX.value === null) return {}
  const leftPct = (hoveredX.value / W) * 100
  const flip = leftPct > 70
  return {
    left: `${leftPct}%`,
    transform: flip ? 'translate(-100%, -100%) translateY(-8px) translateX(-6px)' : 'translate(0, -100%) translateY(-8px) translateX(6px)',
  } as Record<string, string>
})

const hoveredDateLabel = computed(() => {
  if (!hovered.value) return ''
  const d = new Date(hovered.value.date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
})

// Hover delta vs the latest reading (useful context: "+0.3 vs latest")
const hoveredDelta = computed(() => {
  if (!hovered.value || points.value.length === 0) return null
  const latest = points.value[points.value.length - 1].y
  const diff = hovered.value.y - latest
  if (Math.abs(diff) < 0.05) return null
  return Number(diff.toFixed(1))
})
</script>

<template>
  <section class="card p-4">
    <header class="flex items-start justify-between gap-3 mb-3 flex-wrap">
      <div class="min-w-0">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          Weight goal
        </div>
        <div class="flex items-baseline gap-2 mt-1 flex-wrap">
          <span class="text-lg font-bold text-ink tabular-nums">{{ current }} lbs</span>
          <span class="text-ink-muted text-sm">→</span>
          <span class="text-sm font-semibold text-ink-muted tabular-nums">{{ target }} lbs</span>
          <span
            v-if="trend7d !== null"
            class="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
            :class="trend7d < 0 ? 'text-success bg-success/10' : trend7d > 0 ? 'text-warn bg-warn/10' : 'text-ink-muted bg-canvas'"
          >{{ trend7d > 0 ? '+' : '' }}{{ trend7d }} lbs / 7d</span>
        </div>
        <div v-if="targetDeadline" class="text-[11px] text-ink-muted mt-0.5">
          {{ primaryGoal === 'cut' ? 'Cut to' : 'Reach' }} {{ target }} lbs by
          {{ new Date(targetDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
        </div>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0"
        :class="statusBadgeClass"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {{ statusLabel }}
      </span>
    </header>

    <!-- Line graph -->
    <div class="relative">
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        class="w-full h-36 cursor-crosshair"
        @mousemove="onMove"
        @mouseleave="onLeave"
      >
        <defs>
          <linearGradient id="weight-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(var(--color-brand))" stop-opacity="0.16" />
            <stop offset="100%" stop-color="rgb(var(--color-brand))" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Y-axis tick labels (high + low of series) -->
        <template v-for="t in yTicks" :key="`y-${t.value}`">
          <line
            :x1="PAD_X - 4" :y1="t.y" :x2="W - PAD_X" :y2="t.y"
            stroke="rgb(var(--color-divider, 226 232 240))"
            stroke-width="0.5"
            stroke-dasharray="2 4"
            opacity="0.5"
          />
          <text
            :x="PAD_X - 6" :y="t.y + 3"
            text-anchor="end"
            class="fill-current text-ink-muted"
            style="font-size: 9px;"
          >{{ t.value }}</text>
        </template>

        <!-- Target line (dashed) -->
        <line
          v-if="points.length > 0"
          :x1="PAD_X" :y1="targetY"
          :x2="W - PAD_X" :y2="targetY"
          stroke="rgb(var(--color-brand))"
          stroke-width="1.2"
          stroke-dasharray="4 4"
          opacity="0.55"
        />
        <text
          v-if="points.length > 0"
          :x="W - PAD_X - 4"
          :y="targetY - 4"
          text-anchor="end"
          class="fill-brand"
          style="font-size: 9px; font-weight: 600; opacity: 0.75;"
        >target {{ target }}</text>

        <!-- Area under the curve -->
        <path
          v-if="points.length > 1"
          :d="areaPath"
          fill="url(#weight-area)"
        />

        <!-- Weight line -->
        <path
          v-if="points.length > 0"
          :d="linePath"
          fill="none"
          stroke="rgb(var(--color-brand))"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Current point dot -->
        <circle
          v-if="currentX !== null && currentY !== null"
          :cx="currentX"
          :cy="currentY"
          r="3.5"
          fill="rgb(var(--color-brand))"
          stroke="rgb(var(--color-surface, 255 255 255))"
          stroke-width="2"
        />

        <!-- Hover guideline + highlighted dot -->
        <template v-if="hovered && hoveredX !== null && hoveredY !== null">
          <line
            :x1="hoveredX" :y1="PAD_TOP"
            :x2="hoveredX" :y2="H - PAD_BOT"
            stroke="rgb(var(--color-brand))"
            stroke-width="1"
            opacity="0.4"
          />
          <circle
            :cx="hoveredX"
            :cy="hoveredY"
            r="4.5"
            fill="rgb(var(--color-brand))"
            stroke="rgb(var(--color-surface, 255 255 255))"
            stroke-width="2"
          />
        </template>

        <!-- X-axis tick labels -->
        <template v-for="t in xTicks" :key="`x-${t.x}`">
          <text
            :x="t.x" :y="H - 4"
            text-anchor="middle"
            class="fill-current text-ink-muted"
            style="font-size: 9px;"
          >{{ t.label }}</text>
        </template>
      </svg>

      <!-- Hover tooltip (HTML overlay so type rendering is crisp) -->
      <div
        v-if="hovered"
        class="absolute pointer-events-none rounded-md bg-ink text-white px-2 py-1.5 text-[11px] leading-tight shadow-lg z-10 tabular-nums"
        :style="tooltipStyle"
      >
        <div class="font-semibold">{{ hovered.y.toFixed(1) }} lbs</div>
        <div class="opacity-70">{{ hoveredDateLabel }}</div>
        <div v-if="hoveredDelta !== null" class="opacity-70 text-[10px] mt-0.5">
          {{ hoveredDelta > 0 ? '+' : '' }}{{ hoveredDelta }} vs latest
        </div>
      </div>

      <div v-if="points.length === 0" class="absolute inset-0 flex items-center justify-center text-xs text-ink-disabled">
        No weight data yet — log via Apple Health or Ask Sage
      </div>
    </div>

    <!-- Footer stat row — single source of truth (parent's `detail` already
         leads with "{n} lbs to lose"; we no longer duplicate it) -->
    <p class="text-[11px] text-ink-muted leading-snug mt-2">
      <strong class="text-ink tabular-nums">{{ gap.toFixed(1) }} lbs</strong>
      to {{ direction === 'lose' ? 'lose' : direction === 'gain' ? 'gain' : 'go' }}
    </p>
    <p v-if="detail" class="text-[11px] text-ink-muted leading-snug">
      {{ detail.replace(/^\d+(?:\.\d+)?\s*lbs?\s*to\s*(lose|gain)\s*·\s*/i, '') }}
    </p>
  </section>
</template>
