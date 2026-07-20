// Focal Point - shared duplicate-review logic. Cross-references the likely
// duplicate clusters with the live care/drift lists so both the Settings review
// list and the Today cleanup card annotate each cluster with the flag(s) it
// affects (and Grace's reconciliation verdict rides along on `reconcile`).
import { focalPointDuplicateList, type DupInfo } from './duplicates'
import { focalPointServing } from './serving'
import { focalPointBurnout } from './burnout'
import { focalPointGroupDrift } from './groupDrift'

const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

export interface DupReviewRow extends DupInfo {
  flags: string[] // which live lists this person is on right now
}

// normalized name -> the care lists it appears on
function flaggedIndex(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const add = (name: string, tag: string) => {
    const k = norm(name)
    map.set(k, [...(map.get(k) ?? []), tag])
  }
  focalPointServing.people.forEach((p) => add(p.name, 'Stopped serving'))
  focalPointBurnout.people.forEach((p) => add(p.name, 'Burnout risk'))
  focalPointGroupDrift.people.forEach((p) => add(p.name, 'Group drift'))
  return map
}

// All clusters, annotated with the flags they affect, flagged ones sorted first
// (review verdict above confirmed), then high-confidence, then most profiles.
export function allDuplicateRows(): DupReviewRow[] {
  const idx = flaggedIndex()
  return focalPointDuplicateList
    .map((d) => ({ ...d, flags: idx.get(norm(d.name)) ?? [] }))
    .sort((a, b) => {
      if (!!b.flags.length !== !!a.flags.length) return b.flags.length ? 1 : -1
      const review = Number(b.reconcile?.verdict === 'review') - Number(a.reconcile?.verdict === 'review')
      if (review) return review
      const conf = Number(b.confidence === 'high') - Number(a.confidence === 'high')
      if (conf) return conf
      return b.count - a.count
    })
}

// Only the clusters that overlap a live care/drift flag (the ones worth fixing first).
export function flaggedDuplicates(): DupReviewRow[] {
  return allDuplicateRows().filter((r) => r.flags.length)
}
