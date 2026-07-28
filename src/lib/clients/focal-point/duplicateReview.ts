// Focal Point - live duplicate read-layer. Reads the live-or-baked duplicates
// payload from careDataLoader and cross-references the LIVE care/drift lists so the
// Settings review list, Today cleanup card, badges, and flag drawers all annotate
// each cluster with the flag(s) it affects. Grace's reconcile verdict rides on
// `reconcile`; Planning Center owns the actual merge.
import { duplicatesData, servingData, burnoutData, groupDriftData } from '@/lib/clients/church/careDataLoader'
import type { DupInfo } from './duplicates'

const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

export interface DupReviewRow extends DupInfo {
  flags: string[]
}

export function duplicateInfo(name: string): DupInfo | null {
  return duplicatesData().groups[norm(name)] ?? null
}

export function duplicateStats() {
  return duplicatesData().stats
}

// normalized name -> the live care lists it appears on
function flaggedIndex(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const add = (name: string, tag: string) => {
    const k = norm(name)
    map.set(k, [...(map.get(k) ?? []), tag])
  }
  servingData().people.forEach((p) => add(p.name, 'Stopped serving'))
  burnoutData().people.forEach((p) => add(p.name, 'Burnout risk'))
  groupDriftData().people.forEach((p) => add(p.name, 'Group drift'))
  return map
}

// All clusters, annotated with the flags they affect, flagged ones sorted first
// (review verdict above confirmed), then high-confidence, then most profiles.
export function allDuplicateRows(): DupReviewRow[] {
  const idx = flaggedIndex()
  return Object.values(duplicatesData().groups)
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
