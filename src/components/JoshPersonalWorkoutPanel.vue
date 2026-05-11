<script setup lang="ts">
/**
 * Today's workout panel — real exercises with per-set logging.
 *
 * Reads today's planned exercises (from the weekly plan), shows N
 * input rows per exercise (one per planned set), saves weight + reps
 * + RPE per set to personal_workouts on blur. Surfaces last session's
 * actuals inline so Josh sees "last time: 145×6" while filling in
 * today's row.
 */
import { computed, watch } from 'vue'
import { useWorkoutLog, parsePlannedSets, type PlannedExercise, type ActualSet } from '@/lib/clients/josh-personal/workoutsApi'

const props = defineProps<{
  workout: string | null              // e.g. "Push"
  exercises: PlannedExercise[]        // from weekly plan
}>()

const log = useWorkoutLog()

// On mount + whenever planned exercises change, ensure today's row exists
async function syncPlan() {
  if (!props.workout || props.exercises.length === 0) return
  await log.ensureTodayPlanned({
    workoutType: (props.workout ?? '').toLowerCase().replace(/\s+/g, '_'),
    plannedExercises: props.exercises,
  })
}

// React to props changes (e.g., plan regenerated mid-day)
watch(() => props.exercises, syncPlan, { immediate: true, deep: true })

// Per-exercise expanded sets — derived from today's row
const rows = computed(() => {
  if (!log.todayRow.value) {
    return props.exercises.map((ex) => ({
      planned: ex,
      setCount: parsePlannedSets(ex.sets).length,
      actualSets: parsePlannedSets(ex.sets).map(() => ({ weight: null, reps: null, rpe: null }) as ActualSet),
      lastSession: log.lastSessionFor(ex.name),
    }))
  }
  return log.todayRow.value.actual_exercises.map((ae, idx) => {
    const planned = log.todayRow.value!.planned_exercises?.[idx] ?? props.exercises[idx] ?? { name: ae.name, sets: '', load: '' }
    return {
      planned,
      setCount: ae.sets.length,
      actualSets: ae.sets,
      lastSession: log.lastSessionFor(ae.name),
    }
  })
})

async function onSetChange(exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) {
  const num = value === '' ? null : Number(value)
  if (value !== '' && (Number.isNaN(num) || num! < 0)) return
  const cur = rows.value[exIdx].actualSets[setIdx]
  await log.updateSet({
    exerciseIdx: exIdx,
    setIdx,
    weight: field === 'weight' ? num : cur.weight ?? null,
    reps: field === 'reps' ? num : cur.reps ?? null,
    rpe: field === 'rpe' ? num : cur.rpe ?? null,
  })
}

function formatLastSets(sets: ActualSet[]): string {
  return sets
    .map((s) => `${s.weight ?? '—'}×${s.reps ?? '—'}${s.rpe ? ` @${s.rpe}` : ''}`)
    .join(', ')
}

function formatLastDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const isComplete = computed(() => log.todayRow.value?.status === 'completed')
const isSkipped = computed(() => log.todayRow.value?.status === 'skipped')
const isInProgress = computed(() => log.todayRow.value?.status === 'in_progress')

const hasAnyLogged = computed(() =>
  rows.value.some((r) => r.actualSets.some((s) => s.weight && s.reps)),
)
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today's workout</div>
        <div class="font-semibold text-ink mt-0.5 flex items-center gap-2">
          <span>{{ workout || 'Rest day' }}</span>
          <span v-if="isComplete" class="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">✓ Done</span>
          <span v-else-if="isSkipped" class="rounded-full bg-ink-muted/15 text-ink-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Skipped</span>
          <span v-else-if="isInProgress" class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">In progress</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="workout && !isComplete && !isSkipped"
          type="button"
          class="rounded-md border border-divider text-ink-muted bg-surface-raised px-2.5 py-1 text-[11px] font-medium hover:border-warn hover:text-warn"
          @click="log.markSkipped"
        >Skip</button>
        <button
          v-if="workout && hasAnyLogged && !isComplete"
          type="button"
          class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          @click="log.markCompleted()"
        >Mark complete</button>
      </div>
    </header>

    <div v-if="!workout || exercises.length === 0" class="px-4 py-6 text-center text-xs text-ink-muted">
      Rest day. Walk, hydrate, sleep. Sage will check HRV in the morning.
    </div>

    <ul v-else class="divide-y divide-divider">
      <li v-for="(row, exIdx) in rows" :key="row.planned.name + exIdx" class="px-4 py-3">
        <!-- Exercise header -->
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <div class="font-semibold text-ink text-sm">{{ row.planned.name }}</div>
            <div class="text-[11px] text-ink-muted">
              Target: <span class="font-mono">{{ row.planned.sets }} @ {{ row.planned.load }}</span>
              <span v-if="row.planned.notes" class="ml-1.5 italic">· {{ row.planned.notes }}</span>
            </div>
          </div>
          <div v-if="row.lastSession" class="text-right text-[10px] text-ink-disabled shrink-0 max-w-[180px]">
            <div class="font-semibold text-ink-muted">Last ({{ formatLastDate(row.lastSession.date) }})</div>
            <div class="font-mono">{{ formatLastSets(row.lastSession.sets) }}</div>
          </div>
        </div>

        <!-- Set input rows -->
        <div class="space-y-1.5">
          <div
            v-for="(set, setIdx) in row.actualSets"
            :key="setIdx"
            class="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center"
          >
            <span class="text-[10px] text-ink-disabled font-mono tabular-nums text-right">
              Set {{ setIdx + 1 }}
            </span>
            <label class="flex items-center gap-1.5">
              <span class="text-[10px] text-ink-muted shrink-0">lbs</span>
              <input
                type="number"
                step="0.5"
                inputmode="decimal"
                :value="set.weight ?? ''"
                placeholder="—"
                :disabled="isComplete || isSkipped"
                class="w-full rounded-md border border-divider bg-surface px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none disabled:opacity-50"
                @change="onSetChange(exIdx, setIdx, 'weight', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="flex items-center gap-1.5">
              <span class="text-[10px] text-ink-muted shrink-0">reps</span>
              <input
                type="number"
                step="1"
                inputmode="numeric"
                :value="set.reps ?? ''"
                placeholder="—"
                :disabled="isComplete || isSkipped"
                class="w-full rounded-md border border-divider bg-surface px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none disabled:opacity-50"
                @change="onSetChange(exIdx, setIdx, 'reps', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="flex items-center gap-1.5">
              <span class="text-[10px] text-ink-muted shrink-0">RPE</span>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                inputmode="decimal"
                :value="set.rpe ?? ''"
                placeholder="opt"
                :disabled="isComplete || isSkipped"
                class="w-full rounded-md border border-divider bg-surface px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none disabled:opacity-50"
                @change="onSetChange(exIdx, setIdx, 'rpe', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="log.error.value" class="px-4 py-2 text-xs text-danger border-t border-divider">{{ log.error.value }}</div>
  </section>
</template>
