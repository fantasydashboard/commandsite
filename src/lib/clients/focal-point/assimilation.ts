// Focal Point Church - the "Getting Connected" assimilation cohort: of everyone
// who FIRST visited in the last 12 months (a Starting Point card), how many have
// since reached each milestone. Real, from scripts/pull-assimilation.mjs +
// scripts/pull-bra-mtp.mjs, joined by person id to the serving schedule + group
// membership. Aggregate counts only, no PII, committed normally. Scopes by
// congregation (English / Brazilian each run their own Starting Point + Meet the
// Pastor). These are milestones, not a strict funnel: a visitor can join a group
// without serving, so "in a group" can exceed "serving".
export type Campus = 'all' | 'english' | 'brazilian'
export interface Milestones {
  visited: number
  completedSP: number
  metPastor: number
  serving: number
  group: number
}
export const assimilation: Record<Campus, Milestones> = {
  all: { visited: 466, completedSP: 64, metPastor: 50, serving: 17, group: 57 },
  english: { visited: 283, completedSP: 45, metPastor: 46, serving: 10, group: 37 },
  brazilian: { visited: 183, completedSP: 19, metPastor: 4, serving: 7, group: 20 },
}
