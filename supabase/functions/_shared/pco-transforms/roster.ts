// roster.ts (edge transform)
//
// Sunday roster readiness, ported from scripts/pull-roster2.mjs,
// pull-sched-forward.mjs and gen-roster-live.mjs so Serving stops depending on
// someone running scripts by hand every week.
//
// Everything else on the dashboard recomputes nightly; the roster did not, so it
// showed a Sunday that had already happened within days of every refresh. That
// is the most visible way for a product to look broken, and it was the only
// page with a human permanently in the loop.
//
// Pure and synchronous on purpose: all PCO access lives in the fetcher, so the
// decisions here (which teams count, what is short, who to ask) are testable
// without the network.

export type SchedFlag = 'forgotten' | 'empty' | 'short' | 'unconfirmed' | 'ok'

/** Scheduled headcount for one team on one plan, split by confirmation. */
export interface TeamCounts { C: number; U: number; D: number; total: number }

/** One Planning Center plan, already flattened by the fetcher. */
export interface PlanSnapshot {
  date: string
  /** team name -> scheduled counts */
  teams: Record<string, TeamCounts>
  /** team name -> positions still needed */
  need: Record<string, number>
  /** team name -> the specific unfilled positions, so the board can say WHAT is
   *  short ("Acoustic Guitar, Drums") rather than only how many. */
  positions?: Record<string, { pos: string; qty: number }[]>
}

/** A confirmed-or-otherwise serving assignment, from pco_serving_assignments. */
export interface ServingRow { person_id: string; name: string; team: string; date: string; status: string }

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
export interface RosterPayload {
  date: string
  sundayLabel: string
  totalShort: number
  teamsShort: number
  gaps: RosterGap[]
}
export interface TeamWeek { team: string; sched: number; confirmed: number; unconfirmed: number; declined: number; need: number; flag: SchedFlag; positions: { pos: string; qty: number }[] }
export interface SchedWeek { date: string; label: string; teams: TeamWeek[] }
export interface ForwardPayload { expected: string[]; weeks: SchedWeek[] }

/** A team counts as "runs every Sunday" at this share of recent plans. Below it,
 *  an absence is normal rather than an oversight, so flagging it would be noise. */
export const EXPECTED_PRESENCE = 0.6

/** Load window and threshold for "already serving too much". Mirrors
 *  computeBurnout so a name suggested here can never also be a name the burnout
 *  list is telling the church to protect. */
export const SEASON_DAYS = 90
export const OVER_PER_MONTH = 3
export const OVER_TEAMS = 3
/** Away this long and asking them spreads the load instead of deepening it. */
export const FRESH_WEEKS = 8

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function label(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return y && m && d ? `${MON[m - 1]} ${d}` : iso
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5)

export function flagOf(counts: TeamCounts | undefined, need: number): SchedFlag {
  const s = counts ?? { C: 0, U: 0, D: 0, total: 0 }
  if (s.total === 0 && need === 0) return 'forgotten'
  if (need > 0) return s.total === 0 ? 'empty' : 'short'
  if (s.U > 0) return 'unconfirmed'
  return 'ok'
}

interface Person { name: string; teams: Set<string>; recent: number; months: Set<string>; last: string | null }

function loadByPerson(serving: ServingRow[], today: string): Map<string, Person> {
  const by = new Map<string, Person>()
  for (const r of serving) {
    // Declines are not load, and a future assignment has not happened yet.
    if ((r.status ?? '').toUpperCase() !== 'C') continue
    if (r.date > today) continue
    const p = by.get(r.person_id) ?? { name: r.name, teams: new Set<string>(), recent: 0, months: new Set<string>(), last: null }
    p.teams.add(r.team)
    if (daysBetween(today, r.date) <= SEASON_DAYS) {
      p.recent++
      p.months.add(r.date.slice(0, 7))
    }
    if (!p.last || r.date > p.last) p.last = r.date
    by.set(r.person_id, p)
  }
  return by
}

const perMonth = (p: Person) => Math.round(p.recent / Math.max(1, p.months.size))
const isOverServing = (p: Person) => perMonth(p) >= OVER_PER_MONTH || p.teams.size >= OVER_TEAMS

function candidatesFor(team: string, people: Person[], today: string) {
  const served = people.filter((p) => p.teams.has(team))
  const withRoom = served
    .filter((p) => !isOverServing(p))
    .sort((a, b) => perMonth(a) - perMonth(b) || b.recent - a.recent)
  const fresh = withRoom.find((p) => p.last && Math.floor(daysBetween(today, p.last) / 7) >= FRESH_WEEKS)
  const heavy = served.filter(isOverServing).sort((a, b) => perMonth(b) - perMonth(a))[0]
  return {
    suggest: withRoom.slice(0, 2).map((p) => p.name),
    pool: withRoom.length,
    ...(fresh ? { fresh: `${fresh.name} (served ${team} before, has room)` } : {}),
    ...(heavy ? { skip: { name: heavy.name, reason: `already ${perMonth(heavy)}x/month` } } : {}),
  }
}

export function buildRoster(input: {
  past: PlanSnapshot[]
  future: PlanSnapshot[]
  serving: ServingRow[]
  today: string
}): { roster: RosterPayload; forward: ForwardPayload } {
  const { past, future, serving, today } = input

  // Which teams normally run, from how often they appear in recent plans. A team
  // missing from an upcoming plan only matters if it is usually there.
  const presence = new Map<string, number>()
  for (const p of past) {
    for (const t of Object.keys(p.teams)) presence.set(t, (presence.get(t) ?? 0) + 1)
  }
  const expected = past.length
    ? [...presence.entries()].filter(([, n]) => n / past.length >= EXPECTED_PRESENCE).map(([t]) => t).sort()
    : []

  const weeks: SchedWeek[] = future.map((p) => ({
    date: p.date,
    label: label(p.date),
    teams: expected.map((team) => {
      const s = p.teams[team] ?? { C: 0, U: 0, D: 0, total: 0 }
      const need = p.need[team] ?? 0
      return {
        team,
        sched: s.total,
        confirmed: s.C,
        unconfirmed: s.U,
        declined: s.D,
        need,
        flag: flagOf(s, need),
        positions: p.positions?.[team] ?? [],
      }
    }),
  }))

  // The roster card is about the NEXT Sunday only; later weeks live in the grid.
  const next = future[0]
  const people = [...loadByPerson(serving, today).values()]
  const gaps: RosterGap[] = next
    ? Object.entries(next.need)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([team, short]) => ({ team, short, ...candidatesFor(team, people, today) }))
    : []

  return {
    roster: {
      date: next?.date ?? '',
      sundayLabel: next ? `Sun ${label(next.date)}` : '',
      totalShort: gaps.reduce((a, g) => a + g.short, 0),
      teamsShort: gaps.length,
      gaps,
    },
    forward: { expected, weeks },
  }
}
