/**
 * CommandSite Revenue — MRR/ARR/churn dashboard for CommandSite as a
 * SaaS business. Powers the Revenue tab.
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

export function mrrTrend(): MrrPoint[] {
  // 12 months of MRR with growth-trending pattern: starts at $4.2k, ends ~$32k.
  const out: MrrPoint[] = []
  let mrr = 420_000
  const today = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const month = d.toISOString().slice(0, 7)
    const starting = mrr
    const new_mrr = Math.round(starting * (0.10 + (Math.random() * 0.04)))   // 10-14% new
    const expansion = Math.round(starting * (0.04 + (Math.random() * 0.03))) // 4-7% expansion
    const contraction = Math.round(starting * 0.005)                          // 0.5%
    const churned = Math.round(starting * (0.025 + (Math.random() * 0.02)))   // 2.5-4.5%
    const ending = starting + new_mrr + expansion - contraction - churned
    out.push({
      month,
      starting_mrr_cents: starting,
      new_mrr_cents: new_mrr,
      expansion_mrr_cents: expansion,
      contraction_mrr_cents: contraction,
      churned_mrr_cents: churned,
      ending_mrr_cents: ending,
    })
    mrr = ending
  }
  return out
}

export interface PlanMixSlice {
  plan: string
  customers: number
  mrr_cents: number
  color: string
}

export const planMix: PlanMixSlice[] = [
  // Hex literals — Chart.js doesn't resolve CSS var() on the canvas.
  { plan: 'Starter ($199)',       customers: 14, mrr_cents: 278_600,   color: '#94A3B8' },
  { plan: 'Pro ($499)',           customers: 22, mrr_cents: 1_097_800, color: '#0EA5E9' },
  { plan: 'Scale ($999)',         customers: 7,  mrr_cents: 699_300,   color: '#1E40AF' },
  { plan: 'Enterprise ($2,499+)', customers: 2,  mrr_cents: 549_800,   color: '#10B981' },
]

export interface CohortRow {
  /** Month they signed up — 'YYYY-MM' */
  cohort: string
  customers_signed: number
  /** Retention by month (0..1), index 0 = month 0 (always 1.0) */
  retention: number[]
}

export const cohortRetention: CohortRow[] = [
  { cohort: '2025-04', customers_signed: 4,  retention: [1, 1.00, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.50, 0.50, 0.50, 0.50] },
  { cohort: '2025-05', customers_signed: 6,  retention: [1, 1.00, 0.83, 0.83, 0.83, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67] },
  { cohort: '2025-06', customers_signed: 5,  retention: [1, 0.80, 0.80, 0.80, 0.80, 0.80, 0.60, 0.60, 0.60, 0.60, 0.60] },
  { cohort: '2025-07', customers_signed: 7,  retention: [1, 1.00, 1.00, 0.86, 0.86, 0.86, 0.86, 0.86, 0.71, 0.71] },
  { cohort: '2025-08', customers_signed: 5,  retention: [1, 1.00, 1.00, 1.00, 1.00, 0.80, 0.80, 0.80, 0.80] },
  { cohort: '2025-09', customers_signed: 6,  retention: [1, 1.00, 0.83, 0.83, 0.83, 0.83, 0.83, 0.83] },
  { cohort: '2025-10', customers_signed: 8,  retention: [1, 1.00, 1.00, 1.00, 0.88, 0.88, 0.88] },
  { cohort: '2025-11', customers_signed: 9,  retention: [1, 1.00, 1.00, 0.89, 0.89, 0.89] },
  { cohort: '2025-12', customers_signed: 7,  retention: [1, 1.00, 1.00, 1.00, 1.00] },
  { cohort: '2026-01', customers_signed: 10, retention: [1, 1.00, 1.00, 0.90] },
  { cohort: '2026-02', customers_signed: 11, retention: [1, 1.00, 1.00] },
  { cohort: '2026-03', customers_signed: 12, retention: [1, 1.00] },
  { cohort: '2026-04', customers_signed: 14, retention: [1] },
]

export interface FailedPayment {
  id: string
  customer: string
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
    id: 'fp-001',
    customer: 'BrightVolt Electric',
    plan: 'Pro',
    amount_cents: 49_900,
    attempts: 1,
    failed_at: ago(36),
    retry_at: fromNow(36),
    reason: 'card_declined: insufficient funds',
  },
  {
    id: 'fp-002',
    customer: 'Stonecrest Roofing',
    plan: 'Pro',
    amount_cents: 49_900,
    attempts: 2,
    failed_at: ago(72),
    retry_at: fromNow(12),
    reason: 'card_expired',
  },
]

export interface RevenueHeadline {
  current_mrr_cents: number
  arr_cents: number
  net_new_mrr_cents: number
  growth_rate: number     // signed
  net_revenue_retention: number  // 1.0 = flat
  gross_churn_rate: number
  ltv_cents: number
  cac_cents: number
  ltv_cac_ratio: number
}

export function revenueHeadline(): RevenueHeadline {
  const trend = mrrTrend()
  const last = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  const current_mrr = last.ending_mrr_cents
  const net_new = last.new_mrr_cents + last.expansion_mrr_cents - last.contraction_mrr_cents - last.churned_mrr_cents
  const growth = (current_mrr - prev.ending_mrr_cents) / prev.ending_mrr_cents
  // Net Revenue Retention = (start + expansion - contraction - churn) / start, excluding new
  const nrr = (last.starting_mrr_cents + last.expansion_mrr_cents - last.contraction_mrr_cents - last.churned_mrr_cents) / last.starting_mrr_cents
  const gross_churn = last.churned_mrr_cents / last.starting_mrr_cents

  // Demo numbers — calibrated to feel believable for a small SaaS
  const ltv_cents = 1_847_500       // $18,475 lifetime value (from ~24mo retention × $769 avg ARPU)
  const cac_cents = 384_000          // $3,840 CAC

  return {
    current_mrr_cents: current_mrr,
    arr_cents: current_mrr * 12,
    net_new_mrr_cents: net_new,
    growth_rate: growth,
    net_revenue_retention: nrr,
    gross_churn_rate: gross_churn,
    ltv_cents,
    cac_cents,
    ltv_cac_ratio: ltv_cents / cac_cents,
  }
}
