/**
 * CommandSite Automations registry — what's running on autopilot.
 *
 * Solo-founder reality: the dashboard runs your sales + lifecycle work
 * while you ship product. Each automation has a confidence threshold;
 * only the rare exceptions need your eyes.
 */

export type AutomationKind =
  | 'cold_email_sequence'
  | 'reply_classifier'
  | 'auto_pipeline_promote'
  | 'lead_enrichment'
  | 'engaged_lead_promote'
  | 'demo_reminder'
  | 'failed_payment_dunning'
  | 'social_drafting'
  | 'health_scoring'
  | 'nps_trigger'

export type AutomationStatus = 'active' | 'paused' | 'learning'

export interface Automation {
  id: string
  kind: AutomationKind
  name: string
  description: string
  status: AutomationStatus
  trigger: string
  confidence_threshold?: number
  /** Counts in the last 7 days */
  auto_handled_7d: number
  needed_review_7d: number
  /** Outcomes the founder cares about */
  outcomes_30d?: { label: string; value: string }[]
  last_ran_at: string
  /** "Mondays at 10 AM" / "On every reply" — visible in the panel */
  schedule_label?: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const STATUS_META: Record<AutomationStatus, { label: string; color: string }> = {
  active:   { label: 'Auto-running',           color: '#10B981' },
  paused:   { label: 'Paused',                 color: '#94A3B8' },
  learning: { label: 'Learning · supervised',  color: '#F59E0B' },
}

export const KIND_META: Record<AutomationKind, { label: string; icon: string }> = {
  cold_email_sequence:    { label: 'Cold email sequences',    icon: '✉' },
  reply_classifier:       { label: 'Reply classifier',         icon: '🧠' },
  auto_pipeline_promote:  { label: 'Auto pipeline promotion', icon: '➡' },
  lead_enrichment:        { label: 'Lead enrichment',          icon: '🔍' },
  engaged_lead_promote:   { label: 'Social → pipeline',        icon: '🎯' },
  demo_reminder:          { label: 'Demo show-up reminders',  icon: '🎥' },
  failed_payment_dunning: { label: 'Failed-payment dunning',  icon: '💳' },
  social_drafting:        { label: 'Weekly social drafts',    icon: '📝' },
  health_scoring:         { label: 'Customer health scoring', icon: '❤' },
  nps_trigger:            { label: 'NPS triggers',             icon: '📊' },
}

export const automations: Automation[] = [
  {
    id: 'cs-auto-001',
    kind: 'cold_email_sequence',
    name: 'Cold email sequences',
    description: 'Sends 4-touch cadences to ICP-fit prospects across 7 active sequences. Paces sending to protect domain reputation.',
    status: 'active',
    trigger: 'Daily — 9 AM and 2 PM local',
    auto_handled_7d: 184,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Sent',         value: '687' },
      { label: 'Replied',      value: '94' },
      { label: 'Demos booked', value: '23' },
    ],
    last_ran_at: ago(0, 1),
    schedule_label: '9 AM + 2 PM daily',
  },
  {
    id: 'cs-auto-002',
    kind: 'reply_classifier',
    name: 'AI reply classifier',
    description: 'Tags every reply (positive / objection / negative / OOF / spam / unsubscribe). Auto-suppresses negatives + OOFs. Drafts responses to objections.',
    status: 'active',
    trigger: 'On every inbound reply',
    confidence_threshold: 0.90,
    auto_handled_7d: 38,
    needed_review_7d: 4,
    outcomes_30d: [
      { label: 'Auto-classified', value: '142' },
      { label: 'Auto-handled',    value: '127' },
      { label: 'Owner reviewed',  value: '15' },
    ],
    last_ran_at: ago(0, 1),
  },
  {
    id: 'cs-auto-003',
    kind: 'auto_pipeline_promote',
    name: 'Auto pipeline promotion',
    description: 'When a reply is classified positive ≥ 90% confidence and ICP fit ≥ 80, auto-creates the pipeline deal at "Replied" + auto-sends Calendly link.',
    status: 'active',
    trigger: 'On every positive reply',
    confidence_threshold: 0.90,
    auto_handled_7d: 9,
    needed_review_7d: 1,
    outcomes_30d: [
      { label: 'Deals auto-created', value: '34' },
      { label: 'Calendly auto-sent', value: '34' },
      { label: 'Demos booked',       value: '23' },
    ],
    last_ran_at: ago(0, 4),
  },
  {
    id: 'cs-auto-004',
    kind: 'lead_enrichment',
    name: 'Daily lead enrichment',
    description: 'Pulls 50-100 ICP-fit prospects/day from Apollo + Clay. Enriches with role, company size, intent signals. Auto-scores ICP fit.',
    status: 'active',
    trigger: 'Daily — 6 AM',
    auto_handled_7d: 412,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Leads enriched',  value: '1,847' },
      { label: 'ICP-fit ≥ 80',    value: '218' },
      { label: 'Sequence-ready',  value: '184' },
    ],
    last_ran_at: ago(8),
    schedule_label: '6 AM daily',
  },
  {
    id: 'cs-auto-005',
    kind: 'engaged_lead_promote',
    name: 'Social engager → pipeline',
    description: 'When a LinkedIn / X engager hits 2+ engagements AND ICP fit ≥ 80, auto-creates a pipeline deal as "Inbound · warm."',
    status: 'active',
    trigger: 'On every engagement event',
    confidence_threshold: 0.80,
    auto_handled_7d: 6,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Auto-promoted', value: '18' },
      { label: 'Demos booked',  value: '7' },
    ],
    last_ran_at: ago(2),
  },
  {
    id: 'cs-auto-006',
    kind: 'demo_reminder',
    name: 'Demo show-up reminders',
    description: 'Auto-sends SMS + email 2h before every booked demo. Shaves no-show rate from ~45% to ~22% in our data.',
    status: 'active',
    trigger: '2h before scheduled demo',
    auto_handled_7d: 8,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Reminders sent', value: '34' },
      { label: 'Show-up rate',   value: '78%' },
    ],
    last_ran_at: ago(4),
  },
  {
    id: 'cs-auto-007',
    kind: 'social_drafting',
    name: 'Weekly social drafts',
    description: 'Generates Mon-Sun draft posts for LinkedIn + X based on your content calendar themes. You batch-approve Sundays at 8 PM.',
    status: 'active',
    trigger: 'Weekly · Sunday 4 PM (you approve at 8 PM)',
    auto_handled_7d: 14,
    needed_review_7d: 14,  // weekly batch is the "review"
    outcomes_30d: [
      { label: 'Drafts generated', value: '60' },
      { label: 'Posts published',  value: '52' },
      { label: 'Time saved',       value: '~6 hrs' },
    ],
    last_ran_at: ago(72),
    schedule_label: 'Sundays at 4 PM',
  },
  {
    id: 'cs-auto-008',
    kind: 'failed_payment_dunning',
    name: 'Failed-payment dunning',
    description: 'Stripe webhook → auto-retries on day 1, 3, 7. Sends friendly card-update text after first failure.',
    status: 'active',
    trigger: 'On payment_failed event',
    auto_handled_7d: 2,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Recovery rate', value: '82%' },
      { label: 'Cards updated', value: '4' },
    ],
    last_ran_at: ago(36),
  },
  {
    id: 'cs-auto-009',
    kind: 'health_scoring',
    name: 'Customer health scoring',
    description: 'Pulls product usage from PostHog + payment status from Stripe + support volume. Auto-flags at-risk accounts.',
    status: 'active',
    trigger: 'Hourly',
    auto_handled_7d: 168,  // 24 × 7 = 168 hourly runs
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Accounts scored', value: '10' },
      { label: 'Newly flagged',   value: '1' },
      { label: 'Recovered',       value: '0' },
    ],
    last_ran_at: ago(0, 12),
  },
  {
    id: 'cs-auto-010',
    kind: 'nps_trigger',
    name: 'NPS trigger',
    description: 'Sends in-app NPS at day 30 of paid + quarterly thereafter. Promoter responses surface as testimonial-candidate flags.',
    status: 'learning',
    trigger: 'Day 30 + quarterly',
    auto_handled_7d: 2,
    needed_review_7d: 0,
    outcomes_30d: [
      { label: 'Sent',             value: '8' },
      { label: 'Responded',        value: '6' },
      { label: 'Promoter (≥9)',    value: '4' },
    ],
    last_ran_at: ago(48),
  },
]

export interface AutomationStats {
  active_count: number
  total_count: number
  auto_handled_7d: number
  needed_review_7d: number
  auto_handle_rate: number
  /** Estimated founder hours saved at ~5 min per automated action */
  hours_saved_7d: number
}

export function automationStats(): AutomationStats {
  const active = automations.filter((a) => a.status === 'active').length
  const auto = automations.reduce((s, a) => s + a.auto_handled_7d, 0)
  const review = automations.reduce((s, a) => s + a.needed_review_7d, 0)
  const total = auto + review
  return {
    active_count: active,
    total_count: automations.length,
    auto_handled_7d: auto,
    needed_review_7d: review,
    auto_handle_rate: total > 0 ? auto / total : 0,
    hours_saved_7d: Math.round((auto * 5) / 60),
  }
}
