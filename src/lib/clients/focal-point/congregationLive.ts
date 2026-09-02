// Congregation lookup for the English / Brazilian lens, live-or-baked.
//
// ── The bug this fixes ────────────────────────────────────────────────────
// Choosing English or Brazilian on Care & Drift emptied the page: 0 families
// drifting, 0 group drift, in BOTH congregations, while All showed 21 flagged
// families. Stopped serving kept working.
//
// That split is the whole clue. Serving scopes by a `campus` field carried
// inside its live payload. Families and groups scope by looking a name up in
// `focalPointCongregation`, a map in congregation.ts. congregation.ts is a
// skip-worktree file: real names live on one laptop, and the COMMITTED copy
// exports `{}`. So production shipped an empty map, congregationOf returned
// null for every person, and "people we cannot place stay visible only in the
// 'all' scope" quietly hid everyone.
//
// Same class of bug as the roster shipping "Volunteer A" to production: per
// congregant data was living in the JS bundle, where it either leaks names or
// is empty. It belongs in church_dashboard_data, which is behind RLS, so a
// signed-in church user resolves real names and the public bundle carries none.
//
// ── Why a new module instead of editing congregation.ts ───────────────────
// congregation.ts is skip-worktree. Editing it would work perfectly on this
// laptop and never reach production, which is precisely the failure being
// fixed. Anything that has to ship must live in a normally tracked file.
import { careData } from '@/lib/clients/church/careDataLoader'
import { focalPointCongregation, type Congregation } from './congregation'

const norm = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The map in force: the live one when a church has synced it, otherwise the
 * baked one (real on a dev laptop, empty in the production bundle).
 */
function activeMap(): Record<string, Congregation> {
  return careData.congregation ?? focalPointCongregation
}

/**
 * Resolve a person's name, a family surname, or the "The {Name} family" display
 * form to a congregation. Null means "we cannot place this person", which every
 * caller treats as visible in the 'all' scope only.
 */
export function congregationOf(name: string): Congregation | null {
  const map = activeMap()
  const k = norm(name)
  if (map[k]) return map[k]
  const fam = k.replace(/^the\s+/, '').replace(/\s+family$/, '').trim()
  return map[fam] ?? null
}

/**
 * True when we have no map at all, so the lens cannot place anybody. Callers use
 * this to explain an empty scoped view instead of implying the congregation has
 * nobody drifting, which is the misread that made this bug hard to see.
 */
export function congregationMapMissing(): boolean {
  return Object.keys(activeMap()).length === 0
}

export type { Congregation }
