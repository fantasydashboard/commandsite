<script setup lang="ts">
/**
 * Josh Personal — past workouts + compound progression strip.
 *
 * Lives on the Plan tab below the active week. Two sub-views:
 *   - Recent sessions list (last 30 days): date / type / set summary
 *   - Compound progression sparklines for the major lifts
 */
import { computed, ref } from 'vue'
import {
  useWorkoutHistory,
  type WorkoutHistoryRow,
  type ActualSet,
} from '@/lib/clients/josh-personal/historyApi'

const { workouts, compoundProgressions, loading } = useWorkoutHistory(30)

// Title-case the lift name keys (which were stored lowercased).
const compoundEntries = computed(() => {
  return Object.entries(compoundProgressions.value).map(([key, points]) => ({
    name: key.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
    points,
  })).sort((a, b) => b.points.length - a.points.length)
})

const completedWorkouts = computed<WorkoutHistoryRow[]>(() =>
  workouts.value.filter((w) => w.status === 'completed' || w.status === 'in_progress')
)

const showAll = ref(false)
const visibleWorkouts = computed(() => showAll.value ? completedWorkouts.value : completedWorkouts.value.slice(0, 8))

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtSets(sets: ActualSet[]): string {
  return sets
    .filter((s) => s.weight !== null || s.reps !== null)
    .map((s) => `${s.weight ?? '—'}×${s.reps ?? '—'}${s.rpe ? `@${s.rpe}` : ''}`)
    .join(', ')
}

// Sparkline geometry
const SPARK_W = 240
const SPARK_H = 36

function sparklinePath(points: { topWeight: number }[]): string {
  if (points.length < 2) return ''
  const vals = points.map((p) => p.topWeight)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const step = SPARK_W / (points.length - 1)
  return points.map((p, i) => {
    const x = i * step
    const y = SPARK_H - ((p.topWeight - min) / range) * SPARK_H
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function topWeightDelta(points: { topWeight: number }[]): number | null {
  if (points.length < 2) return null
  return points[points.length - 1].topWeight - points[0].topWeight
}
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Strength log · last 30 days</div>
      <div class="text-[11px] text-ink-muted mt-0.5">
        <template v-if="loading">Loading…</template>
        <template v-else-if="completedWorkouts.length === 0">No completed workouts yet. Log sets via the Today tab's workout panel.</template>
        <template v-else>{{ completedWorkouts.length }} session{{ completedWorkouts.length === 1 ? '' : 's' }} logged · top-set progression on the major lifts</template>
      </div>
    </header>

    <!-- Compound progression sparklines -->
    <div v-if="compoundEntries.length > 0" class="px-4 py-3 border-b border-divider grid sm:grid-cols-2 gap-3">
      <div v-for="c in compoundEntries" :key="c.name" class="rounded-md border border-divider p-3">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <div class="text-[11px] font-semibold text-ink">{{ c.name }}</div>
          <div class="text-[10px] text-ink-muted tabular-nums">{{ c.points.length }} session{{ c.points.length === 1 ? '' : 's' }}</div>
        </div>
        <svg v-if="c.points.length >= 2" :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" class="w-full h-9 block">
          <path :d="sparklinePath(c.points)" fill="none" stroke="rgb(var(--color-brand))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div v-else class="text-[10px] text-ink-disabled italic mt-1">Need 2+ sessions for a trend</div>
        <div class="text-[10px] text-ink-muted mt-1 tabular-nums">
          <template v-if="topWeightDelta(c.points) !== null">
            Top set: {{ c.points[0].topWeight }} → {{ c.points[c.points.length - 1].topWeight }} lbs
            <span :class="(topWeightDelta(c.points) ?? 0) > 0 ? 'text-success' : (topWeightDelta(c.points) ?? 0) < 0 ? 'text-warn' : ''">
              ({{ (topWeightDelta(c.points) ?? 0) > 0 ? '+' : '' }}{{ (topWeightDelta(c.points) ?? 0).toFixed(0) }} lbs)
            </span>
          </template>
          <template v-else-if="c.points.length === 1">
            {{ c.points[0].topWeight }} lbs × {{ c.points[0].reps }}
          </template>
        </div>
      </div>
    </div>

    <!-- Recent sessions list -->
    <ul v-if="visibleWorkouts.length > 0" class="divide-y divide-divider">
      <li v-for="w in visibleWorkouts" :key="w.id" class="px-4 py-3">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <div class="text-sm font-semibold text-ink capitalize">{{ w.workout_type.replace(/_/g, ' ') }} · {{ fmtDate(w.workout_date) }}</div>
          <span
            class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
            :class="w.status === 'completed' ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand'"
          >{{ w.status === 'completed' ? '✓ done' : 'in progress' }}</span>
        </div>
        <ul class="space-y-0.5">
          <li v-for="(ex, i) in w.actual_exercises ?? []" :key="i" class="text-[11px] text-ink-muted leading-snug">
            <span class="text-ink font-medium">{{ ex.name }}:</span>
            <span class="font-mono ml-1">{{ fmtSets(ex.sets) }}</span>
          </li>
        </ul>
        <div v-if="w.duration_min" class="text-[10px] text-ink-disabled mt-1 tabular-nums">{{ w.duration_min }} min</div>
      </li>
    </ul>
    <div v-if="completedWorkouts.length > 8" class="px-4 py-2 text-center border-t border-divider">
      <button type="button" class="text-[11px] text-brand font-semibold hover:underline" @click="showAll = !showAll">
        {{ showAll ? 'Show recent only' : `Show all ${completedWorkouts.length}` }}
      </button>
    </div>
  </section>
</template>
