// Emits src/lib/clients/focal-point/congregation.ts: a normalized-name ->
// congregation map covering every person and family the lens filters.
// Signal priority (most accurate first), Brazilian wins on conflict:
//   1. service attendance   (service_congregation.json: Sunday 6pm = Brazilian)
//   2. group membership     (congregation_map.json, fallback)
//   3. group-drift people   classified by their group name (brasil/brazil)
//   4. families             classified by their kids' service attendance
// congregationOf() also resolves family display forms ("The {Name} family" -> name).
// Guests are omitted: first-time visitors sign in at Starting Point, not a
// service, so they carry no congregation signal.
//
// Emits --real (disk, skip-worktree) and --rep (git index, empty map).
import fs from 'fs'
import { focalPointServing } from '../src/lib/clients/focal-point/serving.ts'
import { focalPointBurnout } from '../src/lib/clients/focal-point/burnout.ts'
import { focalPointGroupDrift } from '../src/lib/clients/focal-point/groupDrift.ts'
import { focalPointDrift } from '../src/lib/clients/focal-point/drift.ts'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const svc = JSON.parse(fs.readFileSync('scratchpad/pco-raw/service_congregation.json', 'utf8'))
const grp = JSON.parse(fs.readFileSync('scratchpad/pco-raw/congregation_map.json', 'utf8'))
const vc = JSON.parse(fs.readFileSync('scratchpad/pco-raw/volunteer_checkins.json', 'utf8'))
const kids = JSON.parse(fs.readFileSync('scratchpad/pco-raw/kids_checkins.json', 'utf8'))
const norm = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim()

// name -> person ids, from every check-in source we have
const idsByName = new Map()
for (const c of [...vc, ...kids]) {
  const k = norm(`${c.first} ${c.last}`)
  idsByName.set(k, [...(idsByName.get(k) || []), c.person_id])
}
const congId = (id) => svc.byPersonId[id] || grp.byPersonId[id] || null
const congName = (name) => {
  const k = norm(name)
  if (svc.byName[k]) return svc.byName[k]
  const cs = (idsByName.get(k) || []).map(congId).filter(Boolean)
  return cs.includes('brazilian') ? 'brazilian' : cs.includes('english') ? 'english' : null
}

const result = {}
const setCong = (name, cong) => {
  if (!cong) return
  const k = norm(name)
  if (result[k] === 'brazilian') return
  result[k] = cong
}

let sTag = 0
for (const p of focalPointServing.people) { const c = congName(p.name); if (c) sTag++; setCong(p.name, c) }
let bTag = 0
for (const p of focalPointBurnout.people) { const c = congName(p.name); if (c) bTag++; setCong(p.name, c) }
// group-drift: the group name is the authoritative congregation signal
for (const p of focalPointGroupDrift.people) setCong(p.name, /brasil|brazil/i.test(p.group) ? 'brazilian' : 'english')
// families: classified by their kids' service; keyed by surname
let fTag = 0
for (const f of focalPointDrift.families) {
  const cs = f.kids.map((kid) => congName(`${kid} ${f.family}`)).filter(Boolean)
  const c = cs.includes('brazilian') ? 'brazilian' : cs.includes('english') ? 'english' : null
  if (c) fTag++
  setCong(f.family, c)
}

const braCount = Object.values(result).filter((c) => c === 'brazilian').length
console.error(
  `serving ${sTag}/${focalPointServing.people.length}, burnout ${bTag}/${focalPointBurnout.people.length}, ` +
    `families ${fTag}/${focalPointDrift.families.length}; total keys ${Object.keys(result).length} (brazilian ${braCount})`,
)

const header = `// Focal Point Church - congregation of each flagged person and family, for the
// Brazilian lens (real, from scripts/gen-congregation.mjs).
// Signal: which Sunday service they attend (6pm = Brazilian), backed by group
// membership and, for families, their kids' service. congregationOf resolves a
// person's name OR a family surname OR the "The {Name} family" display form.
// Guests are absent (they sign in at Starting Point, not a service, so they have
// no congregation yet). People with no check-in signal are absent too and only
// show in the 'all' scope.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export type Congregation = "brazilian" | "english"`

const footer = `const norm = (name: string) => name.toLowerCase().replace(/\\s+/g, " ").trim()
export function congregationOf(name: string): Congregation | null {
  const k = norm(name)
  if (focalPointCongregation[k]) return focalPointCongregation[k]
  // family display form: "The {Name} family" -> "{name}"
  const fam = k.replace(/^the\\s+/, "").replace(/\\s+family$/, "").trim()
  return focalPointCongregation[fam] ?? null
}
export const focalPointCongregationStats = {
  brazilianGroups: ${grp.brazilianGroups},
  englishGroups: ${grp.englishGroups},
  brazilianPeople: ${grp.brazilianPeople},
  englishPeople: ${grp.englishPeople},
}`

let body
if (mode === 'rep') {
  body = `export const focalPointCongregation: Record<string, Congregation> = {}`
} else {
  const lines = Object.keys(result).sort().map((k) => `  "${k}": "${result[k]}",`)
  body = `export const focalPointCongregation: Record<string, Congregation> = {\n${lines.join('\n')}\n}`
}

process.stdout.write(`${header}\n${body}\n${footer}\n`)
