// Splits the burnout payload into the two groups it actually contains.
//
// computeBurnout flags anyone matching `perMonth >= 3 || teams.length >= 2`.
// That second clause is very wide: at Focal Point it pulls in roughly 109 of the
// 164 flagged people, all serving once or twice a month, purely for being on two
// teams. Being on two teams is not burnout.
//
// The consequence was a page telling a pastor "164 volunteers serving too often"
// when two thirds of them serve once a month, and labelling all 164 "protect, do
// not add load", which is wrong advice for most of that list and makes the whole
// signal unusable: nobody triages 164 people.
//
// Splitting here rather than retightening the transform is deliberate. Changing
// the threshold means a redeploy plus a recompute, and the resulting number
// cannot be seen until it runs. This is frontend-only, reversible, and shows
// exactly the same underlying data with the two groups named honestly.
//
// The transform should still be tightened; this makes the page truthful now.

/** At or above this many shifts a month is a genuine load concern. */
export const HEAVY_PER_MONTH = 3

/** Serving on this many teams is "spread across ministries" even at low frequency. */
export const SPREAD_TEAMS = 3

export interface LoadPerson {
  name: string
  areas: string[]
  campus: string
  perMonth: number
  tier: string
}

interface Slice { perMonth: number; areas: string[]; tier: string | null }

/**
 * Re-express each person as their load IN ONE CONGREGATION, and drop anyone who
 * does not clear the bar there.
 *
 * The lens used to filter on the person's campus and pass anyone marked 'both'
 * through with their church-wide numbers. At Focal Point that put the heaviest
 * volunteer in the church at the top of the ENGLISH list, at 9x/month, evidenced
 * by six teams of which four serve the 6pm Brazilian service. The English
 * ministry leader could neither recognise the load nor do anything about it, and
 * the panel's own sentence claimed it was counting "the english ministry's
 * teams".
 *
 * Everything downstream (heavyLoad, spreadThin, the chart, the table) keeps
 * reading perMonth / areas / tier, so scoping happens once, here.
 *
 * Payloads computed before byCampus existed fall back to the old behaviour
 * rather than emptying the page: this ships ahead of the recompute, and a board
 * that reads zero is worse than one that reads the old way for an hour.
 */
export function scopedBurnout<T extends LoadPerson & { byCampus?: Record<string, Slice> }>(
  people: T[],
  scope: string,
): T[] {
  if (scope !== 'english' && scope !== 'brazilian') return people
  const out: T[] = []
  for (const p of people) {
    const s = p.byCampus?.[scope]
    if (!s) {
      if (p.campus === 'both' || p.campus === scope) out.push(p)
      continue
    }
    if (s.tier === null) continue
    out.push({ ...p, perMonth: s.perMonth, areas: s.areas, tier: s.tier })
  }
  return out
}

/** Carrying real frequency: the people the phrase "serving too often" describes. */
export function heavyLoad<T extends LoadPerson>(people: T[]): T[] {
  return people.filter((p) => p.perMonth >= HEAVY_PER_MONTH)
}

/** Low frequency but spread across several teams. A different concern (context
 *  switching, many sets of expectations) and a much softer one. */
export function spreadThin<T extends LoadPerson>(people: T[]): T[] {
  return people.filter((p) => p.perMonth < HEAVY_PER_MONTH && p.areas.length >= SPREAD_TEAMS)
}

/** Flagged only for being on two teams at one or two shifts a month. Kept in the
 *  data, but not worth a leader's attention this week. */
export function lightTouch<T extends LoadPerson>(people: T[]): T[] {
  return people.filter((p) => p.perMonth < HEAVY_PER_MONTH && p.areas.length < SPREAD_TEAMS)
}
