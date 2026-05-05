/**
 * Cornerstone — Sunday service plan + volunteer roster.
 * Replaces the Saturday-night "are we covered?" scramble with a single
 * screen that shows what's planned + what's short + who to text first
 * to fill the gaps.
 */

export type ServiceTime = '9_am' | '11_am'
export type VolunteerRoleKey =
  | 'worship_lead' | 'worship_band' | 'worship_vocals'
  | 'kids_nursery' | 'kids_preschool' | 'kids_elementary' | 'kids_youth'
  | 'usher' | 'parking_team' | 'hospitality'
  | 'tech_audio' | 'tech_lights' | 'tech_livestream'
  | 'prayer_team'

export interface ServiceSlot {
  service: ServiceTime
  role: VolunteerRoleKey
  needed: number
  /** Currently confirmed volunteer names */
  confirmed: string[]
  /** Suggested fills if short — ranked by likelihood-to-say-yes from past data */
  suggested_fills?: string[]
}

export interface SermonPlan {
  title: string
  series: string
  series_week: number
  series_total: number
  scripture: string
  prep_pct: number  // 0-100
  notes: string
}

export interface WorshipSong {
  title: string
  artist: string
  key: string
  /** order in the setlist */
  order: number
}

export interface Announcement {
  title: string
  detail: string
  channel: 'live' | 'screen_only' | 'bulletin_only'
  /** Recorded yet for the slide? */
  ready: boolean
}

export interface UpcomingService {
  date: string  // ISO date for the Sunday
  date_label: string  // human-readable
  sermon: SermonPlan
  worship_setlist: WorshipSong[]
  announcements: Announcement[]
  slots: ServiceSlot[]
}

function nextSunday(): string {
  const d = new Date()
  const daysUntilSunday = (7 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + daysUntilSunday)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export const VOLUNTEER_ROLE_META: Record<VolunteerRoleKey, { label: string; group: string; color: string }> = {
  worship_lead:    { label: 'Worship Lead',     group: 'Worship',  color: '#A855F7' },
  worship_band:    { label: 'Band',             group: 'Worship',  color: '#A855F7' },
  worship_vocals:  { label: 'Backing Vocals',   group: 'Worship',  color: '#A855F7' },
  kids_nursery:    { label: 'Nursery (0-2)',    group: 'Kids',     color: '#10B981' },
  kids_preschool:  { label: 'Preschool (3-5)',  group: 'Kids',     color: '#10B981' },
  kids_elementary: { label: 'Elementary (K-5)', group: 'Kids',     color: '#10B981' },
  kids_youth:      { label: 'Youth (6-12)',     group: 'Kids',     color: '#10B981' },
  usher:           { label: 'Usher',            group: 'Hosting',  color: 'rgb(var(--color-brand))' },
  parking_team:    { label: 'Parking',          group: 'Hosting',  color: 'rgb(var(--color-brand))' },
  hospitality:     { label: 'Hospitality',      group: 'Hosting',  color: 'rgb(var(--color-brand))' },
  tech_audio:      { label: 'Audio',            group: 'Tech',     color: '#0EA5E9' },
  tech_lights:     { label: 'Lights',           group: 'Tech',     color: '#0EA5E9' },
  tech_livestream: { label: 'Livestream',       group: 'Tech',     color: '#0EA5E9' },
  prayer_team:     { label: 'Prayer Team',      group: 'Prayer',   color: '#F59E0B' },
}

export const SERVICE_TIME_LABEL: Record<ServiceTime, string> = {
  '9_am':  '9 AM',
  '11_am': '11 AM',
}

export const upcomingService: UpcomingService = {
  date: nextSunday(),
  date_label: 'This Sunday',
  sermon: {
    title: 'When the Honest Prayer is "Why?"',
    series: 'Honest Prayers',
    series_week: 3,
    series_total: 5,
    scripture: 'Psalm 13 · Habakkuk 1',
    prep_pct: 65,
    notes: 'Outline + slides at 65%. Need to land the closing illustration (considering the Foster family\'s loss, but pre-clear with Amanda first). Worship setlist confirmed Sun night by Jess.',
  },
  worship_setlist: [
    { order: 1, title: 'Goodness of God',         artist: 'Bethel',        key: 'A'  },
    { order: 2, title: 'Way Maker',               artist: 'Sinach',        key: 'E'  },
    { order: 3, title: 'King of Kings',           artist: 'Hillsong',      key: 'D'  },
    { order: 4, title: 'Honestly (call to lament)',artist: 'Sandra McCracken', key: 'G' },
    { order: 5, title: 'Build My Life',           artist: 'Pat Barrett',   key: 'E'  },
  ],
  announcements: [
    { title: 'Newcomers Lunch',   detail: 'Last Sunday of month after 11 AM service. Free + no pressure.', channel: 'live', ready: false },
    { title: 'Spring Service Day',detail: 'Saturday May 17 — partnering with Habitat for Humanity. Sign-up in the lobby.', channel: 'live', ready: true },
    { title: 'Discover Cornerstone class',detail: 'May 19 after 9 AM service. 90 min. Lunch provided.', channel: 'screen_only', ready: true },
    { title: 'Owen Holloway — 1 yr as a Youth Leader',detail: 'Public thank-you during announcements.', channel: 'live', ready: false },
    { title: 'Foster family bereavement', detail: 'Brief mention + invitation to attend Friday\'s funeral if anyone wants to support James + Amanda.', channel: 'live', ready: false },
  ],
  slots: [
    // Worship
    { service: '9_am',  role: 'worship_lead',     needed: 1, confirmed: ['Jess Bowman'] },
    { service: '11_am', role: 'worship_lead',     needed: 1, confirmed: ['Jess Bowman'] },
    { service: '9_am',  role: 'worship_band',     needed: 4, confirmed: ['Tyler Reyes (drums)', 'Mason Ortiz (guitar)', 'Carlos Vega (bass)', 'Aanya Patel (keys)'] },
    { service: '11_am', role: 'worship_band',     needed: 4, confirmed: ['Tyler Reyes (drums)', 'Mason Ortiz (guitar)', 'Carlos Vega (bass)', 'Aanya Patel (keys)'] },
    { service: '9_am',  role: 'worship_vocals',   needed: 2, confirmed: ['Sarah Lee', 'Devin Patel'] },
    { service: '11_am', role: 'worship_vocals',   needed: 2, confirmed: ['Sarah Lee', 'Devin Patel'] },

    // Kids — the gap
    { service: '9_am',  role: 'kids_nursery',     needed: 4, confirmed: ['Liz Donovan', 'Tara Ellison'], suggested_fills: ['Mia Pham', 'Amanda Foster', 'Karina Diaz'] },
    { service: '11_am', role: 'kids_nursery',     needed: 4, confirmed: ['Karen Yates', 'Stephanie Park', 'Aanya Patel', 'Tara Ellison'] },
    { service: '9_am',  role: 'kids_preschool',   needed: 3, confirmed: ['Linda Tan', 'Hannah Whitaker', 'Dylan Bowers'] },
    { service: '11_am', role: 'kids_preschool',   needed: 3, confirmed: ['Linda Tan', 'Mia Pham'], suggested_fills: ['Sofia Téllez', 'Brielle Acosta'] },
    { service: '9_am',  role: 'kids_elementary',  needed: 3, confirmed: ['Wes Holloway', 'Jack Foster', 'Devin Patel'] },
    { service: '11_am', role: 'kids_elementary',  needed: 3, confirmed: ['Wes Holloway', 'Jack Foster'], suggested_fills: ['Brian Tan', 'Ramón Téllez'] },
    { service: '9_am',  role: 'kids_youth',       needed: 2, confirmed: ['Owen Holloway', 'Maddie Holloway'] },
    { service: '11_am', role: 'kids_youth',       needed: 2, confirmed: ['Owen Holloway', 'Maddie Holloway'] },

    // Hosting
    { service: '9_am',  role: 'usher',            needed: 4, confirmed: ['Marcus Bowman', 'Brett Whitaker', 'Wes Ellison', 'James Foster'] },
    { service: '11_am', role: 'usher',            needed: 4, confirmed: ['Marcus Bowman', 'Brett Whitaker', 'Wes Ellison'], suggested_fills: ['Andre Castellanos', 'Daniel Pham'] },
    { service: '9_am',  role: 'parking_team',     needed: 3, confirmed: ['Daniel Pham', 'Kevin Bowers', 'Sam Wright'] },
    { service: '11_am', role: 'parking_team',     needed: 3, confirmed: ['Daniel Pham', 'Kevin Bowers'], suggested_fills: ['Anthony Russo', 'Greg Hammond'] },
    { service: '9_am',  role: 'hospitality',      needed: 3, confirmed: ['Wes Holloway', 'Tara Ellison', 'Karina Diaz'] },
    { service: '11_am', role: 'hospitality',      needed: 3, confirmed: ['Wes Holloway', 'Tara Ellison', 'Karina Diaz'] },

    // Tech
    { service: '9_am',  role: 'tech_audio',       needed: 1, confirmed: ['Wes Ellison'] },
    { service: '11_am', role: 'tech_audio',       needed: 1, confirmed: ['Wes Ellison'] },
    { service: '9_am',  role: 'tech_lights',      needed: 1, confirmed: ['Brian Tan'] },
    { service: '11_am', role: 'tech_lights',      needed: 1, confirmed: ['Brian Tan'] },
    { service: '9_am',  role: 'tech_livestream',  needed: 1, confirmed: ['Aaron Roth'] },
    { service: '11_am', role: 'tech_livestream',  needed: 1, confirmed: ['Aaron Roth'] },

    // Prayer
    { service: '9_am',  role: 'prayer_team',      needed: 2, confirmed: ['Jenny Holloway', 'Pastor Mark'] },
    { service: '11_am', role: 'prayer_team',      needed: 2, confirmed: ['Jenny Holloway', 'Pastor Mark'] },
  ],
}

export interface SundayStats {
  total_slots: number
  filled_slots: number
  short_slots: number
  short_total: number  // total people short across all gaps
  prep_pct: number
  announcements_ready: number
  announcements_total: number
}

export function sundayStats(): SundayStats {
  const total_slots = upcomingService.slots.length
  const filled = upcomingService.slots.filter((s) => s.confirmed.length >= s.needed).length
  const short = upcomingService.slots.filter((s) => s.confirmed.length < s.needed)
  const short_total = short.reduce((sum, s) => sum + (s.needed - s.confirmed.length), 0)
  return {
    total_slots,
    filled_slots: filled,
    short_slots: short.length,
    short_total,
    prep_pct: upcomingService.sermon.prep_pct,
    announcements_ready: upcomingService.announcements.filter((a) => a.ready).length,
    announcements_total: upcomingService.announcements.length,
  }
}
