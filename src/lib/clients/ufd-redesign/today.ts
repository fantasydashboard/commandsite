/**
 * UFD Today action queue — what needs Josh's attention right now,
 * mixing trial-conversion signals, viral spikes, churn alerts, and
 * payment dunning.
 *
 * Specific to the B2C/viral/lifecycle pattern (vs. CommandSite's
 * sales-pipeline-driven Today). Cards-as-product thesis baked in —
 * viral signals get top-billing alongside revenue.
 */

export type TodayKind =
  | 'trial_signup'
  | 'trial_expiring'
  | 'viral_spike'
  | 'mrr_change'
  | 'failed_payment'
  | 'churn_save'
  | 'power_user_milestone'
  | 'reddit_mention'
  | 'season_event'
  | 'task'

export type Priority = 'high' | 'medium' | 'low'

export interface TodayItem {
  id: string
  kind: TodayKind
  priority: Priority
  title: string
  detail: string
  cta: string
  /** Foreign key to user record where applicable */
  related_user_id?: string
  created_at: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const KIND_META: Record<TodayKind, { label: string; color: string; icon: string }> = {
  trial_signup:         { label: 'New trial',         color: 'rgb(var(--color-accent))', icon: '🆕' },
  trial_expiring:       { label: 'Trial expiring',    color: '#F59E0B',                  icon: '⏳' },
  viral_spike:          { label: 'Viral spike',       color: '#10B981',                  icon: '🚀' },
  mrr_change:           { label: 'MRR change',        color: '#10B981',                  icon: '📈' },
  failed_payment:       { label: 'Failed payment',    color: '#EF4444',                  icon: '💳' },
  churn_save:           { label: 'Churn save',        color: '#EF4444',                  icon: '🚨' },
  power_user_milestone: { label: 'Power user',        color: '#A855F7',                  icon: '🏆' },
  reddit_mention:       { label: 'Reddit mention',    color: '#FF4500',                  icon: 'r/' },
  season_event:         { label: 'Season',            color: 'rgb(var(--color-brand))',  icon: '🏈' },
  task:                 { label: 'Task',              color: '#94A3B8',                  icon: '✓' },
}

export const todayItems: TodayItem[] = [
  // ── HIGH PRIORITY
  {
    id: 't-001',
    kind: 'trial_expiring',
    priority: 'high',
    title: 'Jordan Maddux — trial expires in 24h, no cards shared',
    detail: 'Day 6 of 7. Made 3 cards, didn\'t share any. Conversion-email send fires today at 12 PM ET. Worth a personal touch?',
    cta: 'Send personal note',
    related_user_id: 'u-009',
    created_at: ago(0, 18),
  },
  {
    id: 't-002',
    kind: 'failed_payment',
    priority: 'high',
    title: 'Cameron Yost — card declined on monthly renewal',
    detail: 'Stripe attempt 1 failed (insufficient funds). Auto-retry in 36h. Cameron has been disengaged 18d already — high churn risk.',
    cta: 'View dunning flow',
    related_user_id: 'u-010',
    created_at: ago(2),
  },
  {
    id: 't-003',
    kind: 'viral_spike',
    priority: 'high',
    title: 'Mason Whitaker shared a Power Rankings card → 12k impressions',
    detail: 'Twitter post hit 12k views overnight, 3 referral signups already attributed. Worth amplifying — quote in tomorrow\'s LinkedIn post?',
    cta: 'View card',
    related_user_id: 'u-001',
    created_at: ago(4),
  },

  // ── MEDIUM
  {
    id: 't-004',
    kind: 'trial_signup',
    priority: 'medium',
    title: '+3 trial signups overnight',
    detail: 'Tasha Rivers (just signed 14h ago, no league connected yet), Riley Boucher (day 4, already shared 2 cards), Kennedy Park (day 2, engaged).',
    cta: 'View trial pipeline',
    created_at: ago(8),
  },
  {
    id: 't-005',
    kind: 'mrr_change',
    priority: 'medium',
    title: '+$79 MRR overnight — Ramón Téllez upgraded to annual',
    detail: 'Converted from trial straight to annual ($79/yr). Strong commitment signal. NPS-prompt fires after day 7.',
    cta: 'View user',
    related_user_id: 'u-005',
    created_at: ago(11),
  },
  {
    id: 't-006',
    kind: 'power_user_milestone',
    priority: 'medium',
    title: 'Jess Bowman crossed 200 lifetime shares',
    detail: '200th share milestone. She\'s also driven 8 attributed signups. Send a thank-you with a free 2-month annual extension.',
    cta: 'Send thank-you + reward',
    related_user_id: 'u-002',
    created_at: ago(14),
  },
  {
    id: 't-007',
    kind: 'churn_save',
    priority: 'medium',
    title: 'Olivia Renteria cancelled 3 weeks ago — schedule winback',
    detail: 'Cited "off-season" as cancel reason. NFL kicks off in ~4 months. Set a winback for Aug 1 with a 50%-off-first-month offer.',
    cta: 'Schedule winback',
    related_user_id: 'u-011',
    created_at: ago(20),
  },
  {
    id: 't-008',
    kind: 'reddit_mention',
    priority: 'medium',
    title: 'r/fantasyfootball thread mentioning UFD — needs reply',
    detail: '"Has anyone tried Ultimate Fantasy Dashboard?" thread, 38 comments, mostly positive. Marcus (a power user) defended you. Drop in to thank him + answer the 2 honest questions.',
    cta: 'Open thread',
    created_at: ago(22),
  },

  // ── LOW
  {
    id: 't-009',
    kind: 'season_event',
    priority: 'low',
    title: 'NFL Draft is in 6 weeks — content/email ramp time',
    detail: 'Draft is the second-biggest engagement moment of the year. Plan: 3 themed cards (Mock draft analyzer, Rookie tier list, Sleeper picks) + 2 email blasts to trial-expired list.',
    cta: 'Build draft campaign',
    created_at: ago(26),
  },
  {
    id: 't-010',
    kind: 'task',
    priority: 'low',
    title: 'Email open rate dropped 6% week-over-week',
    detail: 'This week\'s lifecycle emails averaged 31% open vs. 37% last week. Could be subject-line A/B test going badly. Check in Email Pipeline.',
    cta: 'Investigate',
    created_at: ago(30),
  },
]

export interface TodayStats {
  high_count: number
  medium_count: number
  low_count: number
  trials_at_risk: number
  pipeline_at_risk_cents: number
  viral_signups_today: number
}

export function todayStats(): TodayStats {
  return {
    high_count: todayItems.filter((t) => t.priority === 'high').length,
    medium_count: todayItems.filter((t) => t.priority === 'medium').length,
    low_count: todayItems.filter((t) => t.priority === 'low').length,
    trials_at_risk: 1,                  // Jordan Maddux
    pipeline_at_risk_cents: 999,         // Cameron Yost MRR
    viral_signups_today: 3,              // attributed referrals from Mason's spike
  }
}

// Live pulse — front-and-center ribbon
export interface TodayPulse {
  trials_today: number
  conversions_today: number
  mrr_change_cents: number
  viral_referrals_24h: number
  churns_today: number
}
export function todayPulse(): TodayPulse {
  return {
    trials_today: 3,
    conversions_today: 1,         // Ramón
    mrr_change_cents: 7_900,       // +$79 from Ramón annual
    viral_referrals_24h: 3,
    churns_today: 0,
  }
}
