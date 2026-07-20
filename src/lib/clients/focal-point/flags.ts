// Builds the "why flagged" detail for each drift signal from its real data, so
// the detail drawer and the dismiss/snooze actions share one shape and one id
// scheme. The id is `${signal}:${name}` so a person hidden in one place stays hidden.
import type { DriftFamily } from './drift'
import type { ServingDriftPerson } from './serving'
import type { GroupDrifter } from './groupDrift'
import type { BurnoutPerson } from './burnout'
import type { CareCase } from './carePipeline'
import { duplicateInfo, type DupInfo } from './duplicates'

export type FlagSignal = 'family' | 'serving' | 'group' | 'burnout'

export const SIGNAL_META: Record<FlagSignal, { label: string; class: string }> = {
  family: { label: 'Family drifting', class: 'bg-warn/15 text-warn' },
  serving: { label: 'Stopped serving', class: 'bg-accent/15 text-accent' },
  group: { label: 'Group drift', class: 'bg-brand/12 text-brand' },
  burnout: { label: 'Burnout risk', class: 'bg-danger/12 text-danger' },
}

// Stable id so the same person is hidden everywhere they appear (board, strip,
// directory). Families key on surname; everyone else on name.
export function flagId(signal: FlagSignal, name: string): string {
  const key = signal === 'family' ? name.replace(/^The\s+/i, '').replace(/\s+family$/i, '') : name
  return `${signal}:${key}`
}

export interface FlagDetail {
  id: string
  name: string
  signal: FlagSignal
  signalLabel: string
  signalClass: string
  summary: string
  evidence: { label: string; value: string }[]
  routeTo?: string // who this routes to (leader), when applicable
  duplicate?: DupInfo | null // set when this person may have duplicate PCO profiles
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso
}

export function familyFlag(f: DriftFamily): FlagDetail {
  return {
    id: `family:${f.family}`,
    name: `The ${f.family} family`,
    signal: 'family',
    signalLabel: 'Family drifting',
    signalClass: 'bg-warn/15 text-warn',
    summary: `A family that was regular at Kids Point for months, then stopped for ${f.sundaysMissed} Sundays.`,
    evidence: [
      { label: 'Kids at Kids Point', value: f.kids.join(', ') },
      { label: 'Regular for', value: `~${f.monthsAttending} months (${f.totalSundays} Sundays attended)` },
      { label: 'Last checked in', value: fmtDate(f.lastSeen) },
      { label: 'Sundays missed', value: String(f.sundaysMissed) },
    ],
  }
}

export function servingFlag(p: ServingDriftPerson): FlagDetail {
  return {
    duplicate: duplicateInfo(p.name),
    id: `serving:${p.name}`,
    name: p.name,
    signal: 'serving',
    signalLabel: 'Stopped serving',
    signalClass: 'bg-accent/15 text-accent',
    summary: `A regular volunteer on ${p.area.trim()} who has not served in ${p.weeksSince} weeks.`,
    routeTo: p.area.trim(),
    evidence: [
      { label: 'Team', value: p.area.trim() },
      { label: 'Times served', value: `${p.totalServed}x over ~${p.monthsServing} months` },
      { label: 'Last served', value: fmtDate(p.lastServed) },
      { label: 'Weeks since', value: `${p.weeksSince} weeks` },
    ],
  }
}

export function groupFlag(g: GroupDrifter): FlagDetail {
  return {
    duplicate: duplicateInfo(g.name),
    id: `group:${g.name}`,
    name: g.name,
    signal: 'group',
    signalLabel: 'Group drift',
    signalClass: 'bg-brand/12 text-brand',
    summary: `A regular in their growth group who went quiet ${g.weeksSince} weeks before the season ended.`,
    routeTo: g.group,
    evidence: [
      { label: 'Group', value: g.group },
      { label: 'Attended this season', value: `${g.attended}x` },
      { label: 'Went quiet', value: `${g.weeksSince} weeks before the season ended` },
    ],
  }
}

// A pipeline-board / needs-you-strip case. Evidence is the case summary (the full
// breakdown lives in the directory tables). Uses the shared id so dismissing here
// hides the person in the directory too, and vice versa.
export function careCaseFlag(c: CareCase): FlagDetail {
  const signal: FlagSignal = c.promotedFrom
    ? (c.promotedFrom as FlagSignal)
    : c.track === 'groups'
      ? 'group'
      : (c.track as FlagSignal)
  const meta = SIGNAL_META[signal]
  const evidence = [
    { label: 'What Grace saw', value: c.detail },
    { label: 'Owner', value: c.owner },
    { label: 'Status', value: c.age },
  ]
  return {
    id: flagId(signal, c.name),
    name: c.name,
    signal,
    signalLabel: meta.label,
    signalClass: meta.class,
    summary: c.note ?? c.detail,
    evidence,
    duplicate: signal !== "family" ? duplicateInfo(c.name) : null,
  }
}

export function burnoutFlag(p: BurnoutPerson): FlagDetail {
  return {
    duplicate: duplicateInfo(p.name),
    id: `burnout:${p.name}`,
    name: p.name,
    signal: 'burnout',
    signalLabel: 'Burnout risk',
    signalClass: 'bg-danger/12 text-danger',
    summary: `Serving about ${p.perMonth}x a month across ${p.areas.length} ministries, and still going.`,
    evidence: [
      { label: 'Ministries', value: p.areas.join(', ') },
      { label: 'Frequency', value: `~${p.perMonth}x per month` },
      { label: 'Risk', value: p.tier === 'high' ? 'High' : 'Watch' },
    ],
  }
}
