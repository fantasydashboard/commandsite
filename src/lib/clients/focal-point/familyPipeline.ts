// Focal Point - the family drift track, driven by the REAL flagged families (not
// a hand-picked demo subset). Every active family becomes a pipeline card at a
// stage derived from its own timeline, so the worst cases surface on the board and
// the priority feed instead of being buried in the directory:
//   escalated ("to call")  = established (15+ prior Sundays) AND long gone (8+ missed)
//   flagged   ("note")     = everyone else still drifting
// Returned families are reconciled off by driftLive (handled where these render).
// This is the single source of truth for families across the board, the priority
// feed, and the directory, so their counts and names can never disagree again.
import { servingData, groupDriftData, driftData } from '@/lib/clients/church/careDataLoader'
import type { DriftFamily } from './drift'
import type { CareCase } from './carePipeline'

export const ESTABLISHED_SUNDAYS = 15
export const LONG_GONE_SUNDAYS = 8

/**
 * Where a family stops being a "check in on them" case.
 *
 * Set to 9 so it lines up with LONG_GONE_SUNDAYS: past two months absent, a
 * "we missed you the last few Sundays" note is factually wrong and reads as
 * careless. The first pass used 17 (~4 months), which barely bit: families at
 * 16 Sundays stayed on the board still getting the "last few Sundays" wording.
 *
 * ESCALATED FAMILIES ARE EXEMPT. Established households (15+ prior Sundays)
 * who go long-gone are exactly who a pastor should call, so they stay on the
 * board in the escalated lane with call wording, not a note. What moves to the
 * review list is the other group: families who came a handful of times months
 * ago and faded. Different people, different decision.
 */
export const LONG_DRIFTED_SUNDAYS = 9

/** Off the weekly board: long gone AND never established. Escalated families
 *  stay on the board however long they have been away. */
export function isLongDrifted(f: { sundaysMissed: number; totalSundays: number }): boolean {
  return f.sundaysMissed >= LONG_DRIFTED_SUNDAYS && !isEscalatedFamily(f)
}

export function isEscalatedFamily(f: { totalSundays: number; sundaysMissed: number }): boolean {
  return f.totalSundays >= ESTABLISHED_SUNDAYS && f.sundaysMissed >= LONG_GONE_SUNDAYS
}

function joinKids(kids: string[]): string {
  if (kids.length <= 1) return kids[0] ?? 'the kids'
  if (kids.length === 2) return `${kids[0]} and ${kids[1]}`
  return `${kids.slice(0, -1).join(', ')}, and ${kids[kids.length - 1]}`
}

// Grace's drafted check-in note, personalized per family (the curated Hart/Gonzalez
// wording, generalized so every flagged family has a real draft to approve).
export function familyDraft(f: DriftFamily): string {
  const kids = joinKids(f.kids)
  const verb = f.kids.length === 1 ? 'has' : 'have'
  // The gap phrase has to match the actual gap. "The last few Sundays" was
  // hardcoded, so a family absent four months received a note implying they had
  // missed two or three weeks. Wrong on the facts, and it reads as if nobody
  // actually looked before sending.
  const gap = f.sundaysMissed <= 5 ? 'the last few Sundays' : 'the last several Sundays'
  return `Hey ${f.family} family, I noticed ${kids} ${verb} not been at Kids Point ${gap}. After ${f.monthsAttending} months of seeing you all so regularly, I just wanted to check in. No agenda and no pressure, we simply miss you and your family is thought of and prayed for. If there is anything going on that we can support you with, I would love to know. Hope to see you soon. Blessings, Pastor Mark`
}

// The serving + group drift board lanes, driven by the SAME real directories as
// their lists below (so the board can never disagree with them again). No case
// state exists yet for these tracks, so everyone sits at "flagged"; they route to
// ministry / group leaders, not the pastor's action queue.
export function servingCases(): CareCase[] {
  return servingData().people.map((p) => ({
    id: `serving:${p.name}`,
    track: 'serving' as const,
    stage: 'flagged' as const,
    name: p.name,
    avatar: '',
    detail: `${p.area} · quiet ${p.weeksSince}w`,
    owner: `${p.area} lead`,
    age: 'flagged today',
  }))
}

export function groupCases(): CareCase[] {
  return groupDriftData().people.map((p) => ({
    id: `group:${p.name}`,
    track: 'groups' as const,
    stage: 'flagged' as const,
    name: p.name,
    avatar: '',
    detail: `${p.attended}x this season, quiet ${p.weeksSince}w`,
    owner: 'Group leader',
    age: 'queued for fall',
  }))
}

/** Families still inside the working window, most urgent first. Everything at or
 *  beyond LONG_DRIFTED_SUNDAYS is deliberately excluded here and surfaced by
 *  longDriftedFamilies() instead. */
export function familyCases(): CareCase[] {
  return driftData().families
    .filter((f) => !isLongDrifted(f))
    .slice()
    .sort((a, b) => b.sundaysMissed - a.sundaysMissed || b.totalSundays - a.totalSundays)
    .map((f) => {
      const escalated = isEscalatedFamily(f)
      return {
        id: `family:${f.family}`,
        track: 'family' as const,
        stage: escalated ? ('escalated' as const) : ('flagged' as const),
        name: `The ${f.family} family`,
        avatar: '',
        detail: `kids missed ${f.sundaysMissed} Sundays`,
        owner: 'Pastor Mark',
        age: escalated ? 'no reply yet' : 'flagged today',
        channel: escalated ? 'Personal call' : undefined,
        note: escalated
          ? `Regular for ${f.monthsAttending} months, then a ${f.sundaysMissed}-Sunday gap. Worth your personal call.`
          : 'Grace drafted the note, awaiting your approval',
        draft: escalated ? undefined : familyDraft(f),
      }
    })
}

/**
 * Families past the working window: still flagged, but too far gone to belong in
 * a weekly outreach queue. Surfaced as their own review list so the church can
 * make a decision (reach out anyway, mark as moved on, snooze) rather than
 * having them silently pad the board or silently disappear.
 *
 * Sorted longest-gone first, and carries the tenure figures, because the
 * pastoral weight is completely different for a family that attended two years
 * before going quiet versus one that came a handful of times.
 */
export interface LongDriftedFamily {
  key: string
  family: string
  kids: string[]
  lastSeen: string
  sundaysMissed: number
  monthsAttending: number
  totalSundays: number
  established: boolean
}

export function longDriftedFamilies(): LongDriftedFamily[] {
  return driftData().families
    .filter(isLongDrifted)
    .slice()
    .sort((a, b) => b.sundaysMissed - a.sundaysMissed || b.totalSundays - a.totalSundays)
    .map((f) => ({
      key: `family:${f.family}`,
      family: f.family,
      kids: f.kids,
      lastSeen: f.lastSeen,
      sundaysMissed: f.sundaysMissed,
      monthsAttending: f.monthsAttending,
      totalSundays: f.totalSundays,
      established: f.totalSundays >= ESTABLISHED_SUNDAYS,
    }))
}

/** Buckets for the drift curve. Open-ended at the top so the longest-gone are
 *  never dropped off the end of the chart. */
export const LONG_DRIFT_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '2 to 4 months', min: 9, max: 17 },
  { label: '4 to 6 months', min: 18, max: 26 },
  { label: '6 to 12 months', min: 27, max: 52 },
  { label: 'Over a year', min: 53, max: Number.MAX_SAFE_INTEGER },
]
