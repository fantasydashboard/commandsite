// Rebuilds src/lib/clients/focal-point/burnout.ts from Planning Center SERVICES
// scheduling (the real serving load; check-ins undercount). "Serving too often" =
// scheduled 3+ times a month OR across 2+ teams; high load = 4+/month OR 3+ teams.
// Healthy ~2x/month servers are not flagged. Staff excluded.
//   npx tsx scripts/gen-burnout.mjs --real > scratchpad/burnout.real.ts
//   npx tsx scripts/gen-burnout.mjs --rep  > scratchpad/burnout.rep.ts
import fs from 'fs'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const sched = JSON.parse(fs.readFileSync('scratchpad/pco-raw/serving_schedule.json', 'utf8')).byPerson
const staff = new Set(JSON.parse(fs.readFileSync('scratchpad/pco-raw/staff.json', 'utf8')))

const TODAY = '2026-07-16'
const SEASON_START = '2026-02-01' // recent window for current serving load
// Brazilian ministry teams vs English/main; a person's campus is which they serve.
const isBrazilianTeam = (t) => /4th service|brasil|brazil|apoio pastoral|diaconia|fundamental|pré-escola|pre-escola|culto/i.test(t)
function campusOf(teams) {
  const bra = teams.some(isBrazilianTeam)
  const eng = teams.some((t) => !isBrazilianTeam(t))
  return bra && eng ? 'both' : bra ? 'brazilian' : 'english'
}

const flagged = []
let activeVolunteers = 0
for (const rec of Object.values(sched)) {
  if (staff.has(rec.name)) continue
  const shifts = rec.dates.filter((d) => d.status === 'C' && d.date >= SEASON_START && d.date <= TODAY)
  if (!shifts.length) continue
  activeVolunteers++
  const months = new Set(shifts.map((d) => d.date.slice(0, 7))).size
  const perMonth = Math.round(shifts.length / Math.max(1, months))
  const teams = [...new Set(shifts.map((d) => d.team))]
  const flag = perMonth >= 3 || teams.length >= 2
  if (!flag) continue
  const tier = perMonth >= 4 || teams.length >= 3 ? 'high' : 'medium'
  flagged.push({ name: rec.name, areas: teams, campus: campusOf(teams), perMonth, tier })
}
flagged.sort((a, b) => b.perMonth - a.perMonth || b.areas.length - a.areas.length)
const highRisk = flagged.filter((p) => p.tier === 'high').length

console.error(`burnout ${flagged.length} flagged (${highRisk} high) of ${activeVolunteers} active volunteers`)

const header = `// Focal Point Church - Burnout Watch (real serving load, from Planning Center
// SERVICES scheduling via scripts/gen-burnout.mjs). Flagged = scheduled 3+ times a
// month OR across 2+ teams; high = 4+/month OR 3+ teams. Check-ins are not used
// (they undercount serving). Staff excluded.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface BurnoutPerson { name: string; areas: string[]; campus: "english" | "brazilian" | "both"; perMonth: number; tier: "high" | "medium" }
export interface BurnoutDraft { id: string; name: string; context: string; draft: string }`

const signal =
  'Volunteers scheduled 3+ times a month, often across several teams, and still going. The people most likely to burn out and drop next. Today\'s over-servers are next quarter\'s drift.'

let body
if (mode === 'rep') {
  body = `export const focalPointBurnout: { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: BurnoutDraft[] } = {
  flaggedPeople: 0, highRisk: 0, activeVolunteers: 0,
  signal: ${JSON.stringify(signal)},
  people: [], drafts: [],
}`
} else {
  const peopleLines = flagged.map((p) => `  ${JSON.stringify(p)},`).join('\n')
  body = `export const focalPointBurnout: { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: BurnoutDraft[] } = {
  flaggedPeople: ${flagged.length}, highRisk: ${highRisk}, activeVolunteers: ${activeVolunteers},
  signal: ${JSON.stringify(signal)},
  people: [
${peopleLines}
  ],
  drafts: [],
}`
}

process.stdout.write(`${header}\n${body}\n`)
