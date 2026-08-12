// Regenerates src/lib/clients/focal-point/roster.ts and rosterForward.ts from
// the latest PCO pulls, so the Serving page stops showing a frozen Sunday.
//
// Run the pulls first (they hit PCO live and need PCO_PAT in .env.local):
//   node scripts/pull-roster2.mjs        -> roster_gaps.json      (next plan's needed positions)
//   node scripts/pull-sched-forward.mjs  -> sched_forward.json    (next 4 Sundays, per team)
//   node scripts/pull-sched-positions.mjs-> sched_positions.json  (which positions are unfilled)
// then:
//   node scripts/gen-roster-live.mjs
//
// WHY THE SUGGESTIONS ARE RECOMPUTED, NOT CARRIED OVER
// The previous roster.ts mixed vintages: gaps from one pull, suggested names
// from another. That is dangerous here, because the whole promise of the
// suggestion is that it is burnout-aware. A name carried forward from six weeks
// ago may since have become one of the people you are supposed to protect. So
// suggestions are derived fresh from the same serving history the burnout
// signal uses.
//
// TWO OUTPUTS, ON PURPOSE. roster.ts is skip-worktree: the on-disk copy names
// real congregants, the committed copy uses generic labels so real names never
// reach git or production. This writes both.

import { readFile, writeFile } from 'node:fs/promises'

const RAW = 'scratchpad/pco-raw'
const j = async (f) => JSON.parse(await readFile(`${RAW}/${f}`, 'utf8'))

const gaps = await j('roster_gaps.json')
const fwd = await j('sched_forward.json')
const positions = await j('sched_positions.json').catch(() => ({}))
const sched = await j('serving_schedule.json')

const today = new Date().toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}

// ── Load per person, from the same history the burnout signal reads ──────────
const SEASON_DAYS = 90
const people = []
for (const [id, rec] of Object.entries(sched.byPerson ?? {})) {
  const done = (rec.dates ?? []).filter((d) => d.status === 'C' && d.date <= today)
  const recent = done.filter((d) => daysBetween(today, d.date) <= SEASON_DAYS)
  const months = Math.max(1, new Set(recent.map((d) => d.date.slice(0, 7))).size)
  const teams = [...new Set(done.map((d) => d.team))]
  const last = done.map((d) => d.date).sort().pop() ?? null
  people.push({
    id,
    name: rec.name,
    perMonth: Math.round(recent.length / months),
    teams,
    recentCount: recent.length,
    lastServed: last,
    weeksSince: last ? Math.floor(daysBetween(today, last) / 7) : 999,
  })
}

// Mirrors computeBurnout's rule, so a name this script suggests can never be a
// name the burnout list is telling the church to protect.
const isOverServing = (p) => p.perMonth >= 3 || p.teams.length >= 3

function candidatesFor(team) {
  const served = people.filter((p) => p.teams.includes(team) && !isOverServing(p))
  // Lowest current load first, then the most experience on that team.
  const ranked = served.sort((a, b) => a.perMonth - b.perMonth || b.recentCount - a.recentCount)
  const suggest = ranked.slice(0, 2).map((p) => p.name)
  // "Fresh capacity" = served this team before but has been away a while, so
  // asking them spreads the load instead of deepening it.
  const fresh = ranked.find((p) => p.weeksSince >= 8 && p.weeksSince < 999)
  // The counter-example the card shows: someone who serves this team and should
  // NOT be asked again.
  const heavy = people
    .filter((p) => p.teams.includes(team) && isOverServing(p))
    .sort((a, b) => b.perMonth - a.perMonth)[0]
  return {
    suggest,
    fresh: fresh ? `${fresh.name} (served ${team} before, has room)` : null,
    skip: heavy ? { name: heavy.name, reason: `already ${heavy.perMonth}x/month` } : null,
    poolSize: served.length,
  }
}

// ── roster.ts ────────────────────────────────────────────────────────────────
const date = gaps.date.slice(0, 10)
const gapRows = gaps.grouped.map((g) => ({ team: g.team, short: g.short, ...candidatesFor(g.team) }))
const totalShort = gapRows.reduce((a, g) => a + g.short, 0)

const HEADER = `// Focal Point Church - this Sunday's roster readiness (real, from Planning Center
// Services). Team gaps are aggregate (no PII) and real. Suggested names are
// individual congregants, so this follows the skip-worktree pattern: the
// COMMITTED version uses generic labels, the local on-disk version names the real
// people. Regenerate with scripts/gen-roster-live.mjs after the pulls; do not
// hand-edit, and never carry suggestions across pulls (they are burnout-aware
// and go stale).
// Generated ${today} from the ${date} plan.
export interface RosterGap {
  team: string
  short: number
  suggest: string[]
  /** People who have served this team and are NOT already over-serving. 0 means
   *  everyone qualified is at high load, which is a different problem from
   *  having no volunteer pool at all. */
  pool: number
  skip?: { name: string; reason: string }
  fresh?: string
}
`

function rosterBody(anonymous) {
  let n = 0
  const nextLabel = () => `Volunteer ${String.fromCharCode(65 + n++)}`
  const rows = gapRows.map((g) => {
    const suggest = anonymous ? g.suggest.map(() => nextLabel()) : g.suggest
    const parts = [`team: ${JSON.stringify(g.team)}`, `short: ${g.short}`, `suggest: ${JSON.stringify(suggest)}`, `pool: ${g.poolSize}`]
    if (g.skip) {
      const nm = anonymous ? 'a high-load volunteer' : g.skip.name
      parts.push(`skip: { name: ${JSON.stringify(nm)}, reason: ${JSON.stringify(g.skip.reason)} }`)
    }
    if (g.fresh) {
      const fr = anonymous ? 'someone who has served this team before and has room' : g.fresh
      parts.push(`fresh: ${JSON.stringify(fr)}`)
    }
    return `    { ${parts.join(', ')} },`
  })
  return `${HEADER}
export const focalPointRoster: {
  date: string
  sundayLabel: string
  totalShort: number
  teamsShort: number
  gaps: RosterGap[]
} = {
  date: '${date}',
  sundayLabel: 'Sun ${label(date)}',
  totalShort: ${totalShort},
  teamsShort: ${gapRows.length},
  gaps: [
${rows.join('\n')}
  ],
}
`
}

// ── rosterForward.ts ─────────────────────────────────────────────────────────
const posFor = (wk, team) => {
  const w = (positions.weeks ?? []).find((x) => (x.date ?? '').slice(0, 10) === wk)
  const t = w?.teams?.find((x) => x.team === team)
  return (t?.positions ?? []).map((p) => ({ pos: p.pos ?? p.name ?? String(p), qty: p.qty ?? 1 }))
}
const weeks = (fwd.weeks ?? []).map((w) => ({
  date: w.date,
  label: label(w.date),
  teams: (w.teams ?? []).map((t) => ({
    team: t.team,
    sched: t.sched ?? 0,
    confirmed: t.C ?? 0,
    unconfirmed: t.U ?? 0,
    declined: t.D ?? 0,
    need: t.need ?? 0,
    flag: t.flag ?? 'ok',
    positions: posFor(w.date, t.team),
  })),
}))

const forwardOut = `// Focal Point Church - forward scheduling health (real, from Planning Center
// Services). Team-level only, no PII. Regenerate with scripts/gen-roster-live.mjs.
// Generated ${today}.
export type SchedFlag = "forgotten" | "empty" | "short" | "unconfirmed" | "ok"
export interface NeededPosition { pos: string; qty: number }
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: NeededPosition[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export const focalPointSchedule: { expected: string[]; weeks: SchedWeek[] } = {
  expected: ${JSON.stringify(fwd.expected ?? [])},
  weeks: ${JSON.stringify(weeks, null, 2).split('\n').join('\n  ')},
}
`

await writeFile('src/lib/clients/focal-point/roster.ts', rosterBody(false))
await writeFile('src/lib/clients/focal-point/rosterForward.ts', forwardOut)
await writeFile('scratchpad/roster.committed.ts', rosterBody(true))
// JSON twin of the REAL payload, for the database upload. Emitted here so no
// downstream step has to parse TypeScript back: an apostrophe in a surname
// breaks naive quote handling, and real surnames contain them.
await writeFile('scratchpad/roster.payload.json', JSON.stringify({
  date,
  sundayLabel: `Sun ${label(date)}`,
  totalShort,
  teamsShort: gapRows.length,
  gaps: gapRows.map((g) => ({
    team: g.team, short: g.short, suggest: g.suggest, pool: g.poolSize,
    ...(g.skip ? { skip: g.skip } : {}), ...(g.fresh ? { fresh: g.fresh } : {}),
  })),
}, null, 2))

console.log(`roster.ts        ${date} · ${totalShort} short across ${gapRows.length} teams`)
for (const g of gapRows) {
  console.log(`  ${String(g.short).padStart(2)}x ${g.team.padEnd(28)} pool ${String(g.poolSize).padStart(3)}  suggest: ${g.suggest.join(', ') || '(none with capacity)'}`)
}
console.log(`rosterForward.ts ${weeks.length} weeks: ${weeks.map((w) => w.label).join(', ')}`)
console.log('committed (anonymised) variant -> scratchpad/roster.committed.ts')
