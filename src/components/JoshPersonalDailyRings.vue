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

// Compute a "gap score" — how far each metric is from its target, in
// the direction that matters. The biggest-gap ring gets visually
// promoted as today's FOCUS metric so the operator's eye lands on the
// one thing that needs attention. Per impeccable: identical card grids
// of the same visual weight are the lazy answer. Vary by what matters.
function gapScore(pct: number, kind: 'cal_cap' | 'goal'): number {
  if (kind === 'cal_cap') {
    // For calories, over-target is bad; near-zero is bad too
    // (user hasn't logged anything yet). 100% = good. Distance from 100.
    return Math.abs(100 - pct)
  }
  // For protein/steps/water/sleep, lower than target = bad.
  return Math.max(0, 100 - pct)
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

// Sort rings by how far off-target they are. The biggest-gap ring
// renders as today's FOCUS (visually dominant); the rest sit in a
// secondary compact row. Sleep is excluded from focus because it's
// retrospective — already happened last night, can't act on it today.
const sortedRings = computed<Ring[]>(() => {
  const out = [...rings.value]
  out.sort((a, b) => {
    const akind = a.key === 'cal' ? 'cal_cap' : 'goal'
    const bkind = b.key === 'cal' ? 'cal_cap' : 'goal'
    return gapScore(b.pct, bkind) - gapScore(a.pct, akind)
  })
  return out
})

const focusRing = computed<Ring | null>(() => {
  const list = sortedRings.value
  if (list.length === 0) return null
  // Skip sleep as focus (retrospective, can't fix today).
  const candidate = list[0].key === 'sleep' ? list[1] ?? list[0] : list[0]
  // Don't bother promoting if the gap is tiny — all metrics on track.
  const kind = candidate.key === 'cal' ? 'cal_cap' : 'goal'
  if (gapScore(candidate.pct, kind) < 25) return null
  return candidate
})

const secondaryRings = computed<Ring[]>(() => {
  const focus = focusRing.value
  return rings.value.filter((r) => !focus || r.key !== focus.key)
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
    <!-- Focus ring (the metric most off-target) gets visual dominance.
         When all metrics are on track, this section hides and everything
         sits in the compact row below. -->
    <div
      v-if="focusRing"
      class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3 flex items-center gap-4 mb-3"
    >
      <div class="relative shrink-0" style="width: 96px; height: 96px;">
        <svg width="96" height="96" class="-rotate-90">
          <circle cx="48" cy="48" :r="(96 - STROKE) / 2"
            fill="none" class="stroke-canvas" :stroke-width="STROKE" />
          <circle cx="48" cy="48" :r="(96 - STROKE) / 2"
            fill="none"
            :class="ringStrokeClass(focusRing.color)"
            :stroke="ringStrokeAttr(focusRing.color)"
            :stroke-width="STROKE"
            stroke-linecap="round"
            :stroke-dasharray="2 * Math.PI * ((96 - STROKE) / 2)"
            :stroke-dashoffset="(2 * Math.PI * ((96 - STROKE) / 2)) * (1 - Math.min(100, focusRing.pct) / 100)" />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span
            class="text-base font-bold tabular-nums"
            :class="valueColorClass(focusRing.color)"
            :style="valueInlineColor(focusRing.color) ? { color: valueInlineColor(focusRing.color) } : {}"
          >{{ Math.round(focusRing.pct) }}%</span>
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">Today's focus</div>
        <div class="text-base font-bold text-ink leading-tight">{{ focusRing.label }} · {{ focusRing.display }}</div>
        <div class="text-[11px] text-ink-muted leading-snug">{{ focusRing.helper }}</div>
      </div>
    </div>

    <!-- Secondary rings — compact, demoted. Same data, less visual weight.
         If a focus is showing, this row covers the other 4. If not, all
         5 render here (everything on track, no anchor needed). -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="r in secondaryRings" :key="r.key" class="flex items-center gap-2">
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
          <div class="text-sm font-semibold text-ink tabular-nums leading-tight">{{ r.display }}</div>
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
