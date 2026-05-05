/**
 * Performance metrics for Apex — revenue trends, lead-source ROI,
 * tech leaderboard, service mix, conversion funnel. Powers the
 * Metrics tab.
 */

export interface RevenueTrendPoint { date: string; cents: number }

export function revenueTrend(): RevenueTrendPoint[] {
  // 30-day daily revenue with weekday/weekend variance + occasional
  // big-install spikes so the chart looks like real service revenue.
  const out: RevenueTrendPoint[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dow = d.getDay()
    let baseline = 280_000  // $2,800 baseline weekday
    if (dow === 0) baseline = 90_000        // Sundays light
    if (dow === 6) baseline = 180_000       // Saturday moderate
    if (dow === 2 || dow === 3) baseline = 360_000  // Tue/Wed peak
    const variance = ((d.getDate() * 17_000) % 90_000)
    const installSpike = i % 7 === 0 ? 850_000 : 0  // weekly big install
    out.push({ date: d.toISOString().slice(0, 10), cents: baseline + variance + installSpike })
  }
  return out
}

export interface LeadSource {
  source: string
  leads: number
  quotes: number
  booked: number
  revenue_cents: number
  cost_cents: number
}

export const leadSources: LeadSource[] = [
  { source: 'Google Local Service Ads', leads: 142, quotes: 88, booked: 47, revenue_cents: 2_140_000, cost_cents: 318_000 },
  { source: 'Organic / SEO',            leads: 98,  quotes: 71, booked: 39, revenue_cents: 1_780_000, cost_cents: 0 },
  { source: 'Customer Referrals',       leads: 64,  quotes: 58, booked: 41, revenue_cents: 1_920_000, cost_cents: 0 },
  { source: 'Repeat Customer',          leads: 121, quotes: 121, booked: 109, revenue_cents: 4_280_000, cost_cents: 0 },
  { source: 'Yelp',                     leads: 38,  quotes: 24, booked: 11, revenue_cents: 380_000,   cost_cents: 89_000 },
  { source: 'Nextdoor',                 leads: 27,  quotes: 19, booked: 12, revenue_cents: 410_000,   cost_cents: 0 },
  { source: 'Facebook',                 leads: 22,  quotes: 14, booked: 6,  revenue_cents: 165_000,   cost_cents: 47_000 },
  { source: 'Direct phone',             leads: 31,  quotes: 21, booked: 14, revenue_cents: 540_000,   cost_cents: 0 },
]

export interface TechPerf {
  id: string
  name: string
  jobs: number
  revenue_cents: number
  avg_ticket_cents: number
  avg_rating: number
  callback_rate: number  // 0..1 — % of jobs that needed a return visit
  utilization: number    // 0..1 — % of bookable hours filled
}

export const techPerf: TechPerf[] = [
  { id: 't-001', name: 'Marcus Reyes',    jobs: 47, revenue_cents: 1_872_000, avg_ticket_cents: 39_830, avg_rating: 4.9, callback_rate: 0.02, utilization: 0.91 },
  { id: 't-002', name: 'Diego Hernandez', jobs: 38, revenue_cents: 1_344_000, avg_ticket_cents: 35_370, avg_rating: 4.8, callback_rate: 0.04, utilization: 0.84 },
  { id: 't-003', name: 'Brandon Thomas',  jobs: 32, revenue_cents: 968_000,   avg_ticket_cents: 30_250, avg_rating: 4.7, callback_rate: 0.06, utilization: 0.78 },
  { id: 't-004', name: 'Aaron Whitfield', jobs: 18, revenue_cents: 432_000,   avg_ticket_cents: 24_000, avg_rating: 4.6, callback_rate: 0.11, utilization: 0.62 },
]

export interface ServiceMixSlice {
  label: string
  revenue_cents: number
  color: string
}

export const serviceMix: ServiceMixSlice[] = [
  { label: 'New install',           revenue_cents: 4_820_000, color: 'rgb(var(--color-brand))' },
  { label: 'Repair',                revenue_cents: 2_140_000, color: 'rgb(var(--color-accent))' },
  { label: 'Maintenance plan',      revenue_cents: 1_180_000, color: '#10B981' },
  { label: 'Emergency / after-hrs', revenue_cents: 740_000,   color: '#EF4444' },
  { label: 'Add-on (thermostat)',   revenue_cents: 320_000,   color: '#F59E0B' },
  { label: 'Other',                 revenue_cents: 215_000,   color: '#94A3B8' },
]

export interface FunnelStep { stage: string; count: number; pct_of_top: number }

export const conversionFunnel: FunnelStep[] = [
  { stage: 'Lead captured',       count: 543, pct_of_top: 1.00 },
  { stage: 'Quoted',              count: 416, pct_of_top: 0.77 },
  { stage: 'Booked job',          count: 279, pct_of_top: 0.51 },
  { stage: 'Job completed',       count: 261, pct_of_top: 0.48 },
  { stage: 'Review collected',    count: 187, pct_of_top: 0.34 },
]

export interface MetricsHeadline {
  mtd_revenue_cents: number
  prior_month_revenue_cents: number
  mom_change: number  // signed, e.g. +0.18
  avg_ticket_cents: number
  conversion_rate: number  // booked / leads
  callback_rate: number    // overall
}

export function metricsHeadline(): MetricsHeadline {
  const trend = revenueTrend()
  const mtd = trend.reduce((s, p) => s + p.cents, 0)
  // Prior period is the same length window before today.
  const prior = Math.round(mtd * 0.85)  // demo: 15% MoM growth
  const totalLeads = leadSources.reduce((s, l) => s + l.leads, 0)
  const totalBooked = leadSources.reduce((s, l) => s + l.booked, 0)
  const totalRev = leadSources.reduce((s, l) => s + l.revenue_cents, 0)
  return {
    mtd_revenue_cents: mtd,
    prior_month_revenue_cents: prior,
    mom_change: (mtd - prior) / prior,
    avg_ticket_cents: Math.round(totalRev / totalBooked),
    conversion_rate: totalBooked / totalLeads,
    callback_rate: techPerf.reduce((s, t) => s + t.callback_rate * t.jobs, 0) / techPerf.reduce((s, t) => s + t.jobs, 0),
  }
}
