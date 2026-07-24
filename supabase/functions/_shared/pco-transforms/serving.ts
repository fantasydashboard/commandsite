import type { ByPerson, ServingCfg, BurnoutCfg, ServingPayload, BurnoutPayload, Campus } from './types.ts'

const DAY = 864e5
export const weeksBetween = (a: string, b: string) => Math.floor((Date.parse(a) - Date.parse(b)) / (7 * DAY))
export const monthsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(a) - Date.parse(b)) / (30 * DAY)))
export const isBrazilianTeam = (t: string) => /4th service|brasil|brazil|apoio pastoral|diaconia|fundamental|pré-escola|pre-escola|culto/i.test(t)
export function campusOf(teams: string[]): Campus {
  const uniq = [...new Set(teams)]
  const bra = uniq.some(isBrazilianTeam)
  const eng = uniq.some((t) => !isBrazilianTeam(t))
  return bra && eng ? 'both' : bra ? 'brazilian' : 'english'
}
export function primaryTeam(dates: { team: string }[]): string {
  const count: Record<string, number> = {}
  for (const d of dates) count[d.team] = (count[d.team] || 0) + 1
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Serving'
}
// today minus N months as a YYYY-MM-DD string (UTC).
export function monthsAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

const SERVING_SIGNAL = 'Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.'
const BURNOUT_SIGNAL = "Volunteers scheduled 3+ times a month, often across several teams, and still going. The people most likely to burn out and drop next. Today's over-servers are next quarter's drift."

export function computeServing(byPerson: ByPerson, staff: Set<string>, cfg: ServingCfg, today: string): ServingPayload {
  let totalVolunteers = 0
  const people = []
  for (const rec of Object.values(byPerson)) {
    if (staff.has(rec.name)) continue
    const dates = [...rec.dates].sort((a, b) => (a.date < b.date ? 1 : -1)) // desc
    const past = dates.filter((d) => d.date <= today && d.status === 'C')
    const upcoming = dates.filter((d) => d.date > today && d.status !== 'D')
    if (past.length >= 1) totalVolunteers++
    if (past.length < cfg.regularMin) continue
    const lastServed = past[0].date
    const weeksSince = weeksBetween(today, lastServed)
    if (weeksSince < cfg.gapWeeks || upcoming.length > 0) continue
    const firstServed = past[past.length - 1].date
    people.push({
      name: rec.name, area: primaryTeam(past), campus: campusOf(past.map((d) => d.team)),
      monthsServing: monthsBetween(lastServed, firstServed), totalServed: past.length, lastServed, weeksSince,
    })
  }
  people.sort((a, b) => b.totalServed - a.totalServed || b.weeksSince - a.weeksSince)
  return { flaggedPeople: people.length, totalVolunteers, signal: SERVING_SIGNAL, people, drafts: [] }
}

export function computeBurnout(byPerson: ByPerson, staff: Set<string>, cfg: BurnoutCfg, today: string): BurnoutPayload {
  const seasonStart = monthsAgo(today, cfg.seasonMonths)
  let activeVolunteers = 0
  const people = []
  for (const rec of Object.values(byPerson)) {
    if (staff.has(rec.name)) continue
    const shifts = rec.dates.filter((d) => d.status === 'C' && d.date >= seasonStart && d.date <= today)
    if (!shifts.length) continue
    activeVolunteers++
    const months = new Set(shifts.map((d) => d.date.slice(0, 7))).size
    const perMonth = Math.round(shifts.length / Math.max(1, months))
    const teams = [...new Set(shifts.map((d) => d.team))]
    if (!(perMonth >= 3 || teams.length >= 2)) continue
    const tier: 'high' | 'medium' = perMonth >= 4 || teams.length >= 3 ? 'high' : 'medium'
    people.push({ name: rec.name, areas: teams, campus: campusOf(teams), perMonth, tier })
  }
  people.sort((a, b) => b.perMonth - a.perMonth || b.areas.length - a.areas.length)
  return { flaggedPeople: people.length, highRisk: people.filter((p) => p.tier === 'high').length, activeVolunteers, signal: BURNOUT_SIGNAL, people, drafts: [] }
}
