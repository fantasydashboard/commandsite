/**
 * Dummy call records for the Apex Heating & Air demo.
 * Realistic Orlando-area names + numbers + 24/7 HVAC scenarios.
 *
 * The transcripts are deliberately detailed — the "Listen" modal on
 * the Calls page is the highest-impact demo moment per the spec.
 */
import type { CallRecord } from './types'

// Helper: time relative to now, so the demo always looks fresh.
function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

const TRANSCRIPT_AC_DOWN = `[02:14 AM]
AI: Thanks for calling Apex Heating & Air, this is the after-hours line. I can help you get a tech out tonight. What's going on?

Caller (Jennifer M.): My AC stopped blowing cold around midnight and it's miserable. Two kids in the house.

AI: I'm sorry, that's the worst. I can dispatch our on-call tech to you in the next 60 to 90 minutes. Before I do — is the unit completely off, or running but not cooling?

Caller: Running but blowing room-temp air.

AI: Got it. Most common cause this time of year is either a frozen coil or a refrigerant issue. The tech will diagnose on-site. Quick logistics — what's the address?

Caller: 4218 Lake Shore Drive in Orlando, 32812.

AI: Great. I have you at 4218 Lake Shore Drive. After-hours dispatch fee is $179 plus the cost of any repairs — I just want to make sure that's clear before I send him out.

Caller: That's fine, just please get someone here.

AI: On it. Dispatching Marcus right now — he'll text you when he's about 15 minutes out. You'll get a confirmation text in just a moment with his ETA. Anything else I should pass along?

Caller: That's perfect, thank you.

AI: Thanks Jennifer, hang in there. Marcus is rolling.

[Call ended · 3m 42s · Booked next-day follow-up automatically]`

const TRANSCRIPT_QUOTE_REQUEST = `[10:22 AM]
AI: Apex Heating & Air, how can I help today?

Caller (Robert K.): Hi, I need a quote on a new HVAC system. The current one's about 18 years old and it's on its last legs.

AI: Smart timing — replacing before it dies usually saves you a few hundred in emergency markup. Are you thinking a like-for-like replacement, or is this a chance to rethink the system?

Caller: Probably like-for-like. It's a 3-ton split system, gas furnace.

AI: Perfect. So you'd want a free in-home assessment — we look at the unit, the ductwork, and how the house holds heat, and you'd get a written quote within 24 hours. Does that work?

Caller: Yeah that's what I was hoping for.

AI: Awesome. Let me grab the address and your preferred window… [details captured]

[Call ended · 6m 18s · Booked assessment for Thursday 9-11 AM]`

const TRANSCRIPT_PLUMBING_REFER = `[03:47 PM]
AI: Apex Heating & Air, how can I help?

Caller (Karen H.): Hi, my water heater is leaking. Do you guys do that?

AI: We do gas water heaters and electric tank units, yes. Is yours leaking from the tank itself or from a connection?

Caller: It looks like it's coming from the bottom of the tank.

AI: Bottom of the tank usually means the tank itself failed — that's a replacement, not a repair. I can send a tech out today between 4 and 6 PM to confirm and walk you through replacement options. The diagnostic visit is $89, waived if you proceed with the replacement.

Caller: That works.

AI: Great. What's the address?
[details captured]

[Call ended · 4m 02s · Dispatched same-day]`

const TRANSCRIPT_SPAM = `[07:14 AM]
AI: Apex Heating & Air, how can I help?

Caller: Hello? Can you hear me? This is regarding your business listing —

AI: I hear you fine. If this is about a business listing or marketing services, we're not interested. Have a good day.

[Call ended · 0m 18s · Marked as spam]`

export const calls: CallRecord[] = [
  {
    id: 'c-001',
    caller: 'Jennifer Martinez',
    phone: '(407) 555-0114',
    time: ago(8),
    duration: 222,
    lead_quality: 'hot',
    outcome: 'dispatched',
    handled_by: 'ai',
    job_type: 'AC not cooling',
    transcript: TRANSCRIPT_AC_DOWN,
  },
  {
    id: 'c-002',
    caller: 'Robert Chen',
    phone: '(407) 555-0237',
    time: ago(2, 30),
    duration: 378,
    lead_quality: 'hot',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'New HVAC quote',
    transcript: TRANSCRIPT_QUOTE_REQUEST,
  },
  {
    id: 'c-003',
    caller: 'Karen Holloway',
    phone: '(407) 555-0091',
    time: ago(20),
    duration: 242,
    lead_quality: 'hot',
    outcome: 'dispatched',
    handled_by: 'ai',
    job_type: 'Water heater leak',
    transcript: TRANSCRIPT_PLUMBING_REFER,
  },
  {
    id: 'c-004',
    caller: 'Tom Bradley',
    phone: '(407) 555-0418',
    time: ago(28),
    duration: 320,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Maintenance check',
  },
  {
    id: 'c-005',
    caller: 'Sandra Whitmore',
    phone: '(407) 555-0509',
    time: ago(36),
    duration: 184,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Thermostat install',
  },
  {
    id: 'c-006',
    caller: '(unknown)',
    phone: '(407) 555-0822',
    time: ago(40),
    duration: 18,
    lead_quality: 'cold',
    outcome: 'opted_out',
    handled_by: 'ai',
    job_type: 'Spam',
    transcript: TRANSCRIPT_SPAM,
  },
  {
    id: 'c-007',
    caller: 'Michael Reyes',
    phone: '(407) 555-0651',
    time: ago(48),
    duration: 412,
    lead_quality: 'hot',
    outcome: 'dispatched',
    handled_by: 'ai',
    job_type: 'Furnace not igniting',
  },
  {
    id: 'c-008',
    caller: 'Patricia Andrews',
    phone: '(407) 555-0145',
    time: ago(54),
    duration: 273,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Annual tune-up',
  },
  {
    id: 'c-009',
    caller: 'Daniel Park',
    phone: '(407) 555-0772',
    time: ago(72),
    duration: 91,
    lead_quality: 'cold',
    outcome: 'voicemail',
    handled_by: 'voicemail',
    job_type: 'Quote follow-up',
  },
  {
    id: 'c-010',
    caller: 'Lisa Bennett',
    phone: '(407) 555-0341',
    time: ago(96),
    duration: 305,
    lead_quality: 'hot',
    outcome: 'dispatched',
    handled_by: 'ai',
    job_type: 'Capacitor replacement',
  },
  {
    id: 'c-011',
    caller: 'James Sullivan',
    phone: '(407) 555-0928',
    time: ago(100),
    duration: 198,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Mini-split install quote',
  },
  {
    id: 'c-012',
    caller: 'Yvonne Castillo',
    phone: '(407) 555-0277',
    time: ago(120),
    duration: 144,
    lead_quality: 'cold',
    outcome: 'opted_out',
    handled_by: 'ai',
    job_type: 'Wrong number',
  },
  {
    id: 'c-013',
    caller: 'Anthony Russo',
    phone: '(407) 555-0613',
    time: ago(124),
    duration: 388,
    lead_quality: 'hot',
    outcome: 'dispatched',
    handled_by: 'ai',
    job_type: 'AC compressor failure',
  },
  {
    id: 'c-014',
    caller: 'Amanda Foster',
    phone: '(407) 555-0466',
    time: ago(140),
    duration: 256,
    lead_quality: 'hot',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Duct cleaning',
  },
  {
    id: 'c-015',
    caller: 'Hector Vega',
    phone: '(407) 555-0815',
    time: ago(160),
    duration: 167,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Air handler service',
  },
  {
    id: 'c-016',
    caller: 'Rebecca Lin',
    phone: '(407) 555-0379',
    time: ago(168),
    duration: 49,
    lead_quality: 'cold',
    outcome: 'voicemail',
    handled_by: 'voicemail',
  },
  {
    id: 'c-017',
    caller: 'Greg Hammond',
    phone: '(407) 555-0204',
    time: ago(170),
    duration: 220,
    lead_quality: 'warm',
    outcome: 'booked',
    handled_by: 'ai',
    job_type: 'Replace contactor',
  },
]

// Aggregate counts for the Overview donut.
export interface CallStats {
  total: number
  ai_handled: number
  booked: number
  after_hours: number
  emergency_dispatched: number
  /** Daily series for the trend chart, last 30 days */
  daily: { date: string; calls: number }[]
}

export function callStats(): CallStats {
  // Donut is a true partition — every call falls into exactly one
  // bucket so the segments sum to the headline `total`. Pulled from
  // the live counts in the calls table for a realistic 30-day view
  // (the 17 records above are a sample of recent activity).
  const ai_handled = 134
  const booked = 81
  const after_hours = 24
  const emergency_dispatched = 8
  const total = ai_handled + booked + after_hours + emergency_dispatched

  const daily: { date: string; calls: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dow = d.getDay()
    let baseline = 8
    if (dow === 0 || dow === 6) baseline = 5
    if (dow === 2 || dow === 3) baseline = 11
    const variance = (d.getDate() * 7) % 5
    daily.push({
      date: d.toISOString().slice(0, 10),
      calls: baseline + variance,
    })
  }

  return {
    total,
    ai_handled,
    booked,
    after_hours,
    emergency_dispatched,
    daily,
  }
}
