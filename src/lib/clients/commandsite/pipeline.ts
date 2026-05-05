/**
 * CommandSite — sales pipeline. Each "deal" is a prospect being moved
 * from cold lead toward signed-customer status. Stages roughly track
 * a B2B SaaS funnel: Cold → Researched → Contacted → Replied →
 * Demo Booked → Demo Done → Proposal → Closed (Won / Lost).
 */

export type PipelineStage =
  | 'cold'
  | 'researched'
  | 'contacted'
  | 'replied'
  | 'demo_booked'
  | 'demo_done'
  | 'proposal'
  | 'closed_won'
  | 'closed_lost'

export type LeadSource =
  | 'manual'
  | 'cold_email'
  | 'cold_call'
  | 'linkedin_dm'
  | 'inbound_demo'
  | 'referral'
  | 'event'
  | 'reddit'
  | 'apollo'
  | 'social_engager'
  | 'other'

export type TouchKind = 'email' | 'call' | 'meeting' | 'linkedin' | 'note'

export interface Deal {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_title: string
  industry: string
  city: string
  state: string
  team_size: number
  stage: PipelineStage
  source: LeadSource
  /** Estimated annualized contract value, in cents. */
  estimated_arr_cents: number
  days_in_stage: number
  next_action: string
  next_action_due_at: string
  last_touch_at: string
  last_touch_kind: TouchKind
  notes: string
}

function daysFromNow(days: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const STAGE_META: Record<PipelineStage, { label: string; sub: string; color: string }> = {
  cold:        { label: 'Cold',         sub: 'Imported from Apollo/Clay',  color: '#94A3B8' },
  researched:  { label: 'Researched',   sub: 'Notes + ICP fit scored',     color: '#64748B' },
  contacted:   { label: 'Contacted',    sub: 'Cold email or DM sent',      color: 'rgb(var(--color-accent))' },
  replied:     { label: 'Replied',      sub: 'They responded',             color: '#A0D8F8' },
  demo_booked: { label: 'Demo Booked',  sub: 'Calendar confirmed',         color: '#F59E0B' },
  demo_done:   { label: 'Demo Done',    sub: 'Awaiting next step',         color: '#FB7185' },
  proposal:    { label: 'Proposal',     sub: 'Pricing sent',               color: 'rgb(var(--color-brand))' },
  closed_won:  { label: 'Won',          sub: 'Signed customer',            color: '#10B981' },
  closed_lost: { label: 'Lost',         sub: 'Not this round',             color: '#475569' },
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  manual:         'Manual entry',
  cold_email:     'Cold email',
  cold_call:      'Cold call',
  linkedin_dm:    'LinkedIn DM',
  inbound_demo:   'Inbound demo',
  referral:       'Referral',
  event:          'Event',
  reddit:         'Reddit',
  apollo:         'Apollo / outbound',
  social_engager: 'Social engager',
  other:          'Other',
}

export const deals: Deal[] = [
  // ── COLD (recently imported, untouched)
  {
    id: 'd-001',
    company_name: 'Cool Comfort HVAC',
    contact_name: 'Brett Whitaker',
    contact_email: 'brett@coolcomforthvac.com',
    contact_title: 'Owner',
    industry: 'HVAC',
    city: 'Jacksonville', state: 'FL', team_size: 6,
    stage: 'cold', source: 'apollo',
    estimated_arr_cents: 599_000,
    days_in_stage: 1,
    next_action: 'Research + score ICP fit',
    next_action_due_at: daysFromNow(1),
    last_touch_at: ago(1),
    last_touch_kind: 'note',
    notes: 'Pulled from Apollo — 6 techs, growing, no current SaaS visible. Worth a 5-min research pass.',
  },
  {
    id: 'd-002',
    company_name: 'Suncoast Air Solutions',
    contact_name: 'Dani Rojas',
    contact_email: 'dani@suncoastair.co',
    contact_title: 'GM',
    industry: 'HVAC',
    city: 'St. Petersburg', state: 'FL', team_size: 9,
    stage: 'cold', source: 'apollo',
    estimated_arr_cents: 599_000,
    days_in_stage: 1,
    next_action: 'Research + score ICP fit',
    next_action_due_at: daysFromNow(1),
    last_touch_at: ago(1),
    last_touch_kind: 'note',
    notes: 'Found via Apollo HVAC list. Decent reviews, mid-sized team.',
  },

  // ── RESEARCHED (ready to send first touch)
  {
    id: 'd-003',
    company_name: 'AllPro Heating & Cooling',
    contact_name: 'Mike Donovan',
    contact_email: 'mike@allprohvac.com',
    contact_title: 'Owner',
    industry: 'HVAC',
    city: 'Tampa', state: 'FL', team_size: 8,
    stage: 'researched', source: 'cold_email',
    estimated_arr_cents: 599_000,
    days_in_stage: 2,
    next_action: 'Send opener: "saw your Google review for the Bowman job"',
    next_action_due_at: daysFromNow(0, 14),
    last_touch_at: ago(2),
    last_touch_kind: 'note',
    notes: 'Strong Google reviews, owner replies personally on Yelp. Mention his recent 5-star "Bowman job" review as opener.',
  },
  {
    id: 'd-004',
    company_name: 'Bayside Plumbing Co',
    contact_name: 'Whitney Park',
    contact_email: 'whitney@baysideplumbing.com',
    contact_title: 'Operations Manager',
    industry: 'Plumbing',
    city: 'San Diego', state: 'CA', team_size: 12,
    stage: 'researched', source: 'linkedin_dm',
    estimated_arr_cents: 1_200_000,
    days_in_stage: 1,
    next_action: 'Send LinkedIn DM referencing her "after-hours coverage" comment',
    next_action_due_at: daysFromNow(0, 16),
    last_touch_at: ago(1),
    last_touch_kind: 'note',
    notes: 'Commented on a thread last week about how hard after-hours coverage is. Open door.',
  },

  // ── CONTACTED (no reply yet)
  {
    id: 'd-005',
    company_name: 'ProGrow Lawn Care',
    contact_name: 'Daniel Egbert',
    contact_email: 'daniel@progrowlawn.com',
    contact_title: 'Founder',
    industry: 'Landscaping',
    city: 'Atlanta', state: 'GA', team_size: 5,
    stage: 'contacted', source: 'cold_email',
    estimated_arr_cents: 359_000,
    days_in_stage: 4,
    next_action: 'Send touch #2 (case study link)',
    next_action_due_at: daysFromNow(0, 11),
    last_touch_at: ago(4),
    last_touch_kind: 'email',
    notes: 'Opened email twice but no reply. Time for a value-add nudge — Apex case study.',
  },
  {
    id: 'd-006',
    company_name: 'Frostline Refrigeration',
    contact_name: 'Calvin Ohara',
    contact_email: 'calvin@frostlinerefrig.com',
    contact_title: 'Owner',
    industry: 'HVAC',
    city: 'Minneapolis', state: 'MN', team_size: 7,
    stage: 'contacted', source: 'cold_email',
    estimated_arr_cents: 599_000,
    days_in_stage: 6,
    next_action: 'Send touch #3 (breakup email)',
    next_action_due_at: daysFromNow(2),
    last_touch_at: ago(2),
    last_touch_kind: 'email',
    notes: 'Two touches, no opens. Run a breakup-style email and move on if no reply.',
  },

  // ── REPLIED (positive response, needs scheduling)
  {
    id: 'd-007',
    company_name: 'Premier Plumbing Solutions',
    contact_name: 'Jorge Salinas',
    contact_email: 'jorge@premierplumbingfl.com',
    contact_title: 'GM',
    industry: 'Plumbing',
    city: 'Miami', state: 'FL', team_size: 8,
    stage: 'replied', source: 'cold_email',
    estimated_arr_cents: 599_000,
    days_in_stage: 1,
    next_action: 'Reply with Calendly link for demo',
    next_action_due_at: daysFromNow(0, 9),
    last_touch_at: ago(0, 14),
    last_touch_kind: 'email',
    notes: 'Replied: "interested, send me times for next week" — hot. Send Calendly today.',
  },

  // ── DEMO BOOKED (calendar confirmed)
  {
    id: 'd-008',
    company_name: 'Spark Electric Co',
    contact_name: 'Rebecca Lin-Hartmann',
    contact_email: 'rebecca@sparkelectricnc.com',
    contact_title: 'Co-founder',
    industry: 'Electrical',
    city: 'Raleigh', state: 'NC', team_size: 11,
    stage: 'demo_booked', source: 'inbound_demo',
    estimated_arr_cents: 1_200_000,
    days_in_stage: 2,
    next_action: 'Demo Tuesday 2 PM ET',
    next_action_due_at: daysFromNow(2, 14),
    last_touch_at: ago(2),
    last_touch_kind: 'meeting',
    notes: 'Inbound — found us via the comparison page. Strong fit, 11 techs. Prep: ask about call volume + after-hours pain.',
  },
  {
    id: 'd-009',
    company_name: 'Anchor Pool & Spa',
    contact_name: 'Tomás Quintana',
    contact_email: 'tomas@anchorpoolaz.com',
    contact_title: 'Owner',
    industry: 'Pool service',
    city: 'Scottsdale', state: 'AZ', team_size: 7,
    stage: 'demo_booked', source: 'referral',
    estimated_arr_cents: 599_000,
    days_in_stage: 3,
    next_action: 'Demo Thursday 11 AM MT',
    next_action_due_at: daysFromNow(4, 13),
    last_touch_at: ago(3),
    last_touch_kind: 'email',
    notes: 'Referred by Emma at ClearStream. Already half-sold — expect a short demo + quick close.',
  },

  // ── DEMO DONE (waiting for owner to circle back)
  {
    id: 'd-010',
    company_name: 'Northstar Roofing',
    contact_name: 'Hailey Bramwell',
    contact_email: 'hailey@northstarroofing.co',
    contact_title: 'Owner',
    industry: 'Roofing',
    city: 'Minneapolis', state: 'MN', team_size: 14,
    stage: 'demo_done', source: 'cold_email',
    estimated_arr_cents: 1_200_000,
    days_in_stage: 5,
    next_action: 'Follow up — owner promised decision by Friday',
    next_action_due_at: daysFromNow(2, 10),
    last_touch_at: ago(5),
    last_touch_kind: 'meeting',
    notes: 'Demo went well. Need to check her business partner. Prepare a custom Loom video answering the 3 specific questions she asked.',
  },

  // ── PROPOSAL (pricing sent, awaiting decision)
  {
    id: 'd-011',
    company_name: 'GreenGuard Pest Control',
    contact_name: 'Liam Donnell',
    contact_email: 'liam@greenguardpest.com',
    contact_title: 'GM',
    industry: 'Pest control',
    city: 'Birmingham', state: 'AL', team_size: 9,
    stage: 'proposal', source: 'cold_email',
    estimated_arr_cents: 599_000,
    days_in_stage: 4,
    next_action: 'Personal call — owner Friday 10 AM CT',
    next_action_due_at: daysFromNow(3, 10),
    last_touch_at: ago(4),
    last_touch_kind: 'email',
    notes: 'Sent Pro plan proposal. They\'re comparing us to Birdeye. Highlight AI receptionist (Birdeye doesn\'t have it) on the call.',
  },
  {
    id: 'd-012',
    company_name: 'Coastal Electrical Services',
    contact_name: 'Marisol Diaz',
    contact_email: 'marisol@coastalelectric.com',
    contact_title: 'Owner',
    industry: 'Electrical',
    city: 'Wilmington', state: 'NC', team_size: 6,
    stage: 'proposal', source: 'linkedin_dm',
    estimated_arr_cents: 599_000,
    days_in_stage: 8,
    next_action: 'Final touch — send "we\'re shipping multi-location next month" note',
    next_action_due_at: daysFromNow(1, 10),
    last_touch_at: ago(8),
    last_touch_kind: 'email',
    notes: 'Proposal sent 8 days ago. Cooling off. Use the multi-location roadmap update as a nudge.',
  },

  // ── CLOSED WON (recently)
  {
    id: 'd-013',
    company_name: 'GreenLeaf Landscaping',
    contact_name: 'Wes Holloway',
    contact_email: 'wes@greenleafatx.com',
    contact_title: 'Founder',
    industry: 'Landscaping',
    city: 'Austin', state: 'TX', team_size: 6,
    stage: 'closed_won', source: 'inbound_demo',
    estimated_arr_cents: 599_000,
    days_in_stage: 8,
    next_action: 'Onboarding kickoff call Thursday',
    next_action_due_at: daysFromNow(2, 14),
    last_touch_at: ago(8),
    last_touch_kind: 'call',
    notes: 'Closed last week. In onboarding now — see Customers tab.',
  },
  {
    id: 'd-014',
    company_name: 'Polished Cleaning Co',
    contact_name: 'Yasmin Okafor',
    contact_email: 'yasmin@polishedcleaning.com',
    contact_title: 'Owner',
    industry: 'Cleaning',
    city: 'Nashville', state: 'TN', team_size: 14,
    stage: 'closed_won', source: 'referral',
    estimated_arr_cents: 1_200_000,
    days_in_stage: 184,
    next_action: 'Active customer — see Customers',
    next_action_due_at: daysFromNow(0),
    last_touch_at: ago(0, 12),
    last_touch_kind: 'note',
    notes: 'Long-time customer. Showing for pipeline-history continuity.',
  },

  // ── CLOSED LOST
  {
    id: 'd-015',
    company_name: 'Florida Friendly Pest',
    contact_name: 'Conner Rhys',
    contact_email: 'conner@flfriendlypest.com',
    contact_title: 'Owner',
    industry: 'Pest control',
    city: 'Orlando', state: 'FL', team_size: 4,
    stage: 'closed_lost', source: 'cold_email',
    estimated_arr_cents: 359_000,
    days_in_stage: 14,
    next_action: 'Q4 winback list',
    next_action_due_at: daysFromNow(120),
    last_touch_at: ago(14),
    last_touch_kind: 'email',
    notes: 'Went with Podium. Cited "all-in-one bundle." Add to Q4 winback when their annual is up for renewal.',
  },
]

export interface PipelineStats {
  total_open: number
  total_open_arr_cents: number
  closed_won_30d: number
  closed_won_30d_arr_cents: number
  closed_lost_30d: number
  win_rate_30d: number
  /** Counts in each stage (open stages only) */
  by_stage: Record<PipelineStage, number>
}

export function pipelineStats(): PipelineStats {
  const openStages: PipelineStage[] = ['cold','researched','contacted','replied','demo_booked','demo_done','proposal']
  const open = deals.filter((d) => openStages.includes(d.stage))
  const won = deals.filter((d) => d.stage === 'closed_won')
  const lost = deals.filter((d) => d.stage === 'closed_lost')

  const by_stage = Object.keys(STAGE_META).reduce<Record<PipelineStage, number>>((acc, s) => {
    acc[s as PipelineStage] = deals.filter((d) => d.stage === s).length
    return acc
  }, {} as Record<PipelineStage, number>)

  return {
    total_open: open.length,
    total_open_arr_cents: open.reduce((s, d) => s + d.estimated_arr_cents, 0),
    closed_won_30d: won.length,
    closed_won_30d_arr_cents: won.reduce((s, d) => s + d.estimated_arr_cents, 0),
    closed_lost_30d: lost.length,
    win_rate_30d: (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : 0,
    by_stage,
  }
}
