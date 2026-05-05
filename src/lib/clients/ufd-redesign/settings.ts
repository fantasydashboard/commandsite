/**
 * UFD Redesign — operational Settings fixtures.
 * Team, plans, sending domains, suppression, integrations, API keys +
 * webhooks, AI brand-voice config.
 */

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'engineer' | 'support' | 'community'
  active: boolean
  added_at: string
}

export interface Plan {
  key: 'free_trial' | 'monthly' | 'annual'
  label: string
  monthly_price_cents: number
  /** Effective monthly when billed annually */
  effective_monthly_cents: number
  trial_days: number
  features_included: string[]
  active: boolean
  customers: number
}

export interface SendingDomain {
  domain: string
  purpose: 'transactional' | 'marketing'
  spf: 'verified' | 'pending' | 'failed'
  dkim: 'verified' | 'pending' | 'failed'
  dmarc: 'verified' | 'pending' | 'failed'
  reputation_score: number
  sent_30d: number
  bounce_rate: number
}

export interface SuppressionEntry {
  email: string
  reason: 'unsubscribed' | 'hard_bounce' | 'soft_bounce_repeat' | 'spam_report'
  added_at: string
  list: 'lifecycle' | 'marketing' | 'all'
}

export interface IntegrationConnection {
  key: string
  label: string
  description: string
  connected: boolean
  status_note?: string
  category: 'payments' | 'comms' | 'data' | 'fantasy' | 'devtools' | 'social' | 'ai'
}

export interface ApiKey {
  id: string
  label: string
  scope: 'read_only' | 'read_write' | 'admin'
  last_used_at?: string
  created_at: string
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

export interface BrandVoice {
  tone: string[]
  do_say: string[]
  dont_say: string[]
  signature_phrases: string[]
  /** Free-text guide rendered into the Claude prompt */
  prompt_guide: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const teamMembers: TeamMember[] = [
  { id: 'tm-001', name: 'Josh Daniel', email: 'josh@getinthelimelight.com', role: 'owner',     active: true, added_at: ago(540) },
  { id: 'tm-002', name: 'Aaron Sykes', email: 'aaron@ufd.app',              role: 'engineer',  active: true, added_at: ago(184) },
  { id: 'tm-003', name: 'Riley Park',  email: 'riley@ufd.app',              role: 'community', active: true, added_at: ago(38)  },
]

export const plans: Plan[] = [
  {
    key: 'free_trial', label: 'Free Trial',
    monthly_price_cents: 0, effective_monthly_cents: 0, trial_days: 7,
    features_included: ['All cards', 'All platforms (ESPN/Yahoo/Sleeper)', '7 days only', 'No card limit'],
    active: true, customers: 89,
  },
  {
    key: 'monthly', label: 'Monthly',
    monthly_price_cents: 999, effective_monthly_cents: 999, trial_days: 0,
    features_included: ['Unlimited cards', 'All platforms', 'All card types', 'Trade Analyzer', 'Power Rankings 2×/week', 'Cancel anytime'],
    active: true, customers: 412,
  },
  {
    key: 'annual', label: 'Annual',
    monthly_price_cents: 999, effective_monthly_cents: 658, trial_days: 0,
    features_included: ['Everything in Monthly', '34% off vs monthly ($79/yr)', 'Power Rankings 2×/week', 'Priority feature requests', 'Founder DMs you back'],
    active: true, customers: 187,
  },
]

export const sendingDomains: SendingDomain[] = [
  {
    domain: 'mail.ufd.app', purpose: 'transactional',
    spf: 'verified', dkim: 'verified', dmarc: 'verified',
    reputation_score: 94, sent_30d: 6_212, bounce_rate: 0.014,
  },
  {
    domain: 'go.ufd.app', purpose: 'marketing',
    spf: 'verified', dkim: 'verified', dmarc: 'verified',
    reputation_score: 89, sent_30d: 4_180, bounce_rate: 0.022,
  },
  {
    domain: 'pulse.ufd.app', purpose: 'marketing',
    spf: 'verified', dkim: 'pending', dmarc: 'pending',
    reputation_score: 67, sent_30d: 412, bounce_rate: 0.038,
  },
]

export const suppressionList: SuppressionEntry[] = [
  { email: 'tbuford@gmail.com',           reason: 'hard_bounce',       added_at: ago(0, 8),  list: 'all' },
  { email: 'old.account@aol.com',          reason: 'hard_bounce',       added_at: ago(2),     list: 'all' },
  { email: 'noreply@somefantasysite.com',  reason: 'spam_report',       added_at: ago(4),     list: 'all' },
  { email: 'cancelled.ufd@gmail.com',      reason: 'unsubscribed',      added_at: ago(7),     list: 'marketing' },
  { email: 'too.many.emails@me.com',       reason: 'unsubscribed',      added_at: ago(11),    list: 'marketing' },
  { email: 'lapsed.account.78@yahoo.com',  reason: 'soft_bounce_repeat',added_at: ago(18),    list: 'lifecycle' },
]

export const integrations: IntegrationConnection[] = [
  // Payments
  { key: 'stripe',     label: 'Stripe',          description: 'Subscription billing + dunning + metered usage',     connected: true,  status_note: '$5,346 MRR processed · annual + monthly tiers configured', category: 'payments' },
  // Comms
  { key: 'resend',     label: 'Resend',          description: 'Transactional + marketing email',                    connected: true,  status_note: '6,212 sends · 96.4% delivered', category: 'comms' },
  // Fantasy platforms (the moat)
  { key: 'espn',       label: 'ESPN Fantasy',    description: 'League roster + standings sync',                     connected: true,  status_note: 'OAuth + cookie auth · 134 leagues syncing', category: 'fantasy' },
  { key: 'yahoo',      label: 'Yahoo Fantasy',   description: 'League roster + standings sync',                     connected: true,  status_note: 'OAuth · 89 leagues syncing', category: 'fantasy' },
  { key: 'sleeper',    label: 'Sleeper',         description: 'League roster + standings sync',                     connected: true,  status_note: 'Public API · 64 leagues syncing · cleanest of the three', category: 'fantasy' },
  // Social
  { key: 'reddit',     label: 'Reddit',          description: 'Auto-posting + listening across subreddits',         connected: true,  status_note: 'OAuth · monitoring r/fantasyfootball, r/Sleeperapp, r/DynastyFF', category: 'social' },
  { key: 'twitter',    label: 'Twitter / X',     description: 'Posting + mention monitoring',                       connected: true,  status_note: 'Basic tier $200/mo — read + write enabled', category: 'social' },
  { key: 'youtube',    label: 'YouTube',         description: 'Shorts upload + analytics',                          connected: false, status_note: 'Not connected — manual upload for now', category: 'social' },
  { key: 'tiktok',     label: 'TikTok',          description: 'Posting + analytics',                                connected: false, status_note: 'Not connected — manual posting via creator app', category: 'social' },
  // Data
  { key: 'posthog',    label: 'PostHog',         description: 'Product analytics + session replay',                 connected: true,  status_note: 'EU-cloud · 8.4M events/mo · Share-event funnel tracked', category: 'data' },
  // AI
  { key: 'anthropic',  label: 'Anthropic Claude',description: 'AI for email + reply drafts + post composer',         connected: true,  status_note: 'Sonnet · ~$28/mo at current volume', category: 'ai' },
  { key: 'openai',     label: 'OpenAI',          description: 'Image generation for cards (fallback)',              connected: true,  status_note: 'GPT-Image-1 · ~$12/mo', category: 'ai' },
  // Dev tools
  { key: 'slack',      label: 'Slack',           description: 'In-app alerts (high-priority Today items)',          connected: true,  status_note: '#ufd-alerts channel', category: 'devtools' },
  { key: 'sentry',     label: 'Sentry',          description: 'Error tracking',                                     connected: true,  status_note: '12 errors last 7d (down from 47 last week)', category: 'devtools' },
  { key: 'github',     label: 'GitHub',          description: 'Source + Vercel deploy notifications',               connected: true,  status_note: 'main → vercel via webhook', category: 'devtools' },
]

export const apiKeys: ApiKey[] = [
  { id: 'ak-001', label: 'iOS app (read/write)',     scope: 'read_write', last_used_at: ago(0, 1), created_at: ago(124), masked_value: 'ufd_live_••••e34a' },
  { id: 'ak-002', label: 'Internal admin scripts',   scope: 'admin',      last_used_at: ago(2),    created_at: ago(312), masked_value: 'ufd_live_••••71bf' },
  { id: 'ak-003', label: 'Public docs sandbox',      scope: 'read_only',  last_used_at: ago(8),    created_at: ago(64),  masked_value: 'ufd_live_••••0c92' },
]

export const webhookEndpoints: WebhookEndpoint[] = [
  {
    id: 'wh-001',
    url: 'https://hooks.ufd.app/stripe',
    events: ['subscription.created', 'subscription.updated', 'invoice.payment_failed', 'invoice.paid'],
    active: true, last_delivery_at: ago(0, 1), failure_count_24h: 0,
  },
  {
    id: 'wh-002',
    url: 'https://hooks.ufd.app/share-event',
    events: ['card.shared', 'card.viewed_externally', 'card.cta_clicked'],
    active: true, last_delivery_at: ago(0, 0.5), failure_count_24h: 0,
  },
  {
    id: 'wh-003',
    url: 'https://hooks.ufd.app/lifecycle',
    events: ['user.signed_up', 'user.connected_league', 'user.first_card_made', 'user.first_card_shared', 'user.converted_paid', 'user.churned'],
    active: true, last_delivery_at: ago(0, 2), failure_count_24h: 0,
  },
  {
    id: 'wh-004',
    url: 'https://hooks.zapier.com/hooks/catch/12345/abc',
    events: ['user.converted_paid'],
    active: false, last_delivery_at: ago(34), failure_count_24h: 0,
  },
]

export const brandVoice: BrandVoice = {
  tone: [
    'Direct and warm — never corporate',
    'Confident about what works, honest about what doesn\'t',
    'Uses first person ("I built this", "I run this")',
    'Speaks fantasy-football fluent without being annoying about it',
  ],
  do_say: [
    'Genuinely',
    'Built it for myself + my own league',
    'Trust me on this one',
    'No pressure',
    'Fair pushback',
    'Hit reply if anything\'s broken',
  ],
  dont_say: [
    'Synergy',
    'Best-in-class',
    'Gamechanger',
    'Robust',
    'Leverage (as a verb)',
    '"Hey {{first_name}}!" with a generic exclamation',
    'Marketing-speak superlatives',
  ],
  signature_phrases: [
    '— Josh',
    'Built by a solo dev who plays in 4 leagues',
    'Founder DMs you back',
  ],
  prompt_guide: `You are Josh, the solo founder of UFD (Ultimate Fantasy Dashboard) — a B2C fantasy football SaaS. Write in first person.

Voice: direct and warm, never corporate. You built UFD for yourself and your own leagues, and that comes through in everything you write. You\'re confident about what works and honest about what doesn\'t (even if it\'s a feature you haven\'t built yet).

Avoid: marketing-speak ("best-in-class," "gamechanger," "synergy"), generic "Hey {{first_name}}!" energy, and any phrasing that sounds like a Series-B startup. Use fantasy-football vocabulary fluently but don\'t over-deploy it.

Always end emails with "— Josh" and offer a real reply path ("hit reply if anything\'s broken" / "DM me if you want early access").

When writing replies to Reddit comments or social mentions, match the platform tone — Reddit values community-first framing over promo. Lead with usefulness; mention the product only when it\'s genuinely the best answer to the question.`,
}

export interface SettingsStats {
  team_active: number
  plans_active: number
  domains_healthy: number
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
  transactional: 'Transactional',
  marketing: 'Marketing',
}

export const SUPPRESSION_REASON_LABEL: Record<SuppressionEntry['reason'], string> = {
  unsubscribed: 'Unsubscribed',
  hard_bounce: 'Hard bounce',
  soft_bounce_repeat: 'Repeat soft bounce',
  spam_report: 'Spam reported',
}

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationConnection['category'], string> = {
  payments: 'Payments',
  comms: 'Email',
  data: 'Analytics',
  fantasy: 'Fantasy platforms',
  devtools: 'Dev / DevOps',
  social: 'Social channels',
  ai: 'AI providers',
}
