/**
 * UFD redesign — individual user fixtures.
 * Each "user" is a fantasy football manager using UFD. The B2C parallel
 * to the CommandSite Customers tab — but with viral / share-driven
 * mechanics that don't apply to a B2B account.
 */

export type Plan = 'free_trial' | 'monthly' | 'annual' | 'expired'
export type LifecycleStage =
  | 'trial_new'        // first 48h of trial
  | 'trial_engaged'    // trial + connected league + made 1+ card
  | 'trial_expiring'   // trial day 6+, hasn't paid
  | 'paid_new'         // first 30d paid
  | 'paid_active'      // healthy, daily-ish use
  | 'power_user'       // paid + makes 5+ cards/wk + shares
  | 'at_risk'          // paid but engagement dropped
  | 'churned_recent'   // cancelled in last 30d
  | 'churned_long'     // cancelled 30+ d ago
export type Platform = 'espn' | 'yahoo' | 'sleeper'
export type HealthTrend = 'up' | 'flat' | 'down'

export interface UfdUser {
  id: string
  display_name: string
  email: string
  /** ISO of original signup */
  signed_up_at: string
  /** ISO of most recent login */
  last_login_at: string
  plan: Plan
  /** Monthly recurring revenue in cents (0 if trial / churned) */
  mrr_cents: number
  /** Lifetime paid revenue in cents */
  total_paid_cents: number
  lifecycle_stage: LifecycleStage
  /** Composite 0–100: login freq + cards made + share rate + payment status */
  health_score: number
  health_trend: HealthTrend
  /** Connected fantasy platform(s) */
  platforms: Platform[]
  leagues_connected: number
  cards_made_30d: number
  cards_made_lifetime: number
  /** Share events (clicked the Share button on any card) in last 30d */
  shares_30d: number
  /** Lifetime shares — drives the "top sharer" leaderboard */
  shares_lifetime: number
  /** Estimated viral coefficient — # of new signups attributed to this user's shares */
  viral_signups_attributed: number
  /** What sport season they primarily care about */
  primary_sport: 'NFL' | 'NBA' | 'MLB'
  /** Optional flag explaining a non-default state */
  signal?: string
  /** Top 1-2 favorite card types this user makes (drives content recos) */
  favorite_cards?: string[]
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const PLAN_META: Record<Plan, { label: string; mrr_cents: number; color: string }> = {
  free_trial: { label: 'Free Trial', mrr_cents: 0,    color: '#94A3B8' },
  monthly:    { label: 'Monthly',    mrr_cents: 999,  color: 'rgb(var(--color-accent))' },
  annual:     { label: 'Annual',     mrr_cents: 658,  color: 'rgb(var(--color-brand))' },
  expired:    { label: 'Expired',    mrr_cents: 0,    color: '#64748B' },
}

export const STAGE_META: Record<LifecycleStage, { label: string; color: string; sub: string }> = {
  trial_new:       { label: 'Trial · New',       color: '#94A3B8',                 sub: 'First 48h' },
  trial_engaged:   { label: 'Trial · Engaged',   color: '#A0D8F8',                 sub: 'Connected + made cards' },
  trial_expiring:  { label: 'Trial · Expiring',  color: '#F59E0B',                 sub: 'Day 6+, no convert' },
  paid_new:        { label: 'Paid · New',        color: 'rgb(var(--color-accent))', sub: 'First 30d paid' },
  paid_active:     { label: 'Paid · Active',     color: 'rgb(var(--color-brand))', sub: 'Healthy use' },
  power_user:      { label: 'Power user',        color: '#10B981',                 sub: 'Makes + shares cards' },
  at_risk:         { label: 'At-risk',           color: '#EF4444',                 sub: 'Engagement dropped' },
  churned_recent:  { label: 'Churned · Recent',  color: '#A855F7',                 sub: 'Cancelled in 30d — winback' },
  churned_long:    { label: 'Churned · Long',    color: '#64748B',                 sub: 'Cancelled 30d+ ago' },
}

export const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  espn:    { label: 'ESPN',    color: '#D00' },
  yahoo:   { label: 'Yahoo',   color: '#6E04A0' },
  sleeper: { label: 'Sleeper', color: '#1B9CFC' },
}

export const users: UfdUser[] = [
  // ── POWER USERS / TOP SHARERS
  {
    id: 'u-001',
    display_name: 'Mason Whitaker',
    email: 'mwhitaker@gmail.com',
    signed_up_at: ago(412),
    last_login_at: ago(0, 2),
    plan: 'annual',
    mrr_cents: 658,
    total_paid_cents: 7_900,
    lifecycle_stage: 'power_user',
    health_score: 96,
    health_trend: 'up',
    platforms: ['espn', 'sleeper'],
    leagues_connected: 4,
    cards_made_30d: 28,
    cards_made_lifetime: 412,
    shares_30d: 19,
    shares_lifetime: 287,
    viral_signups_attributed: 14,
    primary_sport: 'NFL',
    favorite_cards: ['Power Rankings', 'Trade Analyzer'],
    signal: 'Top sharer — 14 signups attributed to him this year. Reach out for testimonial.',
  },
  {
    id: 'u-002',
    display_name: 'Jess Bowman',
    email: 'jess.bowman@gmail.com',
    signed_up_at: ago(285),
    last_login_at: ago(0, 6),
    plan: 'annual',
    mrr_cents: 658,
    total_paid_cents: 7_900,
    lifecycle_stage: 'power_user',
    health_score: 92,
    health_trend: 'up',
    platforms: ['yahoo'],
    leagues_connected: 3,
    cards_made_30d: 22,
    cards_made_lifetime: 218,
    shares_30d: 14,
    shares_lifetime: 142,
    viral_signups_attributed: 8,
    primary_sport: 'NFL',
    favorite_cards: ['Weekly Recap', 'Power Rankings'],
    signal: 'Posted a UFD card on Twitter that hit 12k impressions last week.',
  },
  {
    id: 'u-003',
    display_name: 'Devin Patel',
    email: 'dpatel91@hotmail.com',
    signed_up_at: ago(198),
    last_login_at: ago(1),
    plan: 'monthly',
    mrr_cents: 999,
    total_paid_cents: 5_994,
    lifecycle_stage: 'paid_active',
    health_score: 81,
    health_trend: 'flat',
    platforms: ['sleeper'],
    leagues_connected: 2,
    cards_made_30d: 12,
    cards_made_lifetime: 84,
    shares_30d: 4,
    shares_lifetime: 31,
    viral_signups_attributed: 1,
    primary_sport: 'NFL',
    favorite_cards: ['Trade Analyzer'],
  },
  // ── PAID NEW (just converted from trial)
  {
    id: 'u-004',
    display_name: 'Aubrey Castillo',
    email: 'acastillo@yahoo.com',
    signed_up_at: ago(18),
    last_login_at: ago(0, 4),
    plan: 'monthly',
    mrr_cents: 999,
    total_paid_cents: 999,
    lifecycle_stage: 'paid_new',
    health_score: 78,
    health_trend: 'up',
    platforms: ['espn'],
    leagues_connected: 1,
    cards_made_30d: 9,
    cards_made_lifetime: 14,
    shares_30d: 3,
    shares_lifetime: 4,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: 'Converted from trial 18 days ago — track day-30 retention closely.',
  },
  {
    id: 'u-005',
    display_name: 'Ramón Téllez',
    email: 'r.tellez@gmail.com',
    signed_up_at: ago(24),
    last_login_at: ago(2),
    plan: 'annual',
    mrr_cents: 658,
    total_paid_cents: 7_900,
    lifecycle_stage: 'paid_new',
    health_score: 84,
    health_trend: 'up',
    platforms: ['yahoo', 'sleeper'],
    leagues_connected: 2,
    cards_made_30d: 16,
    cards_made_lifetime: 22,
    shares_30d: 6,
    shares_lifetime: 7,
    viral_signups_attributed: 2,
    primary_sport: 'NFL',
    signal: 'Annual plan straight from trial — high commitment signal.',
  },
  // ── TRIAL — ENGAGED (likely to convert)
  {
    id: 'u-006',
    display_name: 'Riley Boucher',
    email: 'riley.b@gmail.com',
    signed_up_at: ago(4),
    last_login_at: ago(0, 1),
    plan: 'free_trial',
    mrr_cents: 0,
    total_paid_cents: 0,
    lifecycle_stage: 'trial_engaged',
    health_score: 73,
    health_trend: 'up',
    platforms: ['espn'],
    leagues_connected: 2,
    cards_made_30d: 7,
    cards_made_lifetime: 7,
    shares_30d: 2,
    shares_lifetime: 2,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: 'Trial day 4 — already shared 2 cards. High convert probability.',
  },
  {
    id: 'u-007',
    display_name: 'Kennedy Park',
    email: 'kpark@me.com',
    signed_up_at: ago(2),
    last_login_at: ago(0, 8),
    plan: 'free_trial',
    mrr_cents: 0,
    total_paid_cents: 0,
    lifecycle_stage: 'trial_engaged',
    health_score: 68,
    health_trend: 'up',
    platforms: ['sleeper'],
    leagues_connected: 1,
    cards_made_30d: 4,
    cards_made_lifetime: 4,
    shares_30d: 0,
    shares_lifetime: 0,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: 'Trial day 2 — engaged but hasn\'t shared yet. Trigger Share-button nudge email.',
  },
  // ── TRIAL — NEW
  {
    id: 'u-008',
    display_name: 'Tasha Rivers',
    email: 'tasha.rivers@gmail.com',
    signed_up_at: ago(0, 14),
    last_login_at: ago(0, 13),
    plan: 'free_trial',
    mrr_cents: 0,
    total_paid_cents: 0,
    lifecycle_stage: 'trial_new',
    health_score: 52,
    health_trend: 'up',
    platforms: [],
    leagues_connected: 0,
    cards_made_30d: 0,
    cards_made_lifetime: 0,
    shares_30d: 0,
    shares_lifetime: 0,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: 'Just signed up 14h ago. Hasn\'t connected a league yet — connect-league nudge fires at 24h.',
  },
  // ── TRIAL — EXPIRING (the conversion moment)
  {
    id: 'u-009',
    display_name: 'Jordan Maddux',
    email: 'jordanmaddux@gmail.com',
    signed_up_at: ago(6),
    last_login_at: ago(2),
    plan: 'free_trial',
    mrr_cents: 0,
    total_paid_cents: 0,
    lifecycle_stage: 'trial_expiring',
    health_score: 41,
    health_trend: 'down',
    platforms: ['espn'],
    leagues_connected: 1,
    cards_made_30d: 3,
    cards_made_lifetime: 3,
    shares_30d: 0,
    shares_lifetime: 0,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: 'Trial day 6 of 7 — last chance. Day-6 conversion email fires today at noon.',
  },
  // ── AT-RISK (paid but disengaged)
  {
    id: 'u-010',
    display_name: 'Cameron Yost',
    email: 'cam.yost@gmail.com',
    signed_up_at: ago(187),
    last_login_at: ago(18),
    plan: 'monthly',
    mrr_cents: 999,
    total_paid_cents: 5_994,
    lifecycle_stage: 'at_risk',
    health_score: 28,
    health_trend: 'down',
    platforms: ['yahoo'],
    leagues_connected: 1,
    cards_made_30d: 1,
    cards_made_lifetime: 47,
    shares_30d: 0,
    shares_lifetime: 12,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
    signal: '18 days since last login. Renewal in 12 days. Send re-engagement email + offer 20% off annual.',
  },
  // ── CHURNED RECENT (winback target)
  {
    id: 'u-011',
    display_name: 'Olivia Renteria',
    email: 'orenteria@hotmail.com',
    signed_up_at: ago(341),
    last_login_at: ago(35),
    plan: 'expired',
    mrr_cents: 0,
    total_paid_cents: 9_990,
    lifecycle_stage: 'churned_recent',
    health_score: 18,
    health_trend: 'down',
    platforms: ['yahoo'],
    leagues_connected: 1,
    cards_made_30d: 0,
    cards_made_lifetime: 132,
    shares_30d: 0,
    shares_lifetime: 38,
    viral_signups_attributed: 2,
    primary_sport: 'NFL',
    signal: 'Cancelled 21 days ago citing "off-season." Football starts again in 4 months — schedule winback for Aug 1.',
  },
  // ── CHURNED LONG (no rush)
  {
    id: 'u-012',
    display_name: 'Brandon Yi',
    email: 'byi.ny@gmail.com',
    signed_up_at: ago(540),
    last_login_at: ago(187),
    plan: 'expired',
    mrr_cents: 0,
    total_paid_cents: 1_998,
    lifecycle_stage: 'churned_long',
    health_score: 8,
    health_trend: 'flat',
    platforms: ['espn'],
    leagues_connected: 0,
    cards_made_30d: 0,
    cards_made_lifetime: 12,
    shares_30d: 0,
    shares_lifetime: 0,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
  },
  // ── PAID ACTIVE — variety
  {
    id: 'u-013',
    display_name: 'Sasha Pellegrino',
    email: 'spellegrino@gmail.com',
    signed_up_at: ago(94),
    last_login_at: ago(0, 5),
    plan: 'annual',
    mrr_cents: 658,
    total_paid_cents: 7_900,
    lifecycle_stage: 'paid_active',
    health_score: 86,
    health_trend: 'up',
    platforms: ['sleeper'],
    leagues_connected: 3,
    cards_made_30d: 11,
    cards_made_lifetime: 89,
    shares_30d: 5,
    shares_lifetime: 41,
    viral_signups_attributed: 3,
    primary_sport: 'NFL',
  },
  {
    id: 'u-014',
    display_name: 'Tyrell Brooks',
    email: 'tbrooks.ftbl@gmail.com',
    signed_up_at: ago(64),
    last_login_at: ago(1),
    plan: 'monthly',
    mrr_cents: 999,
    total_paid_cents: 1_998,
    lifecycle_stage: 'paid_active',
    health_score: 76,
    health_trend: 'flat',
    platforms: ['espn', 'yahoo'],
    leagues_connected: 2,
    cards_made_30d: 8,
    cards_made_lifetime: 41,
    shares_30d: 2,
    shares_lifetime: 9,
    viral_signups_attributed: 1,
    primary_sport: 'NFL',
  },
  {
    id: 'u-015',
    display_name: 'Marisol Acevedo',
    email: 'marisolacevedo@gmail.com',
    signed_up_at: ago(38),
    last_login_at: ago(0, 9),
    plan: 'monthly',
    mrr_cents: 999,
    total_paid_cents: 999,
    lifecycle_stage: 'paid_new',
    health_score: 71,
    health_trend: 'up',
    platforms: ['espn'],
    leagues_connected: 1,
    cards_made_30d: 6,
    cards_made_lifetime: 9,
    shares_30d: 1,
    shares_lifetime: 1,
    viral_signups_attributed: 0,
    primary_sport: 'NFL',
  },
]

export interface UserStats {
  total_paying: number
  total_trialing: number
  total_at_risk: number
  total_churned_recent: number
  total_mrr_cents: number
  avg_health: number
  total_shares_30d: number
  total_viral_signups: number
}

export function userStats(): UserStats {
  const paying = users.filter((u) => u.plan === 'monthly' || u.plan === 'annual')
  const trialing = users.filter((u) => u.plan === 'free_trial').length
  const at_risk = users.filter((u) => u.lifecycle_stage === 'at_risk').length
  const churned_recent = users.filter((u) => u.lifecycle_stage === 'churned_recent').length
  const total_mrr = paying.reduce((s, u) => s + u.mrr_cents, 0)
  const avg_health = paying.length > 0
    ? Math.round(paying.reduce((s, u) => s + u.health_score, 0) / paying.length)
    : 0

  return {
    total_paying: paying.length,
    total_trialing: trialing,
    total_at_risk: at_risk,
    total_churned_recent: churned_recent,
    total_mrr_cents: total_mrr,
    avg_health,
    total_shares_30d: users.reduce((s, u) => s + u.shares_30d, 0),
    total_viral_signups: users.reduce((s, u) => s + u.viral_signups_attributed, 0),
  }
}
