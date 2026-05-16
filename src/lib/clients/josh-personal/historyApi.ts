/**
 * Josh Personal — History tab composables.
 *
 * Three reads:
 *   useSageSummary         — cached 30-day recap with refresh()
 *   useSageObservations    — long-term observations Sage persisted
 *   useDecisionTimeline    — experiments + target_changes interleaved
 *
 * Plus useWorkoutHistory for the Plan-tab strength log.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

// ── Sage summary (cached 30-day recap) ──────────────────────────────

export type SummaryHighlight = {
  label: string
  kind: 'experiment_completed' | 'experiment_active' | 'target_change' | 'adherence' | 'weight' | 'workout' | 'pattern'
}

export interface SageSummary {
  user_id: string
  body: string
  highlights: SummaryHighlight[]
  window_start: string
  window_end: string
  generated_at: string
  updated_at: string
}

export function useSageSummary() {
  const state = ref<SageSummary | null>(null)
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { state.value = null; loading.value = false; return }
    const { data, error: e } = await supabase
      .from('personal_sage_summary')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (e) error.value = e.message
    else state.value = (data as unknown as SageSummary | null) ?? null
    loading.value = false
  }

  async function refresh(): Promise<{ ok: boolean; error?: string }> {
    if (refreshing.value) return { ok: false, error: 'Already refreshing' }
    refreshing.value = true
    error.value = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-history-summary`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        error.value = `${res.status}: ${detail.slice(0, 200)}`
        return { ok: false, error: error.value }
      }
      await load()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error.value = msg
      return { ok: false, error: msg }
    } finally {
      refreshing.value = false
    }
  }

  const refreshedAgo = computed(() => {
    if (!state.value) return ''
    const then = new Date(state.value.generated_at).getTime()
    const mins = Math.floor((Date.now() - then) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })

  onMounted(load)
  return { state, loading, refreshing, error, refresh, refreshedAgo, load }
}

// ── Sage observations (long-term memory) ────────────────────────────

export interface SageObservation {
  id: string
  body: string
  tags: string[]
  confidence: 'hunch' | 'pattern' | 'confirmed'
  evidence_refs: unknown[]
  status: 'active' | 'archived'
  set_at: string
}

export function useSageObservations() {
  const observations = ref<SageObservation[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { observations.value = []; loading.value = false; return }
    const { data, error: e } = await supabase
      .from('personal_sage_observations')
      .select('id, body, tags, confidence, evidence_refs, status, set_at')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .order('set_at', { ascending: false })
      .limit(100)
    if (e) error.value = e.message
    else observations.value = (data ?? []) as unknown as SageObservation[]
    loading.value = false
  }

  async function archive(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('personal_sage_observations')
      .update({ status: 'archived', archived_at: new Date().toISOString() } as never)
      .eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  onMounted(load)
  return { observations, loading, error, load, archive }
}

// ── Decision timeline (experiments + target_changes interleaved) ────

export type DecisionEntryKind = 'experiment' | 'target_change'

export interface DecisionEntry {
  kind: DecisionEntryKind
  id: string
  occurred_at: string  // unified timestamp for sort
  // Pulled-through fields by kind:
  // experiment
  title?: string
  hypothesis?: string
  category?: string
  primary_metric?: string
  baseline_value?: number | null
  end_value?: number | null
  status?: 'active' | 'completed' | 'abandoned'
  verdict?: string | null
  verdict_notes?: string | null
  start_date?: string
  end_date?: string
  // target_change
  scope?: 'target' | 'profile'
  field_key?: string
  old_value?: unknown
  new_value?: unknown
  reason?: string | null
  source?: 'sage' | 'manual'
}

export function useDecisionTimeline(daysBack = 90) {
  const entries = ref<DecisionEntry[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { entries.value = []; loading.value = false; return }
    const since = new Date(); since.setDate(since.getDate() - daysBack)
    const sinceIso = since.toISOString()
    const sinceDate = sinceIso.slice(0, 10)

    const [expR, tcR] = await Promise.all([
      supabase.from('personal_experiments')
        .select('id, title, hypothesis, category, primary_metric, baseline_value, end_value, status, verdict, verdict_notes, start_date, end_date, ended_at, created_at')
        .eq('user_id', userData.user.id)
        .gte('start_date', sinceDate)
        .order('start_date', { ascending: false }),
      supabase.from('personal_target_changes')
        .select('id, scope, field_key, old_value, new_value, reason, source, changed_at')
        .eq('user_id', userData.user.id)
        .gte('changed_at', sinceIso)
        .order('changed_at', { ascending: false }),
    ])

    if (expR.error) error.value = expR.error.message
    if (tcR.error) error.value = (error.value ? error.value + ' · ' : '') + tcR.error.message

    const merged: DecisionEntry[] = []
    for (const e of ((expR.data ?? []) as unknown[]) as Array<Record<string, unknown>>) {
      merged.push({
        kind: 'experiment',
        id: String(e.id),
        // Use ended_at when present (timeline cluster around outcome)
        occurred_at: String(e.ended_at ?? e.created_at ?? e.start_date),
        title: e.title as string,
        hypothesis: e.hypothesis as string,
        category: e.category as string,
        primary_metric: e.primary_metric as string,
        baseline_value: e.baseline_value as number | null,
        end_value: e.end_value as number | null,
        status: e.status as 'active' | 'completed' | 'abandoned',
        verdict: (e.verdict as string | null) ?? null,
        verdict_notes: (e.verdict_notes as string | null) ?? null,
        start_date: e.start_date as string,
        end_date: e.end_date as string,
      })
    }
    for (const c of ((tcR.data ?? []) as unknown[]) as Array<Record<string, unknown>>) {
      merged.push({
        kind: 'target_change',
        id: String(c.id),
        occurred_at: String(c.changed_at),
        scope: c.scope as 'target' | 'profile',
        field_key: c.field_key as string,
        old_value: c.old_value,
        new_value: c.new_value,
        reason: (c.reason as string | null) ?? null,
        source: c.source as 'sage' | 'manual',
      })
    }
    merged.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    entries.value = merged
    loading.value = false
  }

  onMounted(load)
  return { entries, loading, error, load }
}

// ── Workout history (for Plan tab) ──────────────────────────────────

export interface ActualSet { weight: number | null; reps: number | null; rpe?: number | null }
export interface ActualExercise { name: string; sets: ActualSet[]; notes?: string }
export interface WorkoutHistoryRow {
  id: string
  workout_date: string
  workout_type: string
  status: 'planned' | 'in_progress' | 'completed' | 'skipped'
  actual_exercises: ActualExercise[]
  duration_min: number | null
  notes: string | null
}

export function useWorkoutHistory(daysBack = 30) {
  const workouts = ref<WorkoutHistoryRow[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { workouts.value = []; loading.value = false; return }
    const since = new Date(); since.setDate(since.getDate() - daysBack)
    const sinceDate = since.toISOString().slice(0, 10)
    const { data, error: e } = await supabase
      .from('personal_workouts')
      .select('id, workout_date, workout_type, status, actual_exercises, duration_min, notes')
      .eq('user_id', userData.user.id)
      .gte('workout_date', sinceDate)
      .order('workout_date', { ascending: false })
    if (e) error.value = e.message
    else workouts.value = (data ?? []) as unknown as WorkoutHistoryRow[]
    loading.value = false
  }

  /** Per-exercise top-set (heaviest weight × any reps) progression for the major compounds. */
  const compoundProgressions = computed(() => {
    const TARGET_NAMES = [
      'bench press', 'back squat', 'front squat', 'deadlift',
      'romanian deadlift', 'overhead press', 'barbell row', 'weighted pull-up',
    ]
    const out: Record<string, { date: string; topWeight: number; reps: number }[]> = {}
    // Iterate oldest-first so the chart reads left-to-right
    const sorted = [...workouts.value].sort((a, b) => a.workout_date.localeCompare(b.workout_date))
    for (const w of sorted) {
      if (w.status !== 'completed') continue
      for (const ex of w.actual_exercises ?? []) {
        const name = (ex.name ?? '').toLowerCase()
        if (!TARGET_NAMES.some((t) => name.includes(t))) continue
        const top = (ex.sets ?? []).reduce<{ weight: number; reps: number } | null>((acc, s) => {
          if (s.weight == null) return acc
          if (!acc || s.weight > acc.weight) return { weight: Number(s.weight), reps: Number(s.reps ?? 0) }
          return acc
        }, null)
        if (!top) continue
        if (!out[name]) out[name] = []
        out[name].push({ date: w.workout_date, topWeight: top.weight, reps: top.reps })
      }
    }
    return out
  })

  onMounted(load)
  return { workouts, loading, error, compoundProgressions, load }
}
