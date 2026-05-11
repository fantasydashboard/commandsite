<script setup lang="ts">
/**
 * Weight goal — line graph with target reference.
 *
 * Replaces the simple progress bar. Shows the actual weight series
 * (last 60 days) with a dashed target line so the trend toward goal
 * is visible at a glance. Stats row below shows current, target, gap.
 */
import { computed } from 'vue'

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
const H = 120
const PAD_X = 4
const PAD_TOP = 12
const PAD_BOT = 16

const yMin = computed(() => {
  if (points.value.length === 0) return Math.min(props.target, props.current) - 5
  const vals = points.value.map((p) => p.y).concat([props.target, props.current])
  return Math.min(...vals) - 2
})

const yMax = computed(() => {
  if (points.value.length === 0) return Math.max(props.target, props.current) + 5
  const vals = points.value.map((p) => p.y).concat([props.target, props.current])
  return Math.max(...vals) + 2
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
  const start = `M ${xCoord(points.value[0].x).toFixed(1)} ${yCoord(props.target).toFixed(1)}`
  const line = points.value
    .map((p) => `L ${xCoord(p.x).toFixed(1)} ${yCoord(p.y).toFixed(1)}`)
    .join(' ')
  const end = `L ${xCoord(points.value[points.value.length - 1].x).toFixed(1)} ${yCoord(props.target).toFixed(1)} Z`
  return start + ' ' + line + ' ' + end
})

const targetY = computed(() => yCoord(props.target))
const currentY = computed(() => points.value.length > 0 ? yCoord(points.value[points.value.length - 1].y) : null)
const currentX = computed(() => points.value.length > 0 ? xCoord(points.value[points.value.length - 1].x) : null)

const gap = computed(() => Math.abs(props.current - props.target))
const direction = computed(() => props.current > props.target ? 'lose' : props.current < props.target ? 'gain' : 'maintain')

// 30-day trend
const trend30d = computed(() => {
  const pts = points.value
  if (pts.length < 14) return null
  const recent7 = pts.slice(-7).map((p) => p.y)
  const prior7 = pts.slice(-14, -7).map((p) => p.y)
  if (recent7.length === 0 || prior7.length === 0) return null
  const recentAvg = recent7.reduce((s, v) => s + v, 0) / recent7.length
  const priorAvg = prior7.reduce((s, v) => s + v, 0) / prior7.length
  return Number((recentAvg - priorAvg).toFixed(1))
})
</script>

<template>
  <section class="card p-4">
    <header class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          Weight goal
          <span v-if="targetDeadline" class="text-ink-muted font-normal normal-case ml-1">
            · {{ primaryGoal === 'cut' ? 'cut to' : 'reach' }} {{ target }} lbs by {{ new Date(targetDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
          </span>
        </div>
        <div class="text-base font-semibold text-ink mt-0.5">
          <span class="tabular-nums">{{ current }} lbs</span>
          <span class="text-ink-muted text-sm font-normal mx-1">→</span>
          <span class="tabular-nums text-ink-muted">{{ target }} lbs</span>
          <span v-if="trend30d !== null" class="ml-2 text-xs font-normal tabular-nums" :class="trend30d < 0 ? 'text-success' : trend30d > 0 ? 'text-warn' : 'text-ink-muted'">
            {{ trend30d > 0 ? '+' : '' }}{{ trend30d }} lbs / 7d trend
          </span>
        </div>
      </div>
      <span
        class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        :class="statusBadgeClass"
      >{{ statusLabel }}</span>
    </header>

    <!-- Line graph -->
    <div class="relative">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        class="w-full h-32"
      >
        <!-- Gradient fill below the line vs target -->
        <defs>
          <linearGradient id="weight-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(var(--color-brand))" stop-opacity="0.18" />
            <stop offset="100%" stop-color="rgb(var(--color-brand))" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <!-- Target line (dashed) -->
        <line
          v-if="points.length > 0"
          :x1="PAD_X" :y1="targetY"
          :x2="W - PAD_X" :y2="targetY"
          stroke="rgb(var(--color-brand))"
          stroke-width="1.2"
          stroke-dasharray="4 4"
          opacity="0.5"
        />
        <text
          v-if="points.length > 0"
          :x="W - PAD_X - 4"
          :y="targetY - 4"
          text-anchor="end"
          class="fill-brand"
          style="font-size: 9px; font-weight: 600; opacity: 0.7;"
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
      </svg>

      <div v-if="points.length === 0" class="absolute inset-0 flex items-center justify-center text-xs text-ink-disabled">
        No weight data yet — log via Apple Health or Ask Sage
      </div>
    </div>

    <p class="text-xs text-ink-muted leading-snug mt-2">
      <strong class="text-ink tabular-nums">{{ gap.toFixed(1) }} lbs</strong>
      to {{ direction === 'lose' ? 'lose' : direction === 'gain' ? 'gain' : 'go' }} ·
      {{ detail }}
    </p>
  </section>
</template>
