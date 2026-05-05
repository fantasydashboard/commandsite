/**
 * Ada's role inventory for Apex Heating & Air (and any local services
 * customer). Mirrors the Grace structure on the Cornerstone side —
 * 10 roles, each mapped to a tab + with status + this-week snippet
 * shown on the Roles Status Grid on the Today/Overview page.
 */

export type RoleStatus = 'active' | 'configured' | 'setup_needed'

export interface AdaRole {
  key: string
  icon: string
  name: string
  description: string
  tab: string
  status: RoleStatus
  this_week_snippet: string
}

export const adaRoles: AdaRole[] = [
  {
    key: 'front_desk',
    icon: '📞',
    name: 'Front Desk',
    description: 'Catches every call, web form, after-hours request 24/7.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Caught 84 calls · booked 31 service appts',
  },
  {
    key: 'quote_followup',
    icon: '📋',
    name: 'Quote Follow-Up',
    description: 'Chases every estimate on a 7-day SMS sequence in your voice.',
    tab: 'front-desk-quotes',
    status: 'active',
    this_week_snippet: 'Followed up on 18 quotes · 6 closed this week',
  },
  {
    key: 'customer_health',
    icon: '💚',
    name: 'Customer Health',
    description: 'Watches recurring service intervals + flags churn risk early.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: '3 households flagged at-risk · 2 maintenance overdue',
  },
  {
    key: 'reactivation',
    icon: '🔁',
    name: 'Reactivation Engine',
    description: 'Wakes up dormant leads + past customers with personalized outreach.',
    tab: 'customer-care',
    status: 'active',
    this_week_snippet: 'Sent 24 reactivation messages · 5 booked jobs back',
  },
  {
    key: 'schedule_coord',
    icon: '🗓️',
    name: 'Schedule Coordination',
    description: 'Dispatches techs, sends reminders, handles weather reshuffles.',
    tab: 'schedule',
    status: 'active',
    this_week_snippet: 'Reshuffled 4 jobs around storms · 12 reminder texts sent',
  },
  {
    key: 'review_engine',
    icon: '⭐',
    name: 'Review Engine',
    description: 'Asks customers 2 hrs after job completion, drafts replies to negative reviews.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Earned 11 new reviews (avg 4.8★) · drafted 1 reply to 3-star',
  },
  {
    key: 'email_marketing',
    icon: '📧',
    name: 'Email Marketing',
    description: 'Drafts + sends seasonal campaigns, monthly newsletter, promotions.',
    tab: 'reputation-marketing',
    status: 'active',
    this_week_snippet: 'Sent monthly newsletter (1,247 recipients · 41% open)',
  },
  {
    key: 'performance_reporting',
    icon: '📊',
    name: 'Performance Reporting',
    description: 'Weekly + monthly metrics — revenue, conversion, churn, technician utilization.',
    tab: 'insights',
    status: 'active',
    this_week_snippet: 'Last week: $48,920 revenue · 34 jobs · 87% close rate',
  },
  {
    key: 'qa_assistant',
    icon: '💬',
    name: 'Q&A Assistant',
    description: 'Answers ad-hoc questions in plain English — try the chat above.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · ask her about jobs, customers, anything',
  },
  {
    key: 'job_documentation',
    icon: '📸',
    name: 'Job Documentation',
    description: 'Prompts techs for completion photos + notes; auto-organizes for warranty + marketing.',
    tab: 'schedule',
    status: 'configured',
    this_week_snippet: '47 photos captured · 8 ready for social posts',
  },
]

export const ROLE_STATUS_META: Record<RoleStatus, { label: string; pillClass: string }> = {
  active:        { label: 'Active',         pillClass: 'bg-success/15 text-success' },
  configured:    { label: 'Configured',     pillClass: 'bg-brand/15 text-brand' },
  setup_needed:  { label: 'Setup needed',   pillClass: 'bg-warn/15 text-warn' },
}

export function rolesOnTab(tabKey: string): AdaRole[] {
  return adaRoles.filter((r) => r.tab === tabKey)
}
