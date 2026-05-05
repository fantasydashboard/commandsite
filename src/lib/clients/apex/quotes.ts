/**
 * Dummy quote follow-up data for the Apex Heating & Air demo.
 * Used by the Overview module's "Quote Follow-Ups Sent" bar chart and
 * by the Quotes kanban (Phase 2).
 */
import type { QuoteRecord } from './types'

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export const quotes: QuoteRecord[] = [
  {
    id: 'q-001',
    customer: 'Robert Chen',
    phone: '(407) 555-0237',
    amount_cents: 1200000,
    created_at: ago(0),
    stage: 'new',
    days_in_stage: 0,
    last_touch: null,
    job_type: 'New 3-ton AC system',
  },
  {
    id: 'q-002',
    customer: 'Lisa Bennett',
    phone: '(407) 555-0341',
    amount_cents: 45000,
    created_at: ago(1),
    stage: 'followup_day_1',
    days_in_stage: 1,
    last_touch: 'sms',
    job_type: 'Capacitor replacement',
  },
  {
    id: 'q-003',
    customer: 'Patricia Andrews',
    phone: '(407) 555-0145',
    amount_cents: 28000,
    created_at: ago(3),
    stage: 'followup_day_3',
    days_in_stage: 3,
    last_touch: 'email',
    job_type: 'Annual tune-up',
  },
  {
    id: 'q-004',
    customer: 'James Sullivan',
    phone: '(407) 555-0928',
    amount_cents: 850000,
    created_at: ago(3),
    stage: 'followup_day_3',
    days_in_stage: 3,
    last_touch: 'sms',
    job_type: 'Mini-split install',
  },
  {
    id: 'q-005',
    customer: 'Anthony Russo',
    phone: '(407) 555-0613',
    amount_cents: 340000,
    created_at: ago(7),
    stage: 'followup_day_7',
    days_in_stage: 7,
    last_touch: 'email',
    job_type: 'AC compressor replacement',
  },
  {
    id: 'q-006',
    customer: 'Amanda Foster',
    phone: '(407) 555-0466',
    amount_cents: 65000,
    created_at: ago(7),
    stage: 'followup_day_7',
    days_in_stage: 7,
    last_touch: 'sms',
    job_type: 'Duct cleaning',
  },
  {
    id: 'q-007',
    customer: 'Michael Reyes',
    phone: '(407) 555-0651',
    amount_cents: 1400000,
    created_at: ago(14),
    stage: 'followup_day_14',
    days_in_stage: 14,
    last_touch: 'call',
    job_type: 'Full system replacement',
  },
  {
    id: 'q-008',
    customer: 'Hector Vega',
    phone: '(407) 555-0815',
    amount_cents: 32000,
    created_at: ago(14),
    stage: 'followup_day_14',
    days_in_stage: 14,
    last_touch: 'email',
    job_type: 'Air handler service',
  },
  {
    id: 'q-009',
    customer: 'Sandra Whitmore',
    phone: '(407) 555-0509',
    amount_cents: 18000,
    created_at: ago(30),
    stage: 'followup_day_30',
    days_in_stage: 30,
    last_touch: 'email',
    job_type: 'Smart thermostat',
  },
  {
    id: 'q-010',
    customer: 'Greg Hammond',
    phone: '(407) 555-0204',
    amount_cents: 22000,
    created_at: ago(2),
    stage: 'booked',
    days_in_stage: 2,
    last_touch: 'sms',
    job_type: 'Contactor replacement',
  },
  {
    id: 'q-011',
    customer: 'Karen Holloway',
    phone: '(407) 555-0091',
    amount_cents: 280000,
    created_at: ago(1),
    stage: 'booked',
    days_in_stage: 1,
    last_touch: 'sms',
    job_type: 'Water heater replacement',
  },
  {
    id: 'q-012',
    customer: 'Jennifer Martinez',
    phone: '(407) 555-0114',
    amount_cents: 17900,
    created_at: ago(0),
    stage: 'booked',
    days_in_stage: 0,
    last_touch: null,
    job_type: 'After-hours dispatch',
  },
  {
    id: 'q-013',
    customer: 'Daniel Park',
    phone: '(407) 555-0772',
    amount_cents: 95000,
    created_at: ago(35),
    stage: 'opted_out',
    days_in_stage: 35,
    last_touch: 'sms',
    job_type: 'Mini-split quote',
  },
  {
    id: 'q-014',
    customer: 'Rebecca Lin',
    phone: '(407) 555-0379',
    amount_cents: 48000,
    created_at: ago(45),
    stage: 'opted_out',
    days_in_stage: 45,
    last_touch: 'call',
    job_type: 'Service contract',
  },
  {
    id: 'q-015',
    customer: 'Yvonne Castillo',
    phone: '(407) 555-0277',
    amount_cents: 1200000,
    created_at: ago(0),
    stage: 'new',
    days_in_stage: 0,
    last_touch: null,
    job_type: 'New 4-ton heat pump',
  },
]

// Counts by sequence step — used by the Overview's "Quote Follow-Ups
// Sent" bar chart.
export function quoteFollowupCounts(): { day: string; sent: number }[] {
  // Counts are intentionally larger than `quotes.length` because the chart
  // represents historical sends, not currently-in-stage quotes.
  return [
    { day: 'Day 1', sent: 89 },
    { day: 'Day 3', sent: 71 },
    { day: 'Day 7', sent: 54 },
    { day: 'Day 14', sent: 38 },
    { day: 'Day 30', sent: 22 },
  ]
}
