import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildRoster, type PlanSnapshot, type ServingRow } from './roster.ts'

const TODAY = '2026-08-27'

function plan(over: Partial<PlanSnapshot>): PlanSnapshot {
  return { date: '2026-08-30', teams: {}, need: {}, positions: {}, ...over }
}
function served(name: string, team: string, dates: string[], status = 'C'): ServingRow[] {
  return dates.map((date) => ({ person_id: name, name, team, date, status }))
}

// ── baseline: which teams normally run ──────────────────────────────────────
Deno.test('a team present in most past plans is expected; a rare one is not', () => {
  const past = [
    plan({ teams: { Ushers: { C: 2, U: 0, D: 0, total: 2 }, Band: { C: 1, U: 0, D: 0, total: 1 } } }),
    plan({ teams: { Ushers: { C: 2, U: 0, D: 0, total: 2 } } }),
    plan({ teams: { Ushers: { C: 2, U: 0, D: 0, total: 2 } } }),
  ]
  const r = buildRoster({ past, future: [plan({})], serving: [], today: TODAY })
  assertEquals(r.forward.expected.includes('Ushers'), true)
  // Band appeared once in three, below the 0.6 bar.
  assertEquals(r.forward.expected.includes('Band'), false)
})

// ── flags ───────────────────────────────────────────────────────────────────
Deno.test('flags follow scheduled vs needed', () => {
  const past = Array.from({ length: 3 }, () => plan({ teams: { Ushers: { C: 1, U: 0, D: 0, total: 1 } } }))
  const future = [plan({
    date: '2026-08-30',
    teams: { Ushers: { C: 1, U: 0, D: 0, total: 1 } },
    need: { Ushers: 2 },
  })]
  const wk = buildRoster({ past, future, serving: [], today: TODAY }).forward.weeks[0]
  assertEquals(wk.teams[0].flag, 'short')
  assertEquals(wk.teams[0].need, 2)
})
Deno.test('nobody scheduled and nobody needed is forgotten, not empty', () => {
  const past = Array.from({ length: 3 }, () => plan({ teams: { Ushers: { C: 1, U: 0, D: 0, total: 1 } } }))
  const future = [plan({ teams: {}, need: {} })]
  assertEquals(buildRoster({ past, future, serving: [], today: TODAY }).forward.weeks[0].teams[0].flag, 'forgotten')
})
Deno.test('needed with nobody scheduled is empty', () => {
  const past = Array.from({ length: 3 }, () => plan({ teams: { Ushers: { C: 1, U: 0, D: 0, total: 1 } } }))
  const future = [plan({ teams: {}, need: { Ushers: 4 } })]
  assertEquals(buildRoster({ past, future, serving: [], today: TODAY }).forward.weeks[0].teams[0].flag, 'empty')
})

// ── the roster card: gaps for the NEXT Sunday only ──────────────────────────
Deno.test('gaps come from the first future plan and total correctly', () => {
  const future = [
    plan({ date: '2026-08-30', need: { Ushers: 2, 'Safety Team': 6 } }),
    plan({ date: '2026-09-06', need: { Ushers: 99 } }),
  ]
  const r = buildRoster({ past: [], future, serving: [], today: TODAY })
  assertEquals(r.roster.date, '2026-08-30')
  assertEquals(r.roster.totalShort, 8)
  assertEquals(r.roster.teamsShort, 2)
  // Biggest gap first, so the worst team is the one you read.
  assertEquals(r.roster.gaps[0].team, 'Safety Team')
})

// ── suggestions: the whole promise is that they are burnout-aware ───────────
Deno.test('suggests people who served that team and are not over-serving', () => {
  const future = [plan({ need: { Ushers: 1 } })]
  const serving = [
    // Light: served Ushers twice in the season.
    ...served('Light Lucy', 'Ushers', ['2026-08-02', '2026-08-16']),
    // Heavy: 3+ a month on Ushers, must never be suggested.
    ...served('Heavy Hank', 'Ushers', ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23']),
  ]
  const r = buildRoster({ past: [], future, serving, today: TODAY })
  const g = r.roster.gaps[0]
  assertEquals(g.suggest.includes('Light Lucy'), true)
  assertEquals(g.suggest.includes('Heavy Hank'), false)
  // The over-server is surfaced as the explicit do-not-ask.
  assertEquals(g.skip?.name, 'Heavy Hank')
})
Deno.test('someone who never served that team is never suggested for it', () => {
  const future = [plan({ need: { Ushers: 1 } })]
  const serving = served('Band Only', 'Band', ['2026-08-02'])
  const g = buildRoster({ past: [], future, serving, today: TODAY }).roster.gaps[0]
  assertEquals(g.suggest.length, 0)
  // pool 0 is meaningful: it means nobody qualified has capacity, which the UI
  // renders differently from "no volunteer pool on file".
  assertEquals(g.pool, 0)
})
Deno.test('declined and future-dated shifts do not count as serving load', () => {
  const future = [plan({ need: { Ushers: 1 } })]
  const serving = [
    ...served('Declined Dave', 'Ushers', ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23'], 'D'),
    ...served('Declined Dave', 'Ushers', ['2026-08-02'], 'C'),
  ]
  const g = buildRoster({ past: [], future, serving, today: TODAY }).roster.gaps[0]
  // One confirmed shift only, so he has room and is suggestable.
  assertEquals(g.suggest.includes('Declined Dave'), true)
})

// ── empty / defensive ───────────────────────────────────────────────────────
Deno.test('no future plans yields an empty roster rather than throwing', () => {
  const r = buildRoster({ past: [], future: [], serving: [], today: TODAY })
  assertEquals(r.roster.gaps, [])
  assertEquals(r.roster.totalShort, 0)
  assertEquals(r.forward.weeks, [])
})
