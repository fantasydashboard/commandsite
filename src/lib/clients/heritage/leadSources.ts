/**
 * Heritage Bath & Kitchen Co. — Lead Sources data (NEW for Pro tier).
 *
 * Powers the Lead Sources dashboard module. Shows where leads come from,
 * what each costs per lead, what the close rate is per channel, and total
 * ROI. This is the dashboard most service-business owners have NEVER seen
 * about their own business — and the moment they see it is the "aha"
 * moment that justifies the Pro tier price increase.
 *
 * For bath/kitchen specifically, the typical channel mix is:
 *   - Referrals: highest close rate, lowest CAC (~$0)
 *   - Google organic (driven by reviews): high close rate, low CAC
 *   - Houzz Pro: moderate close rate, moderate CAC
 *   - LSA: moderate close rate, $40-80/lead (the big paid channel)
 *   - Direct + NextDoor + Instagram: smaller, free, hit-or-miss
 *   - Paid Meta + Paid Google: typically lowest ROI for this vertical
 */
import type { LeadSourceRecord } from './types'

// Rolling 30-day window of lead activity by channel.
export const leadSources: LeadSourceRecord[] = [
  {
    channel: 'referrals',
    label: 'Customer Referrals',
    leads_count: 8,
    spend_cents: 0,
    cost_per_lead_cents: 0,
    closed_count: 5,
    close_rate: 0.625,
    revenue_cents: 18800000, // $188K
    roi_cents: 18800000,
    trend: 'up',
    trend_pct: 33, // 33% more leads than prior 30 days
    ada_note: 'Highest ROI source by a wide margin. Referral Engine drove 4 of these — ask volume is up since you approved the campaign.',
  },
  {
    channel: 'google_reviews',
    label: 'Google Reviews → Organic Search',
    leads_count: 11,
    spend_cents: 0,
    cost_per_lead_cents: 0,
    closed_count: 3,
    close_rate: 0.273,
    revenue_cents: 9840000, // $98.4K
    roi_cents: 9840000,
    trend: 'up',
    trend_pct: 18,
    ada_note: 'Your 4.9★ Google rating is the wedge. 11 inbound leads from people who Googled "bath remodel Tampa" — review-driven.',
  },
  {
    channel: 'houzz_pro',
    label: 'Houzz Pro Directory',
    leads_count: 6,
    spend_cents: 12900, // $129 (Houzz Pro subscription, prorated)
    cost_per_lead_cents: 2150, // $21.50/lead
    closed_count: 2,
    close_rate: 0.333,
    revenue_cents: 7660000, // $76.6K
    roi_cents: 7647100, // $76.5K net
    trend: 'flat',
    trend_pct: 2,
    ada_note: 'Houzz quality is consistent. Worth the $129/mo subscription — 6 leads × 33% close rate × $38K avg ticket.',
  },
  {
    channel: 'lsa',
    label: 'Google Local Services Ads',
    leads_count: 14,
    spend_cents: 73500, // $735 spent this month
    cost_per_lead_cents: 5250, // $52.50/lead
    closed_count: 3,
    close_rate: 0.214,
    revenue_cents: 11200000, // $112K
    roi_cents: 11126500, // $111.3K net
    trend: 'up',
    trend_pct: 12,
    ada_note: 'LSA close rate dipped to 21% (below your 28% avg). Worth investigating the 11 unclosed leads — Ada flagged 3 that may still be responsive.',
  },
  {
    channel: 'direct',
    label: 'Direct / Word of Mouth (untracked)',
    leads_count: 5,
    spend_cents: 0,
    cost_per_lead_cents: 0,
    closed_count: 2,
    close_rate: 0.4,
    revenue_cents: 6840000, // $68.4K
    roi_cents: 6840000,
    trend: 'flat',
    trend_pct: 0,
    ada_note: 'High-trust leads — they already knew about you. Ada has started asking "How did you hear about us?" to start attributing.',
  },
  {
    channel: 'instagram',
    label: 'Instagram (Organic)',
    leads_count: 3,
    spend_cents: 0,
    cost_per_lead_cents: 0,
    closed_count: 1,
    close_rate: 0.333,
    revenue_cents: 2480000, // $24.8K
    roi_cents: 2480000,
    trend: 'up',
    trend_pct: 50,
    ada_note: 'Your before/after reels are working. Volume small but quality is good — posters become buyers more than browsers.',
  },
  {
    channel: 'nextdoor',
    label: 'NextDoor Recommendations',
    leads_count: 4,
    spend_cents: 0,
    cost_per_lead_cents: 0,
    closed_count: 1,
    close_rate: 0.25,
    revenue_cents: 1880000, // $18.8K
    roi_cents: 1880000,
    trend: 'down',
    trend_pct: -20,
    ada_note: 'NextDoor mentions dropped this month. Tia Bell\'s glowing post last quarter was driving most of these.',
  },
]

// ── Helpers used by the Lead Sources module ────────────────────────────

export function totalLeadsThisMonth(): number {
  return leadSources.reduce((sum, ls) => sum + ls.leads_count, 0)
}

export function totalSpendThisMonth(): number {
  return leadSources.reduce((sum, ls) => sum + ls.spend_cents, 0)
}

export function totalRevenueThisMonth(): number {
  return leadSources.reduce((sum, ls) => sum + ls.revenue_cents, 0)
}

export function blendedCostPerLead(): number {
  const leads = totalLeadsThisMonth()
  if (leads === 0) return 0
  return Math.round(totalSpendThisMonth() / leads)
}

export function blendedClosedRate(): number {
  const total = leadSources.reduce((sum, ls) => sum + ls.leads_count, 0)
  const closed = leadSources.reduce((sum, ls) => sum + ls.closed_count, 0)
  return total === 0 ? 0 : closed / total
}

/** Channels sorted by ROI dollars (best to worst). Used to surface "where
 *  to put more money" recommendations. */
export function sourcesByRoi(): LeadSourceRecord[] {
  return [...leadSources].sort((a, b) => b.roi_cents - a.roi_cents)
}
