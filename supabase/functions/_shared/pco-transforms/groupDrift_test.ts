import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeGroupDrift } from './groupDrift.ts'
import type { GroupInput } from './groupDrift.ts'

const cfg = { seasonStart: '2025-09-01', seasonEnd: '2026-05-31', minEvents: 4, minAttendance: 5, minGapWeeks: 3, groupTypeMatch: 'growth group' }

// 8 in-season events, descending. The >3-week gap between E2 (05-17) and E3 (04-19)
// is deliberate: it lets a member who attended a last-3 event (E3) still have a large
// gap, so the "attended one of the last 3" rule can be tested in isolation from the
// gap rule (otherwise the two always fire together and neither is really tested).
const events = [
  { id: 'E1', date: '2026-05-24' },
  { id: 'E2', date: '2026-05-17' },
  { id: 'E3', date: '2026-04-19' },
  { id: 'E4', date: '2026-04-12' },
  { id: 'E5', date: '2026-04-05' },
  { id: 'E6', date: '2026-03-29' },
  { id: 'E7', date: '2026-03-22' },
  { id: 'E8', date: '2026-03-15' },
]
// last 3 in-season events = E1, E2, E3 = 2026-05-24, 2026-05-17, 2026-04-19

const group: GroupInput = {
  name: "Young Adult - Oscar Mens' Group",
  events,
  attendanceByPid: {
    // 5 attendances, none in the last 3, last attendance 04-12 (gap 6 weeks) -> FLAGGED
    drifter: ['2026-04-12', '2026-04-05', '2026-03-29', '2026-03-22', '2026-03-15'],
    // only 2 attendances -> excluded by minAttendance ALONE (otherwise would flag: none in last 3, gap 6 weeks)
    thin: ['2026-04-12', '2026-04-05'],
    // 5 attendances but most recent (04-19 = E3) is in the last 3 -> excluded by the last-3 rule ALONE
    // (gap from 04-19 to 05-24 is 5 weeks >= 3, so the gap rule alone would still flag them)
    returned: ['2026-04-19', '2026-04-12', '2026-04-05', '2026-03-29', '2026-03-22'],
    // 5 attendances, none in last 3, gap 6 weeks -> would flag; excluded by leader-of-own-group rule ALONE
    // (name token "oscar" appears in the group name)
    oscar: ['2026-04-12', '2026-04-05', '2026-03-29', '2026-03-22', '2026-03-15'],
  },
  members: [
    { pid: 'drifter', name: 'Liam Secord' },
    { pid: 'thin', name: 'Sam Diaz' },
    { pid: 'returned', name: 'Nate Rowe' },
    { pid: 'oscar', name: 'Oscar Blake' },
  ],
}

Deno.test('flags only the drifter; minAttendance, last-3, and leader exclusions are each isolated', () => {
  const out = computeGroupDrift([group], cfg)
  assertEquals(out.people.map((p) => p.name), ['Liam Secord'])
  assertEquals(out.groups, 1)
  assertEquals(out.flagged, 1)
  assertEquals(out.people[0].attended, 5)
  assertEquals(out.people[0].weeksSince, 6)
  // group-name normalization: dash becomes middot
  assertEquals(out.people[0].group, 'Young Adult · Oscar Mens\' Group')
})
