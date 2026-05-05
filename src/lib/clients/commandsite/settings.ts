/**
 * CommandSite Settings — operational config for running CommandSite-the-business.
 * Team, plans, Stripe, sending domains, integrations, API + webhooks, ICP.
 */

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'csm' | 'engineer' | 'support'
  active: boolean
  added_at: string
}

export interface SaaSPlan {
  key: 'starter' | 'pro' | 'scale' | 'enterprise'
  label: string
  monthly_price_cents: number
  annual_price_cents: number  // already discounted
  /** Max techs / users / locations included */
  included_seats: number
  /** Per-seat overage pricing in cents */
  overage_per_seat_cents: number
  features_included: string[]
  active: boolean
  customers: number
}

export interface SendingDomain {
  domain: string
  purpose: 'transactional' | 'marketing' | 'cold_outreach'
  spf: 'verified' | 'pending' | 'failed'
  dkim: 'verified' | 'pending' | 'failed'
  dmarc: 'verified' | 'pending' | 'failed'
  reputation_score: number  // 0-100
  sent_30d: number
  bounce_rate: number
}

export interface SuppressionEntry {
  email: string
  reason: 'unsubscribed' | 'hard_bounce' | 'soft_bounce_repeat' | 'spam_report'
  added_at: string
  list: 'cold_outreach' | 'marketing' | 'all'
}

export interface IntegrationConnection {
  key: string
  label: string
  description: string
  connected: boolean
  status_note?: string
  category: 'payments' | 'comms' | 'data' | 'crm' | 'devtools' | 'enrichment'
}

export interface ApiKey {
  id: string
  label: string
  scope: 'read_only' | 'read_write' | 'admin'
  last_used_at?: string
  created_at: string
  /** First + last 4 of the key, masked middle */
  masked_value: string
}

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  active: boolean
  last_delivery_at?: string
  failure_count_24h: number
}

export interface IcpProfile {
  industries: string[]
  team_size_min: number
  team_size_max: number
  geos: string[]
  /** Disqualifiers — auto-flag if any match */
  disqualifiers: string[]
  /** Free-text describing the ideal customer */
  description: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const teamMembers: TeamMember[] = [
  { id: 'tm-001', name: 'Josh Daniel',     email: 'josh@getinthelimelight.com', role: 'owner',    active: true, added_at: ago(245) },
  { id: 'tm-002', name: 'Kira Whitfield',  email: 'kira@commandsite.com',       role: 'csm',      active: true, added_at: ago(64) },
  { id: 'tm-003', name: 'Aaron Sykes',     email: 'aaron@commandsite.com',      role: 'engineer', active: true, added_at: ago(122) },
]

export const plans: SaaSPlan[] = [
  {
    key: 'starter', label: 'Starter',
    monthly_price_cents: 19_900, annual_price_cents: 19_100 * 12,
    included_seats: 3, overage_per_seat_cents: 6_000,
    features_included: ['AI Receptionist', 'After-Hours Routing', 'Spam Filter', 'Review Automation'],
    active: true, customers: 14,
  },
  {
    key: 'pro', label: 'Pro',
    monthly_price_cents: 49_900, annual_price_cents: 47_900 * 12,
    included_seats: 8, overage_per_seat_cents: 5_000,
    features_included: ['Everything in Starter', 'Quote Follow-Ups', 'Manual Call Queue', 'AI Review Replies', 'Dormant Detection', 'Email Campaigns', 'Lead Source ROI'],
    active: true, customers: 22,
  },
  {
    key: 'scale', label: 'Scale',
    monthly_price_cents: 99_900, annual_price_cents: 95_900 * 12,
    included_seats: 20, overage_per_seat_cents: 4_000,
    features_included: ['Everything in Pro', 'SMS Campaigns', 'Priority Support', 'Quarterly business review'],
    active: true, customers: 7,
  },
  {
    key: 'enterprise', label: 'Enterprise',
    monthly_price_cents: 249_900, annual_price_cents: 239_900 * 12,
    included_seats: 100, overage_per_seat_cents: 3_000,
    features_included: ['Everything in Scale', 'Multi-Location', 'Custom integrations', 'Dedicated CSM', 'SLA + SOC 2'],
    active: true, customers: 2,
  },
]

export const sendingDomains: SendingDomain[] = [
  {
    domain: 'mail.commandsite.com', purpose: 'transactional',
    spf: 'verified', dkim: 'verified', dmarc: 'verified',
    reputation_score: 96, sent_30d: 8_412, bounce_rate: 0.018,
  },
  {
    domain: 'go.commandsite.com', purpose: 'marketing',
    spf: 'verified', dkim: 'verified', dmarc: 'verified',
    reputation_score: 91, sent_30d: 4_186, bounce_rate: 0.024,
  },
  {
    domain: 'cs-outreach.com', purpose: 'cold_outreach',
    spf: 'verified', dkim: 'verified', dmarc: 'pending',
    reputation_score: 84, sent_30d: 1_847, bounce_rate: 0.041,
  },
  {
    domain: 'cs-outbound.io', purpose: 'cold_outreach',
    spf: 'verified', dkim: 'pending', dmarc: 'pending',
    reputation_score: 62, sent_30d: 312, bounce_rate: 0.073,
  },
]

export const suppressionList: SuppressionEntry[] = [
  { email: 'trent@bufordhvac.com',           reason: 'unsubscribed',      added_at: ago(0, 7),  list: 'cold_outreach' },
  { email: 'office@speedyplumbing.com',      reason: 'unsubscribed',      added_at: ago(1, 4),  list: 'cold_outreach' },
  { email: 'noreply@anchordrain.com',        reason: 'hard_bounce',       added_at: ago(2, 8),  list: 'all' },
  { email: 'admin@oldproelectric.com',       reason: 'hard_bounce',       added_at: ago(3),     list: 'cold_outreach' },
  { email: 'info@summitpest.net',            reason: 'soft_bounce_repeat',added_at: ago(5),     list: 'marketing' },
  { email: 'contact@meadowbrook-hvac.com',   reason: 'spam_report',       added_at: ago(8),     list: 'all' },
]

export const integrations: IntegrationConnection[] = [
  { key: 'stripe',     label: 'Stripe',         description: 'Subscription billing + dunning',         connected: true,  status_note: '$28,475 MRR processed', category: 'payments' },
  { key: 'twilio',     label: 'Twilio',         description: 'Voice + SMS infrastructure',             connected: true,  status_note: '+1 (407) 555-0100 · 312 mins this month', category: 'comms' },
  { key: 'resend',     label: 'Resend',         description: 'Transactional + marketing email',        connected: true,  status_note: '8,412 sends · 96.4% delivered', category: 'comms' },
  { key: 'smartlead',  label: 'Smartlead',      description: 'Cold-email sequencing engine',           connected: true,  status_note: '7 active sequences · 184 sends this week', category: 'comms' },
  { key: 'apollo',     label: 'Apollo.io',      description: 'B2B contact database for outbound',      connected: true,  status_note: '142 leads imported this month', category: 'enrichment' },
  { key: 'clay',       label: 'Clay',           description: 'Lead enrichment + waterfall',            connected: true,  status_note: '218 lookups this month', category: 'enrichment' },
  { key: 'rb2b',       label: 'RB2B',           description: 'Anonymous-website-visitor identification', connected: false, status_note: 'Not connected — recommended for engaged-leads view', category: 'enrichment' },
  { key: 'posthog',    label: 'PostHog',        description: 'Product analytics + session replay',     connected: true,  status_note: 'EU-cloud · 4.2M events captured this month', category: 'data' },
  { key: 'slack',      label: 'Slack',          description: 'In-app notifications + customer Slack channels', connected: true,  status_note: '#cs-customers + #cs-alerts', category: 'devtools' },
  { key: 'linear',     label: 'Linear',         description: 'Eng + product roadmap',                  connected: true,  status_note: 'Auto-create tickets from urgent support', category: 'devtools' },
  { key: 'github',     label: 'GitHub',         description: 'Source control + deployment notifications', connected: true,  status_note: 'main branch deploys to vercel via webhook', category: 'devtools' },
  { key: 'g2',         label: 'G2',             description: 'B2B reviews + listing intent data',      connected: true,  status_note: '8 reviews · 4.6★ avg', category: 'data' },
  { key: 'capterra',   label: 'Capterra',       description: 'B2B reviews + comparison-page traffic',  connected: true,  status_note: '2 reviews + 47 profile views/wk', category: 'data' },
  { key: 'producthunt',label: 'Product Hunt',   description: 'Launch + community presence',            connected: false, status_note: 'Not connected — plan to launch v2 in Q3', category: 'data' },
]

export const apiKeys: ApiKey[] = [
  { id: 'ak-001', label: 'Mobile app (read-only)',    scope: 'read_only',  last_used_at: ago(0, 2),  created_at: ago(122), masked_value: 'cs_live_••••a47f' },
  { id: 'ak-002', label: 'Internal scripts',          scope: 'admin',      last_used_at: ago(1),     created_at: ago(245), masked_value: 'cs_live_••••e91c' },
  { id: 'ak-003', label: 'Zapier integration (Apex)', scope: 'read_write', last_used_at: ago(0, 4),  created_at: ago(98),  masked_value: 'cs_live_••••8b2d' },
]

export const webhookEndpoints: WebhookEndpoint[] = [
  {
    id: 'wh-001',
    url: 'https://hooks.commandsite.com/stripe',
    events: ['subscription.created', 'subscription.updated', 'invoice.payment_failed'],
    active: true, last_delivery_at: ago(0, 2), failure_count_24h: 0,
  },
  {
    id: 'wh-002',
    url: 'https://hooks.zapier.com/hooks/catch/12345/abc',
    events: ['customer.signed', 'customer.upgraded', 'customer.churned'],
    active: true, last_delivery_at: ago(8), failure_count_24h: 0,
  },
  {
    id: 'wh-003',
    url: 'https://api.linear.app/graphql/webhook',
    events: ['support.ticket.urgent_created'],
    active: true, last_delivery_at: ago(0, 4), failure_count_24h: 0,
  },
  {
    id: 'wh-004',
    url: 'https://internal.commandsite.com/audit',
    events: ['*'],
    active: false, last_delivery_at: ago(34), failure_count_24h: 0,
  },
]

export const icpProfile: IcpProfile = {
  industries: ['HVAC', 'Plumbing', 'Electrical', 'Landscaping', 'Roofing', 'Pool Service', 'Pest Control', 'Cleaning'],
  team_size_min: 4,
  team_size_max: 25,
  geos: ['US (Sun Belt + Southeast preferred)', 'Canada (no priority)'],
  disqualifiers: [
    'Solo operator (1 person — too small for our pricing)',
    'Already has a full-time office manager + dedicated CSM tool (less wedge)',
    'Franchise location with no decision authority over software',
    'Trade companies under $200k annual revenue',
  ],
  description: `4-25 person home-services owner-operators in the US Sun Belt + Southeast. Decision-maker is the owner or GM. Currently losing measurable revenue to missed after-hours calls. Already paying for at least one SaaS tool (Jobber, Housecall Pro) — proves they\'ll pay for software. Sweet spot: 6-12 techs, $1-5M annual revenue, growth-mode (added a tech in last 12 months).`,
}

export interface SettingsStats {
  team_active: number
  plans_active: number
  domains_healthy: number  // all 3 of SPF/DKIM/DMARC verified
  domains_total: number
  suppression_size: number
  integrations_connected: number
  integrations_total: number
  webhooks_active: number
  webhook_failures_24h: number
}

export function settingsStats(): SettingsStats {
  return {
    team_active: teamMembers.filter((m) => m.active).length,
    plans_active: plans.filter((p) => p.active).length,
    domains_healthy: sendingDomains.filter((d) => d.spf === 'verified' && d.dkim === 'verified' && d.dmarc === 'verified').length,
    domains_total: sendingDomains.length,
    suppression_size: suppressionList.length,
    integrations_connected: integrations.filter((i) => i.connected).length,
    integrations_total: integrations.length,
    webhooks_active: webhookEndpoints.filter((w) => w.active).length,
    webhook_failures_24h: webhookEndpoints.reduce((s, w) => s + w.failure_count_24h, 0),
  }
}

export const DOMAIN_PURPOSE_LABEL: Record<SendingDomain['purpose'], string> = {
  transactional:  'Transactional',
  marketing:      'Marketing',
  cold_outreach:  'Cold outreach',
}

export const SUPPRESSION_REASON_LABEL: Record<SuppressionEntry['reason'], string> = {
  unsubscribed:        'Unsubscribed',
  hard_bounce:         'Hard bounce',
  soft_bounce_repeat:  'Repeat soft bounce',
  spam_report:         'Spam reported',
}

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationConnection['category'], string> = {
  payments:    'Payments',
  comms:       'Communications',
  data:        'Data + Reviews',
  crm:         'CRM',
  devtools:    'Dev / DevOps',
  enrichment:  'Lead enrichment',
}
