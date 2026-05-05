/**
 * Cornerstone — Giving (intentionally simple).
 *
 * Aggregate trends + the "stopped giving" household flag. No individual
 * gift snooping — that surface is gated by role (senior pastor + finance
 * team only). The pastoral value here is spotting drift, not surveillance.
 */

export interface MonthlyGiving {
  month: string  // YYYY-MM
  general_cents: number
  missions_cents: number
  building_fund_cents: number
  total_cents: number
  giving_households: number
}

export type StopReason =
  | 'unknown'
  | 'cancelled_recurring'
  | 'card_expired_no_update'
  | 'household_drifting'
  | 'household_moved'
  | 'silent_drop'

export interface StoppedGivingHousehold {
  household_id: string
  household_name: string
  /** Last gift date (ISO) */
  last_gift_at: string
  /** Last gift amount in cents */
  last_gift_cents: number
  /** Days since last gift */
  days_silent: number
  /** Their typical monthly giving over the prior year, in cents */
  prior_year_avg_monthly_cents: number
  reason: StopReason
  /** Whether they\'re also flagged at-risk on People (kids/serving) — multi-flag = priority */
  also_kids_flag: boolean
  also_serving_flag: boolean
}

export interface DesignatedFund {
  key: 'general' | 'missions' | 'building_fund' | 'benevolence'
  label: string
  ytd_cents: number
  goal_cents: number
  color: string
}

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

/**
 * 12 months of giving — modest growth + holiday-bumped December
 * (Christmas Eve giving is real for churches).
 */
export function monthlyGiving(): MonthlyGiving[] {
  const today = new Date()
  const out: MonthlyGiving[] = []
  // Patterns calibrated for ~$32k baseline + Dec spike
  const monthlyShape = [
    0.95, 0.90, 0.94, 1.02, 1.04, 1.00, 0.92, 0.88, 1.00, 1.05, 1.08, 1.42,
  ]
  let baseline = 30_500_00  // baseline general for first month rendered
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const month = date.toISOString().slice(0, 7)
    const monthIdx = (12 - i - 1) % 12
    const factor = monthlyShape[monthIdx]
    // Mild growth — multiply baseline by 1.01 each month forward
    const general = Math.round(baseline * factor * 0.78)
    const missions = Math.round(baseline * factor * 0.13)
    const building = Math.round(baseline * factor * 0.09)
    out.push({
      month,
      general_cents: general,
      missions_cents: missions,
      building_fund_cents: building,
      total_cents: general + missions + building,
      giving_households: 78 + Math.round(8 * (factor - 0.9)),
    })
    baseline = Math.round(baseline * 1.011)
  }
  return out
}

export const stoppedGivingHouseholds: StoppedGivingHousehold[] = [
  // Multi-flag — top priority because they\'re drifting overall
  {
    household_id: 'h-009',
    household_name: 'The Sullivan Family',
    last_gift_at: ago(98),
    last_gift_cents: 25_000,
    days_silent: 98,
    prior_year_avg_monthly_cents: 28_000,
    reason: 'silent_drop',
    also_kids_flag: true,
    also_serving_flag: true,
  },
  {
    household_id: 'h-008',
    household_name: 'The Whitaker Family',
    last_gift_at: ago(72),
    last_gift_cents: 15_000,
    days_silent: 72,
    prior_year_avg_monthly_cents: 18_500,
    reason: 'cancelled_recurring',
    also_kids_flag: true,
    also_serving_flag: false,
  },

  // Single-flag — could be life circumstance, not necessarily drifting
  {
    household_id: 'h-stopped-001',
    household_name: 'The Hawthorne Family',
    last_gift_at: ago(64),
    last_gift_cents: 12_000,
    days_silent: 64,
    prior_year_avg_monthly_cents: 12_000,
    reason: 'card_expired_no_update',
    also_kids_flag: false,
    also_serving_flag: false,
  },
  {
    household_id: 'h-stopped-002',
    household_name: 'Bryan Cole',
    last_gift_at: ago(81),
    last_gift_cents: 5_000,
    days_silent: 81,
    prior_year_avg_monthly_cents: 5_000,
    reason: 'unknown',
    also_kids_flag: false,
    also_serving_flag: false,
  },
  {
    household_id: 'h-stopped-003',
    household_name: 'The Yates Family',
    last_gift_at: ago(112),
    last_gift_cents: 22_500,
    days_silent: 112,
    prior_year_avg_monthly_cents: 22_500,
    reason: 'household_moved',
    also_kids_flag: false,
    also_serving_flag: false,
  },
]

export const designatedFunds: DesignatedFund[] = [
  { key: 'general',       label: 'General fund',     ytd_cents: 1_842_000_00 / 12 * 4, goal_cents: 1_842_000_00,  color: 'rgb(var(--color-brand))' },
  { key: 'missions',      label: 'Missions',         ytd_cents: 312_000_00 / 12 * 4,   goal_cents: 312_000_00,    color: '#10B981' },
  { key: 'building_fund', label: 'Building fund',    ytd_cents: 218_000_00 / 12 * 4,   goal_cents: 800_000_00,    color: '#A855F7' },
  { key: 'benevolence',   label: 'Benevolence',      ytd_cents: 48_000_00 / 12 * 4,    goal_cents: 60_000_00,     color: '#F59E0B' },
]

export const STOP_REASON_LABEL: Record<StopReason, string> = {
  unknown:                'Unknown — needs check-in',
  cancelled_recurring:    'Cancelled recurring gift',
  card_expired_no_update: 'Card expired, no update',
  household_drifting:     'Household also drifting',
  household_moved:        'Household moved',
  silent_drop:            'Silent drop — no comm',
}

export interface GivingStats {
  current_month_cents: number
  prior_month_cents: number
  mom_change: number
  ytd_cents: number
  ytd_goal_cents: number
  giving_households: number
  total_households: number
  stopped_count: number
  stopped_priority: number  // multi-flag
  recurring_pct: number
}

export function givingStats(): GivingStats {
  const trend = monthlyGiving()
  const current = trend[trend.length - 1].total_cents
  const prior = trend[trend.length - 2].total_cents
  const ytd = designatedFunds.reduce((s, f) => s + f.ytd_cents, 0)
  const ytd_goal = designatedFunds.reduce((s, f) => s + f.goal_cents, 0)

  return {
    current_month_cents: current,
    prior_month_cents: prior,
    mom_change: (current - prior) / prior,
    ytd_cents: ytd,
    ytd_goal_cents: ytd_goal,
    giving_households: trend[trend.length - 1].giving_households,
    total_households: 120,
    stopped_count: stoppedGivingHouseholds.length,
    stopped_priority: stoppedGivingHouseholds.filter((h) => h.also_kids_flag || h.also_serving_flag).length,
    recurring_pct: 0.62,
  }
}
