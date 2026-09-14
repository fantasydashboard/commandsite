// serveCandidates.ts (edge transform)
//
// "Who to ask to serve", ported from scripts/pull-serve-candidates.mjs +
// gen-serve-candidates.mjs so the Serving page stops depending on someone
// running two scripts by hand and uploading the result.
//
// It was the last list on the dashboard arriving that way, and it showed:
// pulled Aug 27, it went stale silently, and because the local script never
// applied the church's staff list it was recommending staff members to the
// church as people to ask.
//
// Ranked by the two signals that predict a yes:
//   Tier 1  in a Growth Group AND dropping kids off   already here, weekly, and connected
//   Tier 2  in a Growth Group
//   Tier 3  dropping kids off
// Within a tier, more Sundays present ranks higher. "Sundays" counts distinct
// days they physically dropped a child off, which is a recorded, dated
// appearance. Group membership on its own is not, so tier 2 carries no
// attendance measure and is reported as a count rather than a worklist.
//
// Pure and synchronous: all database access lives in computeFromCache, so the
// decisions here are testable without a network or a database.

/** One staged kids check-in. `checked_in_by` is the ADULT who dropped the child
 *  off, null for self check-in and kiosk rows. */
export interface KidsCheckinRow { person_id: string; checkin_date: string; checked_in_by: string | null }
export interface GroupMemberRow { person_id: string; name: string; group_name: string }
export interface AssignmentRow { person_id: string; date: string; status: string }
export interface PersonNameRow { person_id: string; name: string }

export interface ServeCandidate {
  name: string
  /** 1 = group + kids drop-off, 2 = group only, 3 = kids drop-off only */
  tier: 1 | 2 | 3
  /** Distinct days they dropped a child off inside the window. */
  sundays: number
  groups: string[]
}
export interface ServeCandidatesPayload {
  generated: string
  windowDays: number
  /** Exact, even where the named list below is capped. */
  totals: { tier1: number; tier2: number; tier3: number; all: number }
  people: ServeCandidate[]
}

/** How far back a drop-off still counts as "here regularly". */
export const WINDOW_DAYS = 120
/**
 * Tier 1 ships in full: it is the actionable list and it is small. Tiers 2 and
 * 3 are capped because several hundred people whose only signal is group
 * membership is a directory, not a worklist, and shipping all of them would
 * repeat the mistake the guest and care windows were built to fix. The totals
 * stay exact so the page never understates the pool.
 */
export const NAMED_CAP = 120

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5)

const norm = (n: string): string => n.toLowerCase().replace(/\s+/g, ' ').trim()

export function buildServeCandidates(input: {
  kids: KidsCheckinRow[]
  groupMembers: GroupMemberRow[]
  assignments: AssignmentRow[]
  people: PersonNameRow[]
  staffNames: string[]
  today: string
  windowDays?: number
}): ServeCandidatesPayload {
  const { kids, groupMembers, assignments, people, staffNames, today } = input
  const windowDays = input.windowDays ?? WINDOW_DAYS

  // Who dropped a child off, and on how many distinct days.
  const dropDates = new Map<string, Set<string>>()
  for (const k of kids) {
    const by = k.checked_in_by
    if (!by || !k.checkin_date) continue
    const age = daysBetween(today, k.checkin_date)
    if (age < 0 || age > windowDays) continue
    let set = dropDates.get(by)
    if (!set) { set = new Set<string>(); dropDates.set(by, set) }
    set.add(k.checkin_date)
  }

  // Group membership, and the names that come with it.
  const groupsOf = new Map<string, Set<string>>()
  const nameOf = new Map<string, string>()
  for (const m of groupMembers) {
    if (!m.person_id) continue
    let set = groupsOf.get(m.person_id)
    if (!set) { set = new Set<string>(); groupsOf.set(m.person_id, set) }
    if (m.group_name) set.add(m.group_name)
    if (m.name && !nameOf.has(m.person_id)) nameOf.set(m.person_id, m.name.trim())
  }
  for (const p of people) {
    if (p.person_id && p.name && !nameOf.has(p.person_id)) nameOf.set(p.person_id, p.name.trim())
  }

  /**
   * Already serving, so not a "never been asked" candidate.
   *
   * A confirmed shift inside the same window, or anything upcoming they have
   * not declined. Deliberately the SAME window as the drop-off signal: this
   * asks "do they serve right now", not "have they ever served". Someone who
   * served last spring and stopped is a Care & Drift case, not a person to ask.
   */
  const serving = new Set<string>()
  for (const a of assignments) {
    if (!a.person_id || !a.date) continue
    const status = (a.status ?? '').toUpperCase()
    if (a.date > today) {
      if (status !== 'D') serving.add(a.person_id)
      continue
    }
    if (status !== 'C') continue
    if (daysBetween(today, a.date) <= windowDays) serving.add(a.person_id)
  }

  const staff = new Set(staffNames.map(norm))

  const candidates: ServeCandidate[] = []
  const seen = new Set<string>([...groupsOf.keys(), ...dropDates.keys()])
  for (const pid of seen) {
    if (serving.has(pid)) continue
    const name = nameOf.get(pid)
    // No name means no row a human could act on, so it is not a candidate.
    if (!name) continue
    if (staff.has(norm(name))) continue
    const groups = [...(groupsOf.get(pid) ?? [])].sort()
    const sundays = dropDates.get(pid)?.size ?? 0
    const inGroup = groups.length > 0
    const drops = sundays > 0
    if (!inGroup && !drops) continue
    const tier: 1 | 2 | 3 = inGroup && drops ? 1 : inGroup ? 2 : 3
    candidates.push({ name, tier, sundays, groups })
  }

  candidates.sort((a, b) =>
    a.tier - b.tier || b.sundays - a.sundays || a.name.localeCompare(b.name))

  const byTier = (t: 1 | 2 | 3) => candidates.filter((c) => c.tier === t)
  const t1 = byTier(1), t2 = byTier(2), t3 = byTier(3)

  return {
    generated: today,
    windowDays,
    totals: { tier1: t1.length, tier2: t2.length, tier3: t3.length, all: candidates.length },
    people: [...t1, ...t2.slice(0, NAMED_CAP), ...t3.slice(0, NAMED_CAP)],
  }
}
