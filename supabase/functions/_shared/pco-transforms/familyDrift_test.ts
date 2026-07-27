import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkinsToFamilies, computeFamilyDrift } from './familyDrift.ts'

Deno.test('checkinsToFamilies groups by surname, pools distinct Sundays', () => {
  const rows = [
    { person_id: 'a', first: 'Theo', last: 'Mendes', checkin_date: '2026-05-03', kind: 'Regular' },
    { person_id: 'b', first: 'Ana', last: 'Mendes', checkin_date: '2026-05-03', kind: 'Regular' },
    { person_id: 'a', first: 'Theo', last: 'Mendes', checkin_date: '2026-05-10', kind: 'Regular' },
  ]
  const fams = checkinsToFamilies(rows)
  assertEquals(fams.length, 1)
  assertEquals(fams[0].family, 'Mendes')
  assertEquals(fams[0].kids.sort(), ['Ana Mendes', 'Theo Mendes'])
  assertEquals(fams[0].sundays.sort(), ['2026-05-03', '2026-05-10'])
})

Deno.test('computeFamilyDrift flags established-then-quiet, excludes first-timers', () => {
  const cfg = { windowMonths: 10, sundaysMissed: 3, minEstablishedSundays: 5 }
  const today = '2026-07-27' // most recent Sunday on/before = 2026-07-26
  const fams = [
    // established (6 Sundays) and quiet since 2026-06-14 -> missed 6 Sundays -> FLAGGED
    { family: 'Drifter', kids: ['Kid D'], sundays: ['2026-04-05', '2026-04-12', '2026-05-03', '2026-05-31', '2026-06-07', '2026-06-14'] },
    // established but attended last Sunday -> not quiet -> not flagged
    { family: 'Regular', kids: ['Kid R'], sundays: ['2026-06-07', '2026-06-14', '2026-06-21', '2026-07-05', '2026-07-19', '2026-07-26'] },
    // only 2 Sundays -> first-timer/occasional -> excluded
    { family: 'Newcomer', kids: ['Kid N'], sundays: ['2026-07-19', '2026-07-26'] },
  ]
  const out = computeFamilyDrift(fams, cfg, today)
  assertEquals(out.families.map((f) => f.family), ['Drifter'])
  assertEquals(out.flaggedFamilies, 1)
  assertEquals(out.flaggedKids, 1)
  assertEquals(out.onboardingExcluded, 1)
  assertEquals(out.windowMonths, 10)
  assertEquals(out.families[0].totalSundays, 6)
  assertEquals(out.families[0].lastSeen, '2026-06-14')
})
