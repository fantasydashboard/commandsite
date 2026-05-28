/**
 * Heritage Bath & Kitchen Co. — quote pipeline fixture data.
 *
 * Bath/kitchen quotes range $12K–$80K with 30–90 day sales cycles. Quote
 * Chaser is Ada's killer role in this vertical — without followup, 40–60%
 * of quotes go cold. The mix below reflects a typical week: a few fresh
 * quotes, several mid-pipeline, a couple aged that need a stronger nudge.
 */
import type { QuoteRecord } from './types'

// Recent ISO timestamp helper — days ago
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

export const quotes: QuoteRecord[] = [
  // ── Fresh quotes (day 1-3) ─────────────────────────────────────
  {
    id: 'q-001',
    customer: 'Hendricks Family · Westshore',
    phone: '(813) 555-2104',
    amount_cents: 4280000, // $42,800
    created_at: daysAgo(1),
    stage: 'followup_day_1',
    days_in_stage: 1,
    last_touch: 'email',
    job_type: 'Primary bath gut remodel',
  },
  {
    id: 'q-002',
    customer: 'Patricia Mendoza',
    phone: '(813) 555-3812',
    amount_cents: 6850000, // $68,500
    created_at: daysAgo(2),
    stage: 'followup_day_1',
    days_in_stage: 2,
    last_touch: 'sms',
    job_type: 'Kitchen · full renovation w/ island add',
  },
  {
    id: 'q-003',
    customer: 'Carter & Lin',
    phone: '(813) 555-4471',
    amount_cents: 1820000, // $18,200
    created_at: daysAgo(3),
    stage: 'followup_day_3',
    days_in_stage: 3,
    last_touch: 'email',
    job_type: 'Powder room refresh · tile + vanity',
  },

  // ── Mid-pipeline (day 7) — most movement happens here ───────────
  {
    id: 'q-004',
    customer: 'Rodriguez Estate',
    phone: '(727) 555-9023',
    amount_cents: 5440000, // $54,400
    created_at: daysAgo(7),
    stage: 'followup_day_7',
    days_in_stage: 7,
    last_touch: 'sms',
    job_type: 'Master bath + walk-in closet remodel',
  },
  {
    id: 'q-005',
    customer: 'James & Rebecca Liu',
    phone: '(813) 555-6781',
    amount_cents: 3290000, // $32,900
    created_at: daysAgo(7),
    stage: 'followup_day_7',
    days_in_stage: 7,
    last_touch: 'sms',
    job_type: 'Bathroom · accessible aging-in-place conversion',
  },
  {
    id: 'q-006',
    customer: 'Whitfield Family',
    phone: '(813) 555-7345',
    amount_cents: 7820000, // $78,200
    created_at: daysAgo(8),
    stage: 'followup_day_7',
    days_in_stage: 8,
    last_touch: 'email',
    job_type: 'Kitchen · open-concept conversion + walk-in pantry',
  },

  // ── Aged (day 14) — Ada gets more direct here ───────────────────
  {
    id: 'q-007',
    customer: 'David Hernandez',
    phone: '(727) 555-2156',
    amount_cents: 2440000, // $24,400
    created_at: daysAgo(14),
    stage: 'followup_day_14',
    days_in_stage: 14,
    last_touch: 'sms',
    job_type: 'Guest bath · tile shower + double vanity',
  },
  {
    id: 'q-008',
    customer: 'Stephanie Voss',
    phone: '(813) 555-8845',
    amount_cents: 4760000, // $47,600
    created_at: daysAgo(15),
    stage: 'followup_day_14',
    days_in_stage: 15,
    last_touch: 'email',
    job_type: 'Kitchen · cabinet refacing + countertops + backsplash',
  },

  // ── Late-stage (day 30) — last-chance reactivation ──────────────
  {
    id: 'q-009',
    customer: 'Allen & Priya Patel',
    phone: '(813) 555-3392',
    amount_cents: 3680000, // $36,800
    created_at: daysAgo(31),
    stage: 'followup_day_30',
    days_in_stage: 31,
    last_touch: 'sms',
    job_type: 'Primary bath · wet room conversion',
  },

  // ── Booked (won) ─────────────────────────────────────────────────
  {
    id: 'q-010',
    customer: 'Marcus & Tia Bell',
    phone: '(813) 555-1144',
    amount_cents: 5920000, // $59,200
    created_at: daysAgo(11),
    stage: 'booked',
    days_in_stage: 0,
    last_touch: 'call',
    job_type: 'Kitchen · full renovation w/ island',
  },
  {
    id: 'q-011',
    customer: 'Olivia Reagan',
    phone: '(727) 555-4477',
    amount_cents: 2210000, // $22,100
    created_at: daysAgo(6),
    stage: 'booked',
    days_in_stage: 0,
    last_touch: 'sms',
    job_type: 'Powder room + half-bath refresh',
  },

  // ── Opted out ────────────────────────────────────────────────────
  {
    id: 'q-012',
    customer: 'The Stratton Family',
    phone: '(813) 555-9911',
    amount_cents: 4180000, // $41,800
    created_at: daysAgo(22),
    stage: 'opted_out',
    days_in_stage: 0,
    last_touch: 'sms',
    job_type: 'Bath remodel',
    loss_reason: 'went with a competitor',
  },
]

// Helper aggregations used by the Quotes & Inbound module

export function totalPipelineValueCents(): number {
  return quotes
    .filter((q) => q.stage !== 'booked' && q.stage !== 'opted_out')
    .reduce((sum, q) => sum + q.amount_cents, 0)
}

export function quotesAtStage(stage: QuoteRecord['stage']): QuoteRecord[] {
  return quotes.filter((q) => q.stage === stage)
}

export function agingQuoteCount(): number {
  return quotes.filter((q) =>
    q.stage === 'followup_day_7' ||
    q.stage === 'followup_day_14' ||
    q.stage === 'followup_day_30',
  ).length
}
