/**
 * Josh Personal — experiments composable.
 *
 * Reads from personal_experiments. Sage writes here via tool calls;
 * the UI is read-only for now (no manual create surface).
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export type ExperimentStatus = 'active' | 'completed' | 'abandoned'
export type ExperimentVerdict = 'confirmed' | 'partial' | 'refuted' | 'inconclusive' | 'pending'
export type ExperimentCategory = 'nutrition' | 'sleep' | 'activity' | 'hydration' | 'supplement' | 'recovery' | 'other'

export interface Experiment {
  id: string
  user_id: string
  title: string
  hypothesis: string
  category: ExperimentCategory
  target_change_id: string | null
  decision_summary: string
  start_date: string
  duration_days: number
  end_date: string
  primary_metric: string
  baseline_value: number | null
  baseline_snapshot: Record<string, unknown>
  success_criteria: string
  status: ExperimentStatus
  end_value: number | null
  end_snapshot: Record<string, unknown> | null
  verdict: ExperimentVerdict | null
  verdict_notes: string | null
  ended_at: string | null
  source: 'sage' | 'manual'
  created_at: string
  updated_at: string
}

function todayLocalDateIso(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00').getTime()
  const b = new Date(bIso + 'T00:00:00').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

export function useExperiments() {
  const experiments = ref<Experiment[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      experiments.value = []
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_experiments')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('end_date', { ascending: true })
      .limit(50)
    if (e) error.value = e.message
    else experiments.value = ((data ?? []) as unknown as Experiment[])
    loading.value = false
  }

  const active = computed<Experiment[]>(() =>
    experiments.value.filter((x) => x.status === 'active')
      .sort((a, b) => a.end_date.localeCompare(b.end_date)),
  )

  const recentlyCompleted = computed<Experiment[]>(() =>
    experiments.value
      .filter((x) => x.status === 'completed' || x.status === 'abandoned')
      .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''))
      .slice(0, 5),
  )

  /** For an active experiment, days remaining (negative = ready for verdict). */
  function daysRemaining(exp: Experiment): number {
    return daysBetween(todayLocalDateIso(), exp.end_date)
  }

  /** % of duration elapsed (0-100 clamped). */
  function progressPct(exp: Experiment): number {
    const total = exp.duration_days
    const elapsed = total - daysRemaining(exp)
    return Math.max(0, Math.min(100, (elapsed / Math.max(1, total)) * 100))
  }

  onMounted(load)

  return { experiments, loading, error, active, recentlyCompleted, daysRemaining, progressPct, load }
}
