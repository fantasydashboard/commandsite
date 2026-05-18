/**
 * Grace's role inventory for Cornerstone Community Church.
 *
 * Each role maps to a tab on the dashboard so prospects can see —
 * and click through — exactly what Grace handles. Status + weekly
 * snippet are shown on the Today page's Grace at Work hub; tab
 * assignment drives "Grace's roles on this page" headers across
 * the rest of the dashboard.
 *
 * The shape is shared with Ada — see `@/lib/types/employeeRole`.
 */
import type { EmployeeRole } from '@/lib/types/employeeRole'
export { ROLE_STATUS_META, type RoleStatus } from '@/lib/types/employeeRole'

/** Alias — kept for back-compat with existing imports. */
export type GraceRole = EmployeeRole

export const graceRoles: GraceRole[] = [
  {
    key: 'front_desk',
    icon: 'front_desk',
    name: 'Front Desk',
    description: 'Catches every call, form, and connect card 24/7.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Handled 47 calls · captured 12 first-time visitors',
    this_week_count: 47,
    minutes_saved_per_event: 5,
  },
  {
    key: 'guest_followup',
    icon: 'qa_assistant',
    name: 'Guest Follow-Up',
    description: 'Personal welcome within 2 hours of every first-time visit.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Sent 8 welcomes (avg open: 11 min) · 5 day-3 nudges',
    this_week_count: 13,
    minutes_saved_per_event: 6,
  },
  {
    key: 'stories',
    icon: 'review_engine',
    name: 'Story Engine',
    description: 'Captures testimonies after baptisms, milestones, life events.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Captured 2 baptism stories · 1 share-ready quote drafted',
    this_week_count: 3,
    minutes_saved_per_event: 12,
  },
  {
    key: 'reengagement',
    icon: 'reactivation',
    name: 'Re-engagement',
    description: 'Notices when members drift past 60 days, drafts gentle outreach.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Sent 1 "we missed you" check-in (Reyes Family)',
    this_week_count: 4,
    minutes_saved_per_event: 8,
  },
  {
    key: 'drift_detection',
    icon: 'alert-triangle',
    name: 'Drift Detection',
    description: 'Watches the three flags (kids, giving, serving) per household.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Escalated 1 household past 2-flag threshold (Sullivans)',
    this_week_count: 6,
    minutes_saved_per_event: 4,
  },
  {
    key: 'care_triage',
    icon: 'referral_hunter',
    name: 'Care Triage',
    description: 'Routes pastoral emergencies, drafts check-ins for at-risk households.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Triaged 2 urgent cases · drafted 3 pastoral check-ins',
    this_week_count: 5,
    minutes_saved_per_event: 10,
  },
  {
    key: 'volunteer_coord',
    icon: 'calendar',
    name: 'Volunteer Coordination',
    description: 'Spots Sunday gaps, suggests fills, pings Planning Center.',
    tab: 'sundays-comms',
    status: 'active',
    this_week_snippet: 'Flagged 2 nursery gaps · suggested 4 last-minute fills',
    this_week_count: 6,
    minutes_saved_per_event: 7,
  },
  {
    key: 'communications',
    icon: 'email_marketing',
    name: 'Communications',
    description: 'Drafts birthday cards, life-event notes, condolences in your voice.',
    tab: 'sundays-comms',
    status: 'active',
    this_week_snippet: 'Sent newsletter (847 recipients · 38% open) · drafted 4 cards',
    this_week_count: 8,
    minutes_saved_per_event: 9,
  },
  {
    key: 'engagement_reporting',
    icon: 'performance_reporting',
    name: 'Engagement Reporting',
    description: 'Weekly + monthly health summaries — attendance, visitors, follow-ups.',
    tab: 'insights',
    status: 'active',
    this_week_snippet: 'Last Sunday: 412 attended (+24 vs 4-wk avg)',
    this_week_count: 4,
    minutes_saved_per_event: 18,
  },
  {
    key: 'qa_assistant',
    icon: 'qa_assistant',
    name: 'Q&A Assistant',
    description: 'Answers ad-hoc questions in plain English — try the chat above.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · answers about your congregation',
    this_week_count: 14,
    minutes_saved_per_event: 3,
  },
]

/** Filter roles to those that live on a specific tab — for use in
 *  per-page "Grace's roles on this page" headers. */
export function rolesOnTab(tabKey: string): GraceRole[] {
  return graceRoles.filter((r) => r.tab === tabKey)
}

/** Look up a role by key. Returns undefined if no role matches.
 *  Used by LiveActivityFeed to render role chips on events. */
export function getRole(key: string | undefined): GraceRole | undefined {
  if (!key) return undefined
  return graceRoles.find((r) => r.key === key)
}
