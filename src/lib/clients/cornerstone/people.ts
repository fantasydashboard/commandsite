/**
 * Cornerstone Community Church — household-aware people directory.
 *
 * The unit is the household, not the individual. Each household carries
 * three at-risk flags that drive the Care surface:
 *   • kids-attendance (the leading indicator — when 7-year-olds skip 2
 *     weeks, the family is drifting before the adults realize it)
 *   • giving (60+ days of no recurring gift)
 *   • serving (no active volunteer role)
 *
 * Households with all three flags red are the priority care list.
 */

export type HouseholdStage =
  | 'visitor'        // no membership yet
  | 'connected'      // came to a class/event/group
  | 'member'         // completed Discover Cornerstone
  | 'pillar'         // long-tenure, high-engagement
  | 'drifting'       // multi-flag at-risk
  | 'returning'      // recently re-engaged after a gap

export type FlagState = 'green' | 'yellow' | 'red' | 'na'

export type AgeGroup = 'nursery' | 'preschool' | 'elementary' | 'youth' | 'adult'
export type ServingRole =
  | 'worship_team' | 'kids_ministry' | 'youth_leader' | 'usher'
  | 'parking_team' | 'hospitality' | 'tech_av' | 'small_group_leader'
  | 'prayer_team'  | 'community_outreach'

export interface Person {
  id: string
  household_id: string
  first_name: string
  last_name: string
  age: number
  age_group: AgeGroup
  /** True if this person is the primary household contact for messages */
  primary_contact: boolean
  /** Active volunteer roles (adults only) */
  serving_roles: ServingRole[]
  small_group_id?: string
  baptized: boolean
  member_since?: string
  /** True if attendance was recorded for each of the last 8 Sundays */
  attendance_last_8: boolean[]
}

export interface LifeEvent {
  kind: 'birth' | 'death' | 'wedding' | 'baptism' | 'hospitalization' | 'job_change' | 'engagement'
  detail: string
  occurred_at: string
}

export interface Household {
  id: string
  household_name: string
  /** Members live in `people[]` joined by household_id */
  primary_contact_email: string
  primary_contact_phone: string
  address: string
  /** ISO of first contact with the church */
  first_contact_at: string
  stage: HouseholdStage
  /** 0–100 (last 8 Sundays of kids attendance — `na` if no kids in household) */
  kids_attendance_score: number
  kids_attendance_flag: FlagState
  /** 0–100 — recurring giving cadence */
  giving_score: number
  giving_flag: FlagState
  /** 0–100 — adults actively serving */
  serving_score: number
  serving_flag: FlagState
  /** Optional context for at-risk households */
  pastoral_note?: string
  /** Recent life event the church should acknowledge */
  recent_life_event?: LifeEvent
  /** When the pastor / care team last reached out personally */
  last_personal_touch_at?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const STAGE_META: Record<HouseholdStage, { label: string; color: string }> = {
  visitor:   { label: 'Visitor',    color: '#94A3B8' },
  connected: { label: 'Connected',  color: '#A0D8F8' },
  member:    { label: 'Member',     color: 'rgb(var(--color-brand))' },
  pillar:    { label: 'Pillar',     color: '#10B981' },
  drifting:  { label: 'Drifting',   color: '#EF4444' },
  returning: { label: 'Returning',  color: '#A855F7' },
}

export const FLAG_META: Record<FlagState, { label: string; color: string }> = {
  green: { label: 'Healthy',  color: '#10B981' },
  yellow:{ label: 'Watch',    color: '#F59E0B' },
  red:   { label: 'At-risk',  color: '#EF4444' },
  na:    { label: 'N/A',      color: '#94A3B8' },
}

export const SERVING_LABEL: Record<ServingRole, string> = {
  worship_team:        'Worship Team',
  kids_ministry:       'Kids Ministry',
  youth_leader:        'Youth Leader',
  usher:               'Usher',
  parking_team:        'Parking Team',
  hospitality:         'Hospitality',
  tech_av:             'Tech / AV',
  small_group_leader:  'Small-Group Leader',
  prayer_team:         'Prayer Team',
  community_outreach:  'Community Outreach',
}

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = {
  nursery:    'Nursery (0-2)',
  preschool:  'Preschool (3-5)',
  elementary: 'Elementary (K-5)',
  youth:      'Youth (6-12 grade)',
  adult:      'Adult',
}

// Helpers for fixture building — generates the attendance-last-8 pattern.
const FULL_ATTEND: boolean[] = [true,true,true,true,true,true,true,true]
const STRONG: boolean[]      = [true,true,true,true,true,false,true,true]   // 1 miss
const WATCH: boolean[]       = [true,true,true,false,true,true,false,false] // 3 misses
const DRIFTING: boolean[]    = [true,true,false,false,false,false,true,false]
const RETURNING: boolean[]   = [false,false,false,false,false,false,true,true]
const NEW_VISITOR: boolean[] = [false,false,false,false,false,false,false,true]
const TWO_VISITS: boolean[]  = [false,false,false,false,false,false,true,true]
const THREE_VISITS: boolean[]= [false,false,false,false,false,true,true,true]

export const households: Household[] = [
  // ── PILLAR (everything green)
  {
    id: 'h-001',
    household_name: 'The Tan Family',
    primary_contact_email: 'brian.tan@gmail.com',
    primary_contact_phone: '(407) 555-0234',
    address: '218 Magnolia Ridge Dr',
    first_contact_at: ago(2_180),
    stage: 'pillar',
    kids_attendance_score: 95, kids_attendance_flag: 'green',
    giving_score: 96, giving_flag: 'green',
    serving_score: 92, serving_flag: 'green',
    last_personal_touch_at: ago(28),
  },
  {
    id: 'h-002',
    household_name: 'The Bowman Family',
    primary_contact_email: 'jess.bowman@gmail.com',
    primary_contact_phone: '(407) 555-0411',
    address: '1442 Sandhill Ln',
    first_contact_at: ago(1_640),
    stage: 'pillar',
    kids_attendance_score: 92, kids_attendance_flag: 'green',
    giving_score: 88, giving_flag: 'green',
    serving_score: 95, serving_flag: 'green',
    last_personal_touch_at: ago(45),
  },
  {
    id: 'h-003',
    household_name: 'The Holloway Family',
    primary_contact_email: 'wesholloway@gmail.com',
    primary_contact_phone: '(407) 555-0512',
    address: '847 Pine Forest Rd',
    first_contact_at: ago(2_840),
    stage: 'pillar',
    kids_attendance_score: 88, kids_attendance_flag: 'green',
    giving_score: 91, giving_flag: 'green',
    serving_score: 84, serving_flag: 'green',
    last_personal_touch_at: ago(64),
  },

  // ── HEALTHY MEMBERS
  {
    id: 'h-004',
    household_name: 'The Patel Family',
    primary_contact_email: 'devin.patel@gmail.com',
    primary_contact_phone: '(407) 555-0601',
    address: '512 Oakwood Cir',
    first_contact_at: ago(840),
    stage: 'member',
    kids_attendance_score: 84, kids_attendance_flag: 'green',
    giving_score: 78, giving_flag: 'green',
    serving_score: 89, serving_flag: 'green',
    last_personal_touch_at: ago(38),
  },
  {
    id: 'h-005',
    household_name: 'The Pham Family',
    primary_contact_email: 'daniel.pham@gmail.com',
    primary_contact_phone: '(407) 555-0712',
    address: '1108 Lakeview Ave',
    first_contact_at: ago(412),
    stage: 'member',
    kids_attendance_score: 78, kids_attendance_flag: 'green',
    giving_score: 71, giving_flag: 'green',
    serving_score: 65, serving_flag: 'green',
    last_personal_touch_at: ago(120),
  },

  // ── RECENT MEMBER
  {
    id: 'h-006',
    household_name: 'The Téllez Family',
    primary_contact_email: 'r.tellez@gmail.com',
    primary_contact_phone: '(407) 555-0822',
    address: '6618 Magnolia Park Cir',
    first_contact_at: ago(184),
    stage: 'member',
    kids_attendance_score: 88, kids_attendance_flag: 'green',
    giving_score: 64, giving_flag: 'green',
    serving_score: 0, serving_flag: 'yellow',
    pastoral_note: 'Just completed Discover Cornerstone last month — natural next step is plugging into a serving role. Mention to Sofia.',
    last_personal_touch_at: ago(34),
  },

  // ── ONE FLAG (yellow)
  {
    id: 'h-007',
    household_name: 'The Castellanos Family',
    primary_contact_email: 'emma.cast@gmail.com',
    primary_contact_phone: '(407) 555-0918',
    address: '2204 Riverbend Way',
    first_contact_at: ago(1_120),
    stage: 'member',
    kids_attendance_score: 82, kids_attendance_flag: 'green',
    giving_score: 78, giving_flag: 'green',
    serving_score: 0, serving_flag: 'yellow',
    pastoral_note: 'Stepped off worship team in January after their second baby. Andre still attends — could plug into something low-commitment like prayer team.',
    last_personal_touch_at: ago(74),
  },

  // ── TWO FLAGS (orange)
  {
    id: 'h-008',
    household_name: 'The Whitaker Family',
    primary_contact_email: 'hannahwhitaker@gmail.com',
    primary_contact_phone: '(407) 555-1024',
    address: '4422 Edgewater Dr',
    first_contact_at: ago(740),
    stage: 'drifting',
    kids_attendance_score: 50, kids_attendance_flag: 'yellow',
    giving_score: 22, giving_flag: 'red',
    serving_score: 60, serving_flag: 'green',
    pastoral_note: 'Bowen + Reese missed 3 of last 4 Sundays. Recurring gift cancelled in February without comment. Brett still ushers.',
    last_personal_touch_at: ago(102),
    recent_life_event: undefined,
  },

  // ── THREE FLAGS (red — the drifting family)
  {
    id: 'h-009',
    household_name: 'The Sullivan Family',
    primary_contact_email: 'casey.sullivan@gmail.com',
    primary_contact_phone: '(407) 555-1145',
    address: '8847 Curry Ford Rd',
    first_contact_at: ago(1_490),
    stage: 'drifting',
    kids_attendance_score: 18, kids_attendance_flag: 'red',
    giving_score: 12, giving_flag: 'red',
    serving_score: 0, serving_flag: 'red',
    pastoral_note: '4 weeks no kids attendance. Casey was on hospitality but quietly stepped off in March. James hasn\'t responded to last 2 texts. Pastoral check-in overdue.',
    last_personal_touch_at: ago(168),
  },

  // ── LIFE EVENTS to acknowledge
  {
    id: 'h-010',
    household_name: 'The Ellison Family',
    primary_contact_email: 'wes.ellison@gmail.com',
    primary_contact_phone: '(407) 555-1267',
    address: '309 Westbridge Ln',
    first_contact_at: ago(620),
    stage: 'member',
    kids_attendance_score: 88, kids_attendance_flag: 'green',
    giving_score: 84, giving_flag: 'green',
    serving_score: 78, serving_flag: 'green',
    recent_life_event: { kind: 'birth', detail: 'Baby boy Ellison — born Tuesday, Mom + baby healthy', occurred_at: ago(3) },
    last_personal_touch_at: ago(15),
  },
  {
    id: 'h-011',
    household_name: 'The Foster Family',
    primary_contact_email: 'amanda.foster@gmail.com',
    primary_contact_phone: '(407) 555-1382',
    address: '512 Maple Heights Dr',
    first_contact_at: ago(1_240),
    stage: 'member',
    kids_attendance_score: 82, kids_attendance_flag: 'green',
    giving_score: 88, giving_flag: 'green',
    serving_score: 71, serving_flag: 'green',
    recent_life_event: { kind: 'death', detail: 'James\'s father passed away Sunday — funeral Friday at 10 AM', occurred_at: ago(5) },
    pastoral_note: 'Need to coordinate meal train + casket flowers. Family well-loved at Cornerstone.',
    last_personal_touch_at: ago(2),
  },

  // ── RETURNING
  {
    id: 'h-012',
    household_name: 'The Reyes Family',
    primary_contact_email: 'maria.reyes@gmail.com',
    primary_contact_phone: '(407) 555-1493',
    address: '928 Brookhaven Ct',
    first_contact_at: ago(1_080),
    stage: 'returning',
    kids_attendance_score: 38, kids_attendance_flag: 'yellow',
    giving_score: 0, giving_flag: 'yellow',
    serving_score: 0, serving_flag: 'yellow',
    pastoral_note: 'Maria + kids back the last 2 Sundays after a 4-month gap. Single mom — life got hard. Be warm but no pressure to plug in fast.',
    last_personal_touch_at: ago(8),
  },

  // ── VISITORS at different stages
  {
    id: 'h-013',
    household_name: 'Riley Boucher',
    primary_contact_email: 'riley.boucher@gmail.com',
    primary_contact_phone: '(407) 555-1607',
    address: '224 Park Ridge Dr',
    first_contact_at: ago(1),
    stage: 'visitor',
    kids_attendance_score: 0, kids_attendance_flag: 'na',
    giving_score: 0, giving_flag: 'na',
    serving_score: 0, serving_flag: 'na',
    pastoral_note: 'First-time visitor yesterday. Single, mid-30s. Came alone. Connected on the way out — said her coworker invited her.',
  },
  {
    id: 'h-014',
    household_name: 'Kennedy Park',
    primary_contact_email: 'k.park@gmail.com',
    primary_contact_phone: '(407) 555-1718',
    address: '1817 Sunset Pointe',
    first_contact_at: ago(11),
    stage: 'visitor',
    kids_attendance_score: 0, kids_attendance_flag: 'na',
    giving_score: 0, giving_flag: 'na',
    serving_score: 0, serving_flag: 'na',
    pastoral_note: 'Second-time visitor. Filled out the connect card. Mentioned she\'s "checking out churches in the area."',
  },
  {
    id: 'h-015',
    household_name: 'The Maddux Family',
    primary_contact_email: 'jordanmaddux@gmail.com',
    primary_contact_phone: '(407) 555-1829',
    address: '4002 Pershing Ave',
    first_contact_at: ago(34),
    stage: 'connected',
    kids_attendance_score: 67, kids_attendance_flag: 'green',
    giving_score: 0, giving_flag: 'na',
    serving_score: 0, serving_flag: 'na',
    pastoral_note: 'Came to Newcomers Lunch 2 weeks ago. Daughter loves the kids program. Ready for the small-group invite + Discover Cornerstone class.',
  },
]

// ── PEOPLE within households ────────────────────────────────────────────
export const people: Person[] = [
  // Tan family
  { id: 'p-001a', household_id: 'h-001', first_name: 'Brian',  last_name: 'Tan',     age: 44, age_group: 'adult',     primary_contact: true,  serving_roles: ['small_group_leader', 'tech_av'], small_group_id: 'sg-002', baptized: true, member_since: ago(2_120), attendance_last_8: FULL_ATTEND },
  { id: 'p-001b', household_id: 'h-001', first_name: 'Linda',  last_name: 'Tan',     age: 42, age_group: 'adult',     primary_contact: false, serving_roles: ['kids_ministry'], baptized: true, member_since: ago(2_120), attendance_last_8: FULL_ATTEND },
  { id: 'p-001c', household_id: 'h-001', first_name: 'Caleb',  last_name: 'Tan',     age: 12, age_group: 'youth',     primary_contact: false, serving_roles: [], baptized: true, attendance_last_8: STRONG },
  { id: 'p-001d', household_id: 'h-001', first_name: 'Amelia', last_name: 'Tan',     age: 9,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: FULL_ATTEND },

  // Bowman family
  { id: 'p-002a', household_id: 'h-002', first_name: 'Jess',   last_name: 'Bowman',  age: 38, age_group: 'adult',     primary_contact: true,  serving_roles: ['worship_team', 'small_group_leader'], small_group_id: 'sg-001', baptized: true, member_since: ago(1_580), attendance_last_8: FULL_ATTEND },
  { id: 'p-002b', household_id: 'h-002', first_name: 'Marcus', last_name: 'Bowman',  age: 40, age_group: 'adult',     primary_contact: false, serving_roles: ['usher'], baptized: true, member_since: ago(1_580), attendance_last_8: FULL_ATTEND },
  { id: 'p-002c', household_id: 'h-002', first_name: 'Eli',    last_name: 'Bowman',  age: 8,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },
  { id: 'p-002d', household_id: 'h-002', first_name: 'Nora',   last_name: 'Bowman',  age: 5,  age_group: 'preschool', primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: FULL_ATTEND },

  // Holloway family
  { id: 'p-003a', household_id: 'h-003', first_name: 'Wes',    last_name: 'Holloway',age: 51, age_group: 'adult',     primary_contact: true,  serving_roles: ['hospitality'], baptized: true, member_since: ago(2_780), attendance_last_8: FULL_ATTEND },
  { id: 'p-003b', household_id: 'h-003', first_name: 'Jenny',  last_name: 'Holloway',age: 49, age_group: 'adult',     primary_contact: false, serving_roles: ['prayer_team'], baptized: true, member_since: ago(2_780), attendance_last_8: STRONG },
  { id: 'p-003c', household_id: 'h-003', first_name: 'Owen',   last_name: 'Holloway',age: 16, age_group: 'youth',     primary_contact: false, serving_roles: ['youth_leader'], baptized: true, attendance_last_8: STRONG },
  { id: 'p-003d', household_id: 'h-003', first_name: 'Maddie', last_name: 'Holloway',age: 13, age_group: 'youth',     primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },

  // Patel
  { id: 'p-004a', household_id: 'h-004', first_name: 'Devin',  last_name: 'Patel',   age: 36, age_group: 'adult',     primary_contact: true,  serving_roles: ['small_group_leader'], small_group_id: 'sg-004', baptized: true, member_since: ago(720), attendance_last_8: FULL_ATTEND },
  { id: 'p-004b', household_id: 'h-004', first_name: 'Aanya',  last_name: 'Patel',   age: 34, age_group: 'adult',     primary_contact: false, serving_roles: ['kids_ministry'], baptized: true, member_since: ago(720), attendance_last_8: STRONG },
  { id: 'p-004c', household_id: 'h-004', first_name: 'Arjun',  last_name: 'Patel',   age: 6,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },

  // Pham
  { id: 'p-005a', household_id: 'h-005', first_name: 'Daniel', last_name: 'Pham',    age: 33, age_group: 'adult',     primary_contact: true,  serving_roles: ['parking_team'], baptized: true, member_since: ago(380), attendance_last_8: STRONG },
  { id: 'p-005b', household_id: 'h-005', first_name: 'Mia',    last_name: 'Pham',    age: 32, age_group: 'adult',     primary_contact: false, serving_roles: [], small_group_id: 'sg-002', baptized: true, member_since: ago(380), attendance_last_8: FULL_ATTEND },
  { id: 'p-005c', household_id: 'h-005', first_name: 'Theo',   last_name: 'Pham',    age: 7,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },

  // Téllez (recent member)
  { id: 'p-006a', household_id: 'h-006', first_name: 'Ramón',  last_name: 'Téllez',  age: 39, age_group: 'adult',     primary_contact: true,  serving_roles: [], baptized: true, member_since: ago(34), attendance_last_8: STRONG },
  { id: 'p-006b', household_id: 'h-006', first_name: 'Sofia',  last_name: 'Téllez',  age: 37, age_group: 'adult',     primary_contact: false, serving_roles: [], small_group_id: 'sg-003', baptized: true, member_since: ago(34), attendance_last_8: FULL_ATTEND },
  { id: 'p-006c', household_id: 'h-006', first_name: 'Lucia',  last_name: 'Téllez',  age: 4,  age_group: 'preschool', primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },

  // Castellanos (yellow — stopped serving)
  { id: 'p-007a', household_id: 'h-007', first_name: 'Andre',  last_name: 'Castellanos', age: 35, age_group: 'adult', primary_contact: true,  serving_roles: [], baptized: true, member_since: ago(1_060), attendance_last_8: STRONG },
  { id: 'p-007b', household_id: 'h-007', first_name: 'Emma',   last_name: 'Castellanos', age: 33, age_group: 'adult', primary_contact: false, serving_roles: [], baptized: true, member_since: ago(1_060), attendance_last_8: STRONG },
  { id: 'p-007c', household_id: 'h-007', first_name: 'Mateo',  last_name: 'Castellanos', age: 4,  age_group: 'preschool', primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },
  { id: 'p-007d', household_id: 'h-007', first_name: 'Luna',   last_name: 'Castellanos', age: 1,  age_group: 'nursery',  primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: WATCH },

  // Whitaker (two flags)
  { id: 'p-008a', household_id: 'h-008', first_name: 'Brett',  last_name: 'Whitaker', age: 36, age_group: 'adult',    primary_contact: true,  serving_roles: ['usher'], baptized: true, member_since: ago(680), attendance_last_8: STRONG },
  { id: 'p-008b', household_id: 'h-008', first_name: 'Hannah', last_name: 'Whitaker', age: 34, age_group: 'adult',    primary_contact: false, serving_roles: [], baptized: true, member_since: ago(680), attendance_last_8: WATCH },
  { id: 'p-008c', household_id: 'h-008', first_name: 'Bowen',  last_name: 'Whitaker', age: 5,  age_group: 'preschool',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: WATCH },
  { id: 'p-008d', household_id: 'h-008', first_name: 'Reese',  last_name: 'Whitaker', age: 3,  age_group: 'preschool',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: WATCH },

  // Sullivan (red — three flags)
  { id: 'p-009a', household_id: 'h-009', first_name: 'James',  last_name: 'Sullivan', age: 41, age_group: 'adult',    primary_contact: true,  serving_roles: [], baptized: true, member_since: ago(1_420), attendance_last_8: DRIFTING },
  { id: 'p-009b', household_id: 'h-009', first_name: 'Casey',  last_name: 'Sullivan', age: 39, age_group: 'adult',    primary_contact: false, serving_roles: [], baptized: true, member_since: ago(1_420), attendance_last_8: DRIFTING },
  { id: 'p-009c', household_id: 'h-009', first_name: 'Liam',   last_name: 'Sullivan', age: 11, age_group: 'youth',    primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: DRIFTING },
  { id: 'p-009d', household_id: 'h-009', first_name: 'Ava',    last_name: 'Sullivan', age: 8,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: DRIFTING },

  // Ellison (life event — birth)
  { id: 'p-010a', household_id: 'h-010', first_name: 'Wes',    last_name: 'Ellison',  age: 31, age_group: 'adult',    primary_contact: true,  serving_roles: ['tech_av'], baptized: true, member_since: ago(560), attendance_last_8: STRONG },
  { id: 'p-010b', household_id: 'h-010', first_name: 'Tara',   last_name: 'Ellison',  age: 30, age_group: 'adult',    primary_contact: false, serving_roles: ['hospitality'], small_group_id: 'sg-001', baptized: true, member_since: ago(560), attendance_last_8: STRONG },
  { id: 'p-010c', household_id: 'h-010', first_name: 'Baby',   last_name: 'Ellison',  age: 0,  age_group: 'nursery',  primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: NEW_VISITOR },

  // Foster (life event — death)
  { id: 'p-011a', household_id: 'h-011', first_name: 'James',  last_name: 'Foster',   age: 44, age_group: 'adult',    primary_contact: true,  serving_roles: ['small_group_leader'], small_group_id: 'sg-005', baptized: true, member_since: ago(1_180), attendance_last_8: STRONG },
  { id: 'p-011b', household_id: 'h-011', first_name: 'Amanda', last_name: 'Foster',   age: 42, age_group: 'adult',    primary_contact: false, serving_roles: ['kids_ministry'], baptized: true, member_since: ago(1_180), attendance_last_8: STRONG },
  { id: 'p-011c', household_id: 'h-011', first_name: 'Jack',   last_name: 'Foster',   age: 14, age_group: 'youth',    primary_contact: false, serving_roles: [], baptized: true, attendance_last_8: STRONG },
  { id: 'p-011d', household_id: 'h-011', first_name: 'Ellie',  last_name: 'Foster',   age: 11, age_group: 'youth',    primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },
  { id: 'p-011e', household_id: 'h-011', first_name: 'Sam',    last_name: 'Foster',   age: 8,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: STRONG },

  // Reyes (returning)
  { id: 'p-012a', household_id: 'h-012', first_name: 'Maria',  last_name: 'Reyes',    age: 37, age_group: 'adult',    primary_contact: true,  serving_roles: [], baptized: true, member_since: ago(1_020), attendance_last_8: RETURNING },
  { id: 'p-012b', household_id: 'h-012', first_name: 'Sofia',  last_name: 'Reyes',    age: 9,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: RETURNING },
  { id: 'p-012c', household_id: 'h-012', first_name: 'Mateo',  last_name: 'Reyes',    age: 6,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: RETURNING },

  // Visitors
  { id: 'p-013a', household_id: 'h-013', first_name: 'Riley',  last_name: 'Boucher',  age: 34, age_group: 'adult',    primary_contact: true,  serving_roles: [], baptized: false, attendance_last_8: NEW_VISITOR },
  { id: 'p-014a', household_id: 'h-014', first_name: 'Kennedy',last_name: 'Park',     age: 29, age_group: 'adult',    primary_contact: true,  serving_roles: [], baptized: false, attendance_last_8: TWO_VISITS },
  { id: 'p-015a', household_id: 'h-015', first_name: 'Jordan', last_name: 'Maddux',   age: 38, age_group: 'adult',    primary_contact: true,  serving_roles: [], baptized: false, attendance_last_8: THREE_VISITS },
  { id: 'p-015b', household_id: 'h-015', first_name: 'Lauren', last_name: 'Maddux',   age: 36, age_group: 'adult',    primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: THREE_VISITS },
  { id: 'p-015c', household_id: 'h-015', first_name: 'Hazel',  last_name: 'Maddux',   age: 6,  age_group: 'elementary',primary_contact: false, serving_roles: [], baptized: false, attendance_last_8: THREE_VISITS },
]

export interface PeopleStats {
  total_households: number
  total_people: number
  members: number
  visitors_active: number
  drifting: number
  at_risk_one_flag: number
  at_risk_two_plus_flags: number
  active_volunteers: number
  households_with_kids: number
}

function flagCount(h: Household): number {
  let c = 0
  if (h.kids_attendance_flag === 'red' || h.kids_attendance_flag === 'yellow') c++
  if (h.giving_flag === 'red' || h.giving_flag === 'yellow') c++
  if (h.serving_flag === 'red' || h.serving_flag === 'yellow') c++
  return c
}

export function peopleStats(): PeopleStats {
  return {
    total_households: households.length,
    total_people: people.length,
    members: households.filter((h) => h.stage === 'member' || h.stage === 'pillar' || h.stage === 'returning').length,
    visitors_active: households.filter((h) => h.stage === 'visitor' || h.stage === 'connected').length,
    drifting: households.filter((h) => h.stage === 'drifting').length,
    at_risk_one_flag: households.filter((h) => flagCount(h) === 1).length,
    at_risk_two_plus_flags: households.filter((h) => flagCount(h) >= 2).length,
    active_volunteers: people.filter((p) => p.serving_roles.length > 0).length,
    households_with_kids: households.filter((h) =>
      people.some((p) => p.household_id === h.id && p.age_group !== 'adult'),
    ).length,
  }
}

export function peopleInHousehold(householdId: string): Person[] {
  return people.filter((p) => p.household_id === householdId)
}

export function totalFlagCount(h: Household): number {
  return flagCount(h)
}
