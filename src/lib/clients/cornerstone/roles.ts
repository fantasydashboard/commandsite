/**
 * Grace's role inventory for Cornerstone Community Church.
 *
 * Each role maps to a tab on the dashboard so prospects can see —
 * and click through — exactly what Grace handles. Status + weekly
 * snippet are shown on the Today page's Roles Status Grid; tab
 * assignment drives "Grace's roles on this page" headers across
 * the rest of the dashboard.
 */

export type RoleStatus = 'active' | 'configured' | 'setup_needed'

export interface GraceRole {
  key: string
  icon: string
  name: string
  /** One-line description shown on the role card */
  description: string
  /** Which dashboard tab this role's data + actions live on */
  tab: string
  status: RoleStatus
  /** "This week" activity snippet shown on the role card */
  this_week_snippet: string
}

export const graceRoles: GraceRole[] = [
  {
    key: 'front_desk',
    icon: '📞',
    name: 'Front Desk',
    description: 'Catches every call, form, and connect card 24/7.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Handled 47 calls · captured 12 first-time visitors',
  },
  {
    key: 'guest_followup',
    icon: '👋',
    name: 'Guest Follow-Up',
    description: 'Personal welcome within 2 hours of every first-time visit.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Sent 8 welcomes (avg open: 11 min) · 5 day-3 nudges',
  },
  {
    key: 'stories',
    icon: '🌱',
    name: 'Story Engine',
    description: 'Captures testimonies after baptisms, milestones, life events.',
    tab: 'front-desk-guests',
    status: 'active',
    this_week_snippet: 'Captured 2 baptism stories · 1 share-ready quote drafted',
  },
  {
    key: 'reengagement',
    icon: '🏡',
    name: 'Re-engagement',
    description: 'Notices when members drift past 60 days, drafts gentle outreach.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Sent 1 "we missed you" check-in (Reyes Family)',
  },
  {
    key: 'drift_detection',
    icon: '⚠',
    name: 'Drift Detection',
    description: 'Watches the three flags (kids, giving, serving) per household.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Escalated 1 household past 2-flag threshold (Sullivans)',
  },
  {
    key: 'care_triage',
    icon: '🤝',
    name: 'Care Triage',
    description: 'Routes pastoral emergencies, drafts check-ins for at-risk households.',
    tab: 'care-drift',
    status: 'active',
    this_week_snippet: 'Triaged 2 urgent cases · drafted 3 pastoral check-ins',
  },
  {
    key: 'volunteer_coord',
    icon: '🙋',
    name: 'Volunteer Coordination',
    description: 'Spots Sunday gaps, suggests fills, pings Planning Center.',
    tab: 'sundays-comms',
    status: 'active',
    this_week_snippet: 'Flagged 2 nursery gaps · suggested 4 last-minute fills',
  },
  {
    key: 'communications',
    icon: '📧',
    name: 'Communications',
    description: 'Drafts birthday cards, life-event notes, condolences in your voice.',
    tab: 'sundays-comms',
    status: 'active',
    this_week_snippet: 'Sent newsletter (847 recipients · 38% open) · drafted 4 cards',
  },
  {
    key: 'engagement_reporting',
    icon: '📊',
    name: 'Engagement Reporting',
    description: 'Weekly + monthly health summaries — attendance, visitors, follow-ups.',
    tab: 'insights',
    status: 'active',
    this_week_snippet: 'Last Sunday: 412 attended (+24 vs 4-wk avg)',
  },
  {
    key: 'qa_assistant',
    icon: '💬',
    name: 'Q&A Assistant',
    description: 'Answers ad-hoc questions in plain English — try the chat above.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · answers about your congregation',
  },
]

export const ROLE_STATUS_META: Record<RoleStatus, { label: string; pillClass: string }> = {
  active:        { label: 'Active',         pillClass: 'bg-success/15 text-success' },
  configured:    { label: 'Configured',     pillClass: 'bg-brand/15 text-brand' },
  setup_needed:  { label: 'Setup needed',   pillClass: 'bg-warn/15 text-warn' },
}

/** Filter roles to those that live on a specific tab — for use in
 *  per-page "Grace's roles on this page" headers. */
export function rolesOnTab(tabKey: string): GraceRole[] {
  return graceRoles.filter((r) => r.tab === tabKey)
}
