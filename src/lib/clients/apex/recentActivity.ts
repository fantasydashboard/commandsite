/**
 * Recent activity feed shown on the Overview page.
 * Synthesised from the calls / quotes / reviews fixtures so the
 * timestamps stay aligned with the rest of the demo.
 */
import type { RecentActivityEvent } from './types'

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const recentActivity: RecentActivityEvent[] = [
  { id: 'a1', at: ago(0, 12),  kind: 'call',         text: 'AI booked $1,200 quote with Robert C. · in-home assessment Thursday 9-11 AM' },
  { id: 'a2', at: ago(0, 38),  kind: 'review',       text: '5-star Google review from Tom B. — “same-day fix, fair price”' },
  { id: 'a3', at: ago(1, 5),   kind: 'quote',        text: 'Day-3 follow-up SMS converted Patricia A. → $280 maintenance booked for Friday' },
  { id: 'a4', at: ago(1, 47),  kind: 'reactivation', text: 'Reactivation email sent to 14 dormant customers · 2 already replied to schedule' },
  { id: 'a5', at: ago(2, 22),  kind: 'dispatch',     text: 'Marcus dispatched to Karen H. — water heater replacement, ETA 17 min · est. $1,640' },
  { id: 'a6', at: ago(3, 0),   kind: 'call',         text: 'AI rejected solar-marketing spam call in 18s · saved you the interruption' },
  { id: 'a7', at: ago(4, 14),  kind: 'review',       text: '4-star Google review from Sandra W. — “great work, took a while to schedule”' },
  { id: 'a8', at: ago(5, 30),  kind: 'quote',        text: 'Quote booked: James S. mini-split install — $8,500 estimate sent to inbox' },
  { id: 'a9', at: ago(6, 8),   kind: 'call',         text: 'After-hours: Anthony R. compressor failure → on-call tech dispatched · $487 ticket' },
  { id: 'a10', at: ago(7, 0),  kind: 'reactivation', text: 'Won-back: Greg H. booked $220 contactor replacement (last seen 11 months ago)' },
  { id: 'a11', at: ago(8, 20), kind: 'call',         text: 'AI booked next-day appointment for Jennifer M. · AC not cooling · capacitor swap, $487' },
  { id: 'a12', at: ago(10, 0), kind: 'review',       text: '5-star Facebook review from Lisa B. — “Marcus was incredible”' },
]
