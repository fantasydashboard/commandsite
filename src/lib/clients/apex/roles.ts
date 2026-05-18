/**
 * Ada's role inventory for Apex Heating & Air (and any local services
 * customer). Mirrors the Grace structure on the Cornerstone side —
 * 10+ roles, each mapped to a tab + with status + this-week snippet
 * shown on the Roles Status Grid on the Today/Overview page.
 *
 * The shape is shared across personas — see `@/lib/types/employeeRole`.
 */
import type { EmployeeRole } from '@/lib/types/employeeRole'
export { ROLE_STATUS_META, type RoleStatus } from '@/lib/types/employeeRole'

/** Alias — kept for back-compat with existing imports. */
export type AdaRole = EmployeeRole

export const adaRoles: AdaRole[] = [
  {
    key: 'front_desk',
    icon: 'front_desk',
    name: 'Front Desk',
    description: 'Catches every call, web form, after-hours request 24/7.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Caught 84 calls · booked 31 service appts',
    this_week_count: 84,
    minutes_saved_per_event: 8,
  },
  {
    key: 'quote_followup',
    icon: 'quote_followup',
    name: 'Quote Follow-Up',
    description: 'Chases every estimate on a 7-day SMS sequence in your voice.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Followed up on 18 quotes · 6 closed this week',
    this_week_count: 18,
    minutes_saved_per_event: 4,
  },
  {
    key: 'customer_health',
    icon: 'customer_health',
    name: 'Customer Health',
    description: 'Watches recurring service intervals + flags churn risk early.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: '3 households flagged at-risk · 2 maintenance overdue',
    this_week_count: 5,
    minutes_saved_per_event: 6,
  },
  {
    key: 'reactivation',
    icon: 'reactivation',
    name: 'Reactivation Engine',
    description: 'Wakes up dormant leads + past customers with personalized outreach.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Sent 24 reactivation messages · 5 booked jobs back',
    this_week_count: 24,
    minutes_saved_per_event: 6,
  },
  {
    key: 'schedule_coord',
    icon: 'schedule_coord',
    name: 'Schedule Coordination',
    description: 'Dispatches techs, sends reminders, handles weather reshuffles.',
    tab: 'schedule',
    status: 'active',
    this_week_snippet: 'Reshuffled 4 jobs around storms · 12 reminder texts sent',
    this_week_count: 16,
    minutes_saved_per_event: 5,
  },
  {
    key: 'review_engine',
    icon: 'review_engine',
    name: 'Review Engine',
    description: 'Asks customers 2 hrs after job completion, drafts replies to negative reviews.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Earned 11 new reviews (avg 4.8★) · drafted 1 reply to 3-star',
    this_week_count: 12,
    minutes_saved_per_event: 5,
  },
  {
    key: 'email_marketing',
    icon: 'email_marketing',
    name: 'Email Marketing',
    description: 'Drafts + sends seasonal campaigns, monthly newsletter, promotions.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Sent monthly newsletter (1,247 recipients · 41% open)',
    this_week_count: 1,
    minutes_saved_per_event: 60,
  },
  {
    key: 'performance_reporting',
    icon: 'performance_reporting',
    name: 'Performance Reporting',
    description: 'Weekly + monthly metrics — revenue, conversion, churn, technician utilization.',
    tab: 'insights',
    status: 'active',
    this_week_snippet: 'Last week: $48,920 revenue · 34 jobs · 87% close rate',
    this_week_count: 7,
    minutes_saved_per_event: 15,
  },
  {
    key: 'qa_assistant',
    icon: 'qa_assistant',
    name: 'Q&A Assistant',
    description: 'Answers ad-hoc questions in plain English — try the chat above.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · ask her about jobs, customers, anything',
    this_week_count: 18,
    minutes_saved_per_event: 3,
  },
  {
    key: 'referral_hunter',
    icon: 'referral_hunter',
    name: 'Referral Hunter',
    description: 'Asks past happy customers who they’d refer, tracks + thanks the referrer when it converts.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Asked 6 customers for a referral · 2 warm leads back',
    this_week_count: 6,
    minutes_saved_per_event: 5,
  },
  {
    key: 'deal_won_handoff',
    icon: 'deal_won_handoff',
    name: 'Deal-Won Handoff',
    description: 'When a quote closes, auto-creates the customer + sends welcome + slots the calendar.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Onboarded 6 new customers · welcome texts + calendar holds',
    this_week_count: 6,
    minutes_saved_per_event: 7,
  },
  {
    key: 'job_documentation',
    icon: 'job_documentation',
    name: 'Job Documentation',
    description: 'Prompts techs for completion photos + notes; auto-organizes for warranty + marketing.',
    tab: 'schedule',
    status: 'configured',
    this_week_snippet: '47 photos captured · 8 ready for social posts',
    this_week_count: 47,
    minutes_saved_per_event: 2,
  },
]

export function rolesOnTab(tabKey: string): AdaRole[] {
  return adaRoles.filter((r) => r.tab === tabKey)
}

export function getRole(key: string | undefined): AdaRole | undefined {
  if (!key) return undefined
  return adaRoles.find((r) => r.key === key)
}
