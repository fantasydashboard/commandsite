/**
 * CommandSite Support — open tickets, active onboardings (new customers
 * in setup phase), and knowledge-base hot articles.
 */

export type TicketSeverity = 'urgent' | 'high' | 'normal' | 'low'
export type TicketStatus = 'new' | 'in_progress' | 'waiting_customer' | 'resolved'
export type TicketChannel = 'email' | 'slack' | 'in_app' | 'phone'

export interface Ticket {
  id: string
  customer_company: string
  customer_id: string
  reporter_name: string
  reporter_email: string
  subject: string
  body: string
  severity: TicketSeverity
  status: TicketStatus
  channel: TicketChannel
  assignee: string  // "Josh" since CommandSite is solo for now
  created_at: string
  last_activity_at: string
  /** Reference to KB article that might resolve this */
  suggested_kb?: string
}

export interface OnboardingChecklistItem {
  key: string
  label: string
  done: boolean
  done_at?: string
}

export interface Onboarding {
  id: string
  customer_company: string
  customer_id: string
  primary_contact_name: string
  primary_contact_email: string
  signed_at: string
  /** Day of 14-day onboarding (1-14) */
  day_of_14: number
  /** Currently scheduled kickoff or follow-up call */
  next_call_at?: string
  csm_notes: string
  checklist: OnboardingChecklistItem[]
  /** "On track" / "Stalled" / "At risk" — derived from checklist + days */
  status: 'on_track' | 'stalled' | 'at_risk' | 'complete'
}

export interface KbArticle {
  id: string
  title: string
  category: 'getting_started' | 'twilio' | 'stripe' | 'reviews' | 'reactivation' | 'integrations' | 'troubleshooting'
  views_30d: number
  ticket_deflection_rate: number  // 0-1; how often viewing this article eliminates a ticket
  last_updated_at: string
  /** Has it been updated in the last 90 days? Articles older than that
   *  drift out of date and become a quality liability. */
  needs_refresh: boolean
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}
function fromNow(days: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const tickets: Ticket[] = [
  {
    id: 'tk-001',
    customer_company: 'BrightVolt Electric', customer_id: 'co-003',
    reporter_name: 'Derrick Pham', reporter_email: 'derrick@brightvolt.com',
    subject: 'AI receptionist sounds too scripted',
    body: `Several of our customers have mentioned the AI sounds robotic. Can we adjust the voice or the script? Specifically the after-hours flow — it pauses awkwardly between sentences.`,
    severity: 'high', status: 'in_progress', channel: 'email', assignee: 'Josh',
    created_at: ago(4), last_activity_at: ago(0, 12),
    suggested_kb: 'kb-006',
  },
  {
    id: 'tk-002',
    customer_company: 'BrightVolt Electric', customer_id: 'co-003',
    reporter_name: 'Derrick Pham', reporter_email: 'derrick@brightvolt.com',
    subject: 'Two of our techs aren\'t getting dispatch SMS',
    body: `Brandon and Aaron say they\'ve missed at least 3 dispatch SMS each in the last week. Other techs are getting them fine. Could be Twilio? Could be on our end?`,
    severity: 'urgent', status: 'in_progress', channel: 'slack', assignee: 'Josh',
    created_at: ago(2), last_activity_at: ago(0, 4),
    suggested_kb: 'kb-008',
  },
  {
    id: 'tk-003',
    customer_company: 'Stonecrest Roofing', customer_id: 'co-007',
    reporter_name: 'Owen Maddox', reporter_email: 'owen@stonecrestroofing.com',
    subject: 'Reactivation template needs editing for roofing',
    body: `The default reactivation SMS uses HVAC-specific language ("AC tune-up"). Need a roofing-friendly version. Happy to draft it if you have a template.`,
    severity: 'normal', status: 'waiting_customer', channel: 'in_app', assignee: 'Josh',
    created_at: ago(7), last_activity_at: ago(2),
    suggested_kb: 'kb-005',
  },
  {
    id: 'tk-004',
    customer_company: 'Apex Heating & Air', customer_id: 'co-001',
    reporter_name: 'Marcus Reyes', reporter_email: 'marcus@apex-air.com',
    subject: 'Multi-location early access — when?',
    body: `You mentioned multi-location is shipping next month — putting it on Marcus\'s ops calendar so we\'re ready to onboard a second location in May. Any rough date?`,
    severity: 'low', status: 'waiting_customer', channel: 'email', assignee: 'Josh',
    created_at: ago(11), last_activity_at: ago(5),
  },
  {
    id: 'tk-005',
    customer_company: 'TidalWave Plumbing', customer_id: 'co-002',
    reporter_name: 'Sofia Marquez', reporter_email: 'sofia@tidalwaveplumbing.com',
    subject: 'Quick question on quote-followup timing',
    body: `Can the Day-3 follow-up SMS be timed for 9 AM local instead of 10 AM? We\'ve seen better reply rates with earlier sends in our manual tests.`,
    severity: 'low', status: 'new', channel: 'in_app', assignee: 'Josh',
    created_at: ago(0, 18), last_activity_at: ago(0, 18),
    suggested_kb: 'kb-007',
  },
  {
    id: 'tk-006',
    customer_company: 'Polished Cleaning Co', customer_id: 'co-008',
    reporter_name: 'Yasmin Okafor', reporter_email: 'yasmin@polishedcleaning.com',
    subject: 'Webhook events feature request',
    body: `Would love a "job_completed" webhook so we can pipe completed jobs into our internal scheduling tool. Even just the JSON payload spec would unblock us.`,
    severity: 'normal', status: 'new', channel: 'email', assignee: 'Josh',
    created_at: ago(1, 6), last_activity_at: ago(1, 6),
    suggested_kb: 'kb-009',
  },
  {
    id: 'tk-007',
    customer_company: 'Premier Plumbing Solutions', customer_id: 'co-010',
    reporter_name: 'Jorge Salinas', reporter_email: 'jorge@premierplumbingfl.com',
    subject: '[RESOLVED] Twilio number not forwarding',
    body: `Our Twilio number wasn\'t forwarding to the AI assistant — turned out to be a config flag we missed. Resolved by Josh in 14 min, posting here for reference.`,
    severity: 'high', status: 'resolved', channel: 'slack', assignee: 'Josh',
    created_at: ago(3), last_activity_at: ago(2, 22),
  },
  {
    id: 'tk-008',
    customer_company: 'GreenLeaf Landscaping', customer_id: 'co-004',
    reporter_name: 'Wes Holloway', reporter_email: 'wes@greenleafatx.com',
    subject: '[RESOLVED] Stripe webhook failing',
    body: `Stripe webhook was firing but our handler 500\'d on subscription_updated events. Fixed by Josh — needed to add nullable handling on the metadata field.`,
    severity: 'high', status: 'resolved', channel: 'in_app', assignee: 'Josh',
    created_at: ago(5), last_activity_at: ago(4, 18),
  },
]

export const onboardings: Onboarding[] = [
  {
    id: 'ob-001',
    customer_company: 'GreenLeaf Landscaping', customer_id: 'co-004',
    primary_contact_name: 'Wes Holloway',
    primary_contact_email: 'wes@greenleafatx.com',
    signed_at: ago(8), day_of_14: 8,
    next_call_at: fromNow(2, 14),
    csm_notes: 'Highly engaged in shared Slack. Twilio + Stripe still need wiring before EOW. Wes prefers Looms over docs.',
    status: 'on_track',
    checklist: [
      { key: 'kickoff_call',        label: 'Kickoff call (60 min)',                  done: true,  done_at: ago(7) },
      { key: 'stripe_connected',    label: 'Stripe payment method on file',          done: true,  done_at: ago(7) },
      { key: 'team_invited',        label: 'Team members invited',                    done: true,  done_at: ago(6) },
      { key: 'twilio_routed',       label: 'Twilio number forwarded',                done: false },
      { key: 'first_call_handled',  label: 'First AI-handled call',                  done: false },
      { key: 'review_automation_on',label: 'Review automation enabled',              done: false },
      { key: 'reactivation_on',     label: 'Reactivation cadence enabled',           done: false },
      { key: 'final_walkthrough',   label: 'Final walkthrough call (30 min)',        done: false },
    ],
  },
  {
    id: 'ob-002',
    customer_company: 'HomeShield Pest', customer_id: 'co-006',
    primary_contact_name: 'Andre Bautista',
    primary_contact_email: 'andre@homeshieldpest.com',
    signed_at: ago(4), day_of_14: 4,
    next_call_at: fromNow(1, 11),
    csm_notes: 'Trial customer (Day 4 of 14). Twilio connected yesterday — needs nudge to enable review automation by Day 6.',
    status: 'on_track',
    checklist: [
      { key: 'kickoff_call',        label: 'Kickoff call',                  done: true,  done_at: ago(3) },
      { key: 'stripe_connected',    label: 'Stripe trial PM on file',       done: true,  done_at: ago(3) },
      { key: 'team_invited',        label: 'Team members invited',          done: false },
      { key: 'twilio_routed',       label: 'Twilio number forwarded',       done: true,  done_at: ago(1) },
      { key: 'first_call_handled',  label: 'First AI-handled call',         done: false },
      { key: 'review_automation_on',label: 'Review automation enabled',     done: false },
    ],
  },
  {
    id: 'ob-003',
    customer_company: 'Anchor Pool & Spa', customer_id: 'co-pending-anchor',
    primary_contact_name: 'Tomás Quintana',
    primary_contact_email: 'tomas@anchorpoolaz.com',
    signed_at: ago(1), day_of_14: 1,
    next_call_at: fromNow(3, 13),
    csm_notes: 'Just signed yesterday (referred by Emma at ClearStream). Easy onboarding — already half-sold. Kickoff Thursday.',
    status: 'on_track',
    checklist: [
      { key: 'kickoff_call',        label: 'Kickoff call (Thu)',           done: false },
      { key: 'stripe_connected',    label: 'Stripe payment method on file',done: true,  done_at: ago(1) },
      { key: 'team_invited',        label: 'Team members invited',         done: false },
      { key: 'twilio_routed',       label: 'Twilio number forwarded',      done: false },
      { key: 'first_call_handled',  label: 'First AI-handled call',        done: false },
    ],
  },
]

export const kbArticles: KbArticle[] = [
  { id: 'kb-001', title: 'Getting Started: Your first 24 hours', category: 'getting_started', views_30d: 412, ticket_deflection_rate: 0.31, last_updated_at: ago(18), needs_refresh: false },
  { id: 'kb-002', title: 'Connecting Twilio (step-by-step with screenshots)', category: 'twilio', views_30d: 287, ticket_deflection_rate: 0.42, last_updated_at: ago(34), needs_refresh: false },
  { id: 'kb-003', title: 'Connecting Stripe + setting up your subscription', category: 'stripe', views_30d: 198, ticket_deflection_rate: 0.38, last_updated_at: ago(41), needs_refresh: false },
  { id: 'kb-004', title: 'Setting up the AI receptionist greeting + script', category: 'getting_started', views_30d: 184, ticket_deflection_rate: 0.27, last_updated_at: ago(22), needs_refresh: false },
  { id: 'kb-005', title: 'Customizing reactivation SMS templates per industry', category: 'reactivation', views_30d: 96, ticket_deflection_rate: 0.51, last_updated_at: ago(124), needs_refresh: true },
  { id: 'kb-006', title: 'Tuning the AI receptionist voice (avoid sounding scripted)', category: 'troubleshooting', views_30d: 142, ticket_deflection_rate: 0.18, last_updated_at: ago(67), needs_refresh: false },
  { id: 'kb-007', title: 'Quote-followup cadence: timing + message templates', category: 'getting_started', views_30d: 78, ticket_deflection_rate: 0.34, last_updated_at: ago(48), needs_refresh: false },
  { id: 'kb-008', title: 'Troubleshooting: dispatch SMS not arriving', category: 'troubleshooting', views_30d: 64, ticket_deflection_rate: 0.61, last_updated_at: ago(102), needs_refresh: true },
  { id: 'kb-009', title: 'Webhooks: payload reference + setup guide', category: 'integrations', views_30d: 47, ticket_deflection_rate: 0.44, last_updated_at: ago(28), needs_refresh: false },
  { id: 'kb-010', title: 'Importing customers from Jobber / Housecall Pro', category: 'integrations', views_30d: 134, ticket_deflection_rate: 0.29, last_updated_at: ago(57), needs_refresh: false },
  { id: 'kb-011', title: 'Review automation: setup + best practices', category: 'reviews', views_30d: 91, ticket_deflection_rate: 0.36, last_updated_at: ago(31), needs_refresh: false },
  { id: 'kb-012', title: 'Pricing tiers explained (Starter / Pro / Scale)', category: 'getting_started', views_30d: 162, ticket_deflection_rate: 0.21, last_updated_at: ago(14), needs_refresh: false },
]

export interface SupportStats {
  open_tickets: number
  urgent_tickets: number
  median_response_h: number
  active_onboardings: number
  onboardings_at_risk: number
  kb_views_30d: number
  kb_articles_needing_refresh: number
}

export function supportStats(): SupportStats {
  const open = tickets.filter((t) => t.status !== 'resolved')
  const urgent = open.filter((t) => t.severity === 'urgent').length
  const onboardings_at_risk = onboardings.filter((o) => o.status === 'at_risk' || o.status === 'stalled').length

  return {
    open_tickets: open.length,
    urgent_tickets: urgent,
    median_response_h: 2,  // demo placeholder — would compute from first-response times
    active_onboardings: onboardings.filter((o) => o.status !== 'complete').length,
    onboardings_at_risk,
    kb_views_30d: kbArticles.reduce((s, a) => s + a.views_30d, 0),
    kb_articles_needing_refresh: kbArticles.filter((a) => a.needs_refresh).length,
  }
}

export const SEVERITY_META: Record<TicketSeverity, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#EF4444' },
  high:   { label: 'High',   color: '#F59E0B' },
  normal: { label: 'Normal', color: 'rgb(var(--color-brand))' },
  low:    { label: 'Low',    color: '#94A3B8' },
}

export const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  new:                { label: 'New',                color: 'rgb(var(--color-accent))' },
  in_progress:        { label: 'In progress',        color: '#F59E0B' },
  waiting_customer:   { label: 'Waiting on customer',color: '#A855F7' },
  resolved:           { label: 'Resolved',           color: '#10B981' },
}

export const ONBOARDING_STATUS_META: Record<Onboarding['status'], { label: string; color: string }> = {
  on_track: { label: 'On track', color: '#10B981' },
  stalled:  { label: 'Stalled',  color: '#F59E0B' },
  at_risk:  { label: 'At risk',  color: '#EF4444' },
  complete: { label: 'Complete', color: '#94A3B8' },
}

export const KB_CATEGORY_LABEL: Record<KbArticle['category'], string> = {
  getting_started: 'Getting started',
  twilio:          'Twilio',
  stripe:          'Stripe',
  reviews:         'Reviews',
  reactivation:    'Reactivation',
  integrations:    'Integrations',
  troubleshooting: 'Troubleshooting',
}
