// Focal Point Church - Drift Watch (real kids-attendance drift).
// ---------------------------------------------------------------------------
// Real signal: children who checked into Kids Point regularly, then stopped
// for 3+ Sundays. This is the leading indicator that a family is drifting
// (the kids go quiet before the adults do). Computed from Planning Center
// Check-Ins (scripts/explore-drift.mjs -> scratchpad/pco-raw/drift_families.json).
//
// The aggregate counts below are real and safe to commit. The family-level
// list and the drafted check-ins contain real names, so the committed version
// keeps them EMPTY; the real data lives only in the local copy of this file
// (git skip-worktree), so congregant PII never enters git.
//
// Not yet included (waiting on Christina's full-access token): the giving-lapse
// and group-absence signals. Attendance drift stands on its own until then.

export interface DriftFamily {
  family: string
  kids: string[]
  lastSeen: string       // ISO date of last Kids Point check-in
  sundaysMissed: number  // consecutive Sundays missed since lastSeen
  priorAttendance: number // Sundays attended in the prior window (was regular)
}

export interface DriftDraft {
  id: string
  family: string
  context: string        // e.g. "1 kid · last at Kids Point May 3 · missed 9 Sundays"
  draft: string          // check-in text in Pastor Mark's voice, never auto-sent
}

export const focalPointDrift: {
  flaggedFamilies: number
  flaggedKids: number
  windowSundays: number
  signal: string
  families: DriftFamily[]
  drafts: DriftDraft[]
} = {
  flaggedFamilies: 29,
  flaggedKids: 37,
  windowSundays: 13,
  signal:
    'Children who checked into Kids Point regularly, then stopped for 3+ Sundays. The leading indicator that a family is drifting.',
  families: [],
  drafts: [],
}
