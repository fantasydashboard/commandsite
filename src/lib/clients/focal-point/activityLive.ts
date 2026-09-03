// Recent activity behind a flag, live-or-baked.
//
// ── The bug this fixes ────────────────────────────────────────────────────
// activity.ts is skip-worktree. The real map is 130KB on a developer laptop and
// the COMMITTED copy exports `{}`. It had no live loader, unlike drift, serving,
// burnout and guests, so in production `activityFor()` returned null for every
// person and FlagDetailDrawer's "Recent activity" block, gated on
// `v-if="recent.length"`, simply vanished.
//
// That block is the evidence. The drawer answers "why is this person flagged",
// and in production it showed the claim without the check-ins that prove it, and
// gave no sign anything was missing. Staff being asked to trust these flags were
// shown the least trustworthy version of them.
//
// Third occurrence of the same class: roster/serveCandidates shipped
// "Volunteer A", then the congregation map shipped empty. Per-person data
// belongs in church_dashboard_data, which is behind RLS, not in the public JS
// bundle. See [[cs_pii_lives_in_the_database]].
//
// ── Why a new module ──────────────────────────────────────────────────────
// Editing activity.ts would work perfectly on this laptop and never reach
// production, which is the exact failure being fixed.
import { careData } from '@/lib/clients/church/careDataLoader'
import { focalPointActivity, type PersonActivity } from './activity'

const norm = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

function activeMap(): Record<string, PersonActivity> {
  return careData.activity ?? focalPointActivity
}

/**
 * Resolve a person's name, or the "The {Name} family" display form, to their
 * recent check-in / serving history. Null means we genuinely have no history
 * for them, which callers must show honestly rather than hide.
 */
export function activityFor(name: string): PersonActivity | null {
  const map = activeMap()
  const k = norm(name)
  if (map[k]) return map[k]
  const fam = k.replace(/^the\s+/, '').replace(/\s+family$/, '').trim()
  return map[fam] ?? null
}

/**
 * True when no activity history is loaded at all, so a missing block is a
 * data-plumbing gap rather than a person with no history. Drives the drawer's
 * honest empty state: an absent evidence panel reads as "there is no evidence",
 * which is a very different and much worse claim.
 */
export function activityMapMissing(): boolean {
  return Object.keys(activeMap()).length === 0
}

export type { PersonActivity }
