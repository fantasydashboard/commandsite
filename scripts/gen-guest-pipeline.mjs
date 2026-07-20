// Rebuilds src/lib/clients/focal-point/guestPipeline.ts from the real Starting
// Point workflow guests (guest_pipeline.json), tagged by congregation so Front
// Desk & Guests scopes. Stage comes from the follow-up step: Welcome Phone Call =
// new (or cooled if stuck), Week 2 = welcomed, Week 3 = connecting, completed =
// belongs. New guests get a templated welcome draft (English / Portuguese).
// Emits --real (disk, skip-worktree, real names) and --rep (git, empty).
import fs from 'fs'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const g = JSON.parse(fs.readFileSync('scratchpad/pco-raw/guest_pipeline.json', 'utf8'))
const TODAY = '2026-07-17'
const daysAgo = (d) => Math.round((new Date(`${TODAY}T00:00:00Z`) - new Date(`${d}T00:00:00Z`)) / 864e5)
const first = (name) => (name || 'Friend').split(' ')[0]

function stageOf(x) {
  if (x.completed) return 'belongs'
  if (/week 3/i.test(x.step)) return 'connecting'
  if (/week 2/i.test(x.step)) return 'welcomed'
  return daysAgo(x.created) > 28 ? 'cooled' : 'new'
}
function draftOf(x, campus) {
  const f = first(x.name)
  if (campus === 'brazilian')
    return `${f}, foi uma alegria ter você conosco na Focal Point no domingo. Sabemos que encontrar uma igreja é diferente para cada pessoa, e seria uma honra caminhar ao seu lado nesta temporada. Se pudermos ajudar de alguma forma, é só responder aqui. Bênçãos, Pastor`
  return `${f}, we were so glad you joined us at Focal Point on Sunday. We know finding a church home looks different for every person, and we would be honored to walk alongside you this season. If we can help in any way, just reply here. Blessings, Pastor Mark`
}
const stageDetail = {
  new: 'first visit · signed in at Starting Point',
  welcomed: 'welcome sent · in the week-2 follow-up',
  connecting: 'week-3 follow-up · progressing',
  belongs: 'finished the welcome sequence',
  cooled: 'signed in weeks ago · no next step since',
}

const cases = []
const kpis = {}
let ci = 0
for (const campus of ['english', 'brazilian']) {
  const list = g[campus]
  for (const x of list) {
    const stage = stageOf(x)
    // A guest who first visited this week gets a welcome draft awaiting approval,
    // whatever follow-up step the workflow has advanced them to.
    const thisWeek = daysAgo(x.created) <= 7
    cases.push({
      id: `gp-${++ci}`,
      name: x.name,
      campus,
      stage,
      detail: stageDetail[stage],
      owner: stage === 'new' ? 'Pastor Mark' : stage === 'cooled' ? 'Connections team' : 'Grace, auto',
      age: daysAgo(x.created) < 7 ? 'this week' : `${Math.round(daysAgo(x.created) / 7)}w ago`,
      ...(thisWeek ? { note: 'Grace drafted a welcome, awaiting your approval', draft: draftOf(x, campus) } : {}),
    })
  }
  const recentGuests = list.length
  const firstTimers4w = list.filter((x) => daysAgo(x.created) <= 28).length
  const stillVisitors = list.filter((x) => !x.completed).length
  const completedPct = Math.round((list.filter((x) => x.completed).length / Math.max(1, recentGuests)) * 100)
  kpis[campus] = { recentGuests, firstTimers4w, stillVisitors, completedPct }
}
// all = english + brazilian
const sum = (k) => kpis.english[k] + kpis.brazilian[k]
const allRecent = sum('recentGuests')
kpis.all = {
  recentGuests: allRecent,
  firstTimers4w: sum('firstTimers4w'),
  stillVisitors: sum('stillVisitors'),
  completedPct: Math.round(((kpis.english.completedPct * kpis.english.recentGuests + kpis.brazilian.completedPct * kpis.brazilian.recentGuests) / Math.max(1, allRecent))),
}

console.error(`cases ${cases.length} | kpis ${JSON.stringify(kpis.all)}`)

const header = `// Focal Point Church - guest pipeline (real, from the two Starting Point
// workflows via scripts/gen-guest-pipeline.mjs). Each guest is tagged by
// congregation (English weekend service vs Brazilian service) so Front Desk &
// Guests scopes. Stage from the follow-up step. LOCAL OVERRIDE (skip-worktree):
// real congregant names live on disk only, never in git.
export type GuestStage = 'new' | 'welcomed' | 'connecting' | 'belongs' | 'cooled'
export type GuestCampus = 'english' | 'brazilian'
export const GUEST_STAGES: { key: GuestStage; label: string; positive?: boolean; leak?: boolean }[] = [
  { key: 'new', label: 'New guest' },
  { key: 'welcomed', label: 'Welcomed' },
  { key: 'connecting', label: 'Connecting' },
  { key: 'belongs', label: 'Belongs', positive: true },
  { key: 'cooled', label: 'Cooled', leak: true },
]
export interface GuestCase {
  id: string
  name: string
  campus: GuestCampus
  stage: GuestStage
  detail: string
  owner: string
  age: string
  note?: string
  draft?: string
  outcome?: string
}
export interface GuestKpis { recentGuests: number; firstTimers4w: number; stillVisitors: number; completedPct: number }`

const footer = `export function guestKpis(scope: 'all' | GuestCampus): GuestKpis {
  return guestPipeline.kpis[scope]
}`

let body
if (mode === 'rep') {
  body = `export const guestPipeline: { cases: GuestCase[]; kpis: Record<'all' | GuestCampus, GuestKpis> } = {
  cases: [],
  kpis: { all: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 }, english: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 }, brazilian: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 } },
}`
} else {
  const caseLines = cases.map((c) => `    ${JSON.stringify(c)},`).join('\n')
  body = `export const guestPipeline: { cases: GuestCase[]; kpis: Record<'all' | GuestCampus, GuestKpis> } = {
  cases: [
${caseLines}
  ],
  kpis: ${JSON.stringify(kpis, null, 2).replace(/\n/g, '\n  ')},
}`
}

process.stdout.write(`${header}\n${body}\n${footer}\n`)
