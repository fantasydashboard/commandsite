/**
 * Ada's role inventory for CommandSite-as-a-business (Josh's own
 * solo-founder dashboard). Same persona name as Apex's Ada — Josh
 * uses it daily so he's already rehearsed the brand when he gets
 * on a sales call. Different role inventory because solo-founder
 * SaaS ops are different from HVAC ops.
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
    key: 'reply_triage',
    icon: '✉',
    name: 'Reply Triage',
    description: 'Classifies every cold-email reply, auto-handles OOFs/unsubs, surfaces positives + objections.',
    tab: 'outreach',
    status: 'active',
    this_week_snippet: 'Classified 14 replies · 4 positives queued for your eyes',
  },
  {
    key: 'lead_sourcing',
    icon: '🎯',
    name: 'Lead Sourcing',
    description: 'Pulls from Apollo, scores against your ICP, queues winners for outreach.',
    tab: 'leads',
    status: 'configured',
    this_week_snippet: '47 leads added · 12 above 80% ICP score',
  },
  {
    key: 'pipeline_hygiene',
    icon: '📊',
    name: 'Pipeline Hygiene',
    description: 'Flags stale deals, suggests next actions, drafts "did this land?" follow-ups.',
    tab: 'pipeline',
    status: 'active',
    this_week_snippet: '6 stale deals flagged · 3 follow-ups drafted in your voice',
  },
  {
    key: 'deal_drafts',
    icon: '✏',
    name: 'Deal Closer Drafts',
    description: 'Drafts proposals, Loom scripts, and "ready to start?" check-ins for stalled deals.',
    tab: 'pipeline',
    status: 'configured',
    this_week_snippet: '2 proposal drafts ready for your review',
  },
  {
    key: 'customer_health',
    icon: '💚',
    name: 'Customer Health Watch',
    description: 'Watches MRR + product usage + ticket signals for early churn flags.',
    tab: 'customers',
    status: 'configured',
    this_week_snippet: 'No customers yet — activates once you onboard your first',
  },
  {
    key: 'support_triage',
    icon: '🤝',
    name: 'Support Triage',
    description: 'Classifies inbound support tickets, drafts replies, escalates urgent.',
    tab: 'customers',
    status: 'configured',
    this_week_snippet: 'Activates when first support ticket lands',
  },
  {
    key: 'revenue_reporting',
    icon: '💰',
    name: 'Revenue Reporting',
    description: 'MRR pulse, churn alerts, expansion opportunities, weekly snapshot.',
    tab: 'revenue',
    status: 'configured',
    this_week_snippet: 'MRR snapshot ready when first customer subscribes',
  },
  {
    key: 'social_composer',
    icon: '📱',
    name: 'Social Composer',
    description: 'Drafts cross-platform posts in your voice — Reddit, X, LinkedIn — for review + scheduling.',
    tab: 'social',
    status: 'active',
    this_week_snippet: '3 posts drafted · 2 scheduled to publish this week',
  },
  {
    key: 'founder_briefings',
    icon: '☕',
    name: 'Founder Briefings',
    description: 'Daily morning digest + Monday-morning weekly strategic summary.',
    tab: 'today',
    status: 'configured',
    this_week_snippet: 'Daily AM brief drops at 7:30 — strategic Monday summary at 8:00',
  },
  {
    key: 'qa_assistant',
    icon: '💬',
    name: 'Q&A Assistant',
    description: 'Ask-anything chat — try the box on Today. Knows MRR, pipeline, customers, the lot.',
    tab: 'today',
    status: 'active',
    this_week_snippet: 'Available 24/7 · ask her anything about CommandSite',
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
