/**
 * UFD Users — live cohort data composable.
 *
 * Wraps the ufd-users edge function (UFD's separate Supabase) which
 * returns per-user rows for a given cohort. Used by
 * UfdRedesignUsersModule to show actual trial / at-risk / expired /
 * paying users — the surface Josh needs to drive founder-touch
 * outreach for trial conversion.
 *
 * The fixture-heavy Users layout (health_score, viral signups,
 * shares_30d, etc.) doesn't map to data ufd-users exposes today.
 * Surface only what's actually queryable.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'

export type Cohort =
  | 'total_users'
  | 'free_trial'
  | 'at_risk'
  | 'expired'
  | 'individual_monthly'
  | 'individual_annual'
  | 'league_passes'

export interface UfdUserRow {
  id?: string
  email: string
  full_name?: string
  signup_date?: string
  trial_started_at?: string
  trial_expires_at?: string
  plan_started_at?: string
  current_period_end?: string
  // Email engagement (joined from email events)
  emails_sent?: number
  last_received?: string
  last_opened?: string
  open_rate?: number
}

interface UsersResponse {
  cohort: Cohort
  rows: UfdUserRow[]
}

export const COHORT_META: Record<Cohort, { label: string; description: string; color: string }> = {
  total_users:        { label: 'All users',     description: 'every signup',                                color: 'text-ink' },
  free_trial:         { label: 'Free trial',    description: 'currently in trial — drive conversion here', color: 'text-brand' },
  at_risk:            { label: 'At risk',       description: 'trial expired ≤ 21d, no payment yet',        color: 'text-warn' },
  expired:            { label: 'Expired',       description: 'trial expired > 21d — win-back territory',   color: 'text-danger' },
  individual_monthly: { label: 'Monthly paid',  description: 'active monthly subscribers',                 color: 'text-success' },
  individual_annual:  { label: 'Annual paid',   description: 'active annual subscribers',                  color: 'text-success' },
  league_passes:      { label: 'League passes', description: 'league-pass holders',                        color: 'text-success' },
}

/** Days until trial expires (or days since if already expired). */
export function trialDaysLeft(user: UfdUserRow): number | null {
  if (!user.trial_expires_at) return null
  const ms = new Date(user.trial_expires_at).getTime() - Date.now()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

/** Days since signup. Used to detect "ghosted within hours" vs. "tried it then dropped." */
export function daysSinceSignup(user: UfdUserRow): number | null {
  if (!user.signup_date) return null
  const ms = Date.now() - new Date(user.signup_date).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

/** Build a Gmail compose URL pre-filled for founder-touch outreach. */
export function gmailComposeUrlForUser(
  user: UfdUserRow,
  opts: { subject?: string; body?: string } = {},
): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: user.email,
    su: opts.subject ?? '',
    body: opts.body ?? '',
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

export function useUfdUsersData(initialCohort: Cohort = 'free_trial') {
  const cohort = ref<Cohort>(initialCohort)
  const rows = ref<UfdUserRow[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastFetchAt = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase.functions.invoke<UsersResponse>('ufd-users', {
      body: { cohort: cohort.value },
    })
    if (e) {
      error.value = e.message
      loading.value = false
      return
    }
    rows.value = (data?.rows ?? []) as UfdUserRow[]
    lastFetchAt.value = new Date().toISOString()
    loading.value = false
  }

  function setCohort(c: Cohort) {
    cohort.value = c
  }

  // Reload whenever cohort changes
  watch(cohort, load)
  onMounted(load)

  /** Sort users in the way that's most useful for action. For trials,
   *  surface the ones expiring soonest first. For at_risk, the most
   *  recent expiry first (highest reactivation chance). */
  const sorted = computed<UfdUserRow[]>(() => {
    const list = [...rows.value]
    if (cohort.value === 'free_trial') {
      return list.sort((a, b) => {
        const aMs = a.trial_expires_at ? new Date(a.trial_expires_at).getTime() : 0
        const bMs = b.trial_expires_at ? new Date(b.trial_expires_at).getTime() : 0
        return aMs - bMs  // expiring soonest first
      })
    }
    // Default: most-recent signup first
    return list.sort((a, b) => {
      const aMs = a.signup_date ? new Date(a.signup_date).getTime() : 0
      const bMs = b.signup_date ? new Date(b.signup_date).getTime() : 0
      return bMs - aMs
    })
  })

  return {
    cohort,
    rows: sorted,
    loading,
    error,
    lastFetchAt,
    load,
    setCohort,
  }
}
