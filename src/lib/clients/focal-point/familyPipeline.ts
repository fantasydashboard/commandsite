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
  return `Hey ${f.family} family, I noticed ${kids} ${verb} not been at Kids Point the last few Sundays. After ${f.monthsAttending} months of seeing you all so regularly, I just wanted to check in. No agenda and no pressure, we simply miss you and your family is thought of and prayed for. If there is anything going on that we can support you with, I would love to know. Hope to see you soon. Blessings, Pastor Mark`
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

// All active (non-returned) families as pipeline cards, most urgent first.
export function familyCases(): CareCase[] {
  return driftData().families
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
