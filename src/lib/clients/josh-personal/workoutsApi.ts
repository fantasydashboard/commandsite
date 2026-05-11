/**
 * Josh Personal — workout logging composable.
 *
 * Reads/writes personal_workouts. The Today page uses this to:
 * - load today's planned workout (from the weekly plan or from a
 *   previously-saved 'planned' row)
 * - log actual sets (weight + reps + RPE) as Josh performs them
 * - mark the workout complete
 *
 * History fetch: getPastSessionsForExercise(name) returns the most
 * recent N performances of a named exercise so the UI can show
 * "last time: 145×6, 145×5, 140×5" inline next to today's planned sets.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export interface PlannedExercise {
  name: string
  sets: string         // "3 × 6"
  load: string         // "145 lbs"
  notes?: string
}

export interface ActualSet {
  weight: number | null
  reps: number | null
  rpe?: number | null
}

export interface ActualExercise {
  name: string
  sets: ActualSet[]
  notes?: string
}

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'

export interface WorkoutRow {
  id: string
  user_id: string
  workout_date: string         // ISO date
  workout_type: string         // 'push' | 'pull' | 'legs' | etc.
  planned_exercises: PlannedExercise[] | null
  actual_exercises: ActualExercise[]
  duration_min: number | null
  notes: string | null
  status: WorkoutStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useWorkoutLog() {
  const todayRow = ref<WorkoutRow | null>(null)
  const recent = ref<WorkoutRow[]>([])  // last ~30 days
  const loading = ref(true)
  const error = ref<string | null>(null)
  const saving = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      loading.value = false
      return
    }

    const today = localDate(new Date())
    const thirtyAgo = new Date()
    thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const since = localDate(thirtyAgo)

    const { data, error: e } = await supabase
      .from('personal_workouts')
      .select('*')
      .eq('user_id', userData.user.id)
      .gte('workout_date', since)
      .order('workout_date', { ascending: false })
      .limit(60)
    if (e) {
      error.value = e.message
      loading.value = false
      return
    }
    const rows = (data ?? []) as unknown as WorkoutRow[]
    recent.value = rows
    todayRow.value = rows.find((r) => r.workout_date === today) ?? null
    loading.value = false
  }

  /**
   * Make sure a row exists for today with the given planned exercises
   * (idempotent — won't overwrite an existing row's actual_exercises).
   */
  async function ensureTodayPlanned(input: {
    workoutType: string
    plannedExercises: PlannedExercise[]
  }): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in' }
    const today = localDate(new Date())

    // If a row already exists, keep it. Only insert if missing.
    if (todayRow.value) return { ok: true }

    const payload = {
      user_id: userData.user.id,
      workout_date: today,
      workout_type: input.workoutType,
      planned_exercises: input.plannedExercises,
      actual_exercises: input.plannedExercises.map((p) => ({
        name: p.name,
        sets: parsePlannedSets(p.sets).map(() => ({ weight: null, reps: null, rpe: null })),
      })),
      status: 'planned' as WorkoutStatus,
    }
    const { error: e } = await supabase
      .from('personal_workouts')
      .upsert(payload as never, { onConflict: 'user_id,workout_date' })
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  async function updateSet(input: {
    exerciseIdx: number
    setIdx: number
    weight: number | null
    reps: number | null
    rpe?: number | null
  }): Promise<{ ok: boolean; error?: string }> {
    if (!todayRow.value) return { ok: false, error: 'No workout for today' }
    saving.value = true
    try {
      const updated = todayRow.value.actual_exercises.map((ex, ei) => {
        if (ei !== input.exerciseIdx) return ex
        const newSets = [...ex.sets]
        newSets[input.setIdx] = {
          weight: input.weight,
          reps: input.reps,
          rpe: input.rpe ?? null,
        }
        return { ...ex, sets: newSets }
      })
      const newStatus: WorkoutStatus =
        todayRow.value.status === 'planned' ? 'in_progress' : todayRow.value.status

      const { error: e } = await supabase
        .from('personal_workouts')
        .update({ actual_exercises: updated, status: newStatus } as never)
        .eq('id', todayRow.value.id)
      if (e) return { ok: false, error: e.message }
      await load()
      return { ok: true }
    } finally {
      saving.value = false
    }
  }

  async function markCompleted(durationMin?: number, notes?: string): Promise<{ ok: boolean; error?: string }> {
    if (!todayRow.value) return { ok: false, error: 'No workout for today' }
    const { error: e } = await supabase
      .from('personal_workouts')
      .update({
        status: 'completed' as WorkoutStatus,
        completed_at: new Date().toISOString(),
        duration_min: durationMin ?? todayRow.value.duration_min,
        notes: notes ?? todayRow.value.notes,
      } as never)
      .eq('id', todayRow.value.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  async function markSkipped(): Promise<{ ok: boolean; error?: string }> {
    if (!todayRow.value) return { ok: false, error: 'No workout for today' }
    const { error: e } = await supabase
      .from('personal_workouts')
      .update({ status: 'skipped' as WorkoutStatus } as never)
      .eq('id', todayRow.value.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  /**
   * Find the most recent prior performance of a named exercise.
   * Returns the actual sets so the UI can show "last time: 145×6, 145×5, 140×5".
   */
  function lastSessionFor(exerciseName: string): { date: string; sets: ActualSet[] } | null {
    const today = todayRow.value?.workout_date
    for (const row of recent.value) {
      if (row.workout_date === today) continue  // skip today
      if (row.status === 'skipped') continue
      const match = row.actual_exercises.find(
        (e) => e.name.toLowerCase() === exerciseName.toLowerCase(),
      )
      if (match && match.sets.some((s) => s.weight && s.reps)) {
        return {
          date: row.workout_date,
          sets: match.sets.filter((s) => s.weight && s.reps),
        }
      }
    }
    return null
  }

  const isComplete = computed(() => todayRow.value?.status === 'completed')
  const isSkipped = computed(() => todayRow.value?.status === 'skipped')

  onMounted(load)

  return {
    todayRow,
    recent,
    loading,
    error,
    saving,
    isComplete,
    isSkipped,
    load,
    ensureTodayPlanned,
    updateSet,
    markCompleted,
    markSkipped,
    lastSessionFor,
  }
}

/**
 * Parse a "sets" string like "3 × 6" or "4 × 8-10" into N empty set
 * objects so the UI can render N input rows.
 */
export function parsePlannedSets(sets: string): { reps_target: string }[] {
  const m = sets.match(/(\d+)\s*[×x]\s*(.+)/i)
  if (!m) return [{ reps_target: sets }]
  const count = parseInt(m[1], 10)
  const reps = m[2].trim()
  return Array.from({ length: count }, () => ({ reps_target: reps }))
}
