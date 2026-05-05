/**
 * Cornerstone — Today action queue.
 * Surfaces every signal from the People + Visitors + Care surfaces so
 * the pastor's morning routine is "open Today, work the list."
 */

export type TodayKind =
  | 'visitor_followup'
  | 'at_risk_family'
  | 'life_event'
  | 'volunteer_gap'
  | 'service_prep'
  | 'returning_family'
  | 'milestone'
  | 'task'

export type Priority = 'high' | 'medium' | 'low'

export interface TodayItem {
  id: string
  kind: TodayKind
  priority: Priority
  title: string
  detail: string
  cta: string
  /** Foreign key to household / visitor record */
  related_household_id?: string
  created_at: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}

export const KIND_META: Record<TodayKind, { label: string; color: string; icon: string }> = {
  visitor_followup:  { label: 'Visitor follow-up', color: 'rgb(var(--color-accent))', icon: '👋' },
  at_risk_family:    { label: 'At-risk family',    color: '#EF4444',                  icon: '⚠' },
  life_event:        { label: 'Life event',        color: '#A855F7',                  icon: '🎉' },
  volunteer_gap:     { label: 'Volunteer gap',     color: '#F59E0B',                  icon: '🙋' },
  service_prep:      { label: 'Service prep',      color: 'rgb(var(--color-brand))',  icon: '⛪' },
  returning_family:  { label: 'Returning family',  color: '#10B981',                  icon: '🏡' },
  milestone:         { label: 'Milestone',         color: '#10B981',                  icon: '🥳' },
  task:              { label: 'Task',              color: '#94A3B8',                  icon: '✓' },
}

export const todayItems: TodayItem[] = [
  // ── HIGH PRIORITY
  {
    id: 't-001',
    kind: 'life_event',
    priority: 'high',
    title: 'James Foster\'s father passed away — funeral Friday',
    detail: 'James called Sunday. Funeral 10 AM Friday at Woodlawn. Need to coordinate meal train, casket flowers, and a Cornerstone presence. Family well-loved here.',
    cta: 'Open care plan',
    related_household_id: 'h-011',
    created_at: ago(0, 30),
  },
  {
    id: 't-002',
    kind: 'at_risk_family',
    priority: 'high',
    title: 'The Sullivans — 4 weeks no kids attendance, all 3 flags red',
    detail: 'Liam + Ava haven\'t been in their classes 4 weeks running. Recurring gift cancelled, Casey stepped off hospitality. James hasn\'t responded to last 2 texts. Time for a personal call — not text.',
    cta: 'Plan personal visit',
    related_household_id: 'h-009',
    created_at: ago(2),
  },
  {
    id: 't-003',
    kind: 'visitor_followup',
    priority: 'high',
    title: 'Riley Boucher — first-time visitor yesterday, 24h follow-up due',
    detail: 'Marcus Bowman invited her, sat in back row alone. Mentioned work has been lonely. AI-drafted text ready in Visitors — review + send before EOD.',
    cta: 'Review + send',
    related_household_id: 'h-013',
    created_at: ago(4),
  },

  // ── MEDIUM
  {
    id: 't-004',
    kind: 'life_event',
    priority: 'medium',
    title: 'Baby Ellison born Tuesday — congrats + meal train',
    detail: 'Wes + Tara welcomed a baby boy Tuesday. Both healthy. Meal train through their small group (sg-001) + schedule baby dedication for ~6 weeks out.',
    cta: 'Send congrats note',
    related_household_id: 'h-010',
    created_at: ago(8),
  },
  {
    id: 't-005',
    kind: 'visitor_followup',
    priority: 'medium',
    title: 'The Madduxes — connected, ready for Discover Cornerstone invite',
    detail: '4 visits in the last month. Came to Newcomers Lunch. Hazel loves the kids program. AI-drafted invite to Discover Cornerstone class (May 19) ready in Visitors.',
    cta: 'Review + send',
    related_household_id: 'h-015',
    created_at: ago(11),
  },
  {
    id: 't-006',
    kind: 'returning_family',
    priority: 'medium',
    title: 'The Reyes Family back 2 Sundays in a row',
    detail: 'Maria + kids came back the last 2 Sundays after a 4-month gap. Single mom, life got hard. Greet warmly Sunday — no pressure to plug in fast.',
    cta: 'Add to Sunday greet list',
    related_household_id: 'h-012',
    created_at: ago(14),
  },
  {
    id: 't-007',
    kind: 'at_risk_family',
    priority: 'medium',
    title: 'The Whitakers — kids missed 3 of last 4 Sundays + recurring gift cancelled',
    detail: 'Bowen + Reese (3 + 5) — that\'s the leading indicator. Hannah usually replies fast to texts. Send a soft check-in: "missed the kiddos last week — everything ok?"',
    cta: 'Draft check-in',
    related_household_id: 'h-008',
    created_at: ago(18),
  },
  {
    id: 't-008',
    kind: 'volunteer_gap',
    priority: 'medium',
    title: 'Nursery short 2 volunteers Sunday at 9 AM',
    detail: 'Linda Tan + Aanya Patel both off this week (one travel, one sick). 4 babies expected (Luna Castellanos, Baby Ellison maybe). Suggest texting Mia Pham + Amanda Foster — both have stepped in last-minute before.',
    cta: 'Send volunteer text',
    created_at: ago(20),
  },

  // ── LOW
  {
    id: 't-009',
    kind: 'service_prep',
    priority: 'low',
    title: 'Sunday sermon — Week 3 of "Honest Prayers" series',
    detail: 'Outline + slides at 60%. Worship setlist confirmed (Jess sent it Sunday night). AV team confirmed. Two announcements to record by Thursday: Newcomers Lunch + Spring service day.',
    cta: 'Open service plan',
    created_at: ago(24),
  },
  {
    id: 't-010',
    kind: 'milestone',
    priority: 'low',
    title: 'Owen Holloway — 1 year as a Youth Leader',
    detail: 'Wes + Jenny\'s son Owen has been leading youth Wednesday nights for a year. Worth a public thank-you Sunday + a handwritten note this week.',
    cta: 'Add to Sunday shout-out',
    related_household_id: 'h-003',
    created_at: ago(28),
  },
]

export interface TodayStats {
  high_count: number
  medium_count: number
  low_count: number
  /** At-risk households (any flag red) */
  households_at_risk: number
  /** Visitors with action firing in next 24h */
  pending_visitor_actions: number
}

export function todayStats(): TodayStats {
  return {
    high_count: todayItems.filter((t) => t.priority === 'high').length,
    medium_count: todayItems.filter((t) => t.priority === 'medium').length,
    low_count: todayItems.filter((t) => t.priority === 'low').length,
    households_at_risk: 3,        // Sullivan, Whitaker, Castellanos (latter is yellow only)
    pending_visitor_actions: 3,    // Riley, Kennedy, Maddux
  }
}

// Live pulse — Sunday-week-shape
export interface TodayPulse {
  visitors_last_sunday: number
  attendance_last_sunday: number
  attendance_avg_4w: number
  households_at_risk: number
  life_events_this_week: number
}
export function todayPulse(): TodayPulse {
  return {
    visitors_last_sunday: 3,
    attendance_last_sunday: 412,
    attendance_avg_4w: 388,
    households_at_risk: 3,
    life_events_this_week: 2,
  }
}
