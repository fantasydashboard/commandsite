/**
 * CommandSite Outreach — cold-email + cold-call + LinkedIn sequences,
 * the reply inbox classified by AI, and the manual call queue. This
 * is where new pipeline gets created.
 */

export type Channel = 'email' | 'linkedin' | 'call'
export type SequenceStatus = 'active' | 'paused' | 'draft'

export interface Sequence {
  id: string
  name: string
  channel: Channel
  status: SequenceStatus
  /** Buyer persona this sequence targets */
  persona: string
  /** Number of touches in the sequence (e.g. 4-touch email cadence) */
  touches: number
  leads_total: number
  sent: number
  opened: number
  replied: number
  positive_replies: number
  meetings_booked: number
  started_at: string
  /** ISO of most recent send by the engine */
  last_send_at: string
}

export type ReplyClass = 'positive' | 'neutral' | 'negative' | 'objection' | 'oof' | 'unsubscribe'

export interface Reply {
  id: string
  sequence_id: string
  author_name: string
  author_title: string
  author_company: string
  author_industry: string
  city: string
  state: string
  team_size: number
  classification: ReplyClass
  /** AI confidence in the classification, 0-1 */
  confidence: number
  excerpt: string
  full_body: string
  ai_suggested_reply: string
  /** Whether they're already in the pipeline as a deal */
  in_pipeline: boolean
  received_at: string
}

export interface CallQueueItem {
  id: string
  contact_name: string
  contact_title: string
  company: string
  industry: string
  city: string
  state: string
  phone: string
  reason: string  // why this person is in the queue
  priority: 'high' | 'medium' | 'low'
  best_time_window: string  // "10 AM – 12 PM CT"
  last_attempted_at: string | null
  attempts: number
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const sequences: Sequence[] = [
  {
    id: 'seq-001',
    name: 'HVAC Operators · Florida · Q2',
    channel: 'email',
    status: 'active',
    persona: 'HVAC owners + GMs, 5-15 techs',
    touches: 4,
    leads_total: 218,
    sent: 612,
    opened: 287,
    replied: 41,
    positive_replies: 12,
    meetings_booked: 7,
    started_at: ago(28),
    last_send_at: ago(0, 4),
  },
  {
    id: 'seq-002',
    name: 'Plumbing GMs · Sun Belt',
    channel: 'email',
    status: 'active',
    persona: 'Plumbing operations leaders, multi-location',
    touches: 4,
    leads_total: 142,
    sent: 398,
    opened: 174,
    replied: 28,
    positive_replies: 9,
    meetings_booked: 5,
    started_at: ago(21),
    last_send_at: ago(0, 6),
  },
  {
    id: 'seq-003',
    name: 'Electrical Owners · NC + SC',
    channel: 'email',
    status: 'active',
    persona: 'Electrical contracting owners, 5-20 techs',
    touches: 3,
    leads_total: 96,
    sent: 184,
    opened: 78,
    replied: 14,
    positive_replies: 4,
    meetings_booked: 2,
    started_at: ago(14),
    last_send_at: ago(1),
  },
  {
    id: 'seq-004',
    name: 'LinkedIn · Owners commenting on Apex case study',
    channel: 'linkedin',
    status: 'active',
    persona: 'Anyone who engages with the Apex story on LinkedIn',
    touches: 2,
    leads_total: 47,
    sent: 47,
    opened: 47,  // LinkedIn doesn't really differentiate
    replied: 18,
    positive_replies: 11,
    meetings_booked: 6,
    started_at: ago(34),
    last_send_at: ago(0, 12),
  },
  {
    id: 'seq-005',
    name: 'Cold call · High-fit accounts (Apollo)',
    channel: 'call',
    status: 'active',
    persona: 'Top 50 accounts from Apollo by ICP fit, no email reply yet',
    touches: 2,
    leads_total: 50,
    sent: 38,  // dials made
    opened: 21,  // connected (someone answered)
    replied: 11, // had a real conversation
    positive_replies: 4,
    meetings_booked: 3,
    started_at: ago(17),
    last_send_at: ago(0, 22),
  },
  {
    id: 'seq-006',
    name: 'Roofing winback · Q3 prospects who ghosted',
    channel: 'email',
    status: 'paused',
    persona: 'Roofing contacts from Q3 that went cold',
    touches: 3,
    leads_total: 64,
    sent: 64,
    opened: 18,
    replied: 2,
    positive_replies: 0,
    meetings_booked: 0,
    started_at: ago(58),
    last_send_at: ago(40),
  },
  {
    id: 'seq-007',
    name: 'Pest control owners · Southeast US',
    channel: 'email',
    status: 'draft',
    persona: 'Pest control owners, 4-12 techs, GA/AL/SC/NC',
    touches: 4,
    leads_total: 0,
    sent: 0,
    opened: 0,
    replied: 0,
    positive_replies: 0,
    meetings_booked: 0,
    started_at: ago(2),
    last_send_at: ago(2),
  },
]

export const replies: Reply[] = [
  // POSITIVE
  {
    id: 'rep-001',
    sequence_id: 'seq-002',
    author_name: 'Jorge Salinas',
    author_title: 'GM',
    author_company: 'Premier Plumbing Solutions',
    author_industry: 'Plumbing',
    city: 'Miami', state: 'FL', team_size: 8,
    classification: 'positive',
    confidence: 0.94,
    excerpt: 'Interested, send me times for next week',
    full_body: `Hey Josh,\n\nThis caught my eye — we lose calls after hours all the time and it drives me nuts. Send me some times for next week. Tuesday or Wednesday afternoon work best.\n\nThanks,\nJorge`,
    ai_suggested_reply: `Jorge — appreciate you replying. Sent over a Calendly link with Tue + Wed afternoons open. 30 min, screenshare-only, no slide deck. Looking forward to it.\n\nIn the meantime — quick question so I can tailor the demo: roughly how many after-hours calls are you missing per week?\n\nJosh`,
    in_pipeline: true,
    received_at: ago(0, 0.25),
  },
  {
    id: 'rep-002',
    sequence_id: 'seq-001',
    author_name: 'Mike Donovan',
    author_title: 'Owner',
    author_company: 'AllPro Heating & Cooling',
    author_industry: 'HVAC',
    city: 'Tampa', state: 'FL', team_size: 8,
    classification: 'positive',
    confidence: 0.88,
    excerpt: 'Yes interested in pricing — what are the tiers?',
    full_body: `Hi Josh,\n\nGood timing. We just lost a tech and our admin is drowning in callbacks. What are your pricing tiers?\n\nMike`,
    ai_suggested_reply: `Mike — sorry to hear about the tech, that's brutal timing. Three tiers:\n\n• Starter $199/mo — solo + 1-2 techs, basic call capture\n• Pro $499/mo — your size sweet spot, full receptionist + review automation + reactivation\n• Scale $999/mo — multi-location, custom integrations\n\nMost folks at 8 techs land on Pro. Happy to walk through it on a 15-min call — here's my Calendly: {{link}}\n\nOr if you'd rather just see a 3-min Loom of how Apex (Marcus's HVAC in Orlando) is using it, I can send that over instead.`,
    in_pipeline: false,  // not yet — needs to be added
    received_at: ago(0, 3),
  },
  {
    id: 'rep-003',
    sequence_id: 'seq-004',
    author_name: 'Sofia Marquez',
    author_title: 'Operations Director',
    author_company: 'TidalWave Plumbing',
    author_industry: 'Plumbing',
    city: 'Tampa', state: 'FL', team_size: 11,
    classification: 'positive',
    confidence: 0.91,
    excerpt: 'Already a customer — but my friend at HydroFlow asked me about it',
    full_body: `Hey Josh — already on Pro plan and loving it 😅 But my friend Aaron runs HydroFlow Plumbing in Sarasota and was asking me what tool I use. Just intro'd you two — keep an eye on your inbox.\n\nSofia`,
    ai_suggested_reply: `Sofia — you're the best. Will definitely look out for Aaron's email and treat him right.\n\nBy the way — that referral is worth a free month on me, I'll add it as credit to your next invoice. Thank you!\n\nP.S. — heard you asked about multi-location. Building it now, you're at the top of the early-access list.`,
    in_pipeline: false,
    received_at: ago(0, 9),
  },

  // OBJECTION (interesting but pushing back)
  {
    id: 'rep-004',
    sequence_id: 'seq-001',
    author_name: 'Calvin Ohara',
    author_title: 'Owner',
    author_company: 'Frostline Refrigeration',
    author_industry: 'HVAC',
    city: 'Minneapolis', state: 'MN', team_size: 7,
    classification: 'objection',
    confidence: 0.79,
    excerpt: '$500/mo is steep for a 7-person shop, what justifies it?',
    full_body: `Josh,\n\nLooked at this. $500/mo is a lot for a 7-person shop. What\'s the actual ROI? I can buy a part-time admin for less than that.\n\nCalvin`,
    ai_suggested_reply: `Calvin — fair pushback. Two things to weigh:\n\n1) Most of our HVAC customers are recovering 2-4 after-hours jobs/mo that would have gone to voicemail. At your average ticket (~$400-600), that's $800-2,400/mo in revenue you weren't capturing. Pays for itself within the first week.\n\n2) An admin works 40 hrs/wk and goes home at 5. The AI receptionist works 168 hrs/wk including 2 AM Saturdays. Different category.\n\nThat said — if it's not a fit, totally understand. Could send you a quick spreadsheet that lets you plug in your own numbers? No pitch, just the math.`,
    in_pipeline: false,
    received_at: ago(1),
  },
  {
    id: 'rep-005',
    sequence_id: 'seq-003',
    author_name: 'Marisol Diaz',
    author_title: 'Owner',
    author_company: 'Coastal Electrical Services',
    author_industry: 'Electrical',
    city: 'Wilmington', state: 'NC', team_size: 6,
    classification: 'objection',
    confidence: 0.83,
    excerpt: 'Already use Jobber — what does this add?',
    full_body: `Hi Josh — appreciate the note. We\'re happy with Jobber for scheduling. What does CommandSite add that Jobber doesn\'t?\n\nMarisol`,
    ai_suggested_reply: `Marisol — Jobber's great for scheduling, no argument. Where CommandSite is different: it\'s the front-of-house, not the back-of-house. The AI receptionist takes the calls Jobber never sees — after-hours, weekends, the ones your team can't get to. Then it books the job into Jobber automatically (we have a direct integration). Plus drives review collection + dormant-customer reactivation.\n\nThink of it as the SDR + receptionist sitting in front of your existing Jobber install. Want a 5-min Loom showing how Coastal could plug it in?`,
    in_pipeline: true,  // already in proposal stage
    received_at: ago(2),
  },

  // NEGATIVE / not interested
  {
    id: 'rep-006',
    sequence_id: 'seq-001',
    author_name: 'Trent Buford',
    author_title: 'Owner',
    author_company: 'Buford Heat & Air',
    author_industry: 'HVAC',
    city: 'Pensacola', state: 'FL', team_size: 4,
    classification: 'negative',
    confidence: 0.92,
    excerpt: 'Not interested, please remove me',
    full_body: `Not interested. Please remove me from your list.`,
    ai_suggested_reply: `Trent — done, you\'re removed. Apologies for the noise. If you ever change your mind the door\'s open.`,
    in_pipeline: false,
    received_at: ago(0, 7),
  },
  {
    id: 'rep-007',
    sequence_id: 'seq-002',
    author_name: 'Kim Vanderhoff',
    author_title: 'Office Manager',
    author_company: 'Speedy Plumbing & Drain',
    author_industry: 'Plumbing',
    city: 'Orlando', state: 'FL', team_size: 6,
    classification: 'negative',
    confidence: 0.86,
    excerpt: 'Owner doesn\'t want to be contacted by vendors',
    full_body: `Hi - I'm the office manager. Mr. Castro doesn\'t take vendor solicitations. Please don\'t contact us again.\n\nThanks,\nKim`,
    ai_suggested_reply: `Kim — totally understood. Removing Speedy from our list now. Apologies for the interruption.`,
    in_pipeline: false,
    received_at: ago(1, 4),
  },

  // OOF (auto-reply)
  {
    id: 'rep-008',
    sequence_id: 'seq-001',
    author_name: 'Hailey Bramwell',
    author_title: 'Owner',
    author_company: 'Northstar Roofing',
    author_industry: 'Roofing',
    city: 'Minneapolis', state: 'MN', team_size: 14,
    classification: 'oof',
    confidence: 0.97,
    excerpt: 'OOO until April 14 — back next week',
    full_body: `I'm out of office until Monday April 14 with limited email access. For urgent matters please contact my partner at hannah@northstarroofing.co.\n\nHailey`,
    ai_suggested_reply: `Hailey — no rush, will follow back up after the 14th. Enjoy the break.`,
    in_pipeline: true,  // already in demo_done
    received_at: ago(2, 6),
  },

  // NEUTRAL
  {
    id: 'rep-009',
    sequence_id: 'seq-001',
    author_name: 'Ramón Castillo',
    author_title: 'GM',
    author_company: 'Castillo HVAC Services',
    author_industry: 'HVAC',
    city: 'Miami', state: 'FL', team_size: 9,
    classification: 'neutral',
    confidence: 0.71,
    excerpt: 'Maybe in Q3 — circle back then',
    full_body: `Hi Josh — interesting concept but our budget for new tools is locked through end of Q2. Try me again in July?\n\nRamón`,
    ai_suggested_reply: `Ramón — appreciate the candor. I\'ve set a reminder for July 1 to circle back. In the meantime, mind if I send you the Apex case study? It\'s a 2-page read and it\'ll give you context for when budget opens up.`,
    in_pipeline: false,
    received_at: ago(2),
  },

  // UNSUBSCRIBE (explicit)
  {
    id: 'rep-010',
    sequence_id: 'seq-002',
    author_name: 'Auto-reply',
    author_title: '',
    author_company: 'Anchor Drain Services',
    author_industry: 'Plumbing',
    city: 'Sarasota', state: 'FL', team_size: 5,
    classification: 'unsubscribe',
    confidence: 0.99,
    excerpt: 'STOP — auto-suppressed',
    full_body: `STOP\n\n[This email is auto-suppressed by the platform]`,
    ai_suggested_reply: `[Auto-suppressed — no action needed]`,
    in_pipeline: false,
    received_at: ago(2, 8),
  },
]

export const callQueue: CallQueueItem[] = [
  {
    id: 'cq-001',
    contact_name: 'Brett Whitaker',
    contact_title: 'Owner',
    company: 'Cool Comfort HVAC',
    industry: 'HVAC',
    city: 'Jacksonville', state: 'FL',
    phone: '(904) 555-0188',
    reason: 'High ICP fit, opened all 3 emails in sequence but never replied. Direct call recommended.',
    priority: 'high',
    best_time_window: '10 AM – 12 PM ET',
    last_attempted_at: null,
    attempts: 0,
  },
  {
    id: 'cq-002',
    contact_name: 'Dani Rojas',
    contact_title: 'GM',
    company: 'Suncoast Air Solutions',
    industry: 'HVAC',
    city: 'St. Petersburg', state: 'FL',
    phone: '(727) 555-0234',
    reason: 'Opened 4 emails + visited pricing page twice. Strong intent.',
    priority: 'high',
    best_time_window: '2 PM – 4 PM ET',
    last_attempted_at: ago(2),
    attempts: 1,
  },
  {
    id: 'cq-003',
    contact_name: 'Liam Donnell',
    contact_title: 'GM',
    company: 'GreenGuard Pest Control',
    industry: 'Pest control',
    city: 'Birmingham', state: 'AL',
    phone: '(205) 555-0641',
    reason: 'Proposal sent 4 days ago. Owner asked for a final call before deciding — Friday 10 AM CT.',
    priority: 'high',
    best_time_window: 'Friday 10 AM CT (already scheduled)',
    last_attempted_at: ago(4),
    attempts: 0,
  },
  {
    id: 'cq-004',
    contact_name: 'Aaron Buchanan',
    contact_title: 'Owner',
    company: 'HydroFlow Plumbing',
    industry: 'Plumbing',
    city: 'Sarasota', state: 'FL',
    phone: '(941) 555-0502',
    reason: 'Warm intro from Sofia at TidalWave today — call before he forgets the context.',
    priority: 'high',
    best_time_window: 'Today, anytime',
    last_attempted_at: null,
    attempts: 0,
  },
  {
    id: 'cq-005',
    contact_name: 'Owen Maddox',
    contact_title: 'Co-founder',
    company: 'Stonecrest Roofing',
    industry: 'Roofing',
    city: 'Denver', state: 'CO',
    phone: '(303) 555-0917',
    reason: 'Existing customer — quarterly check-in, see if Scale tier upgrade fits.',
    priority: 'medium',
    best_time_window: '11 AM – 1 PM MT',
    last_attempted_at: ago(82),
    attempts: 0,
  },
  {
    id: 'cq-006',
    contact_name: 'Brendan Kovacs',
    contact_title: 'Owner',
    company: 'Lakeshore Electric',
    industry: 'Electrical',
    city: 'Madison', state: 'WI',
    phone: '(608) 555-0445',
    reason: 'Replied to a LinkedIn post 2 weeks back asking about call volume. Hasn\'t replied to email — try the phone.',
    priority: 'medium',
    best_time_window: '9 AM – 11 AM CT',
    last_attempted_at: null,
    attempts: 0,
  },
  {
    id: 'cq-007',
    contact_name: 'Carmen Velasquez',
    contact_title: 'Operations Director',
    company: 'BlueRidge Pest',
    industry: 'Pest control',
    city: 'Asheville', state: 'NC',
    phone: '(828) 555-0723',
    reason: 'In Apollo as ICP-fit; cold-email sequence still pending. Phone might be the better first touch.',
    priority: 'low',
    best_time_window: '10 AM – 12 PM ET',
    last_attempted_at: null,
    attempts: 0,
  },
]

export interface OutreachStats {
  active_sequences: number
  total_leads: number
  sent_this_week: number
  reply_rate: number
  positive_reply_rate: number
  meetings_booked_30d: number
  unread_replies: number
}

export function outreachStats(): OutreachStats {
  const active = sequences.filter((s) => s.status === 'active')
  const totals = active.reduce(
    (acc, s) => {
      acc.leads += s.leads_total
      acc.sent += s.sent
      acc.replied += s.replied
      acc.positive += s.positive_replies
      acc.meetings += s.meetings_booked
      return acc
    },
    { leads: 0, sent: 0, replied: 0, positive: 0, meetings: 0 },
  )
  return {
    active_sequences: active.length,
    total_leads: totals.leads,
    sent_this_week: 184,  // demo value — would be sum of last-7-day sends
    reply_rate: totals.sent > 0 ? totals.replied / totals.sent : 0,
    positive_reply_rate: totals.replied > 0 ? totals.positive / totals.replied : 0,
    meetings_booked_30d: totals.meetings,
    unread_replies: replies.filter((r) =>
      r.classification !== 'unsubscribe' && r.classification !== 'oof',
    ).length,
  }
}

// ── Lead enrichment queue (Apollo + Clay daily pull) ──────────────────
export interface EnrichedLead {
  id: string
  name: string
  title: string
  company: string
  industry: string
  city: string
  state: string
  team_size: number
  /** ICP fit 0-100 from auto-scoring */
  icp_fit_score: number
  source: 'apollo' | 'clay' | 'manual'
  /** Auto-suggested sequence based on industry/role */
  suggested_sequence: string
  /** Personalized opener AI generated for cold email */
  ai_opener: string
  enriched_at: string
}

export const enrichedLeads: EnrichedLead[] = [
  {
    id: 'el-001',
    name: 'Tomás Quintana',
    title: 'Owner',
    company: 'Anchor Pool & Spa',
    industry: 'Pool service',
    city: 'Scottsdale', state: 'AZ', team_size: 7,
    icp_fit_score: 92,
    source: 'apollo',
    suggested_sequence: 'Pool Service · Sun Belt',
    ai_opener: `saw your post about losing 6 hrs/week on Tuesday triage calls — exactly the problem we built CommandSite for`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-002',
    name: 'Hailey Bramwell',
    title: 'Owner',
    company: 'Northstar Roofing',
    industry: 'Roofing',
    city: 'Minneapolis', state: 'MN', team_size: 14,
    icp_fit_score: 89,
    source: 'apollo',
    suggested_sequence: 'Roofing operators · Midwest',
    ai_opener: `noticed Northstar just posted "looking for an office hire" — there's another path that costs less per month`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-003',
    name: 'Marcus Henley',
    title: 'GM',
    company: 'Henley Heating & Cooling',
    industry: 'HVAC',
    city: 'Birmingham', state: 'AL', team_size: 9,
    icp_fit_score: 88,
    source: 'apollo',
    suggested_sequence: 'HVAC Operators · Southeast',
    ai_opener: `saw the Henley van in a Yelp photo near the airport — y'all are growing fast`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-004',
    name: 'Brielle Acosta',
    title: 'Operations Director',
    company: 'AllPro Plumbing Services',
    industry: 'Plumbing',
    city: 'Charlotte', state: 'NC', team_size: 12,
    icp_fit_score: 87,
    source: 'clay',
    suggested_sequence: 'Plumbing GMs · Sun Belt',
    ai_opener: `the operational ratio of your team to office staff is exactly what we hear from our best-fit customers`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-005',
    name: 'Liam Donnell',
    title: 'GM',
    company: 'PestGuard Solutions',
    industry: 'Pest control',
    city: 'Tampa', state: 'FL', team_size: 8,
    icp_fit_score: 84,
    source: 'apollo',
    suggested_sequence: 'Pest control owners · Southeast US',
    ai_opener: `your reviews mention how fast your team gets out — that's the kind of operations we make easier, not slower`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-006',
    name: 'Reese Whitford',
    title: 'Owner',
    company: 'Whitford Electric',
    industry: 'Electrical',
    city: 'Asheville', state: 'NC', team_size: 6,
    icp_fit_score: 82,
    source: 'clay',
    suggested_sequence: 'Electrical Owners · NC + SC',
    ai_opener: `Asheville electrical demand is wild lately — saw your wait list note on the website`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-007',
    name: 'Sofia Kapoor',
    title: 'Owner',
    company: 'GreenStripe Landscaping',
    industry: 'Landscaping',
    city: 'Austin', state: 'TX', team_size: 9,
    icp_fit_score: 81,
    source: 'apollo',
    suggested_sequence: 'Landscaping owners · TX',
    ai_opener: `Austin landscaping in spring is brutal on the office line — that's where we sit`,
    enriched_at: ago(0, 6),
  },
  {
    id: 'el-008',
    name: 'Daniel Egbert',
    title: 'Founder',
    company: 'ProGrow Lawn Care',
    industry: 'Landscaping',
    city: 'Atlanta', state: 'GA', team_size: 5,
    icp_fit_score: 79,
    source: 'apollo',
    suggested_sequence: 'Landscaping owners · TX',  // Atlanta still a fit
    ai_opener: `solo dev to founder — wanted to share what we built specifically for shops your size`,
    enriched_at: ago(0, 6),
  },
]

// ── Sending domains + deliverability ──────────────────────────────────
export interface SendingDomainHealth {
  domain: string
  purpose: 'transactional' | 'cold_outreach'
  reputation_score: number
  daily_send_cap: number
  sent_today: number
  bounce_rate_7d: number
  spam_rate_7d: number
  warming_status: 'verified' | 'warming' | 'cooled' | 'flagged'
  warming_day?: number  // for domains in warming
  notes?: string
}

export const sendingDomainsHealth: SendingDomainHealth[] = [
  {
    domain: 'mail.commandsite.com',
    purpose: 'transactional',
    reputation_score: 96,
    daily_send_cap: 5_000,
    sent_today: 142,
    bounce_rate_7d: 0.014,
    spam_rate_7d: 0.0008,
    warming_status: 'verified',
  },
  {
    domain: 'cs-outreach.com',
    purpose: 'cold_outreach',
    reputation_score: 84,
    daily_send_cap: 250,
    sent_today: 184,
    bounce_rate_7d: 0.038,
    spam_rate_7d: 0.0021,
    warming_status: 'verified',
    notes: 'Healthy — sending under cap, bounce rate within range. Can scale to 350/day next week.',
  },
  {
    domain: 'cs-outbound.io',
    purpose: 'cold_outreach',
    reputation_score: 62,
    daily_send_cap: 50,
    sent_today: 28,
    bounce_rate_7d: 0.071,
    spam_rate_7d: 0.0042,
    warming_status: 'warming',
    warming_day: 18,
    notes: 'Day 18 of 30-day warming. DKIM still pending. Bounce rate elevated — Smartlead pacing it correctly.',
  },
]

// ── Demo show-up tracker ──────────────────────────────────────────────
export interface BookedDemo {
  id: string
  prospect_name: string
  company: string
  scheduled_at: string
  reminder_sent: boolean
  reminder_sent_at?: string
  status: 'upcoming' | 'showed' | 'no_show' | 'rescheduled'
  /** Source of the booked demo */
  source: 'cold_email' | 'inbound' | 'referral' | 'social_engager'
}

function inHours(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() + hours, 0, 0, 0)
  return d.toISOString()
}

export const bookedDemos: BookedDemo[] = [
  {
    id: 'demo-001',
    prospect_name: 'Jorge Salinas',
    company: 'Premier Plumbing Solutions',
    scheduled_at: inHours(4),
    reminder_sent: false,
    status: 'upcoming',
    source: 'cold_email',
  },
  {
    id: 'demo-002',
    prospect_name: 'Rebecca Lin-Hartmann',
    company: 'Spark Electric Co',
    scheduled_at: inHours(28),
    reminder_sent: false,
    status: 'upcoming',
    source: 'inbound',
  },
  {
    id: 'demo-003',
    prospect_name: 'Tomás Quintana',
    company: 'Anchor Pool & Spa',
    scheduled_at: inHours(76),
    reminder_sent: false,
    status: 'upcoming',
    source: 'referral',
  },
  // Recent past — for the show-up rate calc
  { id: 'demo-101', prospect_name: 'Aaron Buchanan', company: 'HydroFlow Plumbing', scheduled_at: ago(48),  reminder_sent: true, reminder_sent_at: ago(50), status: 'showed',     source: 'social_engager' },
  { id: 'demo-102', prospect_name: 'Mike Donovan',   company: 'AllPro Heating',     scheduled_at: ago(72),  reminder_sent: true, reminder_sent_at: ago(74), status: 'showed',     source: 'cold_email' },
  { id: 'demo-103', prospect_name: 'Hailey Bramwell',company: 'Northstar Roofing',  scheduled_at: ago(96),  reminder_sent: true, reminder_sent_at: ago(98), status: 'rescheduled',source: 'cold_email' },
  { id: 'demo-104', prospect_name: 'Carmen Velasquez', company: 'BlueRidge Pest',   scheduled_at: ago(120), reminder_sent: true, reminder_sent_at: ago(122),status: 'showed',     source: 'social_engager' },
  { id: 'demo-105', prospect_name: 'Calvin Ohara',   company: 'Frostline Refrig.',  scheduled_at: ago(144), reminder_sent: true, reminder_sent_at: ago(146),status: 'no_show',    source: 'cold_email' },
  { id: 'demo-106', prospect_name: 'Daniel Park',    company: 'Mini-Split Co',      scheduled_at: ago(168), reminder_sent: true, reminder_sent_at: ago(170),status: 'showed',     source: 'inbound' },
  { id: 'demo-107', prospect_name: 'Whitney Park',   company: 'Bayside Plumbing',   scheduled_at: ago(192), reminder_sent: true, reminder_sent_at: ago(194),status: 'showed',     source: 'social_engager' },
  { id: 'demo-108', prospect_name: 'Liam Donnell',   company: 'GreenGuard Pest',    scheduled_at: ago(216), reminder_sent: true, reminder_sent_at: ago(218),status: 'no_show',    source: 'cold_email' },
]

export interface DemoStats {
  upcoming: number
  showed_30d: number
  no_show_30d: number
  rescheduled_30d: number
  show_up_rate_30d: number
}

export function demoStats(): DemoStats {
  const past = bookedDemos.filter((d) => d.status !== 'upcoming')
  const showed = past.filter((d) => d.status === 'showed').length
  const noshow = past.filter((d) => d.status === 'no_show').length
  const resch  = past.filter((d) => d.status === 'rescheduled').length
  return {
    upcoming: bookedDemos.filter((d) => d.status === 'upcoming').length,
    showed_30d: showed,
    no_show_30d: noshow,
    rescheduled_30d: resch,
    show_up_rate_30d: past.length > 0 ? showed / past.length : 0,
  }
}

export const REPLY_CLASS_META: Record<ReplyClass, { label: string; color: string; icon: string }> = {
  positive:    { label: 'Positive',    color: '#10B981', icon: '✓' },
  neutral:     { label: 'Neutral',     color: '#94A3B8', icon: '○' },
  negative:    { label: 'Not interested', color: '#EF4444', icon: '✕' },
  objection:   { label: 'Objection',   color: '#F59E0B', icon: '!' },
  oof:         { label: 'Out of office', color: '#A855F7', icon: '🌴' },
  unsubscribe: { label: 'Unsubscribe', color: '#475569', icon: '⛔' },
}

export const CHANNEL_META: Record<Channel, { label: string; color: string; icon: string }> = {
  email:    { label: 'Email',    color: 'rgb(var(--color-brand))', icon: '✉' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2',                  icon: 'in' },
  call:     { label: 'Cold call',color: '#F59E0B',                  icon: '📞' },
}
