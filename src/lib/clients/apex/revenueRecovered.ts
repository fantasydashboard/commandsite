/**
 * Revenue Recovered metrics for the Overview page.
 * "Recovered" = revenue from jobs that wouldn't have happened without
 * AI follow-up, after-hours capture, or reactivation outreach.
 */
import type { RevenueRecovered } from './types'

export function revenueRecovered(): RevenueRecovered {
  // Synth a daily series for the last 30 days so the chart isn't flat.
  // Most days $300-$1500, occasional $3000+ spikes from big tickets.
  const daily: { date: string; cents: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dow = d.getDay()
    let baseline = 60_000  // $600
    if (dow === 0) baseline = 25_000   // Sundays slow
    if (dow === 6) baseline = 40_000   // Saturdays moderate
    if (dow === 2 || dow === 3) baseline = 95_000  // Tue/Wed peak
    // Add some daily variance and occasional spikes (every 5-6 days)
    const variance = (d.getDate() * 13_000) % 30_000
    const spike = i % 6 === 0 ? 220_000 : 0
    daily.push({ date: d.toISOString().slice(0, 10), cents: baseline + variance + spike })
  }
  return {
    this_month_cents: 1_847_300,         // $18,473
    avg_ticket_cents: 89_240,             // $892.40
    projected_annual_cents: 21_873_840,   // $218,738.40 — projected, not aspirational round
    daily,
  }
}
