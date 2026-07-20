// Emits src/lib/clients/focal-point/activity.ts: recent activity per flagged
// person/family for the detail drawer, each row stamped with the SERVICE attended
// (9 AM / 10:30 AM / 12 PM = English, Brazilian = 6pm) so switching between the
// English and Brazilian services is visible. Real, from checkin_activity.json.
// Keyed by person name AND family surname; activityFor() resolves the
// "The {Name} family" display form.
//
// Emits --real (disk, skip-worktree) and --rep (git index, empty map).
import fs from 'fs'
import { focalPointServing } from '../src/lib/clients/focal-point/serving.ts'
import { focalPointBurnout } from '../src/lib/clients/focal-point/burnout.ts'
import { focalPointGroupDrift } from '../src/lib/clients/focal-point/groupDrift.ts'
import { focalPointDrift } from '../src/lib/clients/focal-point/drift.ts'
import { congregationOf } from '../src/lib/clients/focal-point/congregation.ts'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const ca = JSON.parse(fs.readFileSync('scratchpad/pco-raw/checkin_activity.json', 'utf8')).byName
const norm = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim()
const MAX = 8
const raw = (name) => ca[norm(name)] || []

// Services scheduling by person name: their real serving history (team + date),
// the correct source for a volunteer's activity (check-ins undercount serving).
const scheduleByName = new Map()
{
  const sched = JSON.parse(fs.readFileSync('scratchpad/pco-raw/serving_schedule.json', 'utf8')).byPerson
  for (const rec of Object.values(sched)) scheduleByName.set(norm(rec.name), rec.dates)
}

const result = {}

// people (serving / burnout / group drift): their real serving history from the
// SCHEDULE (confirmed shifts, team + date). Falls back to check-ins only if a
// person has no scheduling record at all.
const personNames = new Set([
  ...focalPointServing.people.map((p) => p.name),
  ...focalPointBurnout.people.map((p) => p.name),
  ...focalPointGroupDrift.people.map((p) => p.name),
])
for (const name of personNames) {
  const sched = scheduleByName.get(norm(name))
  let items
  if (sched && sched.length) {
    const seen = new Set()
    items = []
    for (const d of sched) {
      if (d.status !== 'C' || d.date > '2026-07-16') continue
      const key = `${d.date}|${d.team}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ date: d.date, label: d.team, service: '', tone: 'serving' })
      if (items.length >= MAX) break
    }
  } else {
    items = raw(name)
      .slice(0, MAX)
      .map((r) => ({
        date: r.date,
        label: r.event || 'Check-in',
        service: r.service || '',
        tone: r.kind === 'Volunteer' ? 'serving' : 'attend',
      }))
  }
  const cong = congregationOf(name)
  if (!items.length && !cong) continue
  result[norm(name)] = { congregation: cong, items }
}

// families: their kids' recent check-ins, collapsed to one row per Sunday
// (siblings combined) so more distinct dates + services show.
let famWithKids = 0
for (const f of focalPointDrift.families) {
  const byDate = new Map()
  for (const kid of f.kids) {
    for (const r of raw(`${kid} ${f.family}`)) {
      const key = `${r.date}|${r.service || ''}`
      const e = byDate.get(key) || { date: r.date, service: r.service || '', kids: [] }
      if (!e.kids.includes(kid)) e.kids.push(kid)
      byDate.set(key, e)
    }
  }
  const kept = [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX)
    .map((e) => ({ date: e.date, label: e.kids.join(', '), service: e.service, tone: 'kids' }))
  if (kept.length) famWithKids++
  result[norm(f.family)] = { congregation: congregationOf(f.family), items: kept }
}

console.error(`people ${personNames.size}, families ${focalPointDrift.families.length} (${famWithKids} with kids activity); keys ${Object.keys(result).length}`)

const header = `// Focal Point Church - recent activity per flagged person/family, for the detail
// drawer (real, from scripts/gen-activity.mjs). Each row carries the SERVICE
// attended (English 9/10:30/12 vs Brazilian 6pm) so service-switching is visible,
// plus the team (serving) or child (kids). Keyed by person name or family surname;
// activityFor() resolves the "The {Name} family" display form.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export type Congregation = "brazilian" | "english"
export interface ActivityItem { date: string; label: string; service: string; tone: "serving" | "kids" | "attend" }
export interface PersonActivity { congregation: Congregation | null; items: ActivityItem[] }`

const footer = `const norm = (name: string) => name.toLowerCase().replace(/\\s+/g, " ").trim()
export function activityFor(name: string): PersonActivity | null {
  const k = norm(name)
  if (focalPointActivity[k]) return focalPointActivity[k]
  const fam = k.replace(/^the\\s+/, "").replace(/\\s+family$/, "").trim()
  return focalPointActivity[fam] ?? null
}`

let body
if (mode === 'rep') {
  body = `export const focalPointActivity: Record<string, PersonActivity> = {}`
} else {
  const lines = Object.keys(result).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(result[k])},`)
  body = `export const focalPointActivity: Record<string, PersonActivity> = {\n${lines.join('\n')}\n}`
}

process.stdout.write(`${header}\n${body}\n${footer}\n`)
