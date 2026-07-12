// Focal Point Church - Burnout Watch (real serving-overload signal).
// ---------------------------------------------------------------------------
// The inverse of serving drift: volunteers serving MORE than twice a month,
// often across several ministries, and still going. These are the people most
// likely to burn out and drop next. Catching them early with a "please rest"
// note protects the church's best servers before they become drift.
// Computed from Planning Center volunteer check-ins (scripts/explore-serving.mjs).
//
// Aggregate counts are real and committed. The person-level list and drafts
// contain real names, so the committed version keeps them EMPTY; real data
// lives only in the local copy of this file (git skip-worktree).

export interface BurnoutPerson {
  name: string
  areas: string[]      // ministries they serve in, most-frequent first
  perMonth: number     // times served per month
  tier: 'high' | 'medium'
}

export interface BurnoutDraft {
  id: string
  name: string
  context: string
  draft: string
}

export const focalPointBurnout: {
  flaggedPeople: number
  highRisk: number
  activeVolunteers: number
  signal: string
  people: BurnoutPerson[]
  drafts: BurnoutDraft[]
} = {
  flaggedPeople: 253,
  highRisk: 189,
  activeVolunteers: 754,
  signal:
    'Volunteers serving more than twice a month, often across several ministries, and still going. The people most likely to burn out and drop next. Today\'s over-servers are next quarter\'s drift.',
  people: [],
  drafts: [],
}
