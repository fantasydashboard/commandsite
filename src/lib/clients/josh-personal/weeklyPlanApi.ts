/**
 * Josh Personal — weekly plan composable.
 *
 * Reads the latest plan from personal_weekly_plans, exposes
 * regenerate() + approve() actions. Plan is upserted on
 * (user_id, week_starting) so regenerations overwrite the week
 * before approval.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import type { DayPlan, Swap, ShopItem } from './health'

export interface WeeklyPlan {
  id: string
  user_id: string
  week_starting: string                                  // ISO date (Monday)
  strategy: string | null
  days: DayPlan[]
  shopping_list: ShopItem[]
  swaps: Swap[]
  totals: {
    avg_cal: number
    avg_protein: number
    workout_days: number
    deficit_vs_maintain: number
    shopping_count: number
    shopping_estimate_usd: number
  } | null
  generated_at: string
  generated_by: 'manual' | 'cron' | 'auto_after_data'
  model: string | null
  context_snapshot: unknown
  approved_at: string | null
  created_at: string
  updated_at: string
}

export function useWeeklyPlan() {
  const plan = ref<WeeklyPlan | null>(null)
  const loading = ref(true)
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      plan.value = null
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_weekly_plans')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('week_starting', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) error.value = e.message
    else plan.value = (data as unknown as WeeklyPlan | null) ?? null
    loading.value = false
  }

  async function callGenerator(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (generating.value) return { ok: false, error: 'Already generating' }
    generating.value = true
    error.value = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-weekly-plan`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, error: `${res.status}: ${detail.slice(0, 250)}` }
      }
      const data = await res.json() as { plans: { status: string; error?: string }[] }
      const first = data.plans?.[0]
      if (first?.status === 'error') return { ok: false, error: first.error ?? 'Generation failed' }
      await load()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      generating.value = false
    }
  }

  async function regenerate(): Promise<{ ok: boolean; error?: string }> {
    return callGenerator({})
  }

  /** Revise the existing plan with Josh's feedback ("swap fish for chicken", etc.). */
  async function revise(revisionRequest: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = revisionRequest.trim()
    if (!trimmed) return { ok: false, error: 'Tell Sage what to change' }
    if (!plan.value) return { ok: false, error: 'No plan to revise — generate one first' }
    return callGenerator({
      week_starting: plan.value.week_starting,
      revision_request: trimmed,
    })
  }

  async function approve(): Promise<{ ok: boolean; error?: string }> {
    if (!plan.value) return { ok: false, error: 'No plan to approve' }
    const { error: e } = await supabase
      .from('personal_weekly_plans')
      .update({ approved_at: new Date().toISOString() } as never)
      .eq('id', plan.value.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  const hasPlan = computed(() => plan.value !== null)
  const isApproved = computed(() => plan.value?.approved_at != null)

  /** Today's slice from the active week (or null if today not in plan). */
  const todaySlice = computed<DayPlan | null>(() => {
    if (!plan.value) return null
    const today = new Date().toISOString().slice(0, 10)
    return plan.value.days.find((d) => d.date === today) ?? null
  })

  onMounted(load)

  return { plan, loading, generating, error, hasPlan, isApproved, todaySlice, load, regenerate, revise, approve }
}
