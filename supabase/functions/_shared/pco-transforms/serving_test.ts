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

// ── a retired service is not a roster full of drifters ────────────────────
// Focal Point discontinued its 4th Service. Every volunteer on its teams
// stopped being scheduled the same weekend and each then tripped the "no shift
// in 6+ weeks" rule, so Grace flagged them individually and would have sent
// three ministry leaders after people who never quit.
Deno.test('a team where nobody still serves is dormant, and its people are not flagged', () => {
  const cfg = { regularMin: 3, gapWeeks: 6 } as any
  const byPerson = {
    a: { name: 'Thays Rosa', dates: [
      { date: '2026-07-05', team: 'Vocals 4th Service', status: 'C' },
      { date: '2026-06-28', team: 'Vocals 4th Service', status: 'C' },
      { date: '2026-06-21', team: 'Vocals 4th Service', status: 'C' },
    ] },
    b: { name: 'Tania Santana', dates: [
      { date: '2026-07-05', team: 'Vocals 4th Service', status: 'C' },
      { date: '2026-06-28', team: 'Vocals 4th Service', status: 'C' },
      { date: '2026-06-21', team: 'Vocals 4th Service', status: 'C' },
    ] },
  } as any
  const out = computeServing(byPerson, new Set(), cfg, '2026-09-08')
  assertEquals(out.people.length, 0)
  assertEquals(out.retiredTeamExcluded, 2)
  assertEquals(out.retiredTeams?.includes('Vocals 4th Service'), true)
})

// The team list must describe the EXCLUDED people, not every dormant team, or
// it reads as though one person served on nine teams.
Deno.test('retiredTeams lists only teams behind an exclusion', () => {
  const cfg = { regularMin: 3, gapWeeks: 6 } as any
  const byPerson = {
    // Dormant team, but this person is under regularMin so is never flagged and
    // never excluded. Their team must not appear in the reported list.
    rare: { name: 'Rare Server', dates: [{ date: '2026-05-03', team: 'Ghost Team', status: 'C' }] },
    gone: { name: 'Gone Person', dates: [
      { date: '2026-07-05', team: 'Retired Team', status: 'C' },
      { date: '2026-06-28', team: 'Retired Team', status: 'C' },
      { date: '2026-06-21', team: 'Retired Team', status: 'C' },
    ] },
  } as any
  const out = computeServing(byPerson, new Set(), cfg, '2026-09-08')
  assertEquals(out.retiredTeamExcluded, 1)
  assertEquals(out.retiredTeams, ['Retired Team'])
})

Deno.test('a person on a LIVE team is still flagged when they personally stop', () => {
  const cfg = { regularMin: 3, gapWeeks: 6 } as any
  const byPerson = {
    quit: { name: 'Quit Person', dates: [
      { date: '2026-07-05', team: 'Greeters', status: 'C' },
      { date: '2026-06-28', team: 'Greeters', status: 'C' },
      { date: '2026-06-21', team: 'Greeters', status: 'C' },
    ] },
    // Keeps Greeters alive, so the team is not dormant.
    still: { name: 'Still Serving', dates: [
      { date: '2026-09-06', team: 'Greeters', status: 'C' },
      { date: '2026-08-30', team: 'Greeters', status: 'C' },
      { date: '2026-08-23', team: 'Greeters', status: 'C' },
    ] },
  } as any
  const out = computeServing(byPerson, new Set(), cfg, '2026-09-08')
  assertEquals(out.people.map((p) => p.name), ['Quit Person'])
  assertEquals(out.retiredTeamExcluded, 0)
})
