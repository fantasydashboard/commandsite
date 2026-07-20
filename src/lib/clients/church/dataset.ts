// Client-aware church data resolver.
// ---------------------------------------------------------------------------
// The Cornerstone church modules (Today, Front Desk, Care & Drift, Sundays,
// Metrics, Giving, Settings) are reused verbatim for every church client.
// Only the DATA differs per client. This resolver is the single seam that
// swaps the client-varying data by `client.slug`, so a module renders
// Cornerstone's demo fixtures or Focal Point's real Planning Center data
// without any component-level change.
//
// Shared TYPES and *_META presentation constants are NOT resolved here:
// modules keep importing those directly from the cornerstone data files,
// since they are identical for every client. Only the data arrays and stat
// functions flow through `churchDataset(slug)`.
//
// Adding a church client: create src/lib/clients/<slug>/*.ts exporting the
// same names as cornerstone/*, import them below, and add a BY_SLUG entry.

import type { TodayItem, TodayPulse, TodayStats } from '@/lib/clients/cornerstone/today'
import type { Household, Person, PeopleStats } from '@/lib/clients/cornerstone/people'
import type { VisitorRecord, VisitorStats } from '@/lib/clients/cornerstone/visitors'
import type { CareCase, CareStats } from '@/lib/clients/cornerstone/care'
import type { MonthlyGiving, StoppedGivingHousehold, DesignatedFund, GivingStats } from '@/lib/clients/cornerstone/giving'
import type { WeeklyAttendance, AttendanceStats } from '@/lib/clients/cornerstone/attendance'
import type { UpcomingService, SundayStats } from '@/lib/clients/cornerstone/sundays'
import type { Post, BrandVoice, CommsStats } from '@/lib/clients/cornerstone/comms'
import type { TeamMember, ServiceTime, IntegrationConnection, PrivacySetting, SettingsStats } from '@/lib/clients/cornerstone/settings'

// ── Cornerstone data (the demo client)
import { todayItems, todayPulse, todayStats } from '@/lib/clients/cornerstone/today'
import { households, people, peopleStats, peopleInHousehold, totalFlagCount } from '@/lib/clients/cornerstone/people'
import { visitors, visitorStats } from '@/lib/clients/cornerstone/visitors'
import { careCases, careStats } from '@/lib/clients/cornerstone/care'
import { monthlyGiving, stoppedGivingHouseholds, designatedFunds, givingStats } from '@/lib/clients/cornerstone/giving'
import { weeklyAttendance, priorYearAttendance, attendanceStats } from '@/lib/clients/cornerstone/attendance'
import { upcomingService, sundayStats } from '@/lib/clients/cornerstone/sundays'
import { posts, brandVoice, commsStats } from '@/lib/clients/cornerstone/comms'
import { teamMembers, serviceTimes, integrations, privacySettings, settingsStats } from '@/lib/clients/cornerstone/settings'

// ── Focal Point data (real client; Phase 1 passthrough, real data in Phase 2)
import * as fpToday from '@/lib/clients/focal-point/today'
import * as fpPeople from '@/lib/clients/focal-point/people'
import * as fpVisitors from '@/lib/clients/focal-point/visitors'
import * as fpCare from '@/lib/clients/focal-point/care'
import * as fpGiving from '@/lib/clients/focal-point/giving'
import * as fpAttendance from '@/lib/clients/focal-point/attendance'
import * as fpSundays from '@/lib/clients/focal-point/sundays'
import * as fpComms from '@/lib/clients/focal-point/comms'
import * as fpSettings from '@/lib/clients/focal-point/settings'

export interface ChurchDataset {
  today: {
    items: TodayItem[]
    pulse: () => TodayPulse
    stats: () => TodayStats
  }
  people: {
    households: Household[]
    people: Person[]
    stats: () => PeopleStats
    inHousehold: (householdId: string) => Person[]
    totalFlagCount: (h: Household) => number
  }
  visitors: {
    records: VisitorRecord[]
    stats: () => VisitorStats
  }
  care: {
    cases: CareCase[]
    stats: () => CareStats
  }
  giving: {
    monthly: () => MonthlyGiving[]
    stoppedHouseholds: StoppedGivingHousehold[]
    designatedFunds: DesignatedFund[]
    stats: () => GivingStats
  }
  attendance: {
    weekly: () => WeeklyAttendance[]
    priorYear: () => WeeklyAttendance[]
    stats: () => AttendanceStats
  }
  sundays: {
    upcoming: UpcomingService
    stats: () => SundayStats
  }
  comms: {
    posts: Post[]
    brandVoice: BrandVoice
    stats: () => CommsStats
  }
  settings: {
    team: TeamMember[]
    serviceTimes: ServiceTime[]
    integrations: IntegrationConnection[]
    privacy: PrivacySetting[]
    stats: () => SettingsStats
  }
}

const CORNERSTONE: ChurchDataset = {
  today: { items: todayItems, pulse: todayPulse, stats: todayStats },
  people: { households, people, stats: peopleStats, inHousehold: peopleInHousehold, totalFlagCount },
  visitors: { records: visitors, stats: visitorStats },
  care: { cases: careCases, stats: careStats },
  giving: { monthly: monthlyGiving, stoppedHouseholds: stoppedGivingHouseholds, designatedFunds, stats: givingStats },
  attendance: { weekly: weeklyAttendance, priorYear: priorYearAttendance, stats: attendanceStats },
  sundays: { upcoming: upcomingService, stats: sundayStats },
  comms: { posts, brandVoice, stats: commsStats },
  settings: { team: teamMembers, serviceTimes, integrations, privacy: privacySettings, stats: settingsStats },
}

// Some Focal Point surfaces (Care & Drift, Sundays) still render Cornerstone
// sample data during setup. Scrub the demo church's name out of any displayed
// strings so "Cornerstone" never appears on a Focal Point screen. Deep-clones
// only the data passed through it (never functions), so stat functions that
// read the originals are unaffected.
export function scrubCornerstone<T>(v: T): T {
  if (typeof v === 'string') return v.replace(/Cornerstone/g, 'Focal Point') as unknown as T
  if (Array.isArray(v)) return v.map((x) => scrubCornerstone(x)) as unknown as T
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v as object)) o[k] = scrubCornerstone((v as Record<string, unknown>)[k])
    return o as unknown as T
  }
  return v
}

const FOCAL_POINT: ChurchDataset = {
  today: { items: scrubCornerstone(fpToday.todayItems), pulse: fpToday.todayPulse, stats: fpToday.todayStats },
  people: { households: scrubCornerstone(fpPeople.households), people: scrubCornerstone(fpPeople.people), stats: fpPeople.peopleStats, inHousehold: fpPeople.peopleInHousehold, totalFlagCount: fpPeople.totalFlagCount },
  visitors: { records: scrubCornerstone(fpVisitors.visitors), stats: fpVisitors.visitorStats },
  care: { cases: scrubCornerstone(fpCare.careCases), stats: fpCare.careStats },
  giving: { monthly: fpGiving.monthlyGiving, stoppedHouseholds: scrubCornerstone(fpGiving.stoppedGivingHouseholds), designatedFunds: scrubCornerstone(fpGiving.designatedFunds), stats: fpGiving.givingStats },
  attendance: { weekly: fpAttendance.weeklyAttendance, priorYear: fpAttendance.priorYearAttendance, stats: fpAttendance.attendanceStats },
  sundays: { upcoming: scrubCornerstone(fpSundays.upcomingService), stats: fpSundays.sundayStats },
  comms: { posts: scrubCornerstone(fpComms.posts), brandVoice: scrubCornerstone(fpComms.brandVoice), stats: fpComms.commsStats },
  settings: { team: scrubCornerstone(fpSettings.teamMembers), serviceTimes: scrubCornerstone(fpSettings.serviceTimes), integrations: scrubCornerstone(fpSettings.integrations), privacy: scrubCornerstone(fpSettings.privacySettings), stats: fpSettings.settingsStats },
}

const BY_SLUG: Record<string, ChurchDataset> = {
  'cornerstone-church': CORNERSTONE,
  'focal-point-church': FOCAL_POINT,
}

export function churchDataset(slug: string): ChurchDataset {
  return BY_SLUG[slug] ?? CORNERSTONE
}
