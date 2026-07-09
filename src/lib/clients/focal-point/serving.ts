// Focal Point Church - People Drift Watch (real serving drift).
// ---------------------------------------------------------------------------
// Serving is an INDIVIDUAL signal (unlike kids attendance, which is a family
// signal): a person who was a regular volunteer, then stopped serving for 6+
// weeks. The check-in goes to that person, not the household. Computed from
// Planning Center volunteer check-ins over ~6 months (scripts/explore-serving.mjs).
//
// Aggregate counts are real and committed. The person-level list and drafts
// contain real names, so the committed version keeps them EMPTY; real data
// lives only in the local copy of this file (git skip-worktree).
//
// Serving is LIVE. Giving and group-attendance signals connect once those PCO
// scopes are enabled (Christina's full-access token).

export interface ServingDriftPerson {
  name: string
  area: string           // where they served (Youth Service, Kids Point, etc.)
  monthsServing: number  // how long they were a regular before stopping
  totalServed: number    // times served over the window
  lastServed: string     // ISO date
  weeksSince: number      // weeks since they last served
}

export interface ServingDraft {
  id: string
  name: string
  area: string
  context: string
  draft: string
}

export const focalPointServing: {
  flaggedPeople: number
  totalVolunteers: number
  signal: string
  people: ServingDriftPerson[]
  drafts: ServingDraft[]
} = {
  flaggedPeople: 104,
  totalVolunteers: 2168,
  signal:
    'Individuals who were regular volunteers, then stopped serving for 6+ weeks. This is a personal check-in with the individual, not the household.',
  people: [],
  drafts: [],
}
