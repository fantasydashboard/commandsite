// Focal Point Church - the "Getting Connected" assimilation cohort: of everyone
// who FIRST visited in the last 12 months (a Starting Point card), how many have
// since reached each milestone. Real, from scripts/pull-assimilation.mjs joined by
// person id to live group membership and to each person's Services schedule
// (any confirmed assignment, past or upcoming). Aggregate counts only, no PII,
// committed normally. Scopes by congregation (English / Brazilian each run their
// own Starting Point + Meet the Pastor). These are milestones, not a strict
// funnel: a visitor can join a group without serving, so "in a group" can exceed
// "serving".
//
// Pulled 2026-09-11 (window Sep 11 2025 to Sep 11 2026). The Brazilian Meet the
// Pastor set is the Jul 17 pull; there is no workflow for it to re-pull from.
export type Campus = 'all' | 'english' | 'brazilian'
export interface Milestones {
  visited: number
  completedSP: number
  metPastor: number
  serving: number
  group: number
}
export const assimilation: Record<Campus, Milestones> & { asOf: string } = {
  asOf: '2026-09-11',
  all: { visited: 476, completedSP: 72, metPastor: 47, serving: 11, group: 54 },
  english: { visited: 290, completedSP: 43, metPastor: 43, serving: 5, group: 35 },
  brazilian: { visited: 187, completedSP: 29, metPastor: 4, serving: 7, group: 20 },
}
