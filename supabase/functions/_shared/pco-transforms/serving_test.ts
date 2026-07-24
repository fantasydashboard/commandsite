import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeServing, computeBurnout } from './serving.ts'
import type { ByPerson, PcoConfig } from './types.ts'

const sched = JSON.parse(await Deno.readTextFile('scratchpad/pco-raw/serving_schedule.json'))
const staffArr: string[] = JSON.parse(await Deno.readTextFile('scratchpad/pco-raw/staff.json'))
const byPerson: ByPerson = sched.byPerson
const staff = new Set(staffArr)
const cfg: PcoConfig = {
  staffNames: staffArr,
  serving: { regularMin: 4, gapWeeks: 6, lookbackMonths: 7 },
  burnout: { seasonMonths: 6 },
  groupDrift: { seasonStart: '2025-09-01', seasonEnd: '2026-05-31', minEvents: 4, minAttendance: 5, minGapWeeks: 3, groupTypeMatch: 'growth group' },
}
const TODAY = '2026-07-16' // pin to the fixture's era for a deterministic assertion

Deno.test('computeServing flags regular servers with a 6+ week gap and nothing upcoming', () => {
  const out = computeServing(byPerson, staff, cfg.serving, TODAY)
  assert(out.people.length > 0)
  assertEquals(out.drafts, [])
  // No flagged person is staff; all have >= regularMin served and >= gapWeeks since.
  for (const p of out.people) {
    assert(!staff.has(p.name))
    assert(p.totalServed >= 4)
    assert(p.weeksSince >= 6)
    assert(['english', 'brazilian', 'both'].includes(p.campus))
  }
  // Sorted by totalServed desc.
  for (let i = 1; i < out.people.length; i++) assert(out.people[i - 1].totalServed >= out.people[i].totalServed)
})

Deno.test('computeBurnout flags 3+/month or 2+ teams, tiers high at 4+/3+', () => {
  const out = computeBurnout(byPerson, staff, cfg.burnout, TODAY)
  assert(out.people.length > 0)
  for (const p of out.people) {
    assert(!staff.has(p.name))
    assert(p.perMonth >= 3 || p.areas.length >= 2)
    assertEquals(p.tier, p.perMonth >= 4 || p.areas.length >= 3 ? 'high' : 'medium')
  }
  assertEquals(out.highRisk, out.people.filter((p) => p.tier === 'high').length)
})
