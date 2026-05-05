/**
 * CommandSite — "Today" action queue. Things that should grab Josh's
 * attention right now, ordered by priority. Mixes pipeline signals,
 * customer-health alerts, MRR changes, and celebrations.
 */

export type TodayKind =
  | 'reply_needed'
  | 'demo_today'
  | 'at_risk_alert'
  | 'mrr_change'
  | 'expansion_signal'
  | 'new_signup'
  | 'churn_warning'
  | 'celebration'
  | 'task'

export type Priority = 'high' | 'medium' | 'low'

export interface TodayItem {
  id: string
  kind: TodayKind
  priority: Priority
  title: string
  detail: string
  cta: string
  /** Foreign-key reference to a Company or Deal so the row can deep-link */
  related_id?: string
  related_kind?: 'company' | 'deal'
  created_at: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const KIND_META: Record<TodayKind, { label: string; color: string; icon: string }> = {
  reply_needed:     { label: 'Reply needed',     color: 'rgb(var(--color-accent))', icon: '💬' },
  demo_today:       { label: 'Demo today',       color: '#F59E0B',                  icon: '🎥' },
  at_risk_alert:    { label: 'At-risk',          color: '#EF4444',                  icon: '⚠️' },
  mrr_change:       { label: 'MRR change',       color: '#10B981',                  icon: '📈' },
  expansion_signal: { label: 'Expansion',        color: '#10B981',                  icon: '🎯' },
  new_signup:       { label: 'New signup',       color: 'rgb(var(--color-brand))',  icon: '🎉' },
  churn_warning:    { label: 'Churn warning',    color: '#EF4444',                  icon: '🚨' },
  celebration:      { label: 'Celebration',      color: '#A855F7',                  icon: '🥂' },
  task:             { label: 'Task',             color: '#94A3B8',                  icon: '✓' },
}

export const todayItems: TodayItem[] = [
  // HIGH
  {
    id: 't-001',
    kind: 'reply_needed',
    priority: 'high',
    title: 'Jorge at Premier Plumbing replied "send me times"',
    detail: 'Cold-email touch #1 worked — reply landed 14 min ago. Send Calendly today.',
    cta: 'Reply with Calendly',
    related_id: 'd-007', related_kind: 'deal',
    created_at: ago(0, 14),
  },
  {
    id: 't-002',
    kind: 'at_risk_alert',
    priority: 'high',
    title: 'BrightVolt Electric — login frequency down 60%',
    detail: 'Derrick was daily, now weekly. 2 open tickets. Suggest a 15-min check-in this week before the renewal in 23 days.',
    cta: 'Book check-in',
    related_id: 'co-003', related_kind: 'company',
    created_at: ago(2),
  },
  {
    id: 't-003',
    kind: 'demo_today',
    priority: 'high',
    title: 'Spark Electric demo at 2 PM ET',
    detail: 'Inbound from comparison page. 11 techs. Prep notes ready — focus on call volume + after-hours pain.',
    cta: 'Open demo brief',
    related_id: 'd-008', related_kind: 'deal',
    created_at: ago(4),
  },

  // MEDIUM
  {
    id: 't-004',
    kind: 'expansion_signal',
    priority: 'medium',
    title: 'Apex Heating hitting Pro plan call limits',
    detail: 'Marcus used 94% of his monthly call quota and is on track to overage by Friday. Natural Scale upgrade conversation (+$500/mo).',
    cta: 'Send upgrade pitch',
    related_id: 'co-001', related_kind: 'company',
    created_at: ago(5),
  },
  {
    id: 't-005',
    kind: 'mrr_change',
    priority: 'medium',
    title: '+$890 MRR overnight — GreenLeaf added a tech seat',
    detail: 'Wes added a 6th tech to the GreenLeaf account. Stripe processed the prorated upgrade automatically.',
    cta: 'Send thank-you note',
    related_id: 'co-004', related_kind: 'company',
    created_at: ago(8),
  },
  {
    id: 't-006',
    kind: 'celebration',
    priority: 'medium',
    title: 'NPS 9 from ClearStream Pool — case study time',
    detail: 'Emma scored a 9 on the in-product NPS survey + said "happy to be quoted." Perfect candidate for the second case study.',
    cta: 'Draft case-study ask',
    related_id: 'co-005', related_kind: 'company',
    created_at: ago(10),
  },
  {
    id: 't-007',
    kind: 'reply_needed',
    priority: 'medium',
    title: 'Whitney at Bayside Plumbing — researched, ready to send',
    detail: 'LinkedIn opener drafted referencing her after-hours coverage comment. Send before EOD for best response window.',
    cta: 'Send LinkedIn DM',
    related_id: 'd-004', related_kind: 'deal',
    created_at: ago(11),
  },

  // LOW
  {
    id: 't-008',
    kind: 'new_signup',
    priority: 'low',
    title: 'HomeShield Pest started a 14-day trial yesterday',
    detail: 'Day 4 of trial. Twilio connected. Hasn\'t enabled review automation yet — auto-nudge fires day 6.',
    cta: 'View trial progress',
    related_id: 'co-006', related_kind: 'company',
    created_at: ago(20),
  },
  {
    id: 't-009',
    kind: 'task',
    priority: 'low',
    title: '3 cold emails bounced — clean the suppression list',
    detail: 'Smartlead sequence "HVAC operators FL Q2" had 3 hard bounces this morning. They\'re auto-suppressed; just confirm.',
    cta: 'Review bounces',
    created_at: ago(22),
  },
  {
    id: 't-010',
    kind: 'task',
    priority: 'low',
    title: 'Northstar Roofing — Hailey said decision by Friday',
    detail: 'Demo was 5 days ago. Custom Loom video answering her 3 questions hasn\'t been recorded yet. Block 30 min today.',
    cta: 'Open Loom drafts',
    related_id: 'd-010', related_kind: 'deal',
    created_at: ago(24),
  },
]

export interface TodayStats {
  high_count: number
  medium_count: number
  low_count: number
  pipeline_at_stake_cents: number
  mrr_at_stake_cents: number
}

export function todayStats(): TodayStats {
  return {
    high_count: todayItems.filter((t) => t.priority === 'high').length,
    medium_count: todayItems.filter((t) => t.priority === 'medium').length,
    low_count: todayItems.filter((t) => t.priority === 'low').length,
    pipeline_at_stake_cents: 1_198_000 + 1_200_000,  // sum of related deal ARRs (high-priority)
    mrr_at_stake_cents: 49_900,                       // BrightVolt MRR at risk
  }
}

// Quick-glance "yesterday/today" pulse — a small ribbon on the Today page.
export interface TodayPulse {
  new_replies: number
  demos_today: number
  trial_signups_today: number
  mrr_change_cents: number
  active_at_risk: number
}

export function todayPulse(): TodayPulse {
  return {
    new_replies: 2,
    demos_today: 1,
    trial_signups_today: 0,
    mrr_change_cents: 89_000,  // +$890 from GreenLeaf seat add
    active_at_risk: 1,
  }
}
