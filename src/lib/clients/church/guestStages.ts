// Guest pipeline stages, named after the church's OWN Starting Point steps.
//
// ── Why this file exists ──────────────────────────────────────────────────
// The stage list used to live in focal-point/guestPipeline.ts, which is
// skip-worktree, so editing the labels there would have worked on one laptop
// and never shipped. Vocabulary is not congregant data and belongs in a tracked
// leaf. (No imports here on purpose, same reason as tabs.ts.)
//
// ── Why the labels changed ────────────────────────────────────────────────
// The board used to read New guest -> Welcomed -> Connecting -> Belongs ->
// Cooled. None of those were Focal Point's words. Their actual Starting Point
// workflow is three steps and it is physical:
//
//   English    Welcome Phone Call + Orange Coffee Mug
//              Week 2 + "Orange You Glad You Came Back" Bag
//              Week 3 + Gift Card
//   Brazilian  Welcome Phone Call / Week 2 / Week 3   (steps unnamed)
//
// Three problems with the old set, all visible on one screen:
//   1. The phone-call step had NO column. stageOf only tested week 2 and week
//      3, so a card on the call fell through to "New guest". The first human
//      touch in their process was invisible on a board headed "where every
//      first-time guest is".
//   2. "Belongs" claims far more than "received a gift card", and the KPI
//      "95 of your 107 are still just visitors" was derived from it. That tells
//      a pastor 95 people do not belong when all it knows is they have not
//      finished a three-week gift sequence.
//   3. "Cooled" was invented, always empty, and made five columns for a
//      three-step process.
//
// Naming the columns after their steps also fixes attribution for free: "Week 2
// bag" is plainly the church's step, so nothing implies Grace did it. And it
// turns a status into a to-do: "88 people are at the week-2 bag step" is
// actionable in a way "88 Welcomed" never was.
//
// NOTE ON STALLED GUESTS: dropping "Cooled" loses nothing today (it was always
// 0), but a card parked on one step for months is a real signal. That should be
// time-in-step, which the payload does not carry yet, not time-since-first-visit
// dressed up as a stage.

export type GuestStage = 'signed_in' | 'called' | 'week2' | 'week3' | 'finished'

export const GUEST_STAGES: {
  key: GuestStage
  label: string
  sub: string
  positive?: boolean
}[] = [
  { key: 'signed_in', label: 'Signed in', sub: 'at Starting Point, no step yet' },
  { key: 'called', label: 'Welcome call', sub: 'step 1 of their workflow' },
  { key: 'week2', label: 'Week 2', sub: 'came back, step 2' },
  { key: 'week3', label: 'Week 3', sub: 'came back again, step 3' },
  { key: 'finished', label: 'Finished', sub: 'completed Starting Point', positive: true },
]
