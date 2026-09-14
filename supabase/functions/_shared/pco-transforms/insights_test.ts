import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildInsights, type CardRow, type GroupMemberRow, type PersonRow, type AttendanceRow } from './insights.ts'

const TODAY = '2026-09-14'
const SP = [
  { id: 'wf-eng', campus: 'english' as const, totalCards: 2280 },
  { id: 'wf-bra', campus: 'brazilian' as const, totalCards: 231 },
]
const base = {
  cards: [] as CardRow[],
  startingPointWorkflows: SP,
  metPastorPersonIds: [] as string[],
  pathwayTotals: { newMemberClass: 535, baptismClass: 129 },
  groupMembers: [] as GroupMemberRow[],
  attendance: [] as AttendanceRow[],
  assignments: [] as { person_id: string; date: string; status: string }[],
  people: [] as PersonRow[],
  today: TODAY,
}
const card = (o: Partial<CardRow>): CardRow => ({ workflow_id: 'wf-eng', campus: 'english', person_id: 'p1', created_date: '2026-09-06', completed_date: null, ...o })
const mem = (o: Partial<GroupMemberRow>): GroupMemberRow => ({ person_id: 'p1', group_id: 'g1', group_name: 'G', group_type: 'In Person - Growth Groups', role: 'member', ...o })

// ── Getting Connected ──────────────────────────────────────────────────────
Deno.test('the cohort is followed forward into each milestone', () => {
  const p = buildInsights({
    ...base,
    cards: [card({ person_id: 'a', completed_date: '2026-09-10' }), card({ person_id: 'b' })],
    metPastorPersonIds: ['a'],
    groupMembers: [mem({ person_id: 'b' })],
    assignments: [{ person_id: 'a', date: '2026-09-06', status: 'C' }],
  })
  assertEquals(p.assimilation.all, { visited: 2, completedSP: 1, metPastor: 1, serving: 1, group: 1 })
})
Deno.test('first visits older than the cohort window are not counted', () => {
  const p = buildInsights({ ...base, cards: [card({ created_date: '2024-01-07' })] })
  assertEquals(p.assimilation.all.visited, 0)
})
Deno.test('two cards for one person count once, and finished if either did', () => {
  const p = buildInsights({
    ...base,
    cards: [card({ person_id: 'a' }), card({ person_id: 'a', completed_date: '2026-09-10' })],
  })
  assertEquals(p.assimilation.all.visited, 1)
  assertEquals(p.assimilation.all.completedSP, 1)
})
Deno.test('the cohort splits by which workflow they came through', () => {
  const p = buildInsights({
    ...base,
    cards: [card({ person_id: 'a' }), card({ person_id: 'b', workflow_id: 'wf-bra', campus: 'brazilian' })],
  })
  assertEquals(p.assimilation.english.visited, 1)
  assertEquals(p.assimilation.brazilian.visited, 1)
  assertEquals(p.assimilation.all.visited, 2)
})

// ── First-time visitors ────────────────────────────────────────────────────
Deno.test('all-time totals come from the workflow count, not the retained cards', () => {
  // Only one card staged, but the workflow knows it has issued 2,511.
  const p = buildInsights({ ...base, cards: [card({})] })
  assertEquals(p.startingPoint.total, { all: 2511, english: 2280, brazilian: 231 })
})
Deno.test('by-year counts come from the cards, and this year is marked partial', () => {
  const p = buildInsights({
    ...base,
    cards: [card({ person_id: 'a', created_date: '2025-03-02' }), card({ person_id: 'b', created_date: '2026-03-01' }), card({ person_id: 'c', created_date: '2026-04-05' })],
  })
  assertEquals(p.startingPoint.byYear.all, [
    { year: 2025, count: 1 },
    { year: 2026, count: 2, partial: true },
  ])
})

// ── Discipleship Pathway ───────────────────────────────────────────────────
// The row used to read 103: a Jan 2023 cohort of 54 people who had a growth
// group plus 49 who did not, summed and labelled "In a Growth Group".
Deno.test('In a Growth Group is live group membership, with no false ratio', () => {
  const p = buildInsights({
    ...base,
    groupMembers: [mem({ person_id: 'a' }), mem({ person_id: 'b' }), mem({ person_id: 'b', group_id: 'g2' })],
  })
  const gg = p.pathway.stages.find((s) => s.key === 'growth_group')!
  assertEquals(gg.count, 2)          // two people, three memberships
  assertEquals(gg.shareOfTop, false)
})
Deno.test('group leaders are counted from the membership role', () => {
  const p = buildInsights({
    ...base,
    groupMembers: [mem({ person_id: 'a', role: 'leader' }), mem({ person_id: 'b', role: 'member' }), mem({ person_id: 'a', group_id: 'g2', role: 'leader' })],
  })
  assertEquals(p.pathway.context.groupLeaders, 1)
})
Deno.test('Starting Point to member is a percentage of the all-time total', () => {
  const p = buildInsights({ ...base })
  assertEquals(p.pathway.context.startingPointToMember, Math.round((535 / 2511) * 100))
})

// ── Growth Groups ──────────────────────────────────────────────────────────
Deno.test('groups break down by Planning Center type, with readable labels', () => {
  const p = buildInsights({
    ...base,
    groupMembers: [
      mem({ person_id: 'a', group_id: 'g1', group_type: 'In Person - Growth Groups' }),
      mem({ person_id: 'b', group_id: 'g2', group_type: 'YTH Growth Groups' }),
      mem({ person_id: 'c', group_id: 'g2', group_type: 'YTH Growth Groups' }),
    ],
  })
  const labels = p.groupSnapshot.byType.map((t) => t.label)
  assertEquals(labels.includes('Youth groups'), true)
  assertEquals(labels.includes('Growth groups, in person'), true)
  assertEquals(p.groupSnapshot.people, 3)
  assertEquals(p.groupSnapshot.groups, 2)
})
Deno.test('an average needs two logged meetings, otherwise it is not claimed', () => {
  const one = buildInsights({
    ...base,
    groupMembers: [mem({ group_id: 'g1' })],
    attendance: [{ group_id: 'g1', event_id: 'e1', event_date: '2026-09-07', person_id: 'x' }],
  })
  assertEquals(one.groupSnapshot.byType[0].avgAtt, null)
  const two = buildInsights({
    ...base,
    groupMembers: [mem({ group_id: 'g1' })],
    attendance: [
      { group_id: 'g1', event_id: 'e1', event_date: '2026-09-07', person_id: 'x' },
      { group_id: 'g1', event_id: 'e1', event_date: '2026-09-07', person_id: 'y' },
      { group_id: 'g1', event_id: 'e2', event_date: '2026-08-31', person_id: 'x' },
    ],
  })
  assertEquals(two.groupSnapshot.byType[0].avgAtt, 2) // (2 + 1) / 2 meetings
})
Deno.test('attendance older than the recent stretch is not averaged in', () => {
  const p = buildInsights({
    ...base,
    groupMembers: [mem({ group_id: 'g1' })],
    attendance: [
      { group_id: 'g1', event_id: 'e1', event_date: '2026-01-05', person_id: 'x' },
      { group_id: 'g1', event_id: 'e2', event_date: '2026-01-12', person_id: 'y' },
    ],
  })
  assertEquals(p.groupSnapshot.byType[0].avgAtt, null)
})

// ── Body Health + Age Profile ──────────────────────────────────────────────
// Not the 24,000 accumulated records; the people who are actually here.
Deno.test('the core is members and regular attenders only', () => {
  const p = buildInsights({
    ...base,
    people: [
      { person_id: 'a', membership: 'Member', birthdate: '1980-05-01' },
      { person_id: 'b', membership: 'Regular Attender', birthdate: null },
      { person_id: 'c', membership: 'Visitor', birthdate: '1990-01-01' },
      { person_id: 'd', membership: null, birthdate: null },
    ],
  })
  assertEquals(p.bodyHealth.coreAdults, 2)
  assertEquals(p.pathway.context.members, 1)
})
Deno.test('serving percentage is of the core, not of everyone', () => {
  const p = buildInsights({
    ...base,
    people: [
      { person_id: 'a', membership: 'Member', birthdate: null },
      { person_id: 'b', membership: 'Member', birthdate: null },
      { person_id: 'z', membership: 'Visitor', birthdate: null },
    ],
    assignments: [{ person_id: 'a', date: '2026-09-06', status: 'C' }, { person_id: 'z', date: '2026-09-06', status: 'C' }],
  })
  assertEquals(p.bodyHealth.serving, { count: 1, pct: 50 })
})
Deno.test('age bands are a percentage of those WITH a birthdate, and coverage is stated', () => {
  const p = buildInsights({
    ...base,
    people: [
      { person_id: 'a', membership: 'Member', birthdate: '1990-01-01' }, // 36
      { person_id: 'b', membership: 'Member', birthdate: '1980-01-01' }, // 46
      { person_id: 'c', membership: 'Member', birthdate: null },
      { person_id: 'd', membership: 'Member', birthdate: null },
    ],
  })
  assertEquals(p.ageProfile.sample, 2)
  assertEquals(p.ageProfile.coverage, 50)
  assertEquals(p.ageProfile.bands.find((b) => b.band === '35-44')!.pct, 50)
  assertEquals(p.ageProfile.bands.find((b) => b.band === '45-54')!.pct, 50)
})
Deno.test('a child in the core is left out of the adult age sample', () => {
  const p = buildInsights({
    ...base,
    people: [
      { person_id: 'a', membership: 'Member', birthdate: '1990-01-01' },
      { person_id: 'kid', membership: 'Member', birthdate: '2016-01-01' },
    ],
  })
  assertEquals(p.ageProfile.sample, 1)
})
