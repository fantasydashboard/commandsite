/**
 * Apex Automations registry — what's running on autopilot right now.
 *
 * The point of this surface: small business owners don't have time for
 * one-click-per-item approval flows. Default to auto-action with a
 * confidence threshold; surface only the exceptions that need human eyes.
 *
 * Each automation runs itself. Owner intervenes when something looks off.
 */

export type AutomationKind =
  | 'review_reply'
  | 'reactivation_outreach'
  | 'quote_followup'
  | 'review_request'
  | 'tech_eta_text'
  | 'after_hours_dispatch'
  | 'maintenance_reminder'
  | 'failed_payment_dunning'

export type AutomationStatus = 'active' | 'paused' | 'learning'

export interface Automation {
  id: string
  kind: AutomationKind
  name: string
  /** One-sentence plain-English description of what it does */
  description: string
  status: AutomationStatus
  /** When does the automation fire */
  trigger: string
  /** AI-confidence threshold above which it auto-acts (null if not AI-driven) */
  confidence_threshold?: number
  /** Counts in the last 7 days */
  sent_7d: number
  /** AI-handled vs flagged for owner review */
  auto_handled_7d: number
  needed_review_7d: number
  /** Outcomes that came from this automation in the last 30 days */
  outcomes_30d?: { label: string; value: string }[]
  last_ran_at: string
  /** Setting that the owner can tweak — e.g. "Send Mondays at 10 AM" */
  schedule_label?: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const STATUS_META: Record<AutomationStatus, { label: string; color: string }> = {
  active:   { label: 'Auto-running',   color: '#10B981' },
  paused:   { label: 'Paused',         color: '#94A3B8' },
  learning: { label: 'Learning · supervised', color: '#F59E0B' },
}

export const KIND_META: Record<AutomationKind, { label: string; icon: string }> = {
  review_reply:          { label: 'Review replies',          icon: '⭐' },
  reactivation_outreach: { label: 'Reactivation outreach',   icon: '🔁' },
  quote_followup:        { label: 'Quote follow-ups',         icon: '💬' },
  review_request:        { label: 'Review requests',         icon: '📨' },
  tech_eta_text:         { label: 'Tech ETA texts',           icon: '🚐' },
  after_hours_dispatch:  { label: 'After-hours dispatch',    icon: '☎' },
  maintenance_reminder:  { label: 'Maintenance reminders',    icon: '🔧' },
  failed_payment_dunning:{ label: 'Failed-payment dunning',  icon: '💳' },
}

export const automations: Automation[] = [
  {
    id: 'auto-001',
    kind: 'after_hours_dispatch',
    name: 'AI Receptionist · 24/7',
    description: 'Answers every call. Triages emergencies. Books appointments. Dispatches the on-call tech.',
    status: 'active',
    trigger: 'Inbound call (any time)',
    sent_7d: 89,
    auto_handled_7d: 86,
    needed_review_7d: 3,
    outcomes_30d: [
      { label: 'Calls handled', value: '247' },
      { label: 'Jobs booked',   value: '81' },
      { label: 'After-hours captures', value: '24' },
    ],
    last_ran_at: ago(0, 3),
  },
  {
    id: 'auto-002',
    kind: 'review_reply',
    name: 'AI review replies (≥ 85% confidence)',
    description: 'Auto-posts a thoughtful reply to every Google + Facebook review. Low-confidence or low-rated reviews queue for your eyes.',
    status: 'active',
    trigger: 'New review on any connected source',
    confidence_threshold: 0.85,
    sent_7d: 12,
    auto_handled_7d: 10,
    needed_review_7d: 2,
    outcomes_30d: [
      { label: 'Auto-posted',   value: '47' },
      { label: 'Avg rating',    value: '4.8★' },
      { label: 'Owner reviewed', value: '6' },
    ],
    last_ran_at: ago(0, 22),
  },
  {
    id: 'auto-003',
    kind: 'reactivation_outreach',
    name: 'Dormant customer outreach',
    description: 'Auto-sends a personalized SMS to dormant customers (9-18 mo since last service) every Monday at 10 AM local.',
    status: 'active',
    trigger: 'Weekly on Mondays at 10 AM',
    sent_7d: 6,
    auto_handled_7d: 6,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Outreach sent', value: '24' },
      { label: 'Replies',       value: '11' },
      { label: 'Won-back revenue', value: '$1,840' },
    ],
    last_ran_at: ago(72),
    schedule_label: 'Mondays at 10 AM',
  },
  {
    id: 'auto-004',
    kind: 'quote_followup',
    name: 'Quote follow-up cadence',
    description: 'Day 1 SMS · Day 3 email · Day 7 SMS · Day 14 owner-call task · Day 30 last-touch email. All sent automatically.',
    status: 'active',
    trigger: 'When a quote enters a follow-up stage',
    sent_7d: 38,
    auto_handled_7d: 35,
    needed_review_7d: 3,
    outcomes_30d: [
      { label: 'Touches sent',   value: '142' },
      { label: 'Replies',        value: '34' },
      { label: 'Quotes closed',  value: '11' },
    ],
    last_ran_at: ago(0, 6),
  },
  {
    id: 'auto-005',
    kind: 'review_request',
    name: 'Post-job review request',
    description: 'Sends a Google review-request SMS 24h after every completed job.',
    status: 'active',
    trigger: '24h after job_completed event',
    sent_7d: 41,
    auto_handled_7d: 41,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Requests sent', value: '162' },
      { label: 'Reviews left',  value: '38' },
      { label: 'Conversion',    value: '23%' },
    ],
    last_ran_at: ago(0, 4),
  },
  {
    id: 'auto-006',
    kind: 'tech_eta_text',
    name: 'Tech-on-the-way text',
    description: 'When a tech taps "En Route" in the field app, customer auto-receives an ETA text with tech name + photo.',
    status: 'active',
    trigger: 'Tech sets job to en_route',
    sent_7d: 47,
    auto_handled_7d: 47,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'ETAs sent',     value: '184' },
      { label: 'On-time arrivals', value: '97%' },
    ],
    last_ran_at: ago(0, 1),
  },
  {
    id: 'auto-007',
    kind: 'failed_payment_dunning',
    name: 'Failed-payment dunning',
    description: 'Auto-retries failed cards on day 1 + 3 + 7. Sends a friendly card-update text after the first failure.',
    status: 'active',
    trigger: 'Stripe payment_failed event',
    sent_7d: 2,
    auto_handled_7d: 2,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Recovery rate', value: '78%' },
      { label: 'Cards updated', value: '6' },
    ],
    last_ran_at: ago(28),
  },
  {
    id: 'auto-008',
    kind: 'maintenance_reminder',
    name: 'Annual maintenance reminders',
    description: 'For customers on the Comfort Club (Apex maintenance plan), auto-books their spring + fall tune-up visits 30 days out.',
    status: 'learning',
    trigger: '30 days before scheduled maintenance window',
    sent_7d: 4,
    auto_handled_7d: 3,
    needed_review_7d: 1,
    outcomes_30d: [
      { label: 'Reminders sent', value: '14' },
      { label: 'Booked',         value: '11' },
    ],
    last_ran_at: ago(48),
  },
]

export interface AutomationStats {
  active_count: number
  total_count: number
  /** Total auto-handled actions across all automations in last 7 days */
  auto_handled_7d: number
  /** Total flagged for owner review in last 7 days */
  needed_review_7d: number
  /** Auto-handle rate (auto / (auto + review)) */
  auto_handle_rate: number
  /** Estimated owner hours saved (~3 min per automated action) */
  hours_saved_7d: number
}

export function automationStats(): AutomationStats {
  const active = automations.filter((a) => a.status === 'active').length
  const auto = automations.reduce((s, a) => s + a.auto_handled_7d, 0)
  const review = automations.reduce((s, a) => s + a.needed_review_7d, 0)
  const total_actions = auto + review
  return {
    active_count: active,
    total_count: automations.length,
    auto_handled_7d: auto,
    needed_review_7d: review,
    auto_handle_rate: total_actions > 0 ? auto / total_actions : 0,
    hours_saved_7d: Math.round((auto * 3) / 60),
  }
}
