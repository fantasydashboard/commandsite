/**
 * Ada's role inventory for CommandSite-as-a-business (Josh's own
 * solo-founder dashboard). Same persona name as Apex's Ada — Josh
 * uses it daily so he's already rehearsed the brand when he gets
 * on a sales call. Different role inventory because solo-founder
 * SaaS ops are different from HVAC ops.
 *
 * Uses the shared `EmployeeRole` interface so the `AdaAtWorkHub`
 * component renders this catalog identically to Apex / Cornerstone.
 *
 * Count + per-event minutes are realistic estimates for current solo
 * usage; they'll get replaced with live data once we wire counters
 * from cs_replies / cs_outreach_sends / etc.
 */
import type { EmployeeRole, RoleStatus } from '@/lib/types/employeeRole'
import { ROLE_STATUS_META } from '@/lib/types/employeeRole'

// Re-export so existing consumers don't break.
export type AdaRole = EmployeeRole
export type { RoleStatus }
export { ROLE_STATUS_META }

export const adaRoles: EmployeeRole[] = [
  {
    key: 'reply_triage',
    icon: 'shuffle',
    name: 'Reply Triage',
    description: 'Classifies every cold-email reply, auto-handles OOFs/unsubs, surfaces positives + objections.',
    tab: 'outreach',
    status: 'active',
    this_week_snippet: 'Classified 14 replies · 4 positives queued for your eyes',
    this_week_count: 14,
    minutes_saved_per_event: 4,
  },
  {
    key: 'lead_sourcing',
    icon: 'referral_hunter',
    name: 'Lead Sourcing',
    description: 'Pulls from Apollo, scores against your ICP, queues winners for outreach.',
    tab: 'leads',
    status: 'configured',
    this_week_snippet: '47 leads added · 12 above 80% ICP score',
    this_week_count: 47,
    minutes_saved_per_event: 3,
  },
  {
    key: 'pipeline_hygiene',
    icon: 'trending-up',
    name: 'Pipeline Hygiene',
    description: 'Flags stale deals, suggests next actions, drafts "did this land?" follow-ups.',
    tab: 'pipeline',
    status: 'active',
    this_week_snippet: '6 stale deals flagged · 3 follow-ups drafted in your voice',
    this_week_count: 9,
    minutes_saved_per_event: 10,
  },
  {
    key: 'deal_drafts',
    icon: 'quote_followup',
    name: 'Deal Closer Drafts',
    description: 'Drafts proposals, Loom scripts, and "ready to start?" check-ins for stalled deals.',
    tab: 'pipeline',
    status: 'configured',
    this_week_snippet: '2 proposal drafts ready for your review',
    this_week_count: 2,
    minutes_saved_per_event: 25,
  },
  {
    key: 'customer_health',
    icon: 'customer_health',
    name: 'Customer Health Watch',
    description: 'Watches MRR + product usage + ticket signals for early churn flags.',
    tab: 'customers',
    status: 'configured',
    this_week_snippet: 'No customers yet. Activates once you onboard your first.',
    this_week_count: 0,
    minutes_saved_per_event: 5,
  },
  {
    key: 'support_triage',
    icon: 'qa_assistant',
    name: 'Support Triage',
    description: 'Classifies inbound support tickets, drafts replies, escalates urgent.',
    tab: 'customers',
    status: 'configured',
    this_week_snippet: 'Activates when first support ticket lands',
    this_week_count: 0,
    minutes_saved_per_event: 5,
  },
  {
    key: 'revenue_reporting',
    icon: 'dollar-sign',
    name: 'Revenue Reporting',
    description: 'MRR pulse, churn alerts, expansion opportunities, weekly snapshot.',
    tab: 'revenue',
    status: 'configured',
    this_week_snippet: 'MRR snapshot ready when first customer subscribes',
    this_week_count: 0,
    minutes_saved_per_event: 10,
  },
  {
    key: 'social_composer',
    icon: 'email_marketing',
    name: 'Social Composer',
    description: 'Drafts cross-platform posts in your voice (Reddit, X, LinkedIn) for review + scheduling.',
    tab: 'social',
    status: 'active',
    this_week_snippet: '3 posts drafted · 2 scheduled to publish this week',
    this_week_count: 3,
    minutes_saved_per_event: 15,
  },
  {
    key: 'founder_briefings',
    icon: 'performance_reporting',
    name: 'Founder Briefings',
    description: 'Daily morning digest + Monday-morning weekly strategic summary.',
    tab: 'today',
    status: 'configured',
    this_week_snippet: 'Daily AM brief drops at 7:30 · strategic Monday summary at 8:00',
    this_week_count: 5,
    minutes_saved_per_event: 8,
  },
  {
    key: 'qa_assistant',
    icon: 'qa_assistant',
    name: 'Q&A Assistant',
    description: 'Ask-anything chat. Try the box on Today. Knows MRR, pipeline, customers, the lot.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · ask her anything about CommandSite',
    this_week_count: 15,
    minutes_saved_per_event: 2,
  },
]

export function rolesOnTab(tabKey: string): EmployeeRole[] {
  return adaRoles.filter((r) => r.tab === tabKey)
}

export function getRole(key: string): EmployeeRole | undefined {
  return adaRoles.find((r) => r.key === key)
}
