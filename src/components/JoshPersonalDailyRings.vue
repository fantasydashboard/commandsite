<script setup lang="ts">
/**
 * Josh Personal — daily rings strip.
 *
 * Replaces the generic 5-card KPI snapshot. Each ring shows current
 * vs. target for a goal-relevant metric. Color encodes status. Below
 * the rings, 1-3 auto-derived micro-insights ("HRV up 8% w/w").
 *
 * The rings (left → right):
 *   1. Calories (cal logged today / daily_cal_target)
 *   2. Protein (protein g logged today / protein_g target)
 *   3. Steps (steps today / 10,000)
 *   4. Water (water oz today / water_oz target)
 *   5. Sleep (last night hours / sleep_target_hours)
 */
import { computed } from 'vue'

const props = defineProps<{
  caloriesValue: number
  caloriesTarget: number
  proteinValue: number
  proteinTarget: number
  stepsValue: number
  stepsTarget: number
  waterValue: number
  waterTarget: number
  sleepValue: number | null
  sleepTarget: number
  microInsights: string[]
}>()

interface Ring {
  key: string
  label: string
  value: number
  target: number
  unit: string
  display: string
  pct: number
  color: 'brand' | 'success' | 'warn' | 'danger' | 'water'
  helper: string
}

function clampPct(v: number, t: number): number {
  if (!t || t <= 0) return 0
  return Math.max(0, Math.min(100, (v / t) * 100))
}

const rings = computed<Ring[]>(() => {
  const cal = clampPct(props.caloriesValue, props.caloriesTarget)
  const protein = clampPct(props.proteinValue, props.proteinTarget)
  const steps = clampPct(props.stepsValue, props.stepsTarget)
  const water = clampPct(props.waterValue, props.waterTarget)
  const sleep = props.sleepValue == null ? 0 : clampPct(props.sleepValue, props.sleepTarget)

  return [
    {
      key: 'cal', label: 'Calories',
      value: props.caloriesValue, target: props.caloriesTarget, unit: '',
      display: `${Math.round(props.caloriesValue).toLocaleString()}`,
      pct: cal,
      color: cal > 100 ? 'warn' : 'brand',
      helper: `of ${props.caloriesTarget.toLocaleString()}`,
    },
    {
      key: 'protein', label: 'Protein',
      value: props.proteinValue, target: props.proteinTarget, unit: 'g',
      display: `${Math.round(props.proteinValue)}g`,
      pct: protein,
      color: protein >= 90 ? 'success' : protein >= 60 ? 'brand' : 'warn',
      helper: `of ${props.proteinTarget}g`,
    },
    {
      key: 'steps', label: 'Steps',
      value: props.stepsValue, target: props.stepsTarget, unit: '',
      display: props.stepsValue.toLocaleString(),
      pct: steps,
      color: steps >= 90 ? 'success' : steps >= 50 ? 'brand' : 'warn',
      helper: `of ${props.stepsTarget.toLocaleString()}`,
    },
    {
      key: 'water', label: 'Water',
      value: props.waterValue, target: props.waterTarget, unit: 'oz',
      display: `${Math.round(props.waterValue)}oz`,
      pct: water,
      // Water uses its own dedicated blue (sky-500) so it stays
      // visually "water" regardless of progress — never goes green.
      color: 'water',
      helper: `of ${props.waterTarget}oz`,
    },
    {
      key: 'sleep', label: 'Sleep',
      value: props.sleepValue ?? 0, target: props.sleepTarget, unit: 'h',
      display: props.sleepValue != null ? `${props.sleepValue.toFixed(1)}h` : '—',
      pct: sleep,
      color: sleep >= 95 ? 'success' : sleep >= 80 ? 'brand' : 'warn',
      helper: `of ${props.sleepTarget}h target`,
    },
  ]
})

// Ring geometry
const RING_SIZE = 72
const STROKE = 6
const RADIUS = (RING_SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function strokeOffset(pct: number): number {
  return CIRCUMFERENCE * (1 - Math.min(100, pct) / 100)
}

// Hex used for the water "blue" stroke. Stays explicit so we don't
// rely on the per-client brand variable (which is teal for Josh).
const WATER_BLUE = '#0ea5e9'  // sky-500

function ringStrokeClass(color: Ring['color']): string {
  switch (color) {
    case 'success': return 'stroke-success'
    case 'brand':   return 'stroke-brand'
    case 'warn':    return 'stroke-warn'
    case 'danger':  return 'stroke-danger'
    case 'water':   return ''  // overridden via inline stroke attribute below
  }
}

function ringStrokeAttr(color: Ring['color']): string | undefined {
  return color === 'water' ? WATER_BLUE : undefined
}

function valueColorClass(color: Ring['color']): string {
  switch (color) {
    case 'success': return 'text-success'
    case 'brand':   return 'text-ink'
    case 'warn':    return 'text-warn'
    case 'danger':  return 'text-danger'
    case 'water':   return ''  // see inline style below
  }
}

function valueInlineColor(color: Ring['color']): string | undefined {
  return color === 'water' ? WATER_BLUE : undefined
}
</script>

<template>
  <section class="card p-4">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div v-for="r in rings" :key="r.key" class="flex items-center gap-3">
        <div class="relative shrink-0" :style="{ width: `${RING_SIZE}px`, height: `${RING_SIZE}px` }">
          <svg :width="RING_SIZE" :height="RING_SIZE" class="-rotate-90">
            <circle
              :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RADIUS"
              fill="none"
              class="stroke-canvas"
              :stroke-width="STROKE"
            />
            <circle
              :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RADIUS"
              fill="none"
              :class="ringStrokeClass(r.color)"
              :stroke="ringStrokeAttr(r.color)"
              :stroke-width="STROKE"
              stroke-linecap="round"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="strokeOffset(r.pct)"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <span
              class="text-[11px] font-bold tabular-nums"
              :class="valueColorClass(r.color)"
              :style="valueInlineColor(r.color) ? { color: valueInlineColor(r.color) } : {}"
            >{{ Math.round(r.pct) }}%</span>
          </div>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{{ r.label }}</div>
          <div class="text-base font-bold text-ink tabular-nums leading-tight">{{ r.display }}</div>
          <div class="text-[10px] text-ink-muted leading-tight">{{ r.helper }}</div>
        </div>
      </div>
    </div>
    <ul v-if="microInsights.length > 0" class="mt-3 pt-3 border-t border-divider space-y-1">
      <li v-for="(line, i) in microInsights" :key="i" class="text-[11px] text-ink-muted leading-snug">
        <span class="text-brand mr-1">·</span>{{ line }}
      </li>
    </ul>
  </section>
</template>
