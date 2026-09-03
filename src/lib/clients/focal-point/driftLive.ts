// Reconciles the family-drift snapshot against the latest check-ins. A family
// that has since returned (their kids checked back in on recent Sundays) is no
// longer drifting, so it drops off the active list and counts as reconnected.
//
// ── Two bugs fixed here ──────────────────────────────────────────────────
// 1. It read the BAKED drift file and the BAKED activity map. Both are
//    skip-worktree and both are empty in the committed copy, so in production
//    this reconciled real flags against nothing.
// 2. It measured "Sundays missed" against REFERENCE_SUNDAY, derived from the
//    hardcoded DATA_AS_OF = 2026-07-14. Every count was frozen to mid-July
//    regardless of the actual date, so "who came back" drifted further from the
//    truth every week while the rest of Care & Drift ran on nightly live data.
//
// Now reads the live drift payload and live activity, and measures against the
// most recent Sunday relative to today. The file's own original note said this
// becomes a no-op once the dataset is re-pulled on a schedule; that is now true,
// so on live data the reconciliation correctly finds nobody returned (the
// nightly compute already dropped them) and Recent Wins self-hides rather than
// showing July.
import { type DriftFamily } from './drift'
import { driftData } from '@/lib/clients/church/careDataLoader'
import { activityFor } from './activityLive'

/** Most recent Sunday on or before today, in UTC. */
function referenceSunday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

// Sundays a family has missed between their last check-in and the reference Sunday.
function sundaysMissedSince(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`)
  const ref = new Date(`${referenceSunday()}T00:00:00Z`)
  const day = d.getUTCDay()
  const next = new Date(d)
  next.setUTCDate(d.getUTCDate() + (day === 0 ? 7 : 7 - day))
  let n = 0
  while (next <= ref) {
    n++
    next.setUTCDate(next.getUTCDate() + 7)
  }
  return n
}

export interface LiveFamily extends DriftFamily {
  returned: boolean
}

function reconcile(f: DriftFamily): LiveFamily {
  const freshLast = activityFor(f.family)?.items?.[0]?.date ?? f.lastSeen
  const missedNow = sundaysMissedSince(freshLast)
  // reflect the newest reality in the family's own fields
  return { ...f, lastSeen: freshLast, sundaysMissed: missedNow, returned: missedNow < 3 }
}

export function liveFamilies(): LiveFamily[] {
  return driftData().families.map(reconcile)
}
export function activeFamilies(): LiveFamily[] {
  return liveFamilies().filter((f) => !f.returned)
}
export function returnedFamilies(): LiveFamily[] {
  return liveFamilies().filter((f) => f.returned)
}

// Has the family behind a care-case name (e.g. "The Gonzalez family") returned?
export function familyReturned(name: string): boolean {
  const surname = norm(name).replace(/^the\s+/, '').replace(/\s+family$/, '').trim()
  const f = driftData().families.find((x) => norm(x.family) === surname)
  return f ? reconcile(f).returned : false
}
