/**
 * Type contracts for the Heritage Bath & Kitchen Co. demo client.
 *
 * Same shapes as Apex for the roles/quotes/reviews/etc. — bath/kitchen
 * remodelers share the same data model as HVAC shops (quote → followup
 * → close, customer → reactivation, etc.). Two NEW shapes specific to
 * the Pro tier additions: LeadSourceRecord and ReferralRecord.
 */

// Re-export shared Apex shapes so heritage modules can import either path
// without confusion. The data structures don't differ across verticals.
export type {
  QuoteRecord,
  QuoteStage,
  ReviewRecord,
  ReactivationRecord,
  RecentActivityEvent,
  RevenueRecovered,
  CallRecord,
  CallOutcome,
  LeadQuality,
} from '../apex/types'

// ── NEW for Pro tier: Lead Sources dashboard ───────────────────────────
//
// Shows CAC by source — LSA, referrals, reviews, direct, paid social, etc.
// Owner sees which channels are actually profitable vs. which they think
// are profitable. Most owners have never seen this view of their business.

export type LeadSourceChannel =
  | 'lsa'              // Google Local Services Ads
  | 'google_reviews'   // Organic Google search driven by reviews
  | 'referrals'        // Customer-to-customer referrals
  | 'houzz_pro'        // Houzz Pro directory listing (remodel-specific)
  | 'instagram'        // Organic Instagram presence
  | 'nextdoor'         // NextDoor neighborhood mentions
  | 'direct'           // Direct site visits, word of mouth without referral tracking
  | 'paid_meta'        // Paid Facebook/Instagram ads
  | 'paid_google'      // Paid Google search ads (not LSA)

export interface LeadSourceRecord {
  channel: LeadSourceChannel
  /** Human-readable name */
  label: string
  /** Leads received this period (default: rolling 30 days) */
  leads_count: number
  /** Total spend this period in cents (0 for organic channels) */
  spend_cents: number
  /** Cost per lead = spend / leads, in cents */
  cost_per_lead_cents: number
  /** Closed jobs from this channel this period */
  closed_count: number
  /** Close rate = closed / leads */
  close_rate: number
  /** Total revenue attributed this period in cents */
  revenue_cents: number
  /** Net ROI = revenue - spend, in cents (negative means losing money) */
  roi_cents: number
  /** Trend vs prior period */
  trend: 'up' | 'down' | 'flat'
  /** Trend delta — percentage change in cost-per-lead vs prior 30 days */
  trend_pct: number
  /** Ada's one-line read on this channel */
  ada_note: string
}

// ── NEW for Pro tier: Referral Engine ──────────────────────────────────
//
// Tracks Ada's automated referral asks. Customer just had a 5-star
// experience → Ada drafts a "would you refer us to a friend?" message →
// owner approves and sends → friend gets a discount link → conversion
// tracked + thank-you to the original referrer.

export type ReferralStage =
  | 'queued'           // Ada has drafted, owner hasn't sent
  | 'sent'             // Owner sent the ask, no response yet
  | 'replied'          // Customer replied (positive or negative)
  | 'referred'         // Customer provided a friend's contact info
  | 'friend_booked'    // The referred friend booked a consultation
  | 'friend_closed'    // The referred friend became a paying customer

export interface ReferralRecord {
  id: string
  /** Customer being asked to refer */
  referrer_name: string
  referrer_phone: string
  /** What recent job triggered the referral ask */
  trigger_job: string
  /** Star rating that triggered the ask (Ada asks after 5-star reviews) */
  trigger_rating: 5 | 4
  /** When Ada drafted the ask */
  drafted_at: string
  /** Where in the pipeline */
  stage: ReferralStage
  /** Ada's drafted message awaiting owner approval (if queued) */
  drafted_message?: string
  /** The friend's name if they were referred */
  referred_friend_name?: string
  referred_friend_phone?: string
  /** Estimated value of the referred friend's job if booked */
  estimated_value_cents?: number
  /** When the referral converted (if it did) */
  converted_at?: string
  /** Actual revenue from the referred friend (if closed) */
  actual_revenue_cents?: number
}
