/**
 * CommandSite Product Usage — per-customer feature adoption,
 * activation funnel, and cross-sell flags.
 *
 * The point of this surface: spot expansion + retention work without
 * having to dig into each customer one at a time.
 */
import { companies } from './companies'

/** Each "feature" is a meaningful product capability that customers
 * either use or don't. Drives the heatmap + cross-sell logic. */
export interface Feature {
  key: string
  label: string
  /** Group for the heatmap header */
  group: 'Receptionist' | 'Pipeline' | 'Reviews' | 'Reactivation' | 'Marketing' | 'Reporting'
  /** Plan tier required to unlock (lower-tier customers can't adopt) */
  min_plan: 'starter' | 'pro' | 'scale' | 'enterprise'
  /** Why each customer should turn this on — used in cross-sell card */
  unlock_message: string
}

export const features: Feature[] = [
  // Receptionist
  { key: 'ai_receptionist',  label: 'AI Receptionist',     group: 'Receptionist', min_plan: 'starter', unlock_message: 'The core feature. Without this, you\'re not really using CommandSite.' },
  { key: 'after_hours',      label: 'After-Hours Routing', group: 'Receptionist', min_plan: 'starter', unlock_message: 'Captures the calls that go to voicemail today — typically 30-40% of all callbacks.' },
  { key: 'spam_filter',      label: 'Spam Filter',         group: 'Receptionist', min_plan: 'starter', unlock_message: 'Auto-rejects marketing/SEO solicitation calls. Saves your AI minutes.' },
  // Pipeline
  { key: 'quote_followup',   label: 'Quote Follow-Ups',    group: 'Pipeline',     min_plan: 'pro',     unlock_message: 'The Day-3 SMS alone closes 7-12% more quotes for typical HVAC.' },
  { key: 'manual_call_queue',label: 'Manual Call Queue',   group: 'Pipeline',     min_plan: 'pro',     unlock_message: 'Surfaces the personal-call follow-ups your owner should do this week.' },
  // Reviews
  { key: 'review_automation',label: 'Review Automation',   group: 'Reviews',      min_plan: 'starter', unlock_message: 'Sends post-job review requests automatically. Avg 4.7★ uplift in 60 days.' },
  { key: 'ai_review_reply',  label: 'AI Review Replies',   group: 'Reviews',      min_plan: 'pro',     unlock_message: 'Drafts a thoughtful reply to every review. You approve in one click.' },
  // Reactivation
  { key: 'dormant_detection',label: 'Dormant Detection',   group: 'Reactivation', min_plan: 'pro',     unlock_message: 'Auto-identifies customers gone 9-18 months. Typical recovery: $2-4k/mo.' },
  // Marketing
  { key: 'email_campaigns',  label: 'Email Campaigns',     group: 'Marketing',    min_plan: 'pro',     unlock_message: 'Lifecycle + seasonal email sends. Maintenance plan reminders alone pay for the tier.' },
  { key: 'sms_campaigns',    label: 'SMS Campaigns',       group: 'Marketing',    min_plan: 'scale',   unlock_message: 'Text the dormant list during a heat wave. Not subtle, very effective.' },
  // Reporting
  { key: 'lead_source_roi',  label: 'Lead Source ROI',     group: 'Reporting',    min_plan: 'pro',     unlock_message: 'Shows which marketing dollars actually become booked jobs.' },
  { key: 'multi_location',   label: 'Multi-Location',      group: 'Reporting',    min_plan: 'enterprise', unlock_message: 'Roll up metrics across multiple business units.' },
]

/** Adoption level for a given customer × feature pair. */
export type AdoptionLevel = 'unused' | 'set_up' | 'occasional' | 'active' | 'power'

/** Adoption rows are computed from per-customer feature usage scores.
 * In real life these come from event tracking; here we hand-author
 * to tell the cross-sell story clearly. */
export interface Adoption {
  company_id: string
  feature_key: string
  level: AdoptionLevel
  /** Last time the feature was meaningfully used */
  last_used_at?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

// Adoption matrix — kept compact: only the non-default entries are listed.
// Anything not listed is assumed `unused`. Author rows so each company
// has a believable, story-telling profile.
export const adoptions: Adoption[] = [
  // ── Apex (co-001) — power user, hits Pro plan ceiling
  { company_id: 'co-001', feature_key: 'ai_receptionist',   level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-001', feature_key: 'after_hours',       level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-001', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-001', feature_key: 'quote_followup',    level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-001', feature_key: 'manual_call_queue', level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-001', feature_key: 'review_automation', level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-001', feature_key: 'ai_review_reply',   level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-001', feature_key: 'dormant_detection', level: 'active',     last_used_at: ago(7) },
  { company_id: 'co-001', feature_key: 'email_campaigns',   level: 'occasional', last_used_at: ago(14) },
  { company_id: 'co-001', feature_key: 'lead_source_roi',   level: 'occasional', last_used_at: ago(21) },

  // ── TidalWave (co-002) — Scale-tier heavy user, multi-loc target
  { company_id: 'co-002', feature_key: 'ai_receptionist',   level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'after_hours',       level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'quote_followup',    level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'manual_call_queue', level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'review_automation', level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'ai_review_reply',   level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-002', feature_key: 'dormant_detection', level: 'active',     last_used_at: ago(3) },
  { company_id: 'co-002', feature_key: 'email_campaigns',   level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-002', feature_key: 'sms_campaigns',     level: 'occasional', last_used_at: ago(20) },
  { company_id: 'co-002', feature_key: 'lead_source_roi',   level: 'active',     last_used_at: ago(1) },

  // ── BrightVolt (co-003) — at-risk: only using basics
  { company_id: 'co-003', feature_key: 'ai_receptionist',   level: 'occasional', last_used_at: ago(11) },
  { company_id: 'co-003', feature_key: 'after_hours',       level: 'occasional', last_used_at: ago(11) },
  { company_id: 'co-003', feature_key: 'review_automation', level: 'set_up',     last_used_at: ago(40) },
  // Note: hasn't enabled quote_followup, dormant_detection, email_campaigns — huge cross-sell surface

  // ── GreenLeaf (co-004) — onboarding, only basics on
  { company_id: 'co-004', feature_key: 'ai_receptionist',   level: 'set_up',     last_used_at: ago(2) },
  { company_id: 'co-004', feature_key: 'spam_filter',       level: 'set_up',     last_used_at: ago(2) },

  // ── ClearStream (co-005) — Starter plan, healthy use of available features
  { company_id: 'co-005', feature_key: 'ai_receptionist',   level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-005', feature_key: 'after_hours',       level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-005', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-005', feature_key: 'review_automation', level: 'active',     last_used_at: ago(1) },
  // Note: would benefit from upgrading to Pro for quote_followup + dormant_detection

  // ── HomeShield (co-006) — trial day 4, only AI receptionist set up
  { company_id: 'co-006', feature_key: 'ai_receptionist',   level: 'set_up',     last_used_at: ago(0, 8) },
  { company_id: 'co-006', feature_key: 'spam_filter',       level: 'set_up',     last_used_at: ago(2) },

  // ── Stonecrest (co-007) — Pro, steady but underusing follow-ups
  { company_id: 'co-007', feature_key: 'ai_receptionist',   level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-007', feature_key: 'after_hours',       level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-007', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-007', feature_key: 'review_automation', level: 'active',     last_used_at: ago(3) },
  { company_id: 'co-007', feature_key: 'ai_review_reply',   level: 'occasional', last_used_at: ago(11) },
  // Note: not using quote_followup at all → cross-sell

  // ── Polished Cleaning (co-008) — Scale, power user
  { company_id: 'co-008', feature_key: 'ai_receptionist',   level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'after_hours',       level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'quote_followup',    level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'manual_call_queue', level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-008', feature_key: 'review_automation', level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'ai_review_reply',   level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-008', feature_key: 'dormant_detection', level: 'active',     last_used_at: ago(2) },
  { company_id: 'co-008', feature_key: 'email_campaigns',   level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-008', feature_key: 'sms_campaigns',     level: 'occasional', last_used_at: ago(15) },
  { company_id: 'co-008', feature_key: 'lead_source_roi',   level: 'active',     last_used_at: ago(2) },

  // ── Premier Plumbing (co-010) — newer Pro, ramping
  { company_id: 'co-010', feature_key: 'ai_receptionist',   level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-010', feature_key: 'after_hours',       level: 'power',      last_used_at: ago(0) },
  { company_id: 'co-010', feature_key: 'spam_filter',       level: 'active',     last_used_at: ago(0) },
  { company_id: 'co-010', feature_key: 'review_automation', level: 'active',     last_used_at: ago(1) },
  { company_id: 'co-010', feature_key: 'quote_followup',    level: 'occasional', last_used_at: ago(8) },
  // Note: hasn't tried dormant_detection or email_campaigns yet
]

const PLAN_RANK: Record<string, number> = { starter: 0, pro: 1, scale: 2, enterprise: 3 }

/** Lookup: adoption level for a given customer + feature, defaulting to 'unused'. */
export function adoptionFor(companyId: string, featureKey: string): AdoptionLevel {
  const a = adoptions.find((x) => x.company_id === companyId && x.feature_key === featureKey)
  return a?.level ?? 'unused'
}

/** Cross-sell flag — feature a customer's plan supports but they're not using. */
export interface CrossSellFlag {
  company_id: string
  company_name: string
  feature_key: string
  feature_label: string
  message: string
  /** "expansion" if upgrade required, "activation" if already on the right plan */
  kind: 'activation' | 'expansion'
  /** Estimated MRR uplift in cents — only set on `expansion` */
  arr_uplift_cents?: number
}

export function crossSellFlags(): CrossSellFlag[] {
  const out: CrossSellFlag[] = []
  for (const c of companies) {
    if (c.stage === 'churned') continue
    for (const f of features) {
      const lvl = adoptionFor(c.id, f.key)
      if (lvl !== 'unused' && lvl !== 'set_up') continue

      const customerPlan = PLAN_RANK[c.plan] ?? 0
      const featurePlan = PLAN_RANK[f.min_plan] ?? 0
      if (customerPlan >= featurePlan) {
        // Activation play — feature already in their tier
        out.push({
          company_id: c.id, company_name: c.name,
          feature_key: f.key, feature_label: f.label,
          message: f.unlock_message, kind: 'activation',
        })
      } else {
        // Expansion play — they'd need to upgrade
        out.push({
          company_id: c.id, company_name: c.name,
          feature_key: f.key, feature_label: f.label,
          message: f.unlock_message, kind: 'expansion',
          arr_uplift_cents: 50_000,  // demo placeholder — would compute from plan diff
        })
      }
    }
  }
  return out
}

/** Activation funnel — share of customers that have hit each milestone. */
export interface ActivationStep {
  stage: string
  description: string
  count: number
  pct_of_top: number
}

export function activationFunnel(): ActivationStep[] {
  // Demo numbers calibrated to make a believable story.
  const top = 45  // total signups in 90d
  const steps: { stage: string; description: string; count: number }[] = [
    { stage: 'Signed up',           description: 'Created account', count: 45 },
    { stage: 'Connected billing',   description: 'Stripe payment method on file', count: 41 },
    { stage: 'Connected Twilio',    description: 'Phone number forwarded', count: 36 },
    { stage: 'First call handled',  description: 'AI receptionist took at least 1 call', count: 32 },
    { stage: 'First review request',description: 'Sent automated review SMS', count: 28 },
    { stage: '30-day active',       description: 'Used product on 5+ days last 30', count: 24 },
    { stage: 'Habit user',          description: 'Daily login + 3+ features in active use', count: 18 },
  ]
  return steps.map((s) => ({ ...s, pct_of_top: s.count / top }))
}

export interface UsageStats {
  /** Customers with at least one "active" or "power" feature */
  total_active_customers: number
  /** Median # of features in active+ use */
  median_features_in_use: number
  /** Number of cross-sell flags identified */
  cross_sell_count: number
  cross_sell_arr_potential_cents: number
  /** % of paying customers who have hit "Habit user" */
  habit_rate: number
}

export function usageStats(): UsageStats {
  const paying = companies.filter((c) => c.mrr_cents > 0 && c.stage !== 'churned')
  const useCounts = paying.map((c) =>
    features.filter((f) => {
      const l = adoptionFor(c.id, f.key)
      return l === 'active' || l === 'power'
    }).length,
  )
  const sorted = [...useCounts].sort((a, b) => a - b)
  const median = sorted.length
    ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
    : 0
  const flags = crossSellFlags()
  const arrUplift = flags
    .filter((f) => f.kind === 'expansion')
    .reduce((s, f) => s + (f.arr_uplift_cents ?? 0), 0)

  // Habit rate from activation funnel
  const funnel = activationFunnel()
  const habit = funnel[funnel.length - 1]
  const top = funnel[0]

  return {
    total_active_customers: useCounts.filter((c) => c > 0).length,
    median_features_in_use: median,
    cross_sell_count: flags.length,
    cross_sell_arr_potential_cents: arrUplift,
    habit_rate: top.count > 0 ? habit.count / top.count : 0,
  }
}

export const ADOPTION_META: Record<AdoptionLevel, { label: string; color: string }> = {
  unused:      { label: '—',           color: '#E5E7EB' },
  set_up:      { label: 'Set up',      color: '#FDE68A' },
  occasional:  { label: 'Occasional',  color: '#A0D8F8' },
  active:      { label: 'Active',      color: 'rgb(var(--color-brand))' },
  power:       { label: 'Power user',  color: '#10B981' },
}
