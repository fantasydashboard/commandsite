// Regenerates src/lib/clients/focal-point/duplicates.ts from the raw PCO pull,
// enriched with per-profile serving activity AND a reconciliation verdict for the
// people who are currently on a care/drift list.
//
// Reconciliation = combine a person's check-ins across all their duplicate
// profiles and ask: does that change what the flag saw?
//   - stopped-serving flag: cleared/review if another profile served more recently
//   - burnout flag: review if the same dates are double-counted across profiles
//   - otherwise: confirmed (the flag reflects real behavior; the dup is an empty shell)
//
// Emits TWO files:
//   --real -> full data (real names + PCO ids), disk only (skip-worktree)
//   --rep  -> representative version (empty map, same exports/types), git index
// Run with tsx (imports the flagged TS lists):
//   npx tsx scripts/gen-duplicates.mjs --real > scratchpad/dup.real.ts
//   npx tsx scripts/gen-duplicates.mjs --rep  > scratchpad/dup.rep.ts
import fs from 'fs'
import { focalPointServing } from '../src/lib/clients/focal-point/serving.ts'
import { focalPointBurnout } from '../src/lib/clients/focal-point/burnout.ts'

const mode = process.argv[2] === '--rep' ? 'rep' : 'real'
const raw = JSON.parse(fs.readFileSync('scratchpad/pco-raw/duplicates.json', 'utf8'))
const vc = JSON.parse(fs.readFileSync('scratchpad/pco-raw/volunteer_checkins.json', 'utf8'))
const norm = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim()

// person_id -> sorted list of serving dates (YYYY-MM-DD)
const datesByPerson = new Map()
for (const c of vc) {
  const d = (c.created_at || '').slice(0, 10)
  if (!d) continue
  datesByPerson.set(c.person_id, [...(datesByPerson.get(c.person_id) || []), d])
}
const servingFlag = new Map(focalPointServing.people.map((p) => [norm(p.name), p]))
const burnoutFlag = new Map(focalPointBurnout.people.map((p) => [norm(p.name), p]))

const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000)

function reconcile(g, profiles) {
  const key = norm(g.name)
  const s = servingFlag.get(key)
  const b = burnoutFlag.get(key)
  if (!s && !b) return null

  const active = profiles.filter((p) => p.checkins > 0)
  const empty = profiles.filter((p) => p.checkins === 0).map((p) => p.id)
  const lasts = active.map((p) => p.lastServed).filter(Boolean).sort()
  const combinedLast = lasts[lasts.length - 1] || ''

  if (s) {
    // stopped-serving: did another profile serve more recently than the flag saw?
    const gap = combinedLast && s.lastServed ? daysBetween(combinedLast, s.lastServed) : 0
    if (gap > 14) {
      return {
        verdict: 'review',
        flag: 'Stopped serving',
        activeProfiles: active.length,
        mergeTargets: empty,
        note: `Another profile served on ${combinedLast}, more recent than the ${s.lastServed} this flag used. Combined, they may still be active. Verify before reaching out, then merge.`,
      }
    }
    return {
      verdict: 'confirmed',
      flag: 'Stopped serving',
      activeProfiles: active.length,
      mergeTargets: empty,
      note:
        active.length <= 1
          ? `All serving activity sits on one profile; the duplicate has no check-ins. This flag is real. Merge to keep the record clean.`
          : `Combined across profiles, the most recent serving is still ${combinedLast}. This flag holds. Merge to keep the record clean.`,
    }
  }

  // burnout: are the same dates double-counted across profiles?
  const rawCount = active.reduce((n, p) => n + p.checkins, 0)
  const uniqueDates = new Set()
  for (const p of profiles) for (const d of datesByPerson.get(p.id) || []) uniqueDates.add(d)
  const overlap = rawCount - uniqueDates.size
  if (rawCount > 0 && overlap / rawCount > 0.25) {
    return {
      verdict: 'review',
      flag: 'Burnout risk',
      activeProfiles: active.length,
      mergeTargets: empty,
      note: `${overlap} of ${rawCount} check-ins are the same date on two profiles. Their real serving load is lower than this flag shows. Merge, then the load re-checks.`,
    }
  }
  return {
    verdict: 'confirmed',
    flag: 'Burnout risk',
    activeProfiles: active.length,
    mergeTargets: empty,
    note: `The extra profiles add no double-counted check-ins; the serving load is real. Merge to keep the record clean.`,
  }
}

const header = `// Focal Point Church - likely-duplicate profiles in Planning Center (real,
// from scripts/pull-duplicates.mjs, enriched by scripts/gen-duplicates.mjs).
// ${raw.totalGroups} same-name groups scanned across ${raw.totalActive} active records; the ${raw.groups.length}
// most likely clusters kept (${raw.highConfidence} high-confidence). Per-profile serving
// activity is included, plus a reconciliation verdict for anyone on a care list
// (does combining their profiles change what the flag saw?). Three uses:
//   1. warn when a FLAGGED person may have check-ins split across profiles (badge)
//   2. the reconciliation line in the flag drawer (confirmed vs review)
//   3. the Settings "Possible duplicates" review list + Today cleanup card
// Planning Center owns the actual merge; Grace only surfaces the risk.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface DupProfile { id: string; created: string; membership: string; hasContact: boolean; checkins: number; lastServed: string }
export interface DupReconcile { verdict: "confirmed" | "review"; flag: string; activeProfiles: number; mergeTargets: string[]; note: string }
export interface DupInfo {
  name: string
  count: number
  confidence: "high" | "medium"
  sharedEmail: boolean
  sharedPhone: boolean
  profiles: DupProfile[]
  reconcile: DupReconcile | null
}`

const footer = `const norm = (name: string) => name.toLowerCase().replace(/\\s+/g, " ").trim()
export function duplicateInfo(name: string): DupInfo | null {
  return focalPointDuplicates[norm(name)] ?? null
}
// Full list for the Settings review view, most-profiles first.
export const focalPointDuplicateList: DupInfo[] = Object.values(focalPointDuplicates).sort(
  (a, b) => b.count - a.count,
)
export const focalPointDuplicateStats = {
  clusters: ${raw.groups.length},
  highConfidence: ${raw.highConfidence},
  extraProfiles: ${raw.duplicateProfiles},
  scanned: ${raw.totalActive},
}`

let body
if (mode === 'rep') {
  body = `export const focalPointDuplicates: Record<string, DupInfo> = {}`
} else {
  const entries = raw.groups.map((g) => {
    const profiles = g.members
      .map((m) => {
        const dates = (datesByPerson.get(m.id) || []).sort()
        return {
          id: m.id,
          created: m.created,
          membership: m.membership,
          hasContact: Boolean(m.email || m.phone),
          checkins: dates.length,
          lastServed: dates[dates.length - 1] || '',
        }
      })
      .sort((a, b) => b.checkins - a.checkins)
    const rec = reconcile(g, profiles)
    const profileLines = profiles.map(
      (p) =>
        `      { id: "${p.id}", created: "${p.created}", membership: "${p.membership}", hasContact: ${p.hasContact}, checkins: ${p.checkins}, lastServed: "${p.lastServed}" }`,
    )
    const recLine = rec
      ? `    reconcile: { verdict: "${rec.verdict}", flag: "${rec.flag}", activeProfiles: ${rec.activeProfiles}, mergeTargets: [${rec.mergeTargets.map((i) => `"${i}"`).join(', ')}], note: "${rec.note.replace(/"/g, '\\"')}" },`
      : `    reconcile: null,`
    return `  "${norm(g.name)}": {
    name: "${g.name.replace(/"/g, '\\"')}",
    count: ${g.count},
    confidence: "${g.confidence}",
    sharedEmail: ${g.sharedEmail},
    sharedPhone: ${g.sharedPhone},
    profiles: [
${profileLines.join(',\n')}
    ],
${recLine}
  }`
  })
  body = `export const focalPointDuplicates: Record<string, DupInfo> = {
${entries.join(',\n')}
}`
}

process.stdout.write(`${header}\n${body}\n${footer}\n`)
