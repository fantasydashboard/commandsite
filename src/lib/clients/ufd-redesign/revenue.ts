/**
 * UFD Redesign — revenue / MRR / churn fixtures.
 *
 * UFD is unusual for a SaaS: revenue is heavily seasonal (NFL season
 * Aug–Jan = peak; Feb–Jul = drought). This shape should be surfaced
 * front and center so off-season churn isn't mistaken for product issues.
 */

export interface MrrPoint {
  month: string  // YYYY-MM
  starting_mrr_cents: number
  new_mrr_cents: number
  expansion_mrr_cents: number
  contraction_mrr_cents: number
  churned_mrr_cents: number
  ending_mrr_cents: number
}

/**
 * 12 months of MRR with the actual NFL-season cycle baked in:
 *  - Aug–Jan: high signup + low churn (peak)
 *  - Feb–Apr: high churn (people cancel post-season)
 *  - May–Jul: low everything (drought)
 *  - Recovery starts ~late Aug
 */
export function mrrTrend(): MrrPoint[] {
  // Hand-authored monthly cycle so the chart tells the story crisply.
  // Demo "today" sits in early May → the recent months should show
  // post-season churn pain.
  const monthlyDeltas = [
    // index 0 = 12 months ago, index 11 = current month
    { new_pct: 0.18, churn_pct: 0.04, exp_pct: 0.02 }, // Last May (drought start)
    { new_pct: 0.12, churn_pct: 0.05, exp_pct: 0.02 }, // Jun
    { new_pct: 0.10, churn_pct: 0.06, exp_pct: 0.02 }, // Jul
    { new_pct: 0.32, churn_pct: 0.03, exp_pct: 0.04 }, // Aug — preseason ramp
    { new_pct: 0.41, churn_pct: 0.02, exp_pct: 0.05 }, // Sep — opening week peak
    { new_pct: 0.28, churn_pct: 0.02, exp_pct: 0.06 }, // Oct
    { new_pct: 0.22, churn_pct: 0.02, exp_pct: 0.05 }, // Nov
    { new_pct: 0.18, churn_pct: 0.03, exp_pct: 0.04 }, // Dec
    { new_pct: 0.14, churn_pct: 0.04, exp_pct: 0.03 }, // Jan — playoffs
    { new_pct: 0.06, churn_pct: 0.11, exp_pct: 0.01 }, // Feb — post-season churn spike
    { new_pct: 0.04, churn_pct: 0.09, exp_pct: 0.01 }, // Mar
    { new_pct: 0.03, churn_pct: 0.07, exp_pct: 0.01 }, // Apr — current
  ]

  const today = new Date()
  let mrr = 380_000  // ~$3.8k starting MRR 12 months ago

  return monthlyDeltas.map((d, i) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1)
    const month = date.toISOString().slice(0, 7)
    const starting = mrr
    const new_mrr = Math.round(starting * d.new_pct)
    const expansion = Math.round(starting * d.exp_pct)
    const churned = Math.round(starting * d.churn_pct)
    const contraction = Math.round(starting * 0.005)
    const ending = starting + new_mrr + expansion - contraction - churned
    mrr = ending
    return {
      month,
      starting_mrr_cents: starting,
      new_mrr_cents: new_mrr,
      expansion_mrr_cents: expansion,
      contraction_mrr_cents: contraction,
      churned_mrr_cents: churned,
      ending_mrr_cents: ending,
    }
  })
}

/** Current plan-mix snapshot. Annual is way more valuable per LTV. */
export interface PlanMixSlice {
  plan: string
  customers: number
  mrr_cents: number
  color: string
}

export const planMix: PlanMixSlice[] = [
  // Hex literals — Chart.js doesn't resolve CSS var() on the canvas.
  // Sky for monthly · emerald for annual (signals "the prize tier").
  { plan: 'Monthly ($9.99)', customers: 412, mrr_cents: 411_588, color: '#0EA5E9' },
  { plan: 'Annual ($79)',    customers: 187, mrr_cents: 123_046, color: '#10B981' },
]

/**
 * Cohort retention, B2C-flavored.
 * Cohorts visibly retain better when their first season is in-flight
 * (Aug–Jan signups stick around) vs. off-season (Feb–Jul signups
 * churn fast because they have no immediate use case).
 */
export interface CohortRow {
  cohort: string
  customers_signed: number
  retention: number[]
}

export const cohortRetention: CohortRow[] = [
  // Older cohorts, fewer surviving members but full season cycles
  { cohort: '2025-05', customers_signed: 24,  retention: [1, 0.83, 0.67, 0.54, 0.46, 0.42, 0.38, 0.38, 0.33, 0.29, 0.21, 0.17, 0.13] },
  { cohort: '2025-06', customers_signed: 18,  retention: [1, 0.78, 0.61, 0.50, 0.44, 0.39, 0.39, 0.33, 0.28, 0.22, 0.17, 0.17] },
  { cohort: '2025-07', customers_signed: 22,  retention: [1, 0.73, 0.55, 0.50, 0.45, 0.45, 0.41, 0.36, 0.32, 0.27, 0.23] },
  { cohort: '2025-08', customers_signed: 64,  retention: [1, 0.91, 0.84, 0.81, 0.78, 0.73, 0.69, 0.66, 0.61, 0.55] },
  { cohort: '2025-09', customers_signed: 98,  retention: [1, 0.93, 0.88, 0.84, 0.80, 0.76, 0.71, 0.66, 0.59] },
  { cohort: '2025-10', customers_signed: 87,  retention: [1, 0.90, 0.85, 0.79, 0.74, 0.69, 0.62, 0.55] },
  { cohort: '2025-11', customers_signed: 74,  retention: [1, 0.89, 0.81, 0.74, 0.69, 0.62, 0.54] },
  { cohort: '2025-12', customers_signed: 58,  retention: [1, 0.86, 0.78, 0.69, 0.62, 0.52] },
  { cohort: '2026-01', customers_signed: 46,  retention: [1, 0.83, 0.70, 0.59, 0.46] },
  { cohort: '2026-02', customers_signed: 18,  retention: [1, 0.61, 0.44, 0.33] },
  { cohort: '2026-03', customers_signed: 14,  retention: [1, 0.57, 0.43] },
  { cohort: '2026-04', customers_signed: 11,  retention: [1, 0.55] },
  { cohort: '2026-05', customers_signed: 7,   retention: [1] },
]

export interface FailedPayment {
  id: string
  user_name: string
  user_email: string
  plan: string
  amount_cents: number
  attempts: number
  failed_at: string
  retry_at: string
  reason: string
}

function ago(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}
function fromNow(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() + hours, 0, 0, 0)
  return d.toISOString()
}

export const failedPayments: FailedPayment[] = [
  {
    id: 'fp-001', user_name: 'Cameron Yost', user_email: 'cam.yost@gmail.com',
    plan: 'Monthly', amount_cents: 999, attempts: 1,
    failed_at: ago(36), retry_at: fromNow(36),
    reason: 'card_declined: insufficient funds',
  },
  {
    id: 'fp-002', user_name: 'Tyrell Brooks', user_email: 'tbrooks.ftbl@gmail.com',
    plan: 'Monthly', amount_cents: 999, attempts: 2,
    failed_at: ago(72), retry_at: fromNow(12),
    reason: 'card_expired',
  },
  {
    id: 'fp-003', user_name: 'Marisol Acevedo', user_email: 'marisolacevedo@gmail.com',
    plan: 'Monthly', amount_cents: 999, attempts: 3,
    failed_at: ago(120), retry_at: fromNow(0),
    reason: 'card_declined: do_not_honor',
  },
]

export interface RevenueHeadline {
  current_mrr_cents: number
  arr_cents: number
  net_new_mrr_cents: number
  growth_rate: number
  net_revenue_retention: number
  gross_churn_rate: number
  ltv_cents: number
  cac_cents: number
  ltv_cac_ratio: number
  /** % of customers on annual — strategic metric for UFD */
  annual_share: number
}

export function revenueHeadline(): RevenueHeadline {
  const trend = mrrTrend()
  const last = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  const current_mrr = last.ending_mrr_cents
  const net_new = last.new_mrr_cents + last.expansion_mrr_cents - last.contraction_mrr_cents - last.churned_mrr_cents
  const growth = (current_mrr - prev.ending_mrr_cents) / prev.ending_mrr_cents
  const nrr = (last.starting_mrr_cents + last.expansion_mrr_cents - last.contraction_mrr_cents - last.churned_mrr_cents) / last.starting_mrr_cents
  const gross_churn = last.churned_mrr_cents / last.starting_mrr_cents
  const totalCust = planMix.reduce((s, p) => s + p.customers, 0)
  const annualCust = planMix.find((p) => p.plan.startsWith('Annual'))?.customers ?? 0

  return {
    current_mrr_cents: current_mrr,
    arr_cents: current_mrr * 12,
    net_new_mrr_cents: net_new,
    growth_rate: growth,
    net_revenue_retention: nrr,
    gross_churn_rate: gross_churn,
    ltv_cents: 18_500,    // ~$185 — annual heavy
    cac_cents: 4_200,      // ~$42 (paid acquisition heavy on Reddit/Twitter ads)
    ltv_cac_ratio: 18_500 / 4_200,
    annual_share: annualCust / totalCust,
  }
}

/** Season callouts — context for off-season metric drops. */
export interface SeasonNote {
  month_idx: number  // 0-11 (relative to displayed window)
  label: string
  detail: string
  tone: 'good' | 'caution' | 'celebration'
}

/**
 * Season annotations matching the 12-month MRR window.
 * Index 0 = oldest month displayed, index 11 = current.
 */
export const seasonNotes: SeasonNote[] = [
  { month_idx: 3,  label: 'Preseason ramp',   detail: 'NFL preseason. Signups +3× off-season baseline.', tone: 'good' },
  { month_idx: 4,  label: 'Opening week',     detail: 'Week 1 of NFL season — biggest single signup week of the year.', tone: 'celebration' },
  { month_idx: 9,  label: 'Off-season churn', detail: 'Post-Super-Bowl. Highest churn month — users cancel "until next season."', tone: 'caution' },
  { month_idx: 11, label: 'Drought',          detail: 'Off-season low. Use this window to ship + run winback campaigns.', tone: 'caution' },
]
