import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { assignmentsToByPerson, groupRowsToInputs } from './fromStaging.ts'

Deno.test('assignmentsToByPerson groups by person, dates desc', () => {
  const rows = [
    { person_id: 'p1', name: 'Ann', date: '2026-05-03', team: 'Kids', status: 'C' },
    { person_id: 'p1', name: 'Ann', date: '2026-05-10', team: 'Kids', status: 'C' },
    { person_id: 'p2', name: 'Bob', date: '2026-05-03', team: 'Parking', status: 'U' },
  ]
  const bp = assignmentsToByPerson(rows)
  assertEquals(Object.keys(bp).sort(), ['p1', 'p2'])
  assertEquals(bp.p1.name, 'Ann')
  assertEquals(bp.p1.dates.map((d) => d.date), ['2026-05-10', '2026-05-03']) // desc
  assertEquals(bp.p2.dates[0].status, 'U')
})

Deno.test('groupRowsToInputs builds events, attendanceByPid, members', () => {
  const att = [
    { group_id: 'g1', group_name: 'Mens Group', event_id: 'e1', event_date: '2026-05-10', person_id: 'p1', name: 'Ann' },
    { group_id: 'g1', group_name: 'Mens Group', event_id: 'e2', event_date: '2026-05-17', person_id: 'p1', name: 'Ann' },
  ]
  const mem = [{ group_id: 'g1', group_name: 'Mens Group', person_id: 'p1', name: 'Ann' }]
  const gi = groupRowsToInputs(att, mem)
  assertEquals(gi.length, 1)
  assertEquals(gi[0].name, 'Mens Group')
  assertEquals(gi[0].events.map((e) => e.date), ['2026-05-17', '2026-05-10']) // desc
  assertEquals(gi[0].attendanceByPid.p1.sort(), ['2026-05-10', '2026-05-17'])
  assertEquals(gi[0].members, [{ pid: 'p1', name: 'Ann' }])
})
