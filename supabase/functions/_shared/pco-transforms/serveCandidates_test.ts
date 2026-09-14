import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildServeCandidates, type KidsCheckinRow, type GroupMemberRow, type AssignmentRow } from './serveCandidates.ts'

const TODAY = '2026-09-14'
const base = {
  kids: [] as KidsCheckinRow[],
  groupMembers: [] as GroupMemberRow[],
  assignments: [] as AssignmentRow[],
  people: [] as { person_id: string; name: string }[],
  staffNames: [] as string[],
  today: TODAY,
}
const kid = (by: string | null, date: string): KidsCheckinRow => ({ person_id: 'child', checkin_date: date, checked_in_by: by })
const member = (pid: string, name: string, group: string): GroupMemberRow => ({ person_id: pid, name, group_name: group })

Deno.test('group + drop-off is tier 1, group only is tier 2, drop-off only is tier 3', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', "Dave's Group"), member('b', 'Bo Lane', "Dave's Group")],
    kids: [kid('a', '2026-09-06'), kid('c', '2026-09-06')],
    people: [{ person_id: 'c', name: 'Cy Ford' }],
  })
  const by = Object.fromEntries(p.people.map((c) => [c.name, c]))
  assertEquals(by['Ann Reed'].tier, 1)
  assertEquals(by['Bo Lane'].tier, 2)
  assertEquals(by['Cy Ford'].tier, 3)
  assertEquals(p.totals, { tier1: 1, tier2: 1, tier3: 1, all: 3 })
})

Deno.test('sundays counts DISTINCT days, so two children on one morning is one appearance', () => {
  const p = buildServeCandidates({
    ...base,
    people: [{ person_id: 'a', name: 'Ann Reed' }],
    kids: [kid('a', '2026-09-06'), kid('a', '2026-09-06'), kid('a', '2026-08-30')],
  })
  assertEquals(p.people[0].sundays, 2)
})

Deno.test('drop-offs outside the window do not count', () => {
  const p = buildServeCandidates({
    ...base,
    people: [{ person_id: 'a', name: 'Ann Reed' }],
    kids: [kid('a', '2026-01-04')], // ~253 days ago
  })
  assertEquals(p.people.length, 0)
  assertEquals(p.totals.all, 0)
})

// The whole point of the list is people who serve on NOTHING.
Deno.test('a confirmed shift inside the window excludes them', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', "Dave's Group")],
    assignments: [{ person_id: 'a', date: '2026-08-30', status: 'C' }],
  })
  assertEquals(p.people.length, 0)
})
Deno.test('an upcoming shift excludes them, a declined one does not', () => {
  const upcoming = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', "Dave's Group")],
    assignments: [{ person_id: 'a', date: '2026-09-20', status: 'U' }],
  })
  assertEquals(upcoming.people.length, 0)
  const declined = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', "Dave's Group")],
    assignments: [{ person_id: 'a', date: '2026-09-20', status: 'D' }],
  })
  assertEquals(declined.people.length, 1)
})
// Someone who served last spring and stopped is a Care & Drift case, not a
// person to ask, so an OLD shift must not exclude them.
Deno.test('a shift older than the window does not exclude them', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', "Dave's Group")],
    assignments: [{ person_id: 'a', date: '2026-01-04', status: 'C' }],
  })
  assertEquals(p.people.length, 1)
})

// The bug that put Kristen Wiggins and Alyssa Daniel in front of the church as
// people to ask: the local script never applied the staff list.
Deno.test('staff are excluded, case and spacing insensitive', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Kristen Wiggins', "Zoom Prayer"), member('b', 'Ann Reed', "Zoom Prayer")],
    staffNames: ['  kristen   wiggins '],
  })
  assertEquals(p.people.map((c) => c.name), ['Ann Reed'])
})

Deno.test('a self check-in with no adult is not a drop-off signal', () => {
  const p = buildServeCandidates({ ...base, people: [{ person_id: 'a', name: 'Ann Reed' }], kids: [kid(null, '2026-09-06')] })
  assertEquals(p.totals.all, 0)
})

Deno.test('someone with no name anywhere is not a row a human can act on', () => {
  const p = buildServeCandidates({ ...base, kids: [kid('ghost', '2026-09-06')] })
  assertEquals(p.totals.all, 0)
})

Deno.test('ranked by tier, then by Sundays present', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', 'G'), member('b', 'Bo Lane', 'G')],
    kids: [kid('a', '2026-09-06'), kid('b', '2026-09-06'), kid('b', '2026-08-30'), kid('b', '2026-08-23')],
  })
  assertEquals(p.people.map((c) => c.name), ['Bo Lane', 'Ann Reed'])
})

Deno.test('groups are listed and deduped', () => {
  const p = buildServeCandidates({
    ...base,
    groupMembers: [member('a', 'Ann Reed', 'Zoom Prayer'), member('a', 'Ann Reed', 'Zoom Prayer'), member('a', 'Ann Reed', "Dave's Group")],
  })
  assertEquals(p.people[0].groups, ["Dave's Group", 'Zoom Prayer'])
})

// Tier 1 ships whole; the wide tiers are capped but the totals stay exact.
Deno.test('tier 2 is capped in the list and exact in the totals', () => {
  const groupMembers: GroupMemberRow[] = []
  for (let i = 0; i < 200; i++) groupMembers.push(member(`p${i}`, `Person ${String(i).padStart(3, '0')}`, 'G'))
  const p = buildServeCandidates({ ...base, groupMembers })
  assertEquals(p.totals.tier2, 200)
  assertEquals(p.people.filter((c) => c.tier === 2).length, 120)
})
