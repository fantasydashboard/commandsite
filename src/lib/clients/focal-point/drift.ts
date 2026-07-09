// Focal Point Church - Drift Watch (real, tenure-weighted kids-attendance drift).
// ---------------------------------------------------------------------------
// Real signal: children who were REGULAR at Kids Point (months of Sundays),
// then stopped for 3+ Sundays. Weighted by tenure so it flags established,
// committed families going quiet, not one-and-done first-time visitors (those
// are in the welcome funnel on Front Desk, not drifting). Computed from
// Planning Center Check-Ins over ~10 months (scripts/explore-drift.mjs).
//
// Aggregate counts below are real and safe to commit. The family-level list
// and drafted check-ins contain real names, so the committed version keeps
// them EMPTY; the real data lives only in the local copy of this file
// (git skip-worktree).
//
// Not yet included (waiting on Christina's full-access token): giving-lapse
// and group-absence signals. Attendance drift stands on its own until then.

export interface DriftFamily {
  family: string
  kids: string[]
  lastSeen: string        // ISO date of last Kids Point check-in
  sundaysMissed: number   // consecutive Sundays missed since lastSeen
  monthsAttending: number // how many months they were a regular before going quiet
  totalSundays: number    // total Sundays attended over the ~10-month window
}

export interface DriftDraft {
  id: string
  family: string
  context: string         // e.g. "Regular ~9mo (25 Sundays) · last at Kids Point May 24 · missed 6"
  draft: string           // check-in text in Pastor Mark's voice, never auto-sent
}

export const focalPointDrift: {
  flaggedFamilies: number
  flaggedKids: number
  windowMonths: number
  onboardingExcluded: number
  signal: string
  families: DriftFamily[]
  drafts: DriftDraft[]
} = {
  flaggedFamilies: 53,
  flaggedKids: 70,
  windowMonths: 10,
  onboardingExcluded: 352,
  signal:
    'Families whose children were regular at Kids Point for months, then stopped for 3+ Sundays. Ranked by how established they were. First-time and one-or-two-visit families are excluded here (they are in the welcome funnel, not drifting).',
  families: [],
  drafts: [],
}
