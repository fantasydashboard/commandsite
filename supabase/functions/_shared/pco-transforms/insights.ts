// insights.ts (edge transform)
//
// The Insights page, computed from staged Planning Center data instead of
// pasted in from a laptop. Four panels carried a "Sep 11" stamp and two a
// "Jul 12" one, which is honest labelling of a real problem: the church asked
// where every number comes from, and for half this page the answer was "a pull
// I ran by hand when I remembered".
//
// Everything here reads the tables the nightly sync already fills. The only
// live fetch the caller does is the three workflows we do not otherwise need
// (Meet the Pastor, New Member Class, Baptism Class), which are three requests.
//
// NOT INCLUDED, on purpose: the weekend attendance, salvations, online reach
// and youth panels come from the church's own weekly summary sheet and Metrics
// workbook. No amount of Planning Center access produces them.

export type Campus = 'all' | 'english' | 'brazilian'

export interface CardRow {
  workflow_id: string
  campus: string
  person_id: string
  created_date: string
  completed_date: string | null
}
export interface GroupMemberRow { person_id: string; group_name: string; group_type: string | null; role: string | null; group_id: string }
export interface AttendanceRow { group_id: string; event_id: string; event_date: string; person_id: string }
export interface AssignmentRow { person_id: string; date: string; status: string }
export interface PersonRow { person_id: string; membership: string | null; birthdate: string | null }

export interface Milestones { visited: number; completedSP: number; metPastor: number; serving: number; group: number }
export interface GroupTypeRow { type: string; label: string; groups: number; members: number; avgAtt: number | null }
export interface AgeBand { band: string; count: number; pct: number }

export interface InsightsPayload {
  asOf: string
  assimilation: Record<Campus, Milestones>
  pathway: {
    stages: { key: string; label: string; count: number; mark?: string; shareOfTop?: boolean; note?: string }[]
    context: { members: number; visitors: number; groupLeaders: number; startingPointToMember: number }
  }
  startingPoint: {
    total: Record<Campus, number>
    avgPerWeek: Record<Campus, number>
    byYear: Record<Campus, { year: number; count: number; partial?: boolean }[]>
  }
  groupSnapshot: { people: number; groups: number; memberships: number; avgAttendance: number; byType: GroupTypeRow[] }
  bodyHealth: { coreAdults: number; serving: { count: number; pct: number }; groups: { count: number; groupCount: number; memberships: number } }
  ageProfile: { coverage: number; sample: number; bands: AgeBand[] }
}

/** The assimilation cohort: everyone whose first visit was inside this window. */
export const COHORT_DAYS = 365
/** Attendance averages are "per logged meeting" over this recent stretch, so a
 *  new program year is not averaged against last year's. */
export const ATTENDANCE_DAYS = 45
/** Membership values that count as the committed core. Not the whole database:
 *  Focal Point has 24,000 accumulated person records and about 1,400 people who
 *  are actually members or regular attenders, and every rate on this page is
 *  meaningless against the larger number. */
const CORE_MEMBERSHIPS = ['member', 'regular attender']

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5)

const AGE_BANDS: [string, number, number][] = [
  ['18-24', 18, 24], ['25-34', 25, 34], ['35-44', 35, 44],
  ['45-54', 45, 54], ['55-64', 55, 64], ['65+', 65, 200],
]

/**
 * Planning Center's own type names are not what a pastor calls them.
 *
 * `soleRow` matters for the window between adding the group_type column and
 * the groups job next running: every row has an unknown type, they all collapse
 * into one bucket, and calling that bucket "Other groups" tells the church its
 * entire group ministry is miscellaneous. It is all of them, so say so.
 */
function groupTypeLabel(type: string, soleRow: boolean): string {
  if (/yth|youth/i.test(type)) return 'Youth groups'
  if (/zoom/i.test(type)) return 'Zoom groups'
  if (/prayer/i.test(type)) return 'Prayer groups'
  if (/in person/i.test(type)) return 'Growth groups, in person'
  if (type) return type
  return soleRow ? 'All groups' : 'Other groups'
}

export function buildInsights(input: {
  cards: CardRow[]
  startingPointWorkflows: { id: string; campus: 'english' | 'brazilian'; totalCards: number }[]
  metPastorPersonIds: string[]
  /** Cumulative card totals for the workflows we do not otherwise stage. */
  pathwayTotals: { newMemberClass: number; baptismClass: number }
  groupMembers: GroupMemberRow[]
  attendance: AttendanceRow[]
  assignments: AssignmentRow[]
  people: PersonRow[]
  today: string
}): InsightsPayload {
  const { cards, startingPointWorkflows, metPastorPersonIds, pathwayTotals,
          groupMembers, attendance, assignments, people, today } = input

  const spIds = new Set(startingPointWorkflows.map((w) => w.id))
  const spCards = cards.filter((c) => spIds.has(c.workflow_id))
  const campusOfWorkflow = new Map(startingPointWorkflows.map((w) => [w.id, w.campus]))

  // ── who is in a group, who leads one ──────────────────────────────────────
  const inGroup = new Set<string>()
  const leaders = new Set<string>()
  const groupsById = new Map<string, string>()          // group_id -> type
  const groupIdsByType = new Map<string, Set<string>>()
  const membersByType = new Map<string, number>()
  for (const m of groupMembers) {
    if (!m.person_id) continue
    inGroup.add(m.person_id)
    if ((m.role ?? '').toLowerCase() === 'leader') leaders.add(m.person_id)
    const type = m.group_type ?? ''
    groupsById.set(m.group_id, type)
    let ids = groupIdsByType.get(type)
    if (!ids) { ids = new Set<string>(); groupIdsByType.set(type, ids) }
    ids.add(m.group_id)
    membersByType.set(type, (membersByType.get(type) ?? 0) + 1)
  }

  // ── attended-per-logged-meeting, by type, over the recent stretch ─────────
  const attendedByTypeEvent = new Map<string, Map<string, number>>()
  for (const a of attendance) {
    if (!a.event_date || daysBetween(today, a.event_date) > ATTENDANCE_DAYS) continue
    const type = groupsById.get(a.group_id)
    if (type === undefined) continue
    let events = attendedByTypeEvent.get(type)
    if (!events) { events = new Map<string, number>(); attendedByTypeEvent.set(type, events) }
    events.set(a.event_id, (events.get(a.event_id) ?? 0) + 1)
  }
  const soleType = groupIdsByType.size === 1
  const byType: GroupTypeRow[] = [...groupIdsByType.entries()]
    .map(([type, ids]) => {
      const events = attendedByTypeEvent.get(type)
      // One logged meeting is an anecdote, not an average.
      const avgAtt = events && events.size >= 2
        ? Math.round([...events.values()].reduce((n, v) => n + v, 0) / events.size)
        : null
      return { type, label: groupTypeLabel(type, soleType), groups: ids.size, members: membersByType.get(type) ?? 0, avgAtt }
    })
    .sort((a, b) => b.members - a.members)

  const allEvents = [...attendedByTypeEvent.values()].flatMap((m) => [...m.values()])
  const avgAttendance = allEvents.length ? Math.round(allEvents.reduce((n, v) => n + v, 0) / allEvents.length) : 0

  // ── currently serving ────────────────────────────────────────────────────
  const serving = new Set<string>()
  for (const a of assignments) {
    if (!a.person_id || !a.date) continue
    const status = (a.status ?? '').toUpperCase()
    if (a.date > today) { if (status !== 'D') serving.add(a.person_id) ; continue }
    if (status === 'C') serving.add(a.person_id)
  }

  // ── the committed core, and its ages ─────────────────────────────────────
  const core = people.filter((p) => CORE_MEMBERSHIPS.includes((p.membership ?? '').toLowerCase()))
  const coreIds = new Set(core.map((p) => p.person_id))
  const bandCounts = new Map<string, number>(AGE_BANDS.map(([b]) => [b, 0]))
  let withBirthdate = 0
  for (const p of core) {
    if (!p.birthdate) continue
    const age = Math.floor(daysBetween(today, p.birthdate) / 365.25)
    if (age < 0 || age > 120) continue
    const band = AGE_BANDS.find(([, lo, hi]) => age >= lo && age <= hi)
    // Under 18s in the core are real but are not what an adult age profile is
    // asking about, so they are excluded from the sample rather than binned.
    if (!band) continue
    withBirthdate++
    bandCounts.set(band[0], (bandCounts.get(band[0]) ?? 0) + 1)
  }
  const bands: AgeBand[] = AGE_BANDS.map(([band]) => ({
    band,
    count: bandCounts.get(band) ?? 0,
    pct: withBirthdate ? Math.round(((bandCounts.get(band) ?? 0) / withBirthdate) * 1000) / 10 : 0,
  }))
  let coreServing = 0
  for (const id of coreIds) if (serving.has(id)) coreServing++

  // ── Getting Connected: this year's first visits, followed forward ────────
  const metPastor = new Set(metPastorPersonIds)
  const cohort = new Map<string, { campus: string; completed: boolean }>()
  for (const c of spCards) {
    if (!c.person_id || !c.created_date) continue
    if (daysBetween(today, c.created_date) > COHORT_DAYS) continue
    const campus = campusOfWorkflow.get(c.workflow_id) ?? c.campus
    const prev = cohort.get(c.person_id)
    // A person with two cards counts once, and counts as finished if either did.
    cohort.set(c.person_id, { campus: prev?.campus ?? campus, completed: !!prev?.completed || !!c.completed_date })
  }
  const milestonesFor = (pred: (v: { campus: string }) => boolean): Milestones => {
    let visited = 0, completedSP = 0, mp = 0, srv = 0, grp = 0
    for (const [pid, v] of cohort) {
      if (!pred(v)) continue
      visited++
      if (v.completed) completedSP++
      if (metPastor.has(pid)) mp++
      if (serving.has(pid)) srv++
      if (inGroup.has(pid)) grp++
    }
    return { visited, completedSP, metPastor: mp, serving: srv, group: grp }
  }
  const assimilation: Record<Campus, Milestones> = {
    all: milestonesFor(() => true),
    english: milestonesFor((v) => v.campus === 'english'),
    brazilian: milestonesFor((v) => v.campus === 'brazilian'),
  }

  // ── First-time visitors by year ──────────────────────────────────────────
  const thisYear = Number(today.slice(0, 4))
  const weeksElapsed = Math.max(1, daysBetween(today, `${thisYear}-01-01`) / 7)
  const yearsFor = (pred: (c: CardRow) => boolean) => {
    const counts = new Map<number, number>()
    for (const c of spCards) {
      if (!pred(c) || !c.created_date) continue
      const y = Number(c.created_date.slice(0, 4))
      counts.set(y, (counts.get(y) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count, ...(year === thisYear ? { partial: true } : {}) }))
  }
  const perWeek = (rows: { year: number; count: number }[]) => {
    const cur = rows.find((r) => r.year === thisYear)?.count ?? 0
    return Math.round(cur / weeksElapsed)
  }
  const byYearAll = yearsFor(() => true)
  const byYearEng = yearsFor((c) => (campusOfWorkflow.get(c.workflow_id) ?? c.campus) === 'english')
  const byYearBra = yearsFor((c) => (campusOfWorkflow.get(c.workflow_id) ?? c.campus) === 'brazilian')
  // All-time totals come from the workflow's own card count, which is exact
  // regardless of how far back the card retention window reaches.
  const totalEng = startingPointWorkflows.filter((w) => w.campus === 'english').reduce((n, w) => n + w.totalCards, 0)
  const totalBra = startingPointWorkflows.filter((w) => w.campus === 'brazilian').reduce((n, w) => n + w.totalCards, 0)

  // ── Discipleship Pathway ─────────────────────────────────────────────────
  const spTotal = totalEng + totalBra
  const stages = [
    { key: 'starting_point', label: 'Starting Point', count: spTotal, mark: 'devoted followers',
      note: `Weekend (${totalEng.toLocaleString()}) + Brazilian (${totalBra.toLocaleString()}) service entries` },
    { key: 'new_member_class', label: 'New Member Class', count: pathwayTotals.newMemberClass, mark: 'sacrificial friends' },
    { key: 'baptism', label: 'Baptism Class', count: pathwayTotals.baptismClass, mark: 'courageous witnesses' },
    // A different population from the Starting Point entrants above: plenty of
    // group members never came through Starting Point, so a share of the top
    // row would be a false ratio.
    { key: 'growth_group', label: 'In a Growth Group', count: inGroup.size, mark: 'multiplying disciplers',
      shareOfTop: false,
      note: `In a Growth Group counts everyone in an active group today (${inGroup.size.toLocaleString()} people across ${groupsById.size} groups), not only people who came through Starting Point, so it is not shown as a share of the row above.` },
  ]
  const memberCount = people.filter((p) => (p.membership ?? '').toLowerCase() === 'member').length

  return {
    asOf: today,
    assimilation,
    pathway: {
      stages,
      context: {
        members: memberCount,
        visitors: spTotal,
        groupLeaders: leaders.size,
        startingPointToMember: spTotal ? Math.round((pathwayTotals.newMemberClass / spTotal) * 100) : 0,
      },
    },
    startingPoint: {
      total: { all: spTotal, english: totalEng, brazilian: totalBra },
      avgPerWeek: { all: perWeek(byYearAll), english: perWeek(byYearEng), brazilian: perWeek(byYearBra) },
      byYear: { all: byYearAll, english: byYearEng, brazilian: byYearBra },
    },
    groupSnapshot: {
      people: inGroup.size,
      groups: groupsById.size,
      memberships: groupMembers.length,
      avgAttendance,
      byType,
    },
    bodyHealth: {
      coreAdults: core.length,
      serving: { count: coreServing, pct: core.length ? Math.round((coreServing / core.length) * 100) : 0 },
      groups: { count: inGroup.size, groupCount: groupsById.size, memberships: groupMembers.length },
    },
    ageProfile: {
      coverage: core.length ? Math.round((withBirthdate / core.length) * 100) : 0,
      sample: withBirthdate,
      bands,
    },
  }
}
