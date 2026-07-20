// Reconciles the family-drift snapshot against the latest check-ins. The static
// drift flags were pulled earlier (~Jul 9); check-in activity is fresh through
// Jul 14. A family that has since returned (their kids checked back in on recent
// Sundays) is no longer drifting, so it drops off the active list and is counted
// as reconnected. This is exactly what the scheduled production refresh does
// (recompute every flag against the newest check-ins); here it runs once against
// the current snapshot so the flags stay consistent with the activity shown in
// the drawer. When the whole dataset is re-pulled on a schedule, this becomes a
// no-op because the snapshot and the activity are the same age.
import { focalPointDrift, type DriftFamily } from './drift'
import { activityFor } from './activity'
import { REFERENCE_SUNDAY } from './dataFreshness'

const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

// Sundays a family has missed between their last check-in and the reference Sunday.
function sundaysMissedSince(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`)
  const ref = new Date(`${REFERENCE_SUNDAY}T00:00:00Z`)
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
  return focalPointDrift.families.map(reconcile)
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
  const f = focalPointDrift.families.find((x) => norm(x.family) === surname)
  return f ? reconcile(f).returned : false
}
