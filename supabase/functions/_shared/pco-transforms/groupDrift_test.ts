import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeGroupDrift } from './groupDrift.ts'
import type { GroupInput } from './groupDrift.ts'

const cfg = { seasonStart: '2025-09-01', seasonEnd: '2026-05-31', minEvents: 4, minAttendance: 5, minGapWeeks: 3, groupTypeMatch: 'growth group' }
// Group with 5 events (desc). last3 = e5,e4,e3.
const evs = [
  { id: 'e5', date: '2026-05-24' }, { id: 'e4', date: '2026-05-17' }, { id: 'e3', date: '2026-05-10' },
  { id: 'e2', date: '2026-05-03' }, { id: 'e1', date: '2026-04-26' },
]
const group: GroupInput = {
  name: "Oscar Mens' Group",
  events: evs,
  attendanceByPid: {
    drifter:   ['2026-04-26', '2026-05-03', '2026-04-19', '2026-04-12', '2026-04-05'], // 5 attends, none in last3, gap >= 3wk
    returned:  ['2026-04-26', '2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24'], // attended last3 -> excluded
    thin:      ['2026-04-26', '2026-05-03'],                                            // < minAttendance -> excluded
    oscar:     ['2026-04-26', '2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24'], // leader-of-own-group: token in name -> excluded
  },
  members: [
    { pid: 'drifter', name: 'Liam Secord' },
    { pid: 'returned', name: 'Nate Rowe' },
    { pid: 'thin', name: 'Sam Diaz' },
    { pid: 'oscar', name: 'Oscar Blake' }, // leader-of-own-group: token "oscar" in group name -> excluded
  ],
}

Deno.test('flags a drifter, excludes returned/thin/leader', () => {
  const out = computeGroupDrift([group], cfg)
  assertEquals(out.people.map((p) => p.name), ['Liam Secord'])
  assertEquals(out.people[0].attended, 5)
  assertEquals(out.groups, 1)
  assertEquals(out.flagged, 1)
})
