/**
 * Heritage Bath & Kitchen Co. — Referral Engine fixture data (NEW for Pro).
 *
 * Tracks Ada's automated referral asks across the pipeline: queued (drafted
 * but not sent), sent, replied, referred (customer gave a friend's contact),
 * friend booked, friend closed. The Referral Engine is one of the highest
 * leverage things Ada does — referrals close at 60%+ vs. 25-30% for cold
 * leads, and CAC is effectively zero.
 */
import type { ReferralRecord } from './types'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

export const referrals: ReferralRecord[] = [
  // ── Queued — Ada has drafted, owner hasn't sent yet ─────────────
  {
    id: 'r-001',
    referrer_name: 'Marcus & Tia Bell',
    referrer_phone: '(813) 555-1144',
    trigger_job: 'Kitchen full renovation · completed 9 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(2),
    stage: 'queued',
    drafted_message:
      "Hey Marcus and Tia, this is Marc with Heritage. Hope the new kitchen's holding up. Honest question — anyone in your circle thinking about a bath or kitchen project this year? If you're comfortable making an intro, they'd get $500 off and you'd get the same as a thank-you. No pressure either way. — Marc",
  },
  {
    id: 'r-002',
    referrer_name: 'Olivia Reagan',
    referrer_phone: '(727) 555-4477',
    trigger_job: 'Powder room + half-bath refresh · completed 5 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(1),
    stage: 'queued',
    drafted_message:
      "Olivia, it's Marc from Heritage. Loved having you as a client — and your 5-star review made my week. If you happen to know someone in St. Pete thinking about a bath remodel this year, I'd appreciate the intro. They get $500 off, you get the same. Thanks for thinking of us either way. — Marc",
  },

  // ── Sent — owner has sent, waiting on response ──────────────────
  {
    id: 'r-003',
    referrer_name: 'Sandra Pham',
    referrer_phone: '(813) 555-2298',
    trigger_job: 'Master bath wet room conversion · completed 18 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(8),
    stage: 'sent',
  },
  {
    id: 'r-004',
    referrer_name: 'The Caldwell Family',
    referrer_phone: '(813) 555-6612',
    trigger_job: 'Kitchen cabinet refacing · completed 22 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(12),
    stage: 'sent',
  },

  // ── Replied — customer responded, may or may not have given a contact ──
  {
    id: 'r-005',
    referrer_name: 'David & Jennifer Holt',
    referrer_phone: '(727) 555-8821',
    trigger_job: 'Primary bath remodel · completed 31 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(20),
    stage: 'replied',
  },

  // ── Referred — customer provided a friend's contact ─────────────
  {
    id: 'r-006',
    referrer_name: 'Karen Whitcomb',
    referrer_phone: '(813) 555-3344',
    trigger_job: 'Kitchen renovation · completed 45 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(28),
    stage: 'referred',
    referred_friend_name: 'Anita Lapierre (neighbor)',
    referred_friend_phone: '(813) 555-7799',
  },

  // ── Friend booked — referred friend booked a consultation ───────
  {
    id: 'r-007',
    referrer_name: 'Joel & Marie Underwood',
    referrer_phone: '(727) 555-1166',
    trigger_job: 'Kitchen island addition · completed 52 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(38),
    stage: 'friend_booked',
    referred_friend_name: 'Pat Rosenbaum',
    referred_friend_phone: '(727) 555-9034',
    estimated_value_cents: 4500000, // est. $45K
  },

  // ── Friend closed — referred friend converted to a paying customer ──
  {
    id: 'r-008',
    referrer_name: 'The Reyes-Quinn Family',
    referrer_phone: '(813) 555-5577',
    trigger_job: 'Bath remodel · completed 68 days ago',
    trigger_rating: 5,
    drafted_at: daysAgo(48),
    stage: 'friend_closed',
    referred_friend_name: 'Sandra Pham',
    referred_friend_phone: '(813) 555-2298',
    estimated_value_cents: 3400000,
    converted_at: daysAgo(14),
    actual_revenue_cents: 3400000, // $34K closed — see r-003 (now a customer being asked to refer!)
  },
]

// ── Helpers for the Referral Engine module ─────────────────────────────

export function referralsAtStage(stage: ReferralRecord['stage']): ReferralRecord[] {
  return referrals.filter((r) => r.stage === stage)
}

export function totalReferralRevenueThisQuarter(): number {
  return referrals
    .filter((r) => r.stage === 'friend_closed')
    .reduce((sum, r) => sum + (r.actual_revenue_cents ?? 0), 0)
}

export function pendingReferralValue(): number {
  return referrals
    .filter((r) => r.stage === 'friend_booked')
    .reduce((sum, r) => sum + (r.estimated_value_cents ?? 0), 0)
}

export function referralConversionRate(): number {
  const asked = referrals.filter((r) => r.stage !== 'queued').length
  if (asked === 0) return 0
  const closed = referrals.filter((r) => r.stage === 'friend_closed').length
  return closed / asked
}
