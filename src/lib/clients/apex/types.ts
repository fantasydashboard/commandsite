/**
 * Type contracts for the Apex Heating & Air demo client.
 *
 * These shapes intentionally match what real CommandSite-for-home-services
 * data would look like — the dummy modules below pretend to be edge
 * functions returning these shapes. Swapping to real backend later means
 * implementing the same shapes, no UI changes needed.
 */

export type CallOutcome = 'dispatched' | 'booked' | 'voicemail' | 'opted_out'
export type LeadQuality = 'hot' | 'warm' | 'cold'

export interface CallRecord {
  id: string
  caller: string
  phone: string
  /** ISO timestamp when the call came in */
  time: string
  /** Duration in seconds */
  duration: number
  lead_quality: LeadQuality
  outcome: CallOutcome
  /** "AI Receptionist", "After-hours dispatch", etc. — what the AI did */
  handled_by: 'ai' | 'human' | 'voicemail'
  /** Optional transcript shown in the Listen modal */
  transcript?: string
  /** Job tags for filtering */
  job_type?: string
}

export type QuoteStage =
  | 'new'
  | 'followup_day_1'
  | 'followup_day_3'
  | 'followup_day_7'
  | 'followup_day_14'
  | 'followup_day_30'
  | 'booked'
  | 'opted_out'

export interface QuoteRecord {
  id: string
  customer: string
  phone: string
  amount_cents: number
  /** When the quote was created */
  created_at: string
  /** Where in the followup pipeline */
  stage: QuoteStage
  /** Days since quote was sent */
  days_in_stage: number
  /** What we last did (text/email/call) */
  last_touch: 'sms' | 'email' | 'call' | null
  job_type: string
}

export interface ReviewRecord {
  id: string
  customer: string
  rating: 1 | 2 | 3 | 4 | 5
  source: 'google' | 'facebook' | 'yelp' | 'nextdoor'
  text: string
  received_at: string
  /** Job that prompted the review */
  job_type?: string
  /** Owner's response, if posted */
  response?: { text: string; sent_at: string } | null
  /** AI-suggested response shown for unanswered reviews — owner can
   *  approve / edit / send. */
  ai_response_draft?: string
}

export interface ReactivationRecord {
  id: string
  customer: string
  phone: string
  last_service_date: string
  last_service: string
  contact_attempts: number
  status: 'identified' | 'contacted' | 'engaged' | 'booked' | 'won_back'
  estimated_value_cents: number
}

export interface RecentActivityEvent {
  id: string
  /** ISO timestamp */
  at: string
  /** Plain-text event */
  text: string
  /** For coloring/icon — call / quote / review / reactivation / dispatch */
  kind: 'call' | 'quote' | 'review' | 'reactivation' | 'dispatch'
  /** Which Ada role produced this event — key from adaRoles. Rendered
   *  as a chip in the activity feed so the owner sees which "employee"
   *  did the work. */
  role?: string
}

export interface RevenueRecovered {
  this_month_cents: number
  avg_ticket_cents: number
  projected_annual_cents: number
  /** Daily series for the chart */
  daily: { date: string; cents: number }[]
}
