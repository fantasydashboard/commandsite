/**
 * CommandSite — paying customer accounts (and recently-churned).
 * Each "company" is a home-services business that pays Josh monthly.
 * Used by the Customers, Today, and Revenue modules.
 */

export type Industry = 'hvac' | 'plumbing' | 'electrical' | 'landscaping' | 'roofing' | 'pool' | 'pest' | 'cleaning' | 'general'
export type Plan = 'starter' | 'pro' | 'scale' | 'enterprise'
export type CustomerStage = 'trial' | 'onboarding' | 'active' | 'expansion_ready' | 'at_risk' | 'churned'
export type HealthTrend = 'up' | 'flat' | 'down'

export interface Company {
  id: string
  name: string
  slug: string
  industry: Industry
  city: string
  state: string
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_title: string
  team_size: number
  plan: Plan
  mrr_cents: number
  signed_at: string
  last_login_at: string
  /** 0-100 composite of usage + payment + tickets + NPS */
  health_score: number
  health_trend: HealthTrend
  stage: CustomerStage
  notes: string
  expansion_opportunity_cents?: number
  nps?: number
  open_tickets?: number
  /** Why on the at-risk / expansion list (only set when stage requires it) */
  signal?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const PLAN_META: Record<Plan, { label: string; mrr_cents: number; color: string }> = {
  starter:    { label: 'Starter',    mrr_cents: 19_900,  color: '#94A3B8' },
  pro:        { label: 'Pro',        mrr_cents: 49_900,  color: 'rgb(var(--color-accent))' },
  scale:      { label: 'Scale',      mrr_cents: 99_900,  color: 'rgb(var(--color-brand))' },
  enterprise: { label: 'Enterprise', mrr_cents: 249_900, color: '#10B981' },
}

export const STAGE_META: Record<CustomerStage, { label: string; color: string }> = {
  trial:            { label: 'Trial',            color: '#94A3B8' },
  onboarding:       { label: 'Onboarding',       color: '#F59E0B' },
  active:           { label: 'Active',           color: 'rgb(var(--color-brand))' },
  expansion_ready:  { label: 'Expansion-ready',  color: '#10B981' },
  at_risk:          { label: 'At-risk',          color: '#EF4444' },
  churned:          { label: 'Churned',          color: '#64748B' },
}

export const companies: Company[] = [
  {
    id: 'co-001',
    name: 'Apex Heating & Air',
    slug: 'apex-heating-and-air',
    industry: 'hvac',
    city: 'Orlando',
    state: 'FL',
    primary_contact_name: 'Marcus Reyes',
    primary_contact_email: 'marcus@apex-air.com',
    primary_contact_title: 'Owner',
    team_size: 4,
    plan: 'pro',
    mrr_cents: 49_900,
    signed_at: ago(127),
    last_login_at: ago(0, 3),
    health_score: 92,
    health_trend: 'up',
    stage: 'expansion_ready',
    notes: 'Original beta customer. Marcus is the easiest reference call you\'ll ever ask for. Currently on Pro — using almost every Scale feature, perfect upsell target.',
    expansion_opportunity_cents: 50_000,
    nps: 10,
    open_tickets: 0,
    signal: 'Active daily, hitting Pro plan limits on calls — Scale upgrade worth +$500/mo',
  },
  {
    id: 'co-002',
    name: 'TidalWave Plumbing',
    slug: 'tidalwave-plumbing',
    industry: 'plumbing',
    city: 'Tampa',
    state: 'FL',
    primary_contact_name: 'Sofia Marquez',
    primary_contact_email: 'sofia@tidalwaveplumbing.com',
    primary_contact_title: 'Operations Director',
    team_size: 11,
    plan: 'scale',
    mrr_cents: 99_900,
    signed_at: ago(98),
    last_login_at: ago(0, 1),
    health_score: 96,
    health_trend: 'up',
    stage: 'expansion_ready',
    notes: 'Growing fast — added 3 techs this quarter. Asked about multi-location feature last week (not built yet).',
    expansion_opportunity_cents: 150_000,
    nps: 9,
    open_tickets: 1,
    signal: 'Asked about multi-location — Enterprise upgrade signal',
  },
  {
    id: 'co-003',
    name: 'BrightVolt Electric',
    slug: 'brightvolt-electric',
    industry: 'electrical',
    city: 'Charlotte',
    state: 'NC',
    primary_contact_name: 'Derrick Pham',
    primary_contact_email: 'derrick@brightvolt.com',
    primary_contact_title: 'GM',
    team_size: 7,
    plan: 'pro',
    mrr_cents: 49_900,
    signed_at: ago(64),
    last_login_at: ago(11),
    health_score: 38,
    health_trend: 'down',
    stage: 'at_risk',
    notes: 'Login dropped from daily to weekly. Open ticket about the AI receptionist sounding "too scripted." Needs a check-in call this week.',
    nps: 6,
    open_tickets: 2,
    signal: 'Login frequency down 60% in 14 days · 2 open tickets',
  },
  {
    id: 'co-004',
    name: 'GreenLeaf Landscaping',
    slug: 'greenleaf-landscaping',
    industry: 'landscaping',
    city: 'Austin',
    state: 'TX',
    primary_contact_name: 'Wes Holloway',
    primary_contact_email: 'wes@greenleafatx.com',
    primary_contact_title: 'Founder',
    team_size: 6,
    plan: 'pro',
    mrr_cents: 49_900,
    signed_at: ago(8),
    last_login_at: ago(0, 5),
    health_score: 71,
    health_trend: 'up',
    stage: 'onboarding',
    notes: 'Signed last week. Setup call scheduled for Thursday — needs help wiring Twilio + Stripe. Highly engaged in shared Slack.',
    nps: undefined,
    open_tickets: 0,
    signal: 'Day 8 of onboarding — needs Twilio + Stripe wired by end of week',
  },
  {
    id: 'co-005',
    name: 'ClearStream Pool Service',
    slug: 'clearstream-pool',
    industry: 'pool',
    city: 'Phoenix',
    state: 'AZ',
    primary_contact_name: 'Emma Castellanos',
    primary_contact_email: 'emma@clearstreampool.com',
    primary_contact_title: 'Owner',
    team_size: 5,
    plan: 'starter',
    mrr_cents: 19_900,
    signed_at: ago(43),
    last_login_at: ago(1),
    health_score: 84,
    health_trend: 'up',
    stage: 'expansion_ready',
    notes: 'NPS came back as 9 last week. Quoted us in their newsletter. Perfect candidate for case study + Pro upgrade.',
    expansion_opportunity_cents: 30_000,
    nps: 9,
    open_tickets: 0,
    signal: 'NPS 9 + steady usage growth — case study + Pro upgrade play',
  },
  {
    id: 'co-006',
    name: 'HomeShield Pest',
    slug: 'homeshield-pest',
    industry: 'pest',
    city: 'Houston',
    state: 'TX',
    primary_contact_name: 'Andre Bautista',
    primary_contact_email: 'andre@homeshieldpest.com',
    primary_contact_title: 'Owner',
    team_size: 3,
    plan: 'starter',
    mrr_cents: 0,
    signed_at: ago(4),
    last_login_at: ago(0, 8),
    health_score: 65,
    health_trend: 'flat',
    stage: 'trial',
    notes: 'Day 4 of 14-day trial. Connected Twilio yesterday. Needs nudge to set up review automation by day 10.',
    nps: undefined,
    open_tickets: 0,
    signal: 'Trial day 4 — yet to enable Reviews automation',
  },
  {
    id: 'co-007',
    name: 'Stonecrest Roofing',
    slug: 'stonecrest-roofing',
    industry: 'roofing',
    city: 'Denver',
    state: 'CO',
    primary_contact_name: 'Owen Maddox',
    primary_contact_email: 'owen@stonecrestroofing.com',
    primary_contact_title: 'Co-founder',
    team_size: 9,
    plan: 'pro',
    mrr_cents: 49_900,
    signed_at: ago(156),
    last_login_at: ago(2),
    health_score: 78,
    health_trend: 'flat',
    stage: 'active',
    notes: 'Steady customer. Roofing is seasonal (busy May-Sept) — usage spikes accordingly.',
    nps: 8,
    open_tickets: 0,
  },
  {
    id: 'co-008',
    name: 'Polished Cleaning Co',
    slug: 'polished-cleaning',
    industry: 'cleaning',
    city: 'Nashville',
    state: 'TN',
    primary_contact_name: 'Yasmin Okafor',
    primary_contact_email: 'yasmin@polishedcleaning.com',
    primary_contact_title: 'Owner',
    team_size: 14,
    plan: 'scale',
    mrr_cents: 99_900,
    signed_at: ago(184),
    last_login_at: ago(0, 12),
    health_score: 88,
    health_trend: 'up',
    stage: 'active',
    notes: 'Hit 200 jobs/mo last month — heaviest user on Scale plan. Recommended us in 2 LinkedIn posts.',
    nps: 9,
    open_tickets: 0,
  },
  {
    id: 'co-009',
    name: 'Summit Heating Pro',
    slug: 'summit-heating',
    industry: 'hvac',
    city: 'Salt Lake City',
    state: 'UT',
    primary_contact_name: 'Riley Thackeray',
    primary_contact_email: 'riley@summitheatingpro.com',
    primary_contact_title: 'Owner',
    team_size: 6,
    plan: 'pro',
    mrr_cents: 0,
    signed_at: ago(241),
    last_login_at: ago(38),
    health_score: 12,
    health_trend: 'down',
    stage: 'churned',
    notes: 'Churned 2 weeks ago. Cited "Jobber does enough for us" — but Jobber doesn\'t have AI receptionist. Worth a Q4 win-back attempt.',
    nps: 5,
    open_tickets: 0,
    signal: 'Churned 14 days ago — winback candidate Q4',
  },
  {
    id: 'co-010',
    name: 'Premier Plumbing Solutions',
    slug: 'premier-plumbing',
    industry: 'plumbing',
    city: 'Miami',
    state: 'FL',
    primary_contact_name: 'Jorge Salinas',
    primary_contact_email: 'jorge@premierplumbingfl.com',
    primary_contact_title: 'GM',
    team_size: 8,
    plan: 'pro',
    mrr_cents: 49_900,
    signed_at: ago(31),
    last_login_at: ago(0, 6),
    health_score: 82,
    health_trend: 'up',
    stage: 'active',
    notes: 'Solid customer, 30 days in. Already drove $14k in recovered after-hours revenue per his self-reported numbers.',
    nps: 9,
    open_tickets: 0,
  },
]

export interface CustomerStats {
  total_paying: number
  total_trialing: number
  total_at_risk: number
  total_churned_30d: number
  total_mrr_cents: number
  avg_health: number
  expansion_opportunity_cents: number
}

export function customerStats(): CustomerStats {
  const paying = companies.filter((c) => c.mrr_cents > 0 && c.stage !== 'churned')
  const total_mrr_cents = paying.reduce((s, c) => s + c.mrr_cents, 0)
  const expansion_opportunity_cents = companies.reduce((s, c) => s + (c.expansion_opportunity_cents ?? 0), 0)
  const avg_health = paying.length > 0
    ? Math.round(paying.reduce((s, c) => s + c.health_score, 0) / paying.length)
    : 0

  return {
    total_paying: paying.length,
    total_trialing: companies.filter((c) => c.stage === 'trial').length,
    total_at_risk: companies.filter((c) => c.stage === 'at_risk').length,
    total_churned_30d: companies.filter((c) => c.stage === 'churned').length,
    total_mrr_cents,
    avg_health,
    expansion_opportunity_cents,
  }
}

export const INDUSTRY_LABEL: Record<Industry, string> = {
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  landscaping: 'Landscaping',
  roofing: 'Roofing',
  pool: 'Pool service',
  pest: 'Pest control',
  cleaning: 'Cleaning',
  general: 'General contracting',
}
