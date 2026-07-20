// Rebuilds src/lib/clients/focal-point/serving.ts from Planning Center SERVICES
// scheduling (serving_schedule.json), the correct signal, instead of check-ins.
// "Stopped serving" = a regular server (4+ confirmed dates this season) whose last
// served date is 6+ weeks ago AND who has NOTHING upcoming on the schedule. Anyone
// confirmed for a recent or future date is still serving (e.g. Manuel, confirmed
// Jul 5 + Jul 26 + Aug 16), so they never appear here. Staff/admins excluded.
//
// Emits --real (disk, skip-worktree) and --rep (git index, representative empty).
import fs from 'fs'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const sched = JSON.parse(fs.readFileSync('scratchpad/pco-raw/serving_schedule.json', 'utf8')).byPerson
const staff = new Set(JSON.parse(fs.readFileSync('scratchpad/pco-raw/staff.json', 'utf8')))

const TODAY = '2026-07-16'
const REGULAR = 4 // confirmed past dates to count as a regular server
const GAP_WEEKS = 6 // weeks since last served to flag as stopped
const weeksBetween = (a, b) => Math.floor((new Date(a).getTime() - new Date(b).getTime()) / (7 * 864e5))
const monthsBetween = (a, b) => Math.max(1, Math.round((new Date(a).getTime() - new Date(b).getTime()) / (30 * 864e5)))

function primaryTeam(dates) {
  const count = {}
  for (const d of dates) count[d.team] = (count[d.team] || 0) + 1
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Serving'
}
// The Brazilian ministry runs its own teams ("4th Service", FPC Brasil, Apoio
// Pastoral, Diaconia); everything else is the English / main ministry. A person's
// campus is which of those they serve, so serving scopes cleanly by team.
const isBrazilianTeam = (t) => /4th service|brasil|brazil|apoio pastoral|diaconia|fundamental|pré-escola|pre-escola|culto/i.test(t)
function campusOf(dates) {
  const teams = [...new Set(dates.map((d) => d.team))]
  const bra = teams.some(isBrazilianTeam)
  const eng = teams.some((t) => !isBrazilianTeam(t))
  return bra && eng ? 'both' : bra ? 'brazilian' : 'english'
}

const flagged = []
let totalVolunteers = 0
for (const rec of Object.values(sched)) {
  const name = rec.name
  if (staff.has(name)) continue
  const past = rec.dates.filter((d) => d.date <= TODAY && d.status === 'C')
  const upcoming = rec.dates.filter((d) => d.date > TODAY && d.status !== 'D')
  if (past.length >= 1) totalVolunteers++ // served at least once this season
  if (past.length < REGULAR) continue
  const lastServed = past[0].date // dates sorted desc
  const weeksSince = weeksBetween(TODAY, lastServed)
  if (weeksSince < GAP_WEEKS || upcoming.length > 0) continue // still serving
  const firstServed = past[past.length - 1].date
  flagged.push({
    name,
    area: primaryTeam(past),
    campus: campusOf(past),
    monthsServing: monthsBetween(lastServed, firstServed),
    totalServed: past.length,
    lastServed,
    weeksSince,
  })
}
// longest-serving first (most invested), matching the directory's sort
flagged.sort((a, b) => b.totalServed - a.totalServed || b.weeksSince - a.weeksSince)

console.error(`stopped-serving ${flagged.length} of ${totalVolunteers} volunteers who served this season`)

const header = `// Focal Point Church - People Drift Watch (real serving drift, from Planning
// Center SERVICES scheduling via scripts/gen-serving.mjs). "Stopped serving" =
// a regular server (${REGULAR}+ confirmed dates) whose last served date is ${GAP_WEEKS}+ weeks ago
// AND who has nothing upcoming on the schedule. Check-ins are NOT used: they
// undercount (people serve without checking in, whole teams skip the kiosk), so a
// missing check-in never means someone stopped. Staff/admins excluded.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface ServingDriftPerson { name: string; area: string; campus: "english" | "brazilian" | "both"; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingDraft { id: string; name: string; area: string; context: string; draft: string }`

const signal =
  'Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.'

let body
if (mode === 'rep') {
  body = `export const focalPointServing: {
  flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingDriftPerson[]; drafts: ServingDraft[]
} = { flaggedPeople: 0, totalVolunteers: 0, signal: ${JSON.stringify(signal)}, people: [], drafts: [] }`
} else {
  const peopleLines = flagged.map((p) => `  ${JSON.stringify(p)},`).join('\n')
  body = `export const focalPointServing: {
  flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingDriftPerson[]; drafts: ServingDraft[]
} = {
  flaggedPeople: ${flagged.length}, totalVolunteers: ${totalVolunteers},
  signal: ${JSON.stringify(signal)},
  people: [
${peopleLines}
  ],
  drafts: [],
}`
}

process.stdout.write(`${header}\n${body}\n`)
