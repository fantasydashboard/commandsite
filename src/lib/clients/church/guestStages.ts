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
// WHAT THE STEPS MEAN, from Christina (Sep 8 and Sep 10): the form adds a card
// to step one on Sunday, a text goes out Monday at 2pm, and on Tuesday morning
// Gabby moves everyone to week 2 BEFORE anyone has come back. A person on week
// 2 is therefore someone waiting to return, not someone who did; week 3 means
// they came back once; finished means twice. The old subs ("came back, step 2")
// had it backwards. Stalled cards are now triaged by the payload's `bucket`.

export type GuestStage = 'signed_in' | 'called' | 'week2' | 'week3' | 'finished'

export const GUEST_STAGES: {
  key: GuestStage
  label: string
  sub: string
  positive?: boolean
}[] = [
  { key: 'signed_in', label: 'Signed in', sub: 'Sunday, not moved yet' },
  { key: 'called', label: 'Welcome call', sub: 'step 1, Monday text' },
  { key: 'week2', label: 'Week 2', sub: 'moved Tuesday, waiting to come back' },
  { key: 'week3', label: 'Week 3', sub: 'came back once' },
  { key: 'finished', label: 'Finished', sub: 'came back twice, done', positive: true },
]

/**
 * Old stage keys -> new ones.
 *
 * Renaming the stages was a BREAKING change made without a migration path, and
 * it broke production immediately: Vercel ships the frontend the moment main
 * moves, while the edge function and its recompute are a manual step. In that
 * window the payload still carried the old keys, nothing matched the new
 * columns, and the board rendered five zeroes on a page staff were actively
 * reviewing.
 *
 * So the frontend reads BOTH. It renders correctly before the recompute and
 * after it, and the same holds for any church whose payload has not been
 * recomputed yet. Deploy order stops mattering, which is the point.
 *
 * 'welcomed' mapped to the week-2 step and 'cooled' meant "signed in a while
 * ago with no step", so they fold into week2 and signed_in respectively.
 */
const LEGACY_STAGE: Record<string, GuestStage> = {
  new: 'signed_in',
  cooled: 'signed_in',
  welcomed: 'week2',
  connecting: 'week3',
  belongs: 'finished',
}

/** Read a card's stage, accepting either vocabulary. */
export function normalizeStage(stage: string): GuestStage {
  return LEGACY_STAGE[stage] ?? (stage as GuestStage)
}

/**
 * The card's `detail` and `owner` are STORED strings, so a payload written
 * before the rename still carries the old wording even once the columns are
 * placed correctly. That leaves the worst string of all on screen: "Grace, auto"
 * against 88 cards the Starting Point team advanced themselves, while Grace has
 * sent nothing (test mode).
 *
 * These rewrite the old wording at read time, on the same principle as
 * normalizeStage: the page tells the truth regardless of when the recompute
 * happens. Both become no-ops once the payload is rebuilt.
 */
const LEGACY_DETAIL: Record<string, GuestStage> = {
  'first visit · signed in at Starting Point': 'signed_in',
  'signed in weeks ago · no next step since': 'signed_in',
  'welcome sent · in the week-2 follow-up': 'week2',
  'week-3 follow-up · progressing': 'week3',
  'finished the welcome sequence': 'finished',
}

/** What the card is doing, in the church's terms. Only English names the gifts;
 *  the Brazilian workflow's steps are unnamed and may not run the same sequence. */
export function stageDetail(stage: GuestStage, campus: string): string {
  const gift = campus === 'english'
  switch (stage) {
    case 'signed_in': return 'signed in at Starting Point, no step yet'
    case 'called': return gift ? 'welcome call step, coffee mug' : 'welcome call step'
    case 'week2': return gift ? 'week-2 step, waiting to come back for the bag' : 'week-2 step, waiting to come back'
    case 'week3': return gift ? 'came back once, week-3 step, the gift card' : 'came back once, week-3 step'
    case 'finished': return 'completed all three Starting Point steps'
  }
}

export function normalizeDetail(detail: string, campus: string): string {
  const stage = LEGACY_DETAIL[detail]
  return stage ? stageDetail(stage, campus) : detail
}

/** Every stage here comes from a Planning Center step a person advanced. */
export function normalizeOwner(owner: string): string {
  return owner === 'Grace, auto' || owner === 'Connections team' ? 'Starting Point team' : owner
}
