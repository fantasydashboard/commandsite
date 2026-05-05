/**
 * UFD Redesign — Lifecycle Email fixtures.
 * Three views feed off the same data: Templates / Pipeline / Performance.
 *
 * Lifecycle email is UFD's #1 retention lever — trial→paid is where
 * the company lives or dies, and the day-3 share-nudge + day-6
 * conversion email do most of the work.
 */

export type CampaignKind = 'transactional' | 'lifecycle' | 'seasonal' | 'broadcast' | 'winback'

export interface EmailTemplate {
  id: string
  name: string
  kind: CampaignKind
  trigger: string
  active: boolean
  subject: string
  preview: string
  body: string
  recipients_total: number
  open_rate: number
  click_rate: number
  reply_rate?: number
  attributed_revenue_cents: number
  last_sent_at: string | null
  /** Optional A/B variant — if set, A is shown as primary, B as secondary */
  variant_b?: { subject: string; open_rate: number; click_rate: number }
}

export type PipelineStep =
  | 'day_1_connect'
  | 'day_3_share'
  | 'day_6_convert'
  | 'day_8_last_chance'
  | 'paid_welcome'
  | 'day_90_check'
  | 'renewal_60d'
  | 'winback'

export interface PipelineUser {
  id: string
  user_name: string
  user_email: string
  current_step: PipelineStep
  /** ISO of when they entered this step */
  entered_step_at: string
  /** Lifecycle stage (matches users.ts vocab) */
  stage: 'trial_new' | 'trial_engaged' | 'trial_expiring' | 'paid_new' | 'paid_active' | 'at_risk' | 'churned_recent'
  /** Opens / clicks on the most recent email at this step */
  last_email_opened: boolean
  last_email_clicked: boolean
  /** Optional context flag */
  flag?: string
}

export interface SendRecord {
  id: string
  template_id: string
  recipient_name: string
  recipient_email: string
  sent_at: string
  status: 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced'
  reply_excerpt?: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const KIND_META: Record<CampaignKind, { label: string; color: string }> = {
  transactional: { label: 'Transactional', color: 'rgb(var(--color-accent))' },
  lifecycle:     { label: 'Lifecycle',     color: '#10B981' },
  seasonal:      { label: 'Seasonal',      color: '#F59E0B' },
  broadcast:     { label: 'Broadcast',     color: '#A855F7' },
  winback:       { label: 'Winback',       color: '#EF4444' },
}

export const STEP_META: Record<PipelineStep, { label: string; sub: string; color: string }> = {
  day_1_connect:    { label: 'Day 1',  sub: 'Connect league nudge',    color: '#94A3B8' },
  day_3_share:      { label: 'Day 3',  sub: 'Share-a-card nudge',       color: 'rgb(var(--color-accent))' },
  day_6_convert:    { label: 'Day 6',  sub: 'Conversion push',           color: '#F59E0B' },
  day_8_last_chance:{ label: 'Day 8',  sub: 'Last chance / break-up',    color: '#FB7185' },
  paid_welcome:     { label: 'Welcome',sub: 'New paid customer',          color: '#10B981' },
  day_90_check:     { label: 'Day 90', sub: 'Engagement check-in',        color: 'rgb(var(--color-brand))' },
  renewal_60d:      { label: 'Renewal',sub: '60d before annual renewal',  color: '#A855F7' },
  winback:          { label: 'Winback',sub: 'Post-churn re-engagement',   color: '#EF4444' },
}

export const templates: EmailTemplate[] = [
  // ── TRANSACTIONAL
  {
    id: 'em-001',
    name: 'Welcome — first sign-in',
    kind: 'transactional',
    trigger: 'Sent immediately after account created',
    active: true,
    subject: 'You\'re in. Now connect your league.',
    preview: 'Took you 30 seconds to sign up. Let\'s spend 60 more setting it up.',
    body: `Hey {{first_name}},\n\nWelcome to UFD — fastest 60 seconds you'll spend today.\n\nNext step: connect your league. We support ESPN, Yahoo, and Sleeper. Pick one and we'll do the heavy lifting:\n\n👉 {{connect_link}}\n\nOnce you're in, we'll auto-generate your first Power Rankings card. Trust me, you'll want to share it with your league chat immediately.\n\n— Josh, UFD`,
    recipients_total: 287, open_rate: 0.71, click_rate: 0.42, attributed_revenue_cents: 0,
    last_sent_at: ago(0, 35),
  },
  {
    id: 'em-002',
    name: 'First card celebration',
    kind: 'transactional',
    trigger: 'Sent after the user creates their first card',
    active: true,
    subject: '{{first_name}}, your first card is live 🏈',
    preview: 'It looks great. The next move: share it before someone in your league makes a worse one.',
    body: `Nice work, {{first_name}}.\n\nYour first card is saved — {{card_title}}.\n\nHere's the move: share it in your league chat right now, before someone else builds a worse one. The first card in the chat usually starts the trash talk.\n\n👉 Share to group chat\n👉 Share to Discord\n👉 Tweet it\n\nYou\'re also unlocking the rest of the toolkit (Trade Analyzer, Weekly Recap, Sleeper Picks). Make a few more — they get better the more leagues you connect.`,
    recipients_total: 162, open_rate: 0.84, click_rate: 0.51, attributed_revenue_cents: 0,
    last_sent_at: ago(2),
  },
  {
    id: 'em-003',
    name: 'Paid conversion confirmation',
    kind: 'transactional',
    trigger: 'Sent after subscription starts',
    active: true,
    subject: 'You\'re in. Welcome to UFD Pro.',
    preview: 'Here\'s what unlocks now that you\'re paid up.',
    body: `Hey {{first_name}},\n\nThanks for going Pro — genuinely appreciate it.\n\nWhat unlocks now:\n\n✓ Unlimited cards across all your leagues\n✓ Trade Analyzer (Pro-only — sends grades to your league chat)\n✓ Season Awards generator\n✓ Power Rankings every Tuesday + Friday (instead of just Tuesday)\n✓ A small "Powered by UFD" line on every shared card stays — it\'s the deal that keeps prices low\n\nIf anything\'s ever broken, hit reply. I read every one.`,
    recipients_total: 71, open_rate: 0.79, click_rate: 0.18, attributed_revenue_cents: 0,
    last_sent_at: ago(8),
  },

  // ── LIFECYCLE — the core trial cadence
  {
    id: 'em-004',
    name: 'Day 1 — Connect your league',
    kind: 'lifecycle',
    trigger: '24h after signup if no league connected',
    active: true,
    subject: 'Your UFD trial isn\'t doing anything yet',
    preview: 'Connect your league and we\'ll generate your Power Rankings in 60s.',
    body: `Hi {{first_name}},\n\nYou signed up yesterday but haven\'t connected a league yet. UFD doesn\'t do much without one — we need your roster + standings to generate cards.\n\nQuickest setup is Sleeper (~30s). Yahoo + ESPN are both about a minute.\n\n👉 Connect now: {{connect_link}}\n\nOr reply with a question if you got stuck.`,
    recipients_total: 89, open_rate: 0.61, click_rate: 0.34, attributed_revenue_cents: 0,
    last_sent_at: ago(12),
  },
  {
    id: 'em-005',
    name: 'Day 3 — Share a card (the big one)',
    kind: 'lifecycle',
    trigger: '72h after signup if cards made but not shared',
    active: true,
    subject: 'You made {{card_count}} cards. Your league doesn\'t know.',
    preview: 'Sharing one card takes 5 seconds and changes everything.',
    body: `Hey {{first_name}},\n\nYou\'ve made {{card_count}} cards in UFD this week. Your league hasn\'t seen any of them.\n\nThis is the move: share one card to your group chat right now. Doesn\'t matter which. Power Rankings stir the pot. Trade Analyzer settles arguments. Weekly Recap brings the trash talk.\n\nClick to share:\n👉 To group chat (iMessage / SMS)\n👉 To Discord\n👉 Tweet it\n\nReason this matters to you: when someone else in your league sees your card, they want to make their own. That\'s how UFD spreads. And the more your league uses it, the better your trash talk gets.\n\n— Josh`,
    recipients_total: 124, open_rate: 0.66, click_rate: 0.41, reply_rate: 0.04, attributed_revenue_cents: 0,
    last_sent_at: ago(16),
    variant_b: { subject: 'Quick favor — try sharing one card', open_rate: 0.49, click_rate: 0.22 },
  },
  {
    id: 'em-006',
    name: 'Day 6 — Conversion push',
    kind: 'lifecycle',
    trigger: 'Day 6 of trial — fires at noon local',
    active: true,
    subject: 'Your trial ends tomorrow ({{first_name}})',
    preview: '$9.99/mo or $79/yr. Annual saves 34% and is what the power-users pick.',
    body: `Hi {{first_name}},\n\nYour 7-day UFD trial ends tomorrow. Here\'s where to land:\n\n• Monthly — $9.99/mo, cancel anytime\n• Annual — $79/yr (saves 34%, what most power-users pick)\n\n👉 Continue with Pro: {{billing_link}}\n\nOne more thing: based on what you\'ve made this week ({{cards_made}} cards · {{shares_made}} shares), you\'re tracking like our typical Pro users. Annual is the call.\n\nIf you\'re on the fence — hit reply. Happy to extend the trial a couple days while you decide.`,
    recipients_total: 112, open_rate: 0.74, click_rate: 0.38, reply_rate: 0.07, attributed_revenue_cents: 1_847_300,
    last_sent_at: ago(8),
    variant_b: { subject: 'Last day of your UFD trial', open_rate: 0.68, click_rate: 0.26 },
  },
  {
    id: 'em-007',
    name: 'Day 8 — Last chance',
    kind: 'lifecycle',
    trigger: 'Day 8 if trial expired without conversion',
    active: true,
    subject: 'No worries — but here\'s the door',
    preview: 'Your trial expired. The door\'s still open at 50% off your first month.',
    body: `{{first_name}} —\n\nYour trial expired yesterday. No worries, no pitch.\n\nIf you ever want to come back, here\'s a 50%-off-first-month code I made for trial-lapsers: BACK50\n\nIf UFD wasn\'t the right fit, mind hitting reply with one sentence on why? Genuinely useful for what to build next.\n\n— Josh`,
    recipients_total: 53, open_rate: 0.52, click_rate: 0.16, reply_rate: 0.13, attributed_revenue_cents: 599_000,
    last_sent_at: ago(20),
  },

  // ── LIFECYCLE — paid users
  {
    id: 'em-008',
    name: 'Day 90 — Engagement check-in',
    kind: 'lifecycle',
    trigger: '90 days after paid conversion',
    active: true,
    subject: 'Quick check-in, {{first_name}}',
    preview: 'You\'ve been a Pro for 90 days. Here\'s what you\'ve done — and one thing you might be missing.',
    body: `Hey {{first_name}},\n\n90 days as a UFD Pro. Quick stats from your account:\n\n• Cards made: {{cards_made}}\n• Cards shared: {{cards_shared}}\n• Signups attributed to your shares: {{viral_signups}} (the more you share, the bigger this gets)\n\nOne thing most users at your stage haven\'t found yet: the Trade Analyzer. Sends a verdict (with grades) straight to your league chat. Stops the "is this fair" arguments cold.\n\n👉 Try it: {{trade_analyzer_link}}\n\nIf anything ever feels off, just reply.`,
    recipients_total: 47, open_rate: 0.58, click_rate: 0.27, attributed_revenue_cents: 0,
    last_sent_at: ago(48),
  },
  {
    id: 'em-009',
    name: 'Annual renewal — 60d notice',
    kind: 'lifecycle',
    trigger: '60 days before annual subscription renewal',
    active: true,
    subject: 'Heads up — your UFD annual renews on {{renewal_date}}',
    preview: 'Quick note. No action needed unless you want to opt out.',
    body: `Hey {{first_name}},\n\nQuick heads up — your UFD annual subscription renews on {{renewal_date}} for $79.\n\nNothing for you to do. If you want to keep the same setup, ignore this. If anything\'s changed (sold the dynasty team, switching platforms, just want a refund), reply and we\'ll handle it.\n\nYou can also see what\'s coming in the next year: {{roadmap_link}}\n\nThanks for being a Pro,\n— Josh`,
    recipients_total: 38, open_rate: 0.69, click_rate: 0.11, reply_rate: 0.05, attributed_revenue_cents: 0,
    last_sent_at: ago(72),
  },

  // ── SEASONAL
  {
    id: 'em-010',
    name: 'Preseason ramp — August',
    kind: 'seasonal',
    trigger: 'Manual send · August',
    active: false,
    subject: 'Football is back. Your draft kit is ready.',
    preview: 'Pre-draft cheat sheets, sleeper picks, and tier rankings for every position.',
    body: `{{first_name}},\n\nNFL preseason started. UFD\'s draft kit is loaded for the season:\n\n• Pre-draft cheat sheets (PPR + standard)\n• Sleeper picks updated weekly through August\n• Tier-based position rankings\n• Auto-mock-draft analyzer\n\nEverything\'s included with Pro. If your trial lapsed in the off-season, here\'s a 30%-off code to come back: PRESEASON30\n\n— Josh`,
    recipients_total: 412, open_rate: 0.51, click_rate: 0.18, attributed_revenue_cents: 4_120_000,
    last_sent_at: ago(720),
  },
  {
    id: 'em-011',
    name: 'Season Awards prompt — December',
    kind: 'seasonal',
    trigger: 'Manual send · early December',
    active: false,
    subject: 'Your league\'s 2025 Awards card is ready to make',
    preview: 'Generates in 60s. Highest-shared card type by far.',
    body: `{{first_name}},\n\nMost-shared UFD card type all year, hands down: Season Awards.\n\n• Most Improved · Worst GM · Biggest Bust · Trade of the Year · "Best Excuse"\n• Drops your league\'s logo + colors automatically\n• Looks great on phones (most people will see it in your group chat)\n\n👉 Generate yours: {{awards_link}}\n\nWorks for the regular season standings — championship game still to come.`,
    recipients_total: 287, open_rate: 0.62, click_rate: 0.34, attributed_revenue_cents: 921_000,
    last_sent_at: null,
  },

  // ── WINBACK
  {
    id: 'em-012',
    name: 'Off-season winback — Aug 1',
    kind: 'winback',
    trigger: 'Scheduled · sent to lapsed annuals on Aug 1',
    active: true,
    subject: 'Football is back. Want UFD back too?',
    preview: '50% off your first month. No commitment. Just for season opener.',
    body: `Hey {{first_name}},\n\nIt\'s been a few months. NFL preseason starts in 2 weeks, draft season is upon us.\n\nYou cancelled UFD back in {{churn_month}} ("off-season" was the most common reason). Totally fair.\n\nWanted to check in: 50% off your first month if you want to come back for opening week. Locked-in code: COMEBACK50\n\nNo pressure. If you\'re done with UFD, ignore this and I won\'t send another.\n\n— Josh`,
    recipients_total: 84, open_rate: 0.43, click_rate: 0.21, reply_rate: 0.06, attributed_revenue_cents: 612_000,
    last_sent_at: ago(168),
  },
]

// ── PIPELINE — users currently sitting at each step ─────────────────────
export const pipelineUsers: PipelineUser[] = [
  // Day 1 — connect nudge
  {
    id: 'pl-001', user_name: 'Tasha Rivers', user_email: 'tasha.rivers@gmail.com',
    current_step: 'day_1_connect', entered_step_at: ago(14), stage: 'trial_new',
    last_email_opened: true, last_email_clicked: false,
    flag: 'Email opened — likely got distracted before clicking',
  },

  // Day 3 — share nudge
  {
    id: 'pl-002', user_name: 'Kennedy Park', user_email: 'kpark@me.com',
    current_step: 'day_3_share', entered_step_at: ago(8), stage: 'trial_engaged',
    last_email_opened: true, last_email_clicked: true,
    flag: 'Clicked share button — should land in next step soon',
  },

  // Day 6 — conversion push
  {
    id: 'pl-003', user_name: 'Jordan Maddux', user_email: 'jordanmaddux@gmail.com',
    current_step: 'day_6_convert', entered_step_at: ago(1), stage: 'trial_expiring',
    last_email_opened: false, last_email_clicked: false,
    flag: 'High-priority — fires noon today, no engagement yet',
  },

  // Day 8 — last chance
  // (none currently sitting here — most either converted or lapsed)

  // Paid welcome
  {
    id: 'pl-004', user_name: 'Aubrey Castillo', user_email: 'acastillo@yahoo.com',
    current_step: 'paid_welcome', entered_step_at: ago(18 * 24), stage: 'paid_new',
    last_email_opened: true, last_email_clicked: true,
  },
  {
    id: 'pl-005', user_name: 'Ramón Téllez', user_email: 'r.tellez@gmail.com',
    current_step: 'paid_welcome', entered_step_at: ago(24 * 24), stage: 'paid_new',
    last_email_opened: true, last_email_clicked: true,
  },
  {
    id: 'pl-006', user_name: 'Marisol Acevedo', user_email: 'marisolacevedo@gmail.com',
    current_step: 'paid_welcome', entered_step_at: ago(38 * 24), stage: 'paid_new',
    last_email_opened: true, last_email_clicked: false,
  },

  // Day 90 check
  {
    id: 'pl-007', user_name: 'Sasha Pellegrino', user_email: 'spellegrino@gmail.com',
    current_step: 'day_90_check', entered_step_at: ago(48), stage: 'paid_active',
    last_email_opened: true, last_email_clicked: true,
  },

  // Renewal 60d
  {
    id: 'pl-008', user_name: 'Devin Patel', user_email: 'dpatel91@hotmail.com',
    current_step: 'renewal_60d', entered_step_at: ago(72), stage: 'paid_active',
    last_email_opened: true, last_email_clicked: false,
  },

  // Winback
  {
    id: 'pl-009', user_name: 'Olivia Renteria', user_email: 'orenteria@hotmail.com',
    current_step: 'winback', entered_step_at: ago(20 * 24), stage: 'churned_recent',
    last_email_opened: false, last_email_clicked: false,
    flag: 'Scheduled for Aug 1 winback batch — not yet sent',
  },
]

// ── RECENT SENDS feed ──────────────────────────────────────────────────
export const recentSends: SendRecord[] = [
  { id: 's-01', template_id: 'em-001', recipient_name: 'Tasha Rivers',       recipient_email: 'tasha.rivers@gmail.com', sent_at: ago(0, 35), status: 'opened' },
  { id: 's-02', template_id: 'em-002', recipient_name: 'Riley Boucher',      recipient_email: 'riley.b@gmail.com',      sent_at: ago(2),     status: 'clicked' },
  { id: 's-03', template_id: 'em-005', recipient_name: 'Kennedy Park',       recipient_email: 'kpark@me.com',           sent_at: ago(8),     status: 'replied', reply_excerpt: 'Just shared one — thanks for the nudge!' },
  { id: 's-04', template_id: 'em-006', recipient_name: 'Jordan Maddux',      recipient_email: 'jordanmaddux@gmail.com', sent_at: ago(8),     status: 'delivered' },
  { id: 's-05', template_id: 'em-003', recipient_name: 'Ramón Téllez',       recipient_email: 'r.tellez@gmail.com',     sent_at: ago(24),    status: 'opened' },
  { id: 's-06', template_id: 'em-008', recipient_name: 'Sasha Pellegrino',   recipient_email: 'spellegrino@gmail.com',  sent_at: ago(48),    status: 'clicked' },
  { id: 's-07', template_id: 'em-007', recipient_name: 'Cameron Yost',       recipient_email: 'cam.yost@gmail.com',     sent_at: ago(20),    status: 'replied', reply_excerpt: 'Off-season cancel — will revisit Aug.' },
  { id: 's-08', template_id: 'em-009', recipient_name: 'Devin Patel',        recipient_email: 'dpatel91@hotmail.com',   sent_at: ago(72),    status: 'opened' },
  { id: 's-09', template_id: 'em-005', recipient_name: 'Riley Boucher',      recipient_email: 'riley.b@gmail.com',      sent_at: ago(40),    status: 'clicked' },
  { id: 's-10', template_id: 'em-001', recipient_name: 'Trent Buford',       recipient_email: 'tbuford@gmail.com',      sent_at: ago(96),    status: 'bounced' },
]

export interface EmailStats {
  active_templates: number
  total_templates: number
  sends_30d: number
  avg_open_rate: number
  avg_click_rate: number
  attributed_revenue_90d_cents: number
  pipeline_volume: number
  pipeline_high_priority: number
}

export function emailStats(): EmailStats {
  const active = templates.filter((t) => t.active)
  const totalSends = active.reduce((s, t) => s + t.recipients_total, 0)
  const wOpen = active.reduce((s, t) => s + t.open_rate * t.recipients_total, 0)
  const wClick = active.reduce((s, t) => s + t.click_rate * t.recipients_total, 0)
  return {
    active_templates: active.length,
    total_templates: templates.length,
    sends_30d: 1_842,
    avg_open_rate: totalSends > 0 ? wOpen / totalSends : 0,
    avg_click_rate: totalSends > 0 ? wClick / totalSends : 0,
    attributed_revenue_90d_cents: templates.reduce((s, t) => s + t.attributed_revenue_cents, 0),
    pipeline_volume: pipelineUsers.length,
    pipeline_high_priority: pipelineUsers.filter((u) => u.flag).length,
  }
}
