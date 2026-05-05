/**
 * Customer records for Apex Heating & Air. Each customer carries a full
 * timeline of every interaction: AI calls (with transcript), SMS in/out,
 * emails, appointments, completed jobs, review requests, reactivations,
 * and owner notes.
 *
 * The first record (Jennifer Martinez) is the "hero" — her timeline
 * exercises every event type. When demoing on a screen-share, opening
 * her detail panel shows every CommandSite system at work in one scroll.
 */

export type FunnelStage =
  | 'new_lead'
  | 'engaged'
  | 'quoted'
  | 'booked'
  | 'job_complete'
  | 'review_requested'
  | 'won'
  | 'dormant'
  | 'lost'

export type TimelineKind =
  | 'inbound_call'
  | 'sms_sent'
  | 'sms_received'
  | 'email_sent'
  | 'email_received'
  | 'appointment_booked'
  | 'job_completed'
  | 'review_request_sent'
  | 'review_received'
  | 'reactivation_triggered'
  | 'note_added'

export interface TimelineEvent {
  id: string
  /** ISO timestamp */
  at: string
  kind: TimelineKind

  /** Short headline for the event (e.g. "Capacitor Replacement") */
  title?: string
  /** Free-form body — SMS message text, email preview, etc. */
  body?: string

  /** Email subject line */
  subject?: string
  /** Delivery / engagement status (Delivered · Clicked · etc) */
  status?: string

  /** Job-completed amount in cents */
  amount_cents?: number
  /** Call duration in seconds */
  duration_seconds?: number
  /** Tech name (job / dispatch) */
  tech?: string

  /** Review rating */
  rating?: 1 | 2 | 3 | 4 | 5
  /** Review platform (google / facebook / yelp / nextdoor) */
  source?: string

  /** Full call transcript */
  transcript?: string
  /** Summary of AI actions taken on this call */
  ai_actions?: string[]

  /** Arbitrary key/value rows shown in the event card */
  meta?: { label: string; value: string }[]
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  /** Where the customer originally came from */
  source: string
  /** ISO timestamp */
  first_contact_at: string
  funnel_stage: FunnelStage
  lifetime_value_cents: number
  assigned_tech: string | null
  tags: string[]
  notes: string | null
  last_touch_at: string
  last_touch_kind: TimelineKind | null
  /** Reverse-chronological order */
  timeline: TimelineEvent[]
}

// Helpers — keep timestamps relative to "now" so the demo always reads
// fresh. Days = full days back; minutes are independent.
function daysAgo(days: number, hours = 9, minutes = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

// ── Hero customer transcript (Jennifer Martinez · after-hours emergency) ──
const JENNIFER_TRANSCRIPT = `[11:08 PM]

AI: Hey, this is Sarah with Apex Heating and Air. What's going on over there?

JENNIFER: Hi, um, our air conditioner just stopped working. It's blowing but it's not cold. It's like 80 degrees in the house and we have a baby — is there any way someone can come tonight?

AI: Oh no, that's the worst — especially with a little one. Let me see what we can do. First, are you a current customer with us, or is this your first time calling?

JENNIFER: First time. A neighbor recommended you guys.

AI: Got it, welcome. Can I grab your name and the address you're calling about?

JENNIFER: Jennifer Martinez. 1847 Maguire Road in Ocoee.

AI: Thank you Jennifer. So I want to be straight with you — our after-hours emergency rate is $189 just for the visit, plus parts and labor. If it can wait until first thing in the morning, I can have a technician at your house between 8 and 8:30am at our regular rate, no emergency fee. With the baby though, totally your call.

JENNIFER: How early in the morning?

AI: 8 AM, first appointment of the day. I'd send Marcus — he's one of our senior techs, lives about 12 minutes from you.

JENNIFER: Okay yeah let's do the morning. I'll set up a fan tonight.

AI: Smart. I'm booking you for tomorrow 8 to 8:30 AM with Marcus. He'll text you when he's on the way. What's the best number to reach you?

JENNIFER: This number is fine.

AI: Perfect. Last thing — since this is your first time with us, can I get an email so I can send you a confirmation?

JENNIFER: jen.martinez.fl@gmail.com

AI: Got it. You're all set, Jennifer. Marcus will be there tomorrow morning. Try to get some sleep, and we'll get you cooled down first thing.

JENNIFER: Thank you so much.

AI: You're welcome. Goodnight.`

// Hero customer's full timeline.
const JENNIFER_TIMELINE: TimelineEvent[] = [
  {
    id: 'jm-10',
    at: daysAgo(2, 9, 14),
    kind: 'review_received',
    rating: 5,
    source: 'google',
    body:
      "Apex Heating saved us. Our AC died at 11pm on a Tuesday and somehow they still answered the phone. " +
      "Marcus was at our house by 8am the next morning, fixed it same day, and didn't try to upsell us on stuff " +
      "we didn't need. Signed up for their maintenance plan because of how they handled this. Highly recommend.",
    title: 'Posted by Jennifer M.',
  },
  {
    id: 'jm-9',
    at: daysAgo(3, 16, 32),
    kind: 'review_request_sent',
    title: 'SMS — Auto-triggered post-job',
    body:
      "Hi Jennifer — Marcus here from Apex. Hope the AC is still running cold! " +
      "If you have 30 seconds, would mean a lot if you'd share your experience: [google review link]. " +
      "Thanks again for choosing us.",
    status: 'Delivered · Clicked link · 22h to review',
  },
  {
    id: 'jm-8',
    at: daysAgo(3, 15, 45),
    kind: 'job_completed',
    title: 'Annual Maintenance Plan enrollment',
    tech: 'Marcus Reyes',
    amount_cents: 27500,
    duration_seconds: 25 * 60,
    meta: [
      { label: 'Service', value: 'Annual Maintenance Plan enrollment' },
      { label: 'First-year fee', value: '$275' },
      { label: 'Payment', value: 'Card on file · Cleared' },
      { label: 'Notes', value: 'Customer asked about plan during repair visit. Marcus walked through twice-yearly tune-up benefits. Signed on the spot.' },
    ],
  },
  {
    id: 'jm-7',
    at: daysAgo(5, 11, 8),
    kind: 'sms_sent',
    title: 'AI auto-reply',
    body:
      "Hi Jennifer! So glad to hear it's running cold. I'll have someone send over our maintenance plan options today — " +
      "it's $275/year for two tune-ups (spring + fall) plus priority scheduling. " +
      "Want me to text you the details or have Marcus call you?",
    status: 'Customer replied: "text is fine thanks"',
  },
  {
    id: 'jm-6',
    at: daysAgo(5, 11, 8),
    kind: 'sms_received',
    title: 'From Jennifer',
    body:
      "Hey - the AC is running great. Marcus mentioned a maintenance plan when he was here. " +
      "Can someone send me details? Want to make sure this doesn't happen again next summer.",
  },
  {
    id: 'jm-5',
    at: daysAgo(6, 10, 0),
    kind: 'email_sent',
    title: 'Post-Job Follow-Up (Day 3)',
    subject: "How's everything running, Jennifer?",
    body: "Just checking in after Marcus's visit on Tuesday…",
    status: 'Opened · 1 click (maintenance plan link)',
  },
  {
    id: 'jm-4',
    at: daysAgo(9, 9, 42),
    kind: 'job_completed',
    title: 'AC compressor diagnostic + capacitor replacement',
    tech: 'Marcus Reyes',
    amount_cents: 48700,
    duration_seconds: 94 * 60,
    meta: [
      { label: 'Arrival', value: '8:08 AM (ETA was 8:00–8:30)' },
      { label: 'Parts', value: '45/5 MFD dual-run capacitor' },
      { label: 'Payment', value: 'Card · Cleared' },
      { label: 'Job photos', value: '3 attached' },
      { label: 'Tech notes', value: 'Capacitor was bulged/leaking. Replaced and tested — system pulling proper amps now. Recommended maintenance plan, customer interested. Coil could use cleaning before next summer.' },
    ],
  },
  {
    id: 'jm-3',
    at: daysAgo(10, 23, 14),
    kind: 'appointment_booked',
    title: 'Same-day-next emergency repair',
    tech: 'Marcus Reyes (on-call rotation)',
    meta: [
      { label: 'Window', value: 'Tomorrow 8:00–8:30 AM' },
      { label: 'Booked by', value: 'AI Receptionist' },
      { label: 'Confirmation sent', value: 'SMS + Email' },
    ],
  },
  {
    id: 'jm-2',
    at: daysAgo(10, 23, 8),
    kind: 'inbound_call',
    title: 'AI Handled · 4m 18s',
    duration_seconds: 4 * 60 + 18,
    transcript: JENNIFER_TRANSCRIPT,
    ai_actions: [
      'Customer record created',
      'Appointment booked in calendar',
      'Marcus notified via SMS',
      'Confirmation sent to Jennifer (SMS + Email)',
      'Lead quality: HOT',
      'Source tagged: Word-of-mouth referral',
    ],
  },
]

export const customers: Customer[] = [
  // ── HERO ────────────────────────────────────────────────────────────
  {
    id: 'cust-jennifer',
    name: 'Jennifer Martinez',
    phone: '(407) 555-0142',
    email: 'jen.martinez.fl@gmail.com',
    address: '1847 Maguire Rd, Ocoee, FL 34761',
    source: 'Inbound call (after-hours)',
    first_contact_at: daysAgo(18),
    funnel_stage: 'won',
    lifetime_value_cents: 147_500,
    assigned_tech: 'Marcus Reyes',
    tags: ['Repeat customer', 'Maintenance plan', 'Promoter'],
    notes:
      'Great customer. Husband works nights, schedule around mornings. Marcus has rapport — keep assigning.',
    last_touch_at: daysAgo(2, 9, 14),
    last_touch_kind: 'review_received',
    timeline: JENNIFER_TIMELINE,
  },

  // ── Other customers across all stages ─────────────────────────────
  {
    id: 'cust-robert',
    name: 'Robert Chen',
    phone: '(407) 555-0237',
    email: 'r.chen@example.com',
    address: '4218 Lake Shore Dr, Orlando, FL 32812',
    source: 'Inbound call',
    first_contact_at: daysAgo(0, 10, 22),
    funnel_stage: 'new_lead',
    lifetime_value_cents: 0,
    assigned_tech: null,
    tags: ['New', 'High-intent'],
    notes: null,
    last_touch_at: daysAgo(0, 10, 22),
    last_touch_kind: 'inbound_call',
    timeline: [
      {
        id: 'rc-2',
        at: daysAgo(0, 10, 23),
        kind: 'sms_sent',
        title: 'Booking confirmation',
        body: "Hi Robert — confirmed for Thursday 9–11 AM in-home assessment. We'll text 30 min before arrival. — Apex",
        status: 'Delivered',
      },
      {
        id: 'rc-1',
        at: daysAgo(0, 10, 22),
        kind: 'inbound_call',
        title: 'AI Handled · 6m 18s',
        duration_seconds: 378,
        ai_actions: [
          'Customer record created',
          'In-home assessment booked Thursday 9–11 AM',
          'Confirmation sent via SMS',
        ],
      },
    ],
  },
  {
    id: 'cust-patricia',
    name: 'Patricia Andrews',
    phone: '(407) 555-0145',
    email: 'p.andrews@example.com',
    address: '922 Magnolia Ave, Kissimmee, FL 34741',
    source: 'Google ad',
    first_contact_at: daysAgo(4),
    funnel_stage: 'quoted',
    lifetime_value_cents: 0,
    assigned_tech: null,
    tags: ['Quote outstanding'],
    notes: 'Wants annual tune-up plan. Mentioned price-shopping.',
    last_touch_at: daysAgo(1),
    last_touch_kind: 'sms_sent',
    timeline: [
      {
        id: 'pa-3',
        at: daysAgo(1, 11, 5),
        kind: 'sms_sent',
        title: 'Day-3 follow-up',
        body: "Hey Patricia — circling back on the $280 maintenance plan quote. Anything I can answer for you? — Apex",
        status: 'Delivered',
      },
      {
        id: 'pa-2',
        at: daysAgo(4, 14, 0),
        kind: 'email_sent',
        title: 'Quote sent',
        subject: 'Your Apex maintenance plan quote — $280/yr',
        body: 'Two tune-ups (spring + fall) plus priority scheduling and 15% off any repairs.',
        status: 'Opened',
      },
      {
        id: 'pa-1',
        at: daysAgo(4, 13, 30),
        kind: 'inbound_call',
        title: 'AI Handled · 4m 33s',
        duration_seconds: 273,
      },
    ],
  },
  {
    id: 'cust-james',
    name: 'James Sullivan',
    phone: '(407) 555-0928',
    email: 'jsullivan@example.com',
    address: '7104 Cypress Cove, Winter Garden, FL 34787',
    source: 'Web form',
    first_contact_at: daysAgo(7),
    funnel_stage: 'booked',
    lifetime_value_cents: 0,
    assigned_tech: 'Marcus Reyes',
    tags: ['Mini-split', 'Higher ticket'],
    notes: 'Whole-home mini-split install — 4 zones. Custom quote already accepted.',
    last_touch_at: daysAgo(0, 14, 0),
    last_touch_kind: 'sms_sent',
    timeline: [
      {
        id: 'js-3',
        at: daysAgo(0, 14, 0),
        kind: 'appointment_booked',
        title: 'Install scheduled',
        tech: 'Marcus Reyes',
        meta: [
          { label: 'Window', value: 'Next Monday, 7:30 AM start' },
          { label: 'Estimated duration', value: '2 days' },
        ],
      },
      {
        id: 'js-2',
        at: daysAgo(2),
        kind: 'sms_received',
        title: 'From James',
        body: "Quote looks good — let's move forward. When can you start?",
      },
      {
        id: 'js-1',
        at: daysAgo(7),
        kind: 'email_sent',
        title: 'Quote sent',
        subject: 'Your 4-zone mini-split quote — $8,500',
      },
    ],
  },
  {
    id: 'cust-anthony',
    name: 'Anthony Russo',
    phone: '(407) 555-0613',
    email: 'arusso@example.com',
    address: '3349 Pinewood Dr, Orlando, FL 32839',
    source: 'Inbound call (emergency)',
    first_contact_at: daysAgo(5),
    funnel_stage: 'job_complete',
    lifetime_value_cents: 340_000,
    assigned_tech: 'Devon Pierce',
    tags: ['Emergency', 'Compressor failure'],
    notes: null,
    last_touch_at: daysAgo(1),
    last_touch_kind: 'job_completed',
    timeline: [
      {
        id: 'ar-2',
        at: daysAgo(1),
        kind: 'job_completed',
        title: 'AC compressor replacement',
        tech: 'Devon Pierce',
        amount_cents: 340_000,
        duration_seconds: 4 * 60 * 60,
        meta: [{ label: 'Payment', value: 'Card · Cleared' }],
      },
      {
        id: 'ar-1',
        at: daysAgo(5, 23, 30),
        kind: 'inbound_call',
        title: 'After-hours dispatch',
        duration_seconds: 388,
      },
    ],
  },
  {
    id: 'cust-tom',
    name: 'Tom Bradley',
    phone: '(407) 555-0418',
    email: 't.bradley@example.com',
    address: '512 Sunset Lake Rd, Apopka, FL 32703',
    source: 'Inbound call',
    first_contact_at: daysAgo(6),
    funnel_stage: 'review_requested',
    lifetime_value_cents: 89_000,
    assigned_tech: 'Marcus Reyes',
    tags: ['Maintenance customer'],
    notes: null,
    last_touch_at: daysAgo(0, 8, 30),
    last_touch_kind: 'review_request_sent',
    timeline: [
      {
        id: 'tb-2',
        at: daysAgo(0, 8, 30),
        kind: 'review_request_sent',
        title: 'SMS — Review request',
        body: "Hi Tom — Marcus from Apex. If you have 30 seconds: [google review link]. Thanks!",
        status: 'Delivered',
      },
      {
        id: 'tb-1',
        at: daysAgo(2),
        kind: 'job_completed',
        title: 'Spring tune-up',
        tech: 'Marcus Reyes',
        amount_cents: 8900,
      },
    ],
  },
  {
    id: 'cust-karen',
    name: 'Karen Holloway',
    phone: '(407) 555-0091',
    email: 'kholloway@example.com',
    address: '1620 Oak Ridge Ln, Maitland, FL 32751',
    source: 'Inbound call',
    first_contact_at: daysAgo(20),
    funnel_stage: 'won',
    lifetime_value_cents: 295_000,
    assigned_tech: 'Marcus Reyes',
    tags: ['Promoter', 'Water heater'],
    notes: 'Loved the same-day water heater swap. Promised referrals.',
    last_touch_at: daysAgo(8, 14, 12),
    last_touch_kind: 'review_received',
    timeline: [
      {
        id: 'kh-3',
        at: daysAgo(8, 14, 12),
        kind: 'review_received',
        rating: 5,
        source: 'google',
        body: 'Same-day water heater replacement — quoted, ordered, installed in one afternoon. Wild.',
      },
      {
        id: 'kh-2',
        at: daysAgo(15),
        kind: 'job_completed',
        title: 'Water heater replacement (50-gal gas)',
        tech: 'Marcus Reyes',
        amount_cents: 280_000,
      },
      {
        id: 'kh-1',
        at: daysAgo(20),
        kind: 'inbound_call',
        title: 'AI Handled · 4m 02s',
        duration_seconds: 242,
      },
    ],
  },
  {
    id: 'cust-sandra',
    name: 'Sandra Whitmore',
    phone: '(407) 555-0509',
    email: 'sandra.w@example.com',
    address: '2810 Heron Bay Cir, Sanford, FL 32773',
    source: 'Inbound call',
    first_contact_at: daysAgo(2),
    funnel_stage: 'engaged',
    lifetime_value_cents: 0,
    assigned_tech: null,
    tags: ['Smart thermostat'],
    notes: null,
    last_touch_at: daysAgo(0, 16, 30),
    last_touch_kind: 'sms_received',
    timeline: [
      {
        id: 'sw-3',
        at: daysAgo(0, 16, 30),
        kind: 'sms_received',
        title: 'From Sandra',
        body: "Sounds good — what brand do you usually install?",
      },
      {
        id: 'sw-2',
        at: daysAgo(0, 16, 12),
        kind: 'sms_sent',
        title: 'AI follow-up',
        body: "Hi Sandra — wanted to send the smart thermostat options we talked about. Want a Nest or Ecobee install? — Apex",
      },
      {
        id: 'sw-1',
        at: daysAgo(2),
        kind: 'inbound_call',
        title: 'AI Handled · 3m 04s',
        duration_seconds: 184,
      },
    ],
  },
  {
    id: 'cust-daniel',
    name: 'Daniel Park',
    phone: '(407) 555-0772',
    email: 'd.park@example.com',
    address: '4471 Bridgewater Crossing, Ocoee, FL 34761',
    source: 'Reactivation',
    first_contact_at: daysAgo(380),
    funnel_stage: 'dormant',
    lifetime_value_cents: 95_000,
    assigned_tech: null,
    tags: ['11mo since service'],
    notes: 'Booked one big install last summer. No contact since.',
    last_touch_at: daysAgo(2),
    last_touch_kind: 'reactivation_triggered',
    timeline: [
      {
        id: 'dp-2',
        at: daysAgo(2),
        kind: 'reactivation_triggered',
        title: 'Reactivation email sent — "Time for your annual tune-up?"',
        status: 'Opened',
      },
      {
        id: 'dp-1',
        at: daysAgo(380),
        kind: 'job_completed',
        title: 'New 3-ton AC install',
        tech: 'Marcus Reyes',
        amount_cents: 950_000,
      },
    ],
  },
  {
    id: 'cust-yvonne',
    name: 'Yvonne Castillo',
    phone: '(407) 555-0277',
    email: 'y.castillo@example.com',
    address: '655 Lakeview Dr, Casselberry, FL 32707',
    source: 'Inbound call',
    first_contact_at: daysAgo(45),
    funnel_stage: 'lost',
    lifetime_value_cents: 0,
    assigned_tech: null,
    tags: ['Opted out'],
    notes: 'Replied STOP after Day-30 follow-up. Removed from sequence.',
    last_touch_at: daysAgo(15),
    last_touch_kind: 'sms_received',
    timeline: [
      {
        id: 'yc-2',
        at: daysAgo(15),
        kind: 'sms_received',
        title: 'STOP',
        body: 'STOP',
      },
      {
        id: 'yc-1',
        at: daysAgo(45),
        kind: 'inbound_call',
        title: 'AI Handled · 2m 24s',
        duration_seconds: 144,
      },
    ],
  },
]

// ── Aggregates for the list page ─────────────────────────────────────────
export interface CustomerStats {
  total: number
  by_stage: Record<FunnelStage, number>
}

export function customerStats(): CustomerStats {
  const by_stage: Record<FunnelStage, number> = {
    new_lead: 0,
    engaged: 0,
    quoted: 0,
    booked: 0,
    job_complete: 0,
    review_requested: 0,
    won: 0,
    dormant: 0,
    lost: 0,
  }
  for (const c of customers) by_stage[c.funnel_stage]++
  return { total: customers.length, by_stage }
}

export const STAGE_META: Record<FunnelStage, { label: string; color: string }> = {
  new_lead:        { label: 'New Lead',        color: 'rgb(14 165 233)' },     // accent
  engaged:         { label: 'Engaged',         color: 'rgb(96 165 250)' },     // light blue
  quoted:          { label: 'Quoted',          color: 'rgb(168 85 247)' },     // violet
  booked:          { label: 'Booked',          color: 'rgb(234 179 8)' },      // amber
  job_complete:    { label: 'Job Complete',    color: 'rgb(20 184 166)' },     // teal
  review_requested:{ label: 'Review Requested',color: 'rgb(56 189 248)' },     // sky
  won:             { label: 'Won',             color: 'rgb(16 185 129)' },     // emerald
  dormant:         { label: 'Dormant',         color: 'rgb(148 163 184)' },    // slate
  lost:            { label: 'Lost',            color: 'rgb(239 68 68)' },      // red
}
