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

// ── families group by HOUSEHOLD, not by surname string ─────────────────────
// Both directions were live on Focal Point: "Farmer" / "Farmer jr" split one
// household into two flagged families, and two unrelated households sharing a
// surname would have merged into one, putting another family's child in the
// drafted note.
Deno.test('one household with mismatched surnames is ONE family', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'Layla', last: 'Farmer', checkin_date: '2026-08-09', kind: '', household_id: 'h1' },
    { person_id: 'p2', first: 'Marcus', last: 'Farmer jr', checkin_date: '2026-08-02', kind: '', household_id: 'h1' },
  ])
  assertEquals(fams.length, 1)
  assertEquals(fams[0].kids.length, 2)
  // Sundays pool, so tenure is no longer split across two rows.
  assertEquals(fams[0].sundays.length, 2)
})

Deno.test('two households sharing a surname stay SEPARATE families', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'Ann', last: 'Smith', checkin_date: '2026-08-09', kind: '', household_id: 'h1' },
    { person_id: 'p2', first: 'Bob', last: 'Smith', checkin_date: '2026-08-09', kind: '', household_id: 'h2' },
  ])
  assertEquals(fams.length, 2)
})

Deno.test('no household id falls back to surname grouping', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'Ann', last: 'Jones', checkin_date: '2026-08-09', kind: '' },
    { person_id: 'p2', first: 'Bob', last: 'Jones', checkin_date: '2026-08-02', kind: '' },
  ])
  assertEquals(fams.length, 1)
})

Deno.test('lowercase surnames are title-cased before they reach a note', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'noah', last: 'nunes', checkin_date: '2026-08-09', kind: '', household_id: 'h9' },
  ])
  assertEquals(fams[0].family, 'Nunes')
  assertEquals(fams[0].kids[0], 'noah Nunes')
})

// ── blended households take the household's name, kids keep their own ──────
// Chloe Battaglia is in the Medina Household with Marleen Medina. Naming the
// family after the first child made it "the Battaglia family" when the church
// calls them Medina.
Deno.test('family is named after the household, children keep their surnames', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'Chloe', last: 'Battaglia', checkin_date: '2026-07-05', kind: '',
      household_id: 'h7', household_name: 'Medina Household' },
    { person_id: 'p2', first: 'Marleen', last: 'Medina', checkin_date: '2026-07-05', kind: '',
      household_id: 'h7', household_name: 'Medina Household' },
  ])
  assertEquals(fams.length, 1)
  assertEquals(fams[0].family, 'Medina')
  assertEquals(fams[0].kids.sort(), ['Chloe Battaglia', 'Marleen Medina'])
})

Deno.test('household name falls back to the surname when absent', () => {
  const fams = checkinsToFamilies([
    { person_id: 'p1', first: 'Gabriel', last: 'sims', checkin_date: '2026-08-09', kind: '', household_id: 'h1' },
  ])
  assertEquals(fams[0].family, 'Sims')
})
