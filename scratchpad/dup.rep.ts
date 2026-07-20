// Focal Point Church - likely-duplicate profiles in Planning Center (real,
// from scripts/pull-duplicates.mjs, enriched by scripts/gen-duplicates.mjs).
// 463 same-name groups scanned across 13000 active records; the 120
// most likely clusters kept (88 high-confidence). Per-profile serving
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
}
export const focalPointDuplicates: Record<string, DupInfo> = {}
const norm = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim()
export function duplicateInfo(name: string): DupInfo | null {
  return focalPointDuplicates[norm(name)] ?? null
}
// Full list for the Settings review view, most-profiles first.
export const focalPointDuplicateList: DupInfo[] = Object.values(focalPointDuplicates).sort(
  (a, b) => b.count - a.count,
)
export const focalPointDuplicateStats = {
  clusters: 120,
  highConfidence: 88,
  extraProfiles: 526,
  scanned: 13000,
}
