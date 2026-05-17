/**
 * Josh Personal — weekly plan composable.
 *
 * Reads the latest plan from personal_weekly_plans, exposes
 * regenerate() + approve() actions. Plan is upserted on
 * (user_id, week_starting) so regenerations overwrite the week
 * before approval.
 *
 * v2 (meal-planning-v2): supports a flexible planning window
 * (start_date + length_days), per-plan servings_by_slot, and
 * included_slots, plus a feedback loop (submitFeedback, markReviewed,
 * fetchPriorUnreviewed).
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import type { DayPlan, Swap, ShopItem } from './health'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export interface WeeklyPlan {
  id: string
  user_id: string
  week_starting: string                                  // ISO date (start_date)
  end_date: string                                       // ISO date (inclusive end)
  servings_by_slot: Record<MealSlot, number>
  included_slots: MealSlot[]
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
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface MealFeedbackRow {
  id: string
  plan_id: string
  day_idx: number
  meal_slot: MealSlot
  meal_name: string | null
  reaction: 'loved' | 'liked' | 'neutral' | 'never_again'
  reason_category: string | null
  flagged_ingredient: string | null
  notes: string | null
  source: 'inline' | 'review' | 'chat'
  created_at: string
}

// Placeholder used when Sage produces a plan with a missing meal slot.
// Renders as "—" in the UI so the page never crashes on undefined.name.
const PLACEHOLDER_MEAL = {
  name: '—',
  cal: 0,
  protein: 0,
  detail: 'Sage did not provide this slot (revision dropped it). Ask her to add it back.',
} as const

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks']

/**
 * Defensive normalizer — runs on every read from the DB. Ensures every
 * day in `plan.days` has all four meal slots filled with at least a
 * placeholder Meal so downstream components can read `.name` / `.cal`
 * etc. without crashing.
 *
 * This is the "normalize on read" half of the bad-data defense. The
 * "tighten on write" half lives in the generate-weekly-plan and
 * ask-sage edge functions where we should refuse to save a plan with
 * missing slots (TODO if Sage continues producing bad shapes here).
 *
 * Returns the same plan object reference but with `.days[].meals`
 * mutated in place. Logs a single warning per call if any slot was
 * filled — surfaces upstream bugs without spamming the console.
 */
function normalizePlan(p: WeeklyPlan | null): WeeklyPlan | null {
  if (!p || !Array.isArray(p.days)) return p
  let filled = 0
  for (const day of p.days) {
    if (!day.meals || typeof day.meals !== 'object') {
      // deno-lint-ignore no-explicit-any
      (day as any).meals = { breakfast: { ...PLACEHOLDER_MEAL }, lunch: { ...PLACEHOLDER_MEAL }, dinner: { ...PLACEHOLDER_MEAL }, snacks: { ...PLACEHOLDER_MEAL } }
      filled += 4
      continue
    }
    for (const slot of ALL_SLOTS) {
      // deno-lint-ignore no-explicit-any
      const meals = day.meals as any
      if (!meals[slot] || typeof meals[slot] !== 'object' || typeof meals[slot].name !== 'string') {
        meals[slot] = { ...PLACEHOLDER_MEAL }
        filled++
      }
    }
  }
  if (filled > 0) {
    console.warn(`[weeklyPlan] normalized ${filled} missing meal slot(s) — upstream produced an incomplete plan`)
  }
  return p
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
    else plan.value = normalizePlan((data as unknown as WeeklyPlan | null) ?? null)
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

  /** Generate with full v2 params (start date / length / servings / slots). */
  async function generateWithOptions(options: {
    start_date: string
    length_days: number
    servings_by_slot: Record<MealSlot, number>
    included_slots: MealSlot[]
    weekly_preferences?: string
  }): Promise<{ ok: boolean; error?: string }> {
    return callGenerator(options)
  }

  /** Revise the existing plan with Josh's feedback ("swap fish for chicken", etc.). */
  async function revise(revisionRequest: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = revisionRequest.trim()
    if (!trimmed) return { ok: false, error: 'Tell Sage what to change' }
    if (!plan.value) return { ok: false, error: 'No plan to revise — generate one first' }
    return callGenerator({
      start_date: plan.value.week_starting,
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

  /** Inline 👎/👍 — minimal write, no reason yet. Reason gets filled at review. */
  async function quickReact(args: {
    plan_id: string
    day_idx: number
    meal_slot: MealSlot
    meal_name?: string | null
    reaction: 'loved' | 'never_again'
  }): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in' }
    const { error: e } = await supabase.from('personal_meal_feedback').insert({
      user_id: userData.user.id,
      plan_id: args.plan_id,
      day_idx: args.day_idx,
      meal_slot: args.meal_slot,
      meal_name: args.meal_name ?? null,
      reaction: args.reaction,
      source: 'inline',
    } as never)
    if (e) return { ok: false, error: e.message }
    return { ok: true }
  }

  /** Save a structured review row (popover Step 1). */
  async function submitReview(args: {
    plan_id: string
    day_idx: number
    meal_slot: MealSlot
    meal_name?: string | null
    reaction: 'loved' | 'liked' | 'neutral' | 'never_again'
    reason_category?: string
    flagged_ingredient?: string
    notes?: string
  }): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in' }
    const { error: e } = await supabase.from('personal_meal_feedback').insert({
      user_id: userData.user.id,
      plan_id: args.plan_id,
      day_idx: args.day_idx,
      meal_slot: args.meal_slot,
      meal_name: args.meal_name ?? null,
      reaction: args.reaction,
      reason_category: args.reason_category ?? null,
      flagged_ingredient: args.flagged_ingredient ?? null,
      notes: args.notes ?? null,
      source: 'review',
    } as never)
    if (e) return { ok: false, error: e.message }

    // Mirror the ingredient-prefs derivation that ask-sage does (so reviews
    // count toward learning the same way chat feedback does).
    const ing = args.flagged_ingredient?.trim().toLowerCase()
    if (ing && (args.reaction === 'never_again' || args.reaction === 'loved')) {
      const verdict = args.reaction === 'never_again' ? 'never_again' : 'loved'
      const { data: existing } = await supabase
        .from('personal_ingredient_prefs')
        .select('id, evidence_ids, reasons')
        .eq('user_id', userData.user.id)
        .eq('ingredient', ing)
        .maybeSingle()
      const reasonText = (args.reason_category ?? '') + (args.notes ? `: ${args.notes}` : '')
      const next = {
        verdict,
        reasons: reasonText.trim()
          ? [reasonText.trim(), ...(((existing as { reasons?: string[] } | null)?.reasons ?? []))].slice(0, 5)
          : (((existing as { reasons?: string[] } | null)?.reasons ?? [])),
        evidence_ids: (((existing as { evidence_ids?: string[] } | null)?.evidence_ids ?? [])).slice(0, 4),
      }
      if (existing) {
        await supabase.from('personal_ingredient_prefs').update(next as never).eq('id', (existing as { id: string }).id)
      } else {
        await supabase.from('personal_ingredient_prefs').insert({
          user_id: userData.user.id,
          ingredient: ing,
          ...next,
        } as never)
      }
    }
    return { ok: true }
  }

  /** Mark the current plan as "reviewed" once Step 1 of the popover completes. */
  async function markReviewed(planId: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('personal_weekly_plans')
      .update({ reviewed_at: new Date().toISOString() } as never)
      .eq('id', planId)
    if (e) return { ok: false, error: e.message }
    return { ok: true }
  }

  /** Find the most recent unreviewed prior plan. Used to decide if Step 1 shows. */
  async function fetchPriorUnreviewed(): Promise<WeeklyPlan | null> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return null
    const { data } = await supabase
      .from('personal_weekly_plans')
      .select('*')
      .eq('user_id', userData.user.id)
      .is('reviewed_at', null)
      .order('week_starting', { ascending: false })
      .limit(1)
      .maybeSingle()
    return normalizePlan((data as unknown as WeeklyPlan | null) ?? null)
  }

  /** Fetch all feedback rows for a given plan (used to prefill Step 1). */
  async function fetchPlanFeedback(planId: string): Promise<MealFeedbackRow[]> {
    const { data } = await supabase
      .from('personal_meal_feedback')
      .select('id, plan_id, day_idx, meal_slot, meal_name, reaction, reason_category, flagged_ingredient, notes, source, created_at')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true })
    return (data ?? []) as unknown as MealFeedbackRow[]
  }

  const hasPlan = computed(() => plan.value !== null)
  const isApproved = computed(() => plan.value?.approved_at != null)

  /** Today's slice from the active window (or null if today not in plan). */
  const todaySlice = computed<DayPlan | null>(() => {
    if (!plan.value) return null
    const today = new Date().toISOString().slice(0, 10)
    return plan.value.days.find((d) => d.date === today) ?? null
  })

  onMounted(load)

  return {
    plan, loading, generating, error,
    hasPlan, isApproved, todaySlice,
    load, regenerate, revise, approve,
    generateWithOptions, quickReact, submitReview, markReviewed,
    fetchPriorUnreviewed, fetchPlanFeedback,
  }
}
