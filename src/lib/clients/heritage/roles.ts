/**
 * Ada's role inventory for Heritage Bath & Kitchen Co.
 *
 * Same overall role structure as Apex (HVAC) — Ada doesn't change, the
 * vertical changes. What DOES change is the language + this-week activity
 * to reflect bath/kitchen reality (quote-driven sales cycles, longer
 * deliberation, portfolio-driven reviews, NEW Referral Engine role).
 *
 * The Quote Follow-Up role is intentionally bumped to position #2 (right
 * after Front Desk) because Quote Chaser is the KILLER role for this
 * vertical — 30-90 day sales cycles mean follow-up is the engine of
 * close rate.
 */
import type { EmployeeRole } from '@/lib/types/employeeRole'
export { ROLE_STATUS_META, type RoleStatus } from '@/lib/types/employeeRole'

export type AdaRole = EmployeeRole

export const adaRoles: AdaRole[] = [
  {
    key: 'quote_followup',
    icon: 'quote_followup',
    name: 'Quote Chaser',
    description: 'Chases every bath/kitchen quote on a 1/3/7/14/30-day cadence in your voice.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Across 14 quotes nudged · 4 closed this week',
    this_week_count: 14,
    minutes_saved_per_event: 6,
    // Killer role for this vertical — lead with revenue, not hours saved.
    business_outcome_headline: '$112K',
    business_outcome_label: 'revenue won',
  },
  {
    key: 'front_desk',
    icon: 'front_desk',
    name: 'Front Desk',
    description: 'Catches every consultation request, web form, after-hours inquiry.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Caught 22 inquiries · booked 9 in-home consultations',
    this_week_count: 22,
    minutes_saved_per_event: 9,
  },
  {
    key: 'review_engine',
    icon: 'review_engine',
    name: 'Review Engine',
    description: 'Asks customers 48 hours after final walkthrough; drafts replies to anything below 5★.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Earned 5 new 5★ reviews · drafted 1 reply to a 4-star',
    this_week_count: 6,
    minutes_saved_per_event: 5,
  },
  {
    key: 'referral_engine',
    icon: 'referral_hunter',
    name: 'Referral Engine',
    description: 'Asks past 5★ customers for referrals, tracks the friend, thanks the referrer when it converts.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Asked 4 customers for referrals · 2 friends booked consultations · 1 closed for $34K',
    this_week_count: 4,
    minutes_saved_per_event: 7,
  },
  {
    key: 'customer_health',
    icon: 'customer_health',
    name: 'Customer Health',
    description: 'Tracks customers post-completion + flags ones who might want a kitchen after their bath remodel.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: '2 households flagged for expansion outreach · 1 reactivation booked',
    this_week_count: 3,
    minutes_saved_per_event: 6,
  },
  {
    key: 'reactivation',
    icon: 'reactivation',
    name: 'Reactivation Engine',
    description: 'Wakes up dormant prospects + past customers who had a bath remodel and might want a kitchen.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Sent 12 reactivation messages · 3 booked consultations back',
    this_week_count: 12,
    minutes_saved_per_event: 6,
  },
  {
    key: 'schedule_coord',
    icon: 'schedule_coord',
    name: 'Schedule Coordination',
    description: 'Books consultations, sends reminders, handles reschedules when a homeowner needs to move a measure-day.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Booked 9 consults · 14 reminder texts · 2 weather reschedules',
    this_week_count: 11,
    minutes_saved_per_event: 5,
  },
  {
    key: 'email_marketing',
    icon: 'email_marketing',
    name: 'Email Marketing',
    description: 'Drafts + sends seasonal kitchen-trend newsletter, before/after showcase emails, holiday campaigns.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Sent "Spring kitchen trends" newsletter (842 recipients · 38% open)',
    this_week_count: 1,
    minutes_saved_per_event: 75,
  },
  {
    key: 'performance_reporting',
    icon: 'performance_reporting',
    name: 'Performance Reporting',
    description: 'Weekly + monthly metrics — close rate, ticket size, lead source ROI, project margin.',
    tab: 'insights',
    status: 'active',
    this_week_snippet: 'Last week: $112K revenue · 4 jobs closed · 28% close rate · $28K avg ticket',
    this_week_count: 7,
    minutes_saved_per_event: 18,
  },
  {
    key: 'qa_assistant',
    icon: 'qa_assistant',
    name: 'Q&A Assistant',
    description: 'Answers ad-hoc questions in plain English — try the chat above.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · ask her about quotes, customers, lead sources, anything',
    this_week_count: 23,
    minutes_saved_per_event: 4,
  },
  {
    key: 'deal_won_handoff',
    icon: 'deal_won_handoff',
    name: 'Deal-Won Handoff',
    description: 'When a quote closes, auto-creates the project file + sends welcome packet + schedules measure day.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Onboarded 4 new bath/kitchen projects · welcome packets + measure-day slots',
    this_week_count: 4,
    minutes_saved_per_event: 12,
  },
  {
    key: 'job_documentation',
    icon: 'job_documentation',
    name: 'Project Documentation',
    description: 'Prompts your crew for before/after photos + notes; organizes for portfolio + warranty + social.',
    tab: 'customer-care',
    status: 'configured',
    this_week_snippet: '38 photos captured · 6 ready for Houzz portfolio updates',
    this_week_count: 38,
    minutes_saved_per_event: 3,
  },
]

export function rolesOnTab(tabKey: string): AdaRole[] {
  return adaRoles.filter((r) => r.tab === tabKey)
}

export function getRole(key: string | undefined): AdaRole | undefined {
  if (!key) return undefined
  return adaRoles.find((r) => r.key === key)
}
