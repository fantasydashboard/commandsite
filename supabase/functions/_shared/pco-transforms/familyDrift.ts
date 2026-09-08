// familyDrift.ts
export interface CheckinRow {
  person_id: string; first: string; last: string; checkin_date: string; kind: string
  /** Planning Center household, when known. See checkinsToFamilies. */
  household_id?: string | null
  household_name?: string | null
}
export interface FamilyAttendance { family: string; kids: string[]; sundays: string[] }
export interface DriftFamily { family: string; kids: string[]; lastSeen: string; sundaysMissed: number; monthsAttending: number; totalSundays: number }
export interface DriftCfg { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number }
export interface DriftPayload { flaggedFamilies: number; flaggedKids: number; windowMonths: number; onboardingExcluded: number; signal: string; families: DriftFamily[]; drafts: [] }

// Verbatim from src/lib/clients/focal-point/drift.ts (the `signal:` field) so the
// live payload matches the baked shape.
const DRIFT_SIGNAL = 'Families whose children were regular at Kids Point for months, then stopped for 3+ Sundays. Ranked by how established they were. First-time and one-or-two-visit families are excluded here (they are in the welcome funnel, not drifting).'

const DAY = 864e5
// The Sunday (UTC) of the week a date falls in.
function toSunday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}
// Sundays strictly after lastSeen, up to and including refSunday.
function sundaysMissedSince(lastSeen: string, refSunday: string): number {
  const d = new Date(`${lastSeen}T00:00:00Z`)
  const ref = new Date(`${refSunday}T00:00:00Z`)
  const next = new Date(d)
  next.setUTCDate(d.getUTCDate() + 7) // lastSeen is itself a Sunday; step to the next
  let n = 0
  while (next <= ref) { n++; next.setUTCDate(next.getUTCDate() + 7) }
  return n
}

/**
 * Title-cases a surname for display. Planning Center holds whatever was typed,
 * so "nunes" reaches a pastoral note as "Hey nunes family". Only fixes case: an
 * apostrophe missing from "DAmelio" is the church's record to correct, and
 * guessing where one belongs would be worse than leaving it.
 */
function tidySurname(s: string): string {
  return s.replace(/\S+/g, (w) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
}

/**
 * Group a child's check-ins into families.
 *
 * Groups by HOUSEHOLD when Planning Center gives us one, and falls back to the
 * surname string when it does not.
 *
 * It used to always group by surname, which broke in both directions and both
 * were live on Focal Point:
 *
 *   SPLIT   "Farmer" and "Farmer jr" became two flagged families, both 21
 *           Sundays, both last seen the same day, from ONE Farmer Household.
 *           Same with "Merino" and "Merino III", which sat in the escalated
 *           call list twice. The pastor calls one household twice, and because
 *           the Sundays are divided between two rows, tenure is understated and
 *           the "most established first" ranking is wrong.
 *
 *   MERGE   Two unrelated households sharing a surname collapse into one
 *           family, and the drafted note then names another family's child.
 *           Rarer, much worse, and structurally possible.
 *
 * The display name still comes from the surname rather than PCO's household
 * name, because "The Farmer family" is how a pastor speaks and "Farmer
 * Household" is not.
 */
export function checkinsToFamilies(rows: CheckinRow[]): FamilyAttendance[] {
  const byFam: Record<string, { family: string; kids: Set<string>; sundays: Set<string> }> = {}
  for (const r of rows) {
    const surname = (r.last ?? '').trim()
    if (!surname) continue
    // Household id when we have it; surname otherwise, so a church without the
    // household pull still gets the old behaviour rather than nothing.
    const key = (r.household_id ?? '').trim() || `name:${surname.toLowerCase()}`
    const display = tidySurname(surname)
    const g = (byFam[key] ??= { family: display, kids: new Set(), sundays: new Set() })
    g.kids.add(`${(r.first ?? '').trim()} ${display}`.trim())
    g.sundays.add(toSunday(r.checkin_date))
  }
  return Object.values(byFam).map((g) => ({ family: g.family, kids: [...g.kids], sundays: [...g.sundays] }))
}

export function computeFamilyDrift(families: FamilyAttendance[], cfg: DriftCfg, today: string): DriftPayload {
  const refSunday = toSunday(today)
  let onboardingExcluded = 0
  const flagged: DriftFamily[] = []
  for (const f of families) {
    const sundays = [...new Set(f.sundays)].sort()
    const totalSundays = sundays.length
    if (totalSundays < cfg.minEstablishedSundays) { onboardingExcluded++; continue }
    const lastSeen = sundays[sundays.length - 1]
    const firstSeen = sundays[0]
    const monthsAttending = Math.max(1, Math.round((Date.parse(lastSeen) - Date.parse(firstSeen)) / (30 * DAY)))
    const missed = sundaysMissedSince(lastSeen, refSunday)
    if (missed < cfg.sundaysMissed) continue
    flagged.push({ family: f.family, kids: [...new Set(f.kids)], lastSeen, sundaysMissed: missed, monthsAttending, totalSundays })
  }
  flagged.sort((a, b) => b.totalSundays - a.totalSundays || b.monthsAttending - a.monthsAttending)
  return {
    flaggedFamilies: flagged.length,
    flaggedKids: flagged.reduce((n, f) => n + f.kids.length, 0),
    windowMonths: cfg.windowMonths,
    onboardingExcluded,
    signal: DRIFT_SIGNAL,
    families: flagged,
    drafts: [],
  }
}
