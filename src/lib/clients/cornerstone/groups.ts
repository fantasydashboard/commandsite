/**
 * Cornerstone — Small Groups (community health).
 *
 * Discipleship + community happen here, not on Sunday. Each group
 * carries a health rating + attendance trend + launch-pipeline state
 * so the pastor can see where community is actually growing (or not).
 */

export type GroupHealth = 'healthy' | 'watch' | 'struggling'
export type GroupKind = 'mixed' | 'young_adults' | 'married_couples' | 'mens' | 'womens' | 'parents'
export type LaunchStage = 'interested' | 'matched' | 'attended_first' | 'integrated' | 'declined'

export interface SmallGroup {
  id: string
  name: string
  leader_name: string
  leader_household_id: string
  co_leaders: string[]
  kind: GroupKind
  meeting_day: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
  meeting_time: string
  location: string  // 'Patel home (Oakwood Cir)' / 'Cornerstone — room 201'
  members_count: number
  capacity: number
  current_study: string
  /** Attendance counts for last 8 weeks (0 if didn't meet) */
  attendance_last_8: number[]
  launched_at: string
  health: GroupHealth
  /** Pastoral note for staff */
  pastoral_note?: string
  /** Open invitation — accepts new members? */
  open: boolean
}

export interface LaunchCandidate {
  id: string
  name: string
  email: string
  household_id?: string
  /** When they expressed interest */
  expressed_interest_at: string
  stage: LaunchStage
  /** Tags that help match (life stage, geo, interests) */
  preferences: string[]
  /** Suggested groups based on preferences */
  suggested_group_ids: string[]
  /** Final group they joined — only set when integrated */
  matched_group_id?: string
  note?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const HEALTH_META: Record<GroupHealth, { label: string; color: string }> = {
  healthy:    { label: 'Healthy',    color: '#10B981' },
  watch:      { label: 'Watch',      color: '#F59E0B' },
  struggling: { label: 'Struggling', color: '#EF4444' },
}

export const KIND_LABEL: Record<GroupKind, string> = {
  mixed:           'Mixed',
  young_adults:    'Young Adults',
  married_couples: 'Married Couples',
  mens:            "Men's",
  womens:          "Women's",
  parents:         'Parents',
}

export const LAUNCH_STAGE_META: Record<LaunchStage, { label: string; color: string }> = {
  interested:     { label: 'Interested',         color: '#94A3B8' },
  matched:        { label: 'Matched',            color: 'rgb(var(--color-accent))' },
  attended_first: { label: 'Attended first',     color: '#F59E0B' },
  integrated:     { label: 'Integrated',         color: '#10B981' },
  declined:       { label: 'Declined / lapsed',  color: '#EF4444' },
}

export const smallGroups: SmallGroup[] = [
  {
    id: 'sg-001',
    name: 'Wednesday Night Crew',
    leader_name: 'Jess Bowman',
    leader_household_id: 'h-002',
    co_leaders: ['Tara Ellison'],
    kind: 'mixed',
    meeting_day: 'Wed', meeting_time: '7:00 PM',
    location: 'Bowman home (Sandhill Ln)',
    members_count: 11, capacity: 14,
    current_study: 'Galatians — wk 6 of 8',
    attendance_last_8: [10, 11, 9, 11, 10, 0, 11, 10],  // 0 = didn't meet (holiday)
    launched_at: ago(420),
    health: 'healthy',
    open: true,
  },
  {
    id: 'sg-002',
    name: 'Tan Family Sunday Night',
    leader_name: 'Brian Tan',
    leader_household_id: 'h-001',
    co_leaders: ['Mia Pham'],
    kind: 'married_couples',
    meeting_day: 'Sun', meeting_time: '6:30 PM',
    location: 'Tan home (Magnolia Ridge)',
    members_count: 8, capacity: 10,
    current_study: 'Marriage on the Rock — wk 3 of 6',
    attendance_last_8: [8, 8, 7, 8, 8, 8, 6, 8],
    launched_at: ago(680),
    health: 'healthy',
    open: true,
  },
  {
    id: 'sg-003',
    name: 'Thursday Women',
    leader_name: 'Sofia Téllez',
    leader_household_id: 'h-006',
    co_leaders: [],
    kind: 'womens',
    meeting_day: 'Thu', meeting_time: '9:30 AM',
    location: 'Cornerstone — room 201',
    members_count: 7, capacity: 12,
    current_study: 'Psalms of Lament',
    attendance_last_8: [6, 7, 5, 7, 4, 5, 7, 6],
    launched_at: ago(124),
    health: 'healthy',
    open: true,
    pastoral_note: 'Sofia is a brand-new leader (first cycle). Steady but small — could use 2-3 more women. Consider matching Brielle Acosta + Lauren Maddux when they\'re ready.',
  },
  {
    id: 'sg-004',
    name: 'Young Adults @ Patel\'s',
    leader_name: 'Devin Patel',
    leader_household_id: 'h-004',
    co_leaders: ['Aanya Patel'],
    kind: 'young_adults',
    meeting_day: 'Wed', meeting_time: '7:30 PM',
    location: 'Patel home (Oakwood Cir)',
    members_count: 9, capacity: 12,
    current_study: 'Mere Christianity — wk 2 of 10',
    attendance_last_8: [9, 8, 9, 10, 9, 9, 10, 9],
    launched_at: ago(380),
    health: 'healthy',
    open: true,
  },
  {
    id: 'sg-005',
    name: 'Foster Family Friday',
    leader_name: 'James Foster',
    leader_household_id: 'h-011',
    co_leaders: ['Amanda Foster'],
    kind: 'mixed',
    meeting_day: 'Fri', meeting_time: '6:30 PM',
    location: 'Foster home (Maple Heights)',
    members_count: 12, capacity: 14,
    current_study: 'Romans — wk 8 of 12 (paused 1 wk for funeral)',
    attendance_last_8: [11, 12, 11, 12, 10, 11, 11, 0],
    launched_at: ago(890),
    health: 'watch',
    open: true,
    pastoral_note: 'Skipped this Friday for James\'s father\'s funeral. Jess Bowman covering the meal coordination. Group is supportive — actually a strength right now.',
  },
  {
    id: 'sg-006',
    name: 'Parents of Littles',
    leader_name: 'Linda Tan',
    leader_household_id: 'h-001',
    co_leaders: ['Hannah Whitaker'],
    kind: 'parents',
    meeting_day: 'Tue', meeting_time: '10:00 AM',
    location: 'Cornerstone — kids wing',
    members_count: 6, capacity: 12,
    current_study: 'Habits of the Household — wk 4 of 8',
    attendance_last_8: [8, 7, 6, 5, 6, 4, 5, 6],
    launched_at: ago(214),
    health: 'watch',
    open: true,
    pastoral_note: 'Trending down. Hannah\'s home situation may be why — Whitakers showing all the at-risk flags. Don\'t make Hannah carry this alone; consider asking Aanya Patel to step into co-leading.',
  },
  {
    id: 'sg-007',
    name: 'Saturday Men',
    leader_name: 'Marcus Bowman',
    leader_household_id: 'h-002',
    co_leaders: [],
    kind: 'mens',
    meeting_day: 'Sat', meeting_time: '7:00 AM',
    location: 'Donut Joe\'s',
    members_count: 4, capacity: 10,
    current_study: 'Just talking + scripture (no formal study)',
    attendance_last_8: [5, 4, 3, 4, 4, 3, 4, 4],
    launched_at: ago(72),
    health: 'struggling',
    open: true,
    pastoral_note: 'Started with 8 in February. Down to 4. Marcus is a strong guy but not a natural recruiter. Either pair him with a co-leader who is, or fold into Brian Tan\'s Sunday night.',
  },
]

export const launchCandidates: LaunchCandidate[] = [
  {
    id: 'lc-001',
    name: 'Brielle Acosta',
    email: 'brielle.acosta@gmail.com',
    household_id: 'h-conn-001',
    expressed_interest_at: ago(2),
    stage: 'matched',
    preferences: ['young adult', 'female', 'evenings ok', 'new to Orlando'],
    suggested_group_ids: ['sg-004', 'sg-003'],
    matched_group_id: 'sg-004',
    note: 'Mid-20s, recently moved. Pastor Mark suggested Devin + Aanya\'s young-adults group. Pending the intro text.',
  },
  {
    id: 'lc-002',
    name: 'Jordan & Lauren Maddux',
    email: 'jordanmaddux@gmail.com',
    household_id: 'h-015',
    expressed_interest_at: ago(8),
    stage: 'interested',
    preferences: ['married couple', 'parents (1 kid)', 'weeknights work', 'looking for a couples group'],
    suggested_group_ids: ['sg-002', 'sg-005'],
    note: 'Mentioned at Newcomers Lunch they\'d love a couples group. Brian Tan\'s Sunday night is the natural match — Lucia + Hazel are similar ages.',
  },
  {
    id: 'lc-003',
    name: 'Riley Boucher',
    email: 'riley.boucher@gmail.com',
    household_id: 'h-013',
    expressed_interest_at: ago(0, 12),
    stage: 'interested',
    preferences: ['single', 'mid-30s', 'evenings only'],
    suggested_group_ids: ['sg-001', 'sg-003'],
    note: 'First-time visitor yesterday — too early to push, but flag for follow-up after she comes a 2nd time.',
  },
  {
    id: 'lc-004',
    name: 'Trent Buford',
    email: 'tbuford@gmail.com',
    expressed_interest_at: ago(34),
    stage: 'declined',
    preferences: ['single', 'unsure'],
    suggested_group_ids: [],
    note: 'Filled out the connect card 5 weeks back asking about groups. Got a match, never came. Now lapsed as a visitor too.',
  },
  {
    id: 'lc-005',
    name: 'Karina Diaz',
    email: 'karina.diaz@gmail.com',
    expressed_interest_at: ago(48),
    stage: 'integrated',
    preferences: ['young adult', 'female'],
    suggested_group_ids: ['sg-003'],
    matched_group_id: 'sg-003',
    note: 'Joined Sofia\'s Thursday Women group 6 weeks back. Now a regular — also serves on hospitality.',
  },
]

export interface GroupStats {
  total_groups: number
  total_members: number
  total_capacity: number
  healthy: number
  watch: number
  struggling: number
  open_for_new_members: number
  pending_launches: number
  integrated_30d: number
}

export function groupStats(): GroupStats {
  return {
    total_groups: smallGroups.length,
    total_members: smallGroups.reduce((s, g) => s + g.members_count, 0),
    total_capacity: smallGroups.reduce((s, g) => s + g.capacity, 0),
    healthy: smallGroups.filter((g) => g.health === 'healthy').length,
    watch: smallGroups.filter((g) => g.health === 'watch').length,
    struggling: smallGroups.filter((g) => g.health === 'struggling').length,
    open_for_new_members: smallGroups.filter((g) => g.open && g.members_count < g.capacity).length,
    pending_launches: launchCandidates.filter((c) => c.stage !== 'integrated' && c.stage !== 'declined').length,
    integrated_30d: launchCandidates.filter((c) => c.stage === 'integrated').length,
  }
}

export function attendanceTrend(group: SmallGroup): 'up' | 'flat' | 'down' {
  const arr = group.attendance_last_8.filter((n) => n > 0)
  if (arr.length < 4) return 'flat'
  const first = arr.slice(0, Math.floor(arr.length / 2))
  const second = arr.slice(Math.floor(arr.length / 2))
  const avgFirst = first.reduce((s, n) => s + n, 0) / first.length
  const avgSecond = second.reduce((s, n) => s + n, 0) / second.length
  if (avgSecond > avgFirst + 0.5) return 'up'
  if (avgSecond < avgFirst - 0.5) return 'down'
  return 'flat'
}
