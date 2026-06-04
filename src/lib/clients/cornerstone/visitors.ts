/**
 * Cornerstone — Visitor Journey pipeline.
 *
 * Stages: First-time → Returning → Connected → Membership Class →
 * Member. Each stage triggers an automated next-step (text, email,
 * invite) that the pastor approves before sending.
 */

export type VisitorStage =
  | 'first_time'
  | 'returning'
  | 'connected'
  | 'membership_class'
  | 'member'
  | 'lapsed'

export type Source =
  | 'invited_by_member'
  | 'website'
  | 'drive_by'
  | 'community_event'
  | 'school_program'
  | 'returning_after_gap'
  | 'baby_dedication'
  | 'wedding_or_funeral'

export interface VisitorRecord {
  id: string
  household_id: string  // joins to people.ts households
  primary_contact_name: string
  email: string
  phone: string
  first_visit_at: string
  last_visit_at: string
  total_visits: number
  stage: VisitorStage
  source: Source
  /** What automated next-step is queued for this visitor */
  next_action: {
    label: string
    /** Channel of next message */
    channel: 'sms' | 'email' | 'in_person'
    /** AI-drafted message body */
    draft: string
    /** When the automation will fire (or "now" if pending approval) */
    scheduled_at: string
  }
  /** Free-text note from the pastor / care team */
  note?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}
function inHours(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() + hours, 0, 0, 0)
  return d.toISOString()
}
function inDays(days: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const STAGE_META: Record<VisitorStage, { label: string; sub: string; color: string }> = {
  first_time:       { label: 'First-Time',     sub: 'Single Sunday',                color: '#94A3B8' },
  returning:        { label: 'Returning',       sub: 'Came back at least once',      color: 'rgb(var(--color-accent))' },
  connected:        { label: 'Connected',       sub: 'Came to event/lunch/group',    color: '#10B981' },
  membership_class: { label: 'Discover Class',  sub: 'In Discover Cornerstone',      color: '#A855F7' },
  member:           { label: 'Member',          sub: 'Completed membership',         color: 'rgb(var(--color-brand))' },
  lapsed:           { label: 'Lapsed',          sub: 'Stopped coming after visiting',color: '#EF4444' },
}

export const SOURCE_LABEL: Record<Source, string> = {
  invited_by_member:    'Invited by member',
  website:              'Website',
  drive_by:             'Walked in',
  community_event:      'Community event',
  school_program:       'School / kids program',
  returning_after_gap:  'Returning after gap',
  baby_dedication:      'Baby dedication',
  wedding_or_funeral:   'Wedding / funeral',
}

export const visitors: VisitorRecord[] = [
  // First-time, less than 24h ago — automation hasn\'t fired yet
  {
    id: 'v-001',
    household_id: 'h-013',
    primary_contact_name: 'Riley Boucher',
    email: 'riley.boucher@gmail.com',
    phone: '(407) 555-1607',
    first_visit_at: ago(1),
    last_visit_at: ago(1),
    total_visits: 1,
    stage: 'first_time',
    source: 'invited_by_member',
    next_action: {
      label: '24h follow-up text + email — pending approval',
      channel: 'sms',
      draft: `Hey Riley — Pastor Mark from Cornerstone here. Genuinely glad you came yesterday. No pitch — but if you\'re ever up for coffee this week, my treat. Otherwise, no pressure, hope to see you again Sunday.`,
      scheduled_at: inHours(2),
    },
    note: 'Sat in back row alone. Coworker (Marcus Bowman) brought her — she said work has been lonely.',
  },
  // Second visit
  {
    id: 'v-002',
    household_id: 'h-014',
    primary_contact_name: 'Kennedy Park',
    email: 'k.park@gmail.com',
    phone: '(407) 555-1718',
    first_visit_at: ago(11),
    last_visit_at: ago(4),
    total_visits: 2,
    stage: 'returning',
    source: 'website',
    next_action: {
      label: 'Newcomers Lunch invite — fires Wednesday',
      channel: 'email',
      draft: `Subject: Lunch on us, Kennedy?\n\nKennedy — really appreciate you coming back this Sunday. We host a no-strings-attached Newcomers Lunch the last Sunday of each month after second service. It\'s a chance to meet a few of us in a smaller setting + ask any questions. Want to come?\n\nApril\'s lunch is the 28th right after the 11 AM service. Reply YES + I\'ll save you a seat.\n\n— Pastor Mark`,
      scheduled_at: inDays(2, 10),
    },
    note: 'Filled out connect card. Mentioned she\'s "checking out churches in the area."',
  },
  // Third visit, ready for the connect step
  {
    id: 'v-003',
    household_id: 'h-015',
    primary_contact_name: 'Jordan & Lauren Maddux',
    email: 'jordanmaddux@gmail.com',
    phone: '(407) 555-1829',
    first_visit_at: ago(34),
    last_visit_at: ago(2),
    total_visits: 4,
    stage: 'connected',
    source: 'invited_by_member',
    next_action: {
      label: 'Discover Cornerstone class invite — pending approval',
      channel: 'email',
      draft: `Subject: Next steps for the Maddux family at Cornerstone?\n\nJordan + Lauren — so glad to have your family with us. Hazel has been an absolute gift in the kids program (Jenny said she\'s already memorized half the songs).\n\nNext step a lot of folks like at this point: Discover Cornerstone. It\'s a 90-minute Sunday morning class (next one is May 19) where we walk through what we believe + what membership means here. Zero pressure to commit afterward — most people just want to ask the questions out loud.\n\nWant in? Reply YES and I\'ll save you 2 spots.\n\n— Pastor Mark`,
      scheduled_at: inHours(4),
    },
    note: 'Came to Newcomers Lunch 2 weeks ago. Daughter loves the kids program.',
  },
  // Recently completed Discover Cornerstone — became a member
  {
    id: 'v-004',
    household_id: 'h-006',
    primary_contact_name: 'Ramón & Sofia Téllez',
    email: 'r.tellez@gmail.com',
    phone: '(407) 555-0822',
    first_visit_at: ago(184),
    last_visit_at: ago(2),
    total_visits: 24,
    stage: 'member',
    source: 'community_event',
    next_action: {
      label: '6-week post-membership check-in — fires next Tue',
      channel: 'in_person',
      draft: `In-person ask after service: How\'s plugging in feeling? Sofia in a small group already — Ramón, anything you\'re drawn toward serving on?`,
      scheduled_at: inDays(7, 11),
    },
    note: 'Completed Discover Cornerstone last month. Natural next step is plugging Ramón into a serving role.',
  },
  // Connected via baby dedication
  {
    id: 'v-005',
    household_id: 'h-010',
    primary_contact_name: 'Wes & Tara Ellison',
    email: 'wes.ellison@gmail.com',
    phone: '(407) 555-1267',
    first_visit_at: ago(620),
    last_visit_at: ago(0, 4),
    total_visits: 88,
    stage: 'member',
    source: 'baby_dedication',
    next_action: {
      label: 'Meal-train coordination + baby dedication scheduling',
      channel: 'in_person',
      draft: `Set up the meal train through the small-group leader (Tara is in Sg-001). Schedule baby dedication for the first Sunday Wes feels ready — usually 6-8 weeks postpartum.`,
      scheduled_at: inDays(1, 9),
    },
    note: 'Wes converted his trial visit into membership 2 years back. Now growing the family — full-circle moment.',
  },
  // Lapsed visitor — went cold after 2 visits
  {
    id: 'v-006',
    household_id: 'h-lapsed-001',
    primary_contact_name: 'Trent Buford',
    email: 'tbuford@gmail.com',
    phone: '(407) 555-1956',
    first_visit_at: ago(78),
    last_visit_at: ago(64),
    total_visits: 2,
    stage: 'lapsed',
    source: 'drive_by',
    next_action: {
      label: '60-day "we miss you" check-in (low-pressure)',
      channel: 'sms',
      draft: `Hey Trent — saw you visited Cornerstone a couple times back in February + we haven\'t crossed paths since. No pressure to come back — just wanted to say you\'re welcome any Sunday + I\'m here if anything we can do to be useful.\n\n— Pastor Mark`,
      scheduled_at: inDays(0, 10),
    },
    note: 'Did 2 visits, then ghosted. Worth one warm low-pressure ping before letting it go.',
  },
  // In Discover Cornerstone — week 2 of 4
  {
    id: 'v-008',
    household_id: 'h-mc-001',
    primary_contact_name: 'The Brooks Family',
    email: 'matt.brooks@gmail.com',
    phone: '(407) 555-2189',
    first_visit_at: ago(72),
    last_visit_at: ago(2),
    total_visits: 9,
    stage: 'membership_class',
    source: 'invited_by_member',
    next_action: {
      label: 'Discover Cornerstone week 2 reminder — fires Saturday',
      channel: 'sms',
      draft: `Matt + Lindsay — looking forward to seeing you tomorrow for week 2 of Discover Cornerstone at 10:30 in the upper room. Coffee + breakfast on us. Any questions before then, text back. — Pastor Mark`,
      scheduled_at: inDays(3, 10),
    },
    note: 'Brought by the Téllez Family back in March. Came to Newcomers Lunch in April. Started Discover Cornerstone two weeks ago, finishes May 19.',
  },
  // Connected — came to community service event
  {
    id: 'v-007',
    household_id: 'h-conn-001',
    primary_contact_name: 'Brielle Acosta',
    email: 'brielle.acosta@gmail.com',
    phone: '(407) 555-2067',
    first_visit_at: ago(22),
    last_visit_at: ago(2),
    total_visits: 3,
    stage: 'connected',
    source: 'community_event',
    next_action: {
      label: 'Small-group invite — pending approval',
      channel: 'email',
      draft: `Subject: A small group that might be your speed?\n\nBrielle — really enjoyed talking after service Sunday. You mentioned you\'re looking to make some friends in town.\n\nThere\'s a young-adults group that meets Wednesday nights at Devin + Aanya Patel\'s house — about 8 people, ranges from late 20s to mid 30s. Honest, warm, not weird. Want me to make the intro?\n\n— Pastor Mark`,
      scheduled_at: inHours(6),
    },
    note: 'Showed up at the spring community service day + has come back twice. Mid-20s, recently moved to Orlando, hasn\'t plugged in anywhere.',
  },
]

export interface VisitorStats {
  total_active: number
  by_stage: Record<VisitorStage, number>
  /** Visitors with a next action firing in the next 24h */
  pending_actions_24h: number
  /** First-time visitors in the last 30 days */
  first_time_30d: number
  /** Conversion rate over a recent window (visitors → connected at minimum) */
  connect_rate: number
  /** Conversion to member */
  member_conversion_rate: number
}

export function visitorStats(): VisitorStats {
  const active = visitors.filter((v) => v.stage !== 'lapsed' && v.stage !== 'member')
  const by_stage: Record<VisitorStage, number> = {
    first_time: 0, returning: 0, connected: 0, membership_class: 0, member: 0, lapsed: 0,
  }
  for (const v of visitors) by_stage[v.stage]++
  const pending_24h = visitors.filter((v) => {
    const ms = new Date(v.next_action.scheduled_at).getTime() - Date.now()
    return ms < 24 * 60 * 60 * 1000
  }).length
  const first_30d = visitors.filter((v) => {
    return Date.now() - new Date(v.first_visit_at).getTime() < 30 * 24 * 60 * 60 * 1000
  }).length
  // Demo numbers calibrated to the fixture above
  const connect_rate = 0.42
  const member_conversion_rate = 0.18
  return {
    total_active: active.length,
    by_stage,
    pending_actions_24h: pending_24h,
    first_time_30d: first_30d,
    connect_rate,
    member_conversion_rate,
  }
}
