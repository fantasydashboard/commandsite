/**
 * Apex Heating & Air — email campaign library + recent send activity.
 * Mirrors what a real HVAC business actually sends: post-service review
 * requests, maintenance plan renewals, seasonal tune-up campaigns,
 * financing offers, dormant win-backs, new-customer welcome.
 */

export type CampaignKind = 'transactional' | 'lifecycle' | 'seasonal' | 'broadcast'

export interface EmailCampaign {
  id: string
  name: string
  kind: CampaignKind
  trigger: string
  active: boolean
  subject: string
  preview: string
  /** Plain-text body shown in the preview pane */
  body: string
  recipients_total: number
  open_rate: number
  click_rate: number
  reply_rate?: number
  /** Campaign generated revenue last 90 days, in cents */
  attributed_revenue_cents: number
  last_sent_at: string | null
}

export interface SendRecord {
  id: string
  campaign_id: string
  recipient_name: string
  recipient_email: string
  sent_at: string
  status: 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced'
  reply_excerpt?: string
}

function ago(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const campaigns: EmailCampaign[] = [
  // ── Transactional / Triggered
  {
    id: 'cmp-01',
    name: 'Post-Service Review Request',
    kind: 'transactional',
    trigger: 'Sent 24h after job completion',
    active: true,
    subject: '{{first_name}}, how did Marcus do?',
    preview: 'Quick favor — would you mind leaving us a Google review?',
    body: `Hi {{first_name}},\n\nMarcus mentioned the visit went well — thanks again for choosing Apex.\n\nWould you mind taking 30 seconds to share how it went on Google? It genuinely helps neighbors find us, and we read every single one.\n\n👉 Leave a review: {{review_link}}\n\nIf anything wasn't 5-star, please reply to this email and we'll make it right.\n\n— Marcus + the Apex team\n(407) 555-0100`,
    recipients_total: 487,
    open_rate: 0.71,
    click_rate: 0.34,
    reply_rate: 0.06,
    attributed_revenue_cents: 0,
    last_sent_at: ago(2),
  },
  {
    id: 'cmp-02',
    name: 'Quote Sent Confirmation',
    kind: 'transactional',
    trigger: 'Sent immediately after quote is created',
    active: true,
    subject: 'Your Apex quote — {{job_type}}',
    preview: 'Here\'s the breakdown for {{job_type}} at {{address}}.',
    body: `Hi {{first_name}},\n\nThanks for having us out today. Here's the quote we walked through:\n\n📋 Job: {{job_type}}\n💰 Total: {{quote_amount}}\n📅 Quote good through: {{expires_at}}\n\nIf you have any questions before you decide, just hit reply or call (407) 555-0100. We also offer 0% APR financing for 18 months on jobs over $1,000 through Wells Fargo.\n\nNo pressure either way — happy to be considered.\n\n— Marcus, Apex Heating & Air`,
    recipients_total: 142,
    open_rate: 0.84,
    click_rate: 0.27,
    attributed_revenue_cents: 184_700_00,
    last_sent_at: ago(6),
  },
  {
    id: 'cmp-03',
    name: 'New Customer Welcome',
    kind: 'transactional',
    trigger: 'Sent after first paid invoice',
    active: true,
    subject: 'Welcome to Apex, {{first_name}}',
    preview: 'A few things to know now that you\'re part of the family.',
    body: `Hi {{first_name}},\n\nWelcome — we genuinely appreciate you trusting us with your home.\n\nA few quick things to know:\n\n• Save (407) 555-0100 in your phone — we answer 24/7, even on holidays.\n• Your service history lives in your account at apex-air.com/me.\n• Annual maintenance plan members get priority dispatch + 15% off repairs. If you'd like to add it, reply YES and we'll set it up for $14/month.\n\nThanks again,\n\n— The Apex team`,
    recipients_total: 73,
    open_rate: 0.79,
    click_rate: 0.18,
    reply_rate: 0.12,
    attributed_revenue_cents: 21_400_00,
    last_sent_at: ago(28),
  },

  // ── Lifecycle
  {
    id: 'cmp-04',
    name: 'Maintenance Plan Renewal',
    kind: 'lifecycle',
    trigger: '60 days before plan expires',
    active: true,
    subject: 'Your Apex Comfort Club renews on {{renewal_date}}',
    preview: 'Heads up — here\'s what\'s included next year.',
    body: `Hi {{first_name}},\n\nYour Apex Comfort Club membership renews on {{renewal_date}} at $14/month — no action needed.\n\nWhat you get this year:\n\n✓ 2 maintenance visits (spring AC + fall heating)\n✓ Priority dispatch (skip the queue when it's hot)\n✓ 15% off any repair\n✓ No after-hours fees\n✓ 10% off any new install\n\nIf anything's changed (moved, sold the home, want to cancel) — just reply.\n\nThanks for being a member,\n\n— Apex Heating & Air`,
    recipients_total: 318,
    open_rate: 0.68,
    click_rate: 0.09,
    reply_rate: 0.04,
    attributed_revenue_cents: 53_400_00,
    last_sent_at: ago(72),
  },
  {
    id: 'cmp-05',
    name: 'Dormant 90-Day Check-In',
    kind: 'lifecycle',
    trigger: '90 days since last service',
    active: true,
    subject: 'Quick check-in, {{first_name}}',
    preview: 'How is everything running?',
    body: `Hi {{first_name}},\n\nQuick check-in — it's been about three months since {{last_service}}. Anything feel off? Strange sounds, weak airflow, the thermostat acting up?\n\nIf so, reply with what you're noticing and we'll either troubleshoot over text or get a tech out, no charge for the diagnosis.\n\nIf everything's running smoothly, ignore this — we just like to check in.\n\n— Marcus`,
    recipients_total: 264,
    open_rate: 0.59,
    click_rate: 0.07,
    reply_rate: 0.11,
    attributed_revenue_cents: 18_900_00,
    last_sent_at: ago(96),
  },

  // ── Seasonal
  {
    id: 'cmp-06',
    name: 'Spring AC Tune-Up Push',
    kind: 'seasonal',
    trigger: 'Manual send · March',
    active: true,
    subject: 'Beat the Florida heat — book your AC tune-up',
    preview: '$89 includes a 21-point inspection.',
    body: `Hi {{first_name}},\n\nFlorida summers are brutal on AC units. The #1 reason we get emergency calls in July is that nobody serviced the unit in March.\n\nApril promotion: $89 for our 21-point AC tune-up (normally $149). Includes:\n\n• Refrigerant level check\n• Coil cleaning\n• Capacitor + contactor inspection\n• Drain line clear\n• Thermostat calibration\n• Filter replacement (if needed)\n\n👉 Book online: {{booking_link}}\nor reply with two times that work.\n\n— Apex`,
    recipients_total: 1_182,
    open_rate: 0.42,
    click_rate: 0.14,
    attributed_revenue_cents: 67_300_00,
    last_sent_at: ago(720),  // 30 days ago
  },
  {
    id: 'cmp-07',
    name: 'Pre-Winter Furnace Check',
    kind: 'seasonal',
    trigger: 'Manual send · October',
    active: true,
    subject: 'Cold snap coming — is your heat ready?',
    preview: 'Schedule a furnace inspection before the rush.',
    body: `Hi {{first_name}},\n\nCold front coming through next week — the calls always spike when temps drop overnight.\n\nGet ahead of it: schedule a $99 furnace inspection by Friday and we'll bump you to the front of the line if anything fails this winter.\n\n👉 Book online: {{booking_link}}\n\n— Apex Heating & Air`,
    recipients_total: 1_105,
    open_rate: 0.46,
    click_rate: 0.16,
    attributed_revenue_cents: 41_800_00,
    last_sent_at: null,
  },

  // ── Broadcast
  {
    id: 'cmp-08',
    name: 'Wells Fargo Financing Offer',
    kind: 'broadcast',
    trigger: 'Manual send to install-quote prospects',
    active: false,
    subject: '0% APR for 18 months — limited time',
    preview: 'Spread out an HVAC install with no interest.',
    body: `Hi {{first_name}},\n\nQuick note — Wells Fargo has extended their 0% APR for 18 months promotion through the end of the month. That's a meaningful chunk of breathing room for a $5K-$15K install.\n\nIf you've been holding off on the {{quoted_job}} we discussed, now's the time. Application takes 60 seconds and is soft-pull only.\n\n👉 Apply: {{financing_link}}\n\n— Marcus`,
    recipients_total: 89,
    open_rate: 0.61,
    click_rate: 0.22,
    attributed_revenue_cents: 92_500_00,
    last_sent_at: ago(168),  // 7 days ago
  },
  {
    id: 'cmp-09',
    name: 'Hurricane Prep — Generator Service',
    kind: 'broadcast',
    trigger: 'Manual send · June',
    active: false,
    subject: 'Hurricane season starts June 1 — is your generator ready?',
    preview: 'We service Generac, Kohler, and Briggs.',
    body: `Hi {{first_name}},\n\nHurricane season starts June 1. If you have a whole-home generator, now's the time to make sure it'll actually fire up when the power goes out.\n\nWe service Generac, Kohler, and Briggs. $129 for a full inspection + load test.\n\n👉 Book before May 25 to lock in availability: {{booking_link}}\n\n— Apex`,
    recipients_total: 0,
    open_rate: 0,
    click_rate: 0,
    attributed_revenue_cents: 0,
    last_sent_at: null,
  },
]

export const recentSends: SendRecord[] = [
  { id: 's-01', campaign_id: 'cmp-01', recipient_name: 'Tom Bradley',       recipient_email: 'tbradley@gmail.com',   sent_at: ago(0.5), status: 'opened' },
  { id: 's-02', campaign_id: 'cmp-01', recipient_name: 'Lisa Bennett',      recipient_email: 'lbennett@yahoo.com',   sent_at: ago(1),   status: 'clicked' },
  { id: 's-03', campaign_id: 'cmp-02', recipient_name: 'Robert Chen',       recipient_email: 'rchen@me.com',         sent_at: ago(2),   status: 'opened' },
  { id: 's-04', campaign_id: 'cmp-01', recipient_name: 'Karen Holloway',    recipient_email: 'khollo@hotmail.com',   sent_at: ago(3),   status: 'replied', reply_excerpt: 'Marcus was wonderful — leaving a review now!' },
  { id: 's-05', campaign_id: 'cmp-04', recipient_name: 'Patricia Andrews',  recipient_email: 'panddrews@gmail.com',  sent_at: ago(5),   status: 'delivered' },
  { id: 's-06', campaign_id: 'cmp-05', recipient_name: 'Diana Esposito',    recipient_email: 'diana.e@gmail.com',    sent_at: ago(7),   status: 'replied', reply_excerpt: 'AC has been making a clicking noise actually. Can you take a look?' },
  { id: 's-07', campaign_id: 'cmp-08', recipient_name: 'James Sullivan',    recipient_email: 'jsull@aol.com',        sent_at: ago(8),   status: 'clicked' },
  { id: 's-08', campaign_id: 'cmp-02', recipient_name: 'Yvonne Castillo',   recipient_email: 'ycastillo@gmail.com',  sent_at: ago(10),  status: 'opened' },
  { id: 's-09', campaign_id: 'cmp-01', recipient_name: 'Jennifer Martinez', recipient_email: 'jmart@gmail.com',      sent_at: ago(14),  status: 'clicked' },
  { id: 's-10', campaign_id: 'cmp-04', recipient_name: 'Greg Hammond',      recipient_email: 'ghammond@gmail.com',   sent_at: ago(20),  status: 'bounced' },
  { id: 's-11', campaign_id: 'cmp-03', recipient_name: 'Anthony Russo',     recipient_email: 'arusso@yahoo.com',     sent_at: ago(28),  status: 'opened' },
  { id: 's-12', campaign_id: 'cmp-05', recipient_name: 'Frank Delgado',     recipient_email: 'fdelgado@me.com',      sent_at: ago(36),  status: 'opened' },
]

export interface CampaignStats {
  active_count: number
  total_count: number
  sends_30d: number
  avg_open_rate: number
  avg_click_rate: number
  attributed_revenue_90d_cents: number
}

export function campaignStats(): CampaignStats {
  const active = campaigns.filter((c) => c.active)
  const total_sends = active.reduce((s, c) => s + c.recipients_total, 0)
  const wOpen = active.reduce((s, c) => s + c.open_rate * c.recipients_total, 0)
  const wClick = active.reduce((s, c) => s + c.click_rate * c.recipients_total, 0)
  return {
    active_count: active.length,
    total_count: campaigns.length,
    sends_30d: 1_847,  // headline number, sum of recent monthly sends
    avg_open_rate: total_sends > 0 ? wOpen / total_sends : 0,
    avg_click_rate: total_sends > 0 ? wClick / total_sends : 0,
    attributed_revenue_90d_cents: campaigns.reduce((s, c) => s + c.attributed_revenue_cents, 0),
  }
}
