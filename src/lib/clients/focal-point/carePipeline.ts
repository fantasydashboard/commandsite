// Focal Point Church - unified Care Pipeline. The three drift signals (family
// drifting, stopped serving, burnout risk) are ONE lifecycle: over-serving ->
// stops serving -> stops attending -> gone. This board tracks every flagged
// person through defined stages with human approval gates, and shows the two
// cross-track handoffs that make it a living system, not three static lists:
//   1. burnout -> stopped serving  = "we called it" (predicted, confirmed)
//   2. stopped serving + not attending = promoted to the pastoral care track
//
// PII-safe: no names are stored here. Each case references a real person by
// source array + index, so display data resolves from the (skip-worktree) local
// data files at runtime. The auto-advancing engine (Supabase case-state + cron)
// is the week-one build; this is the process on real people.
import { focalPointPriority } from './priority'
import { focalPointDrift, type DriftFamily } from './drift'
import { focalPointServing, type ServingDriftPerson } from './serving'
import { focalPointBurnout, type BurnoutPerson } from './burnout'
import { focalPointGroupDrift } from './groupDrift'

export type Track = 'family' | 'serving' | 'burnout' | 'groups'
export type Stage = 'flagged' | 'reaching' | 'watching' | 'escalated' | 'resolved'

export interface CareCase {
  id: string
  track: Track            // the lane it lives in now (may differ from origin after a promotion)
  stage: Stage
  name: string
  avatar: string          // '' -> initials fallback
  detail: string
  owner: string
  age: string
  note?: string
  channel?: string        // escalation channel change, e.g. "Personal call"
  predicted?: boolean     // burnout -> serving-lapse: Grace called it
  promotedFrom?: Track    // cross-track promotion source
  outcome?: string        // resolved label
  draft?: string          // drafted note for flagged families awaiting approval
}

// Burnout moved to Sundays & Comms (it is a volunteer-load / roster concern).
// It surfaces here only as a cross-page handoff: someone flagged for burnout who
// then stops serving crosses into the "Stopped serving" track (see the predicted
// flag). Care & Drift = people disengaging; Sundays & Comms = volunteer load.
export const TRACKS: { key: Track; label: string; move: string; blurb: string }[] = [
  { key: 'family', label: 'Families drifting', move: 'Reconnect', blurb: 'A pastoral touch, then a personal call' },
  { key: 'serving', label: 'Stopped serving', move: 'Re-engage', blurb: 'Their ministry leader reaches out' },
  { key: 'groups', label: 'Group drift', move: 'Re-engage', blurb: 'Their group leader reaches out at fall restart' },
]

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'flagged', label: 'Flagged' },
  { key: 'reaching', label: 'Reaching out' },
  { key: 'watching', label: 'Watching' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'resolved', label: 'Resolved' },
]

const pri = (i: number) => focalPointPriority.items[i]
const fam = (i: number) => focalPointDrift.families[i] as DriftFamily
const srv = (i: number) => focalPointServing.people[i] as ServingDriftPerson
const brn = (i: number) => focalPointBurnout.people[i] as BurnoutPerson
const grp = (i: number) => focalPointGroupDrift.people[i]
const famName = (f: DriftFamily) => `The ${f.family} family`

// Built lazily (getter + memo), NOT at module-init. Each case reads sibling
// data modules by index (pri/fam/srv/brn/grp -> focalPointPriority.items[i]
// etc.). Building the array at import time made it depend on those siblings
// being initialized FIRST, which a bundler's module order does not guarantee:
// the production build initialized carePipeline before priority, so pri(6) was
// undefined and `.name` threw, crashing the whole dashboard chunk (blank page).
// Deferring to first access runs after every module is initialized.
function buildCarePipelineCases(): CareCase[] {
  return [
    // ---------------- FAMILY (reconnect; owner = Pastor Mark / care team) ----------------
    // Two genuinely flagged families await the pastor's approval (they carry the
    // draft); the rest are already in motion at later stages. State is the single
    // source of truth for both the pipeline and the "Needs you" strip.
    { id: 'cp-f1', track: 'family', stage: 'flagged', name: pri(6).name, avatar: pri(6).avatar, detail: pri(6).stat, owner: 'Pastor Mark', age: 'flagged today', note: 'Grace drafted the note, awaiting your approval', draft: pri(6).draft },
    { id: 'cp-f2', track: 'family', stage: 'flagged', name: pri(0).name, avatar: pri(0).avatar, detail: pri(0).stat, owner: 'Pastor Mark', age: 'flagged today', note: 'Grace drafted the note, awaiting your approval', draft: pri(0).draft },
    { id: 'cp-f3', track: 'family', stage: 'reaching', name: pri(3).name, avatar: pri(3).avatar, detail: pri(3).stat, owner: 'Pastor Mark', age: 'note sent 4d ago' },
    { id: 'cp-f4', track: 'family', stage: 'watching', name: pri(9).name, avatar: pri(9).avatar, detail: pri(9).stat, owner: 'Pastor Mark', age: 'sent 11d ago', note: 'watching for a return' },
    { id: 'cp-f5', track: 'family', stage: 'escalated', name: famName(fam(7)), avatar: '', detail: `kids missed ${fam(7).sundaysMissed} Sundays`, owner: 'Pastor Mark', age: 'no reply in 3 wks', channel: 'Personal call', note: 'Regular for months, then gone. The email got no response.' },
    // the cross-track PROMOTION: a lapsed volunteer who is now also not attending
    // Real cross-track promotion: a volunteer genuinely on BOTH the stopped-serving
    // and group-drift lists, escalated to the pastor. (Was Manuel, who the serving
    // rebuild proved is still actively serving; JR Rivera is a true two-signal case.)
    { id: 'cp-f6', track: 'family', stage: 'escalated', name: 'JR Rivera', avatar: '', detail: 'stopped serving Safety Team, and quiet in his group', owner: 'Pastor Mark', age: 'promoted today', channel: 'Pastor to call', promotedFrom: 'serving', note: 'Two signals at once: he stopped serving and went quiet in his group. Worth your call before he drifts further.' },
    { id: 'cp-f7', track: 'family', stage: 'resolved', name: famName(fam(6)), avatar: '', detail: `back after ${fam(6).sundaysMissed} missed Sundays`, owner: 'Care team', age: 'returned Jun 29', outcome: 'Reconnected' },

    // ---------------- SERVING (re-engage; owner = ministry leader) ----------------
    // the "we called it" handoff: burnout flag from 6 weeks ago, now confirmed
    { id: 'cp-s1', track: 'serving', stage: 'flagged', name: pri(1).name, avatar: pri(1).avatar, detail: `${pri(1).routeTo} · ${pri(1).stat}`, owner: `${pri(1).routeTo} lead`, age: 'flagged today', predicted: true, note: 'Grace flagged her for burnout 6 weeks ago. Now she has stopped.' },
    { id: 'cp-s2', track: 'serving', stage: 'reaching', name: pri(7).name, avatar: pri(7).avatar, detail: `${pri(7).routeTo} · ${pri(7).stat}`, owner: `${pri(7).routeTo} lead`, age: 'leader notified Mon' },
    { id: 'cp-s3', track: 'serving', stage: 'watching', name: pri(10).name, avatar: pri(10).avatar, detail: `${pri(10).routeTo} · ${pri(10).stat}`, owner: `${pri(10).routeTo} lead`, age: 'watching 1 wk' },
    { id: 'cp-s4', track: 'serving', stage: 'resolved', name: srv(17).name, avatar: '', detail: `${srv(17).area.trim()} · back on the team`, owner: `${srv(17).area.trim()} lead`, age: 'returned Jul 6', outcome: 'Back serving' },

    // ---------------- BURNOUT (protect; owner = leader, then pastor) ----------------
    { id: 'cp-b1', track: 'burnout', stage: 'flagged', name: pri(11).name, avatar: pri(11).avatar, detail: pri(11).stat, owner: `${pri(11).routeTo} lead`, age: 'flagged today', note: 'Leader to offer a Sunday off' },
    { id: 'cp-b2', track: 'burnout', stage: 'reaching', name: pri(8).name, avatar: pri(8).avatar, detail: pri(8).stat, owner: `${pri(8).routeTo} lead`, age: 'break offered 3d ago' },
    { id: 'cp-b3', track: 'burnout', stage: 'watching', name: pri(5).name, avatar: pri(5).avatar, detail: pri(5).stat, owner: `${pri(5).routeTo} lead`, age: 'watching load 2 wks' },
    { id: 'cp-b4', track: 'burnout', stage: 'escalated', name: pri(2).name, avatar: pri(2).avatar, detail: pri(2).stat, owner: 'Pastor Mark', age: 'load still climbing', channel: 'Pastor thank-you + backfill', note: 'One of your best. Protect him before you lose him.' },
    { id: 'cp-b5', track: 'burnout', stage: 'resolved', name: brn(14).name, avatar: '', detail: `load eased to ~2x / month`, owner: `${brn(14).areas[0]} lead`, age: 'this month', outcome: 'Load reduced' },

    // ---------------- GROUP DRIFT (re-engage; owner = group leader, fall-timed) ----------------
    // Groups do not meet in summer, so these queue for the group leader at the fall
    // restart rather than an outreach this week.
    { id: 'cp-g1', track: 'groups', stage: 'flagged', name: grp(0).name, avatar: '', detail: `${grp(0).attended}x this season, quiet ${grp(0).weeksSince}w`, owner: 'Group leader', age: 'queued for fall', note: 'Went quiet mid-season. Leader reaches out when groups restart.' },
    { id: 'cp-g2', track: 'groups', stage: 'flagged', name: grp(1).name, avatar: '', detail: `${grp(1).attended}x this season, quiet ${grp(1).weeksSince}w`, owner: 'Group leader', age: 'queued for fall' },
    { id: 'cp-g3', track: 'groups', stage: 'flagged', name: grp(5).name, avatar: '', detail: `${grp(5).attended}x this season, quiet ${grp(5).weeksSince}w`, owner: 'Group leader', age: 'queued for fall' },
    { id: 'cp-g4', track: 'groups', stage: 'reaching', name: grp(2).name, avatar: '', detail: `${grp(2).attended}x this season, quiet ${grp(2).weeksSince}w`, owner: 'Group leader', age: 'leader texted over summer' },
  ]
}

let _carePipelineCases: CareCase[] | null = null
export const carePipeline: { readonly cases: CareCase[] } = {
  get cases(): CareCase[] {
    return (_carePipelineCases ??= buildCarePipelineCases())
  },
}
