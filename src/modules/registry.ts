import type { Component } from 'vue'
import MetricsModule from './MetricsModule.vue'
import CrmModule from './CrmModule.vue'
import ProjectsModule from './ProjectsModule.vue'
import SocialModule from './SocialModule.vue'
import UfdMetricsModule from './UfdMetricsModule.vue'
import UfdRevenueModule from './UfdRevenueModule.vue'
import UfdFunnelModule from './UfdFunnelModule.vue'
import UfdSharesModule from './UfdSharesModule.vue'
import UfdEmailModule from './UfdEmailModule.vue'
import UfdEmailPipelineModule from './UfdEmailPipelineModule.vue'
import AiSocialModule from './AiSocialModule.vue'
import SocialDistributionModule from './SocialDistributionModule.vue'
import SocialListeningModule from './SocialListeningModule.vue'
import SocialPlannerModule from './SocialPlannerModule.vue'
import ApexOverviewModule from './ApexOverviewModule.vue'
import ApexFrontDeskQuotesModule from './ApexFrontDeskQuotesModule.vue'
import ApexCustomerCareModule from './ApexCustomerCareModule.vue'
import ApexReputationMarketingModule from './ApexReputationMarketingModule.vue'
import ApexSettingsModule from './ApexSettingsModule.vue'
import ApexScheduleModule from './ApexScheduleModule.vue'
import ApexMetricsModule from './ApexMetricsModule.vue'
import CommandSiteTodayModule from './CommandSiteTodayModule.vue'
import CommandSitePipelineModule from './CommandSitePipelineModule.vue'
import CommandSiteLeadsModule from './CommandSiteLeadsModule.vue'
import CommandSiteCustomersModule from './CommandSiteCustomersModule.vue'
import CommandSiteOutreachModule from './CommandSiteOutreachModule.vue'
import CommandSiteRevenueModule from './CommandSiteRevenueModule.vue'
import CommandSiteSocialModule from './CommandSiteSocialModule.vue'
import CommandSiteUsageModule from './CommandSiteUsageModule.vue'
import CommandSiteReputationModule from './CommandSiteReputationModule.vue'
import CommandSiteSupportModule from './CommandSiteSupportModule.vue'
import CommandSiteSettingsModule from './CommandSiteSettingsModule.vue'
import UfdRedesignTodayModule from './UfdRedesignTodayModule.vue'
import UfdRedesignUsersModule from './UfdRedesignUsersModule.vue'
import UfdRedesignFunnelModule from './UfdRedesignFunnelModule.vue'
import UfdRedesignRevenueModule from './UfdRedesignRevenueModule.vue'
import UfdRedesignCardsModule from './UfdRedesignCardsModule.vue'
import UfdRedesignEmailModule from './UfdRedesignEmailModule.vue'
import UfdRedesignSocialModule from './UfdRedesignSocialModule.vue'
import UfdRedesignSettingsModule from './UfdRedesignSettingsModule.vue'
import { mentions as ufdRedesignMentions } from '@/lib/clients/ufd-redesign/social'
import JoshPersonalTodayModule from './JoshPersonalTodayModule.vue'
import JoshPersonalPlanModule from './JoshPersonalPlanModule.vue'
import JoshPersonalTrendsModule from './JoshPersonalTrendsModule.vue'
import JoshPersonalBloodworkModule from './JoshPersonalBloodworkModule.vue'
import JoshPersonalGoalsModule from './JoshPersonalGoalsModule.vue'
import CornerstoneTodayModule from './CornerstoneTodayModule.vue'
import CornerstoneFrontDeskGuestsModule from './CornerstoneFrontDeskGuestsModule.vue'
import CornerstoneCareDriftModule from './CornerstoneCareDriftModule.vue'
import CornerstoneSundaysCommsModule from './CornerstoneSundaysCommsModule.vue'
import CornerstoneMetricsModule from './CornerstoneMetricsModule.vue'
import CornerstoneGivingModule from './CornerstoneGivingModule.vue'
import CornerstoneSettingsModule from './CornerstoneSettingsModule.vue'
import { households as cornerstoneHouseholds, totalFlagCount as cornerstoneFlagCount } from '@/lib/clients/cornerstone/people'
import { careStats as cornerstoneCareStats } from '@/lib/clients/cornerstone/care'
import { stoppedGivingHouseholds as cornerstoneStoppedGiving } from '@/lib/clients/cornerstone/giving'
import { crossSellFlags as csCrossSell } from '@/lib/clients/commandsite/usage'
import { reviews as csB2BReviews } from '@/lib/clients/commandsite/reputation'
import { tickets as csTickets } from '@/lib/clients/commandsite/support'
import { todayItems as ufdRedesignTodayItems } from '@/lib/clients/ufd-redesign/today'
import { users as ufdRedesignUsers } from '@/lib/clients/ufd-redesign/users'
import { todayItems as csTodayItems } from '@/lib/clients/commandsite/today'
import { deals as csDeals } from '@/lib/clients/commandsite/pipeline'
import { companies as csCompanies } from '@/lib/clients/commandsite/companies'
import { replies as csReplies } from '@/lib/clients/commandsite/outreach'
import { failedPayments as csFailedPayments } from '@/lib/clients/commandsite/revenue'
import { engagements as csEngagements, engagedLeads as csEngagedLeads } from '@/lib/clients/commandsite/social'
import { todayJobs as apexTodayJobs } from '@/lib/clients/apex/schedule'
import { quotes as apexQuotes } from '@/lib/clients/apex/quotes'
import { customers as apexCustomers } from '@/lib/clients/apex/customers'
import { reviews as apexReviews } from '@/lib/clients/apex/reviews'

export interface SubTab {
  key: string
  label: string
}

export interface TabDefinition {
  key: string
  label: string
  // When present, the tab renders a second-level nav. Modules under this
  // tab declare which subtab they render in via ModuleDefinition.subtab.
  // A subtab only appears in the nav if at least one of the client's
  // enabled modules targets it.
  subtabs?: SubTab[]
}

// Tabs are derived from this list at render time. The dashboard nav shows
// every unique tab that has at least one enabled module for the current
// client. Order here is the source of truth for nav ordering.
//
// The "ops" tabs (calls/quotes/reviews/reactivation/settings) are
// service-industry specific — they only appear for clients with those
// modules enabled (Apex Heating & Air etc.). UFD doesn't get them.
export const dashboardTabs: TabDefinition[] = [
  { key: 'today', label: 'Today' },
  { key: 'plan', label: 'Plan' },
  { key: 'trends', label: 'Trends' },
  { key: 'bloodwork', label: 'Bloodwork' },
  { key: 'goals', label: 'Goals' },
  { key: 'overview', label: 'Overview' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'leads', label: 'Leads' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'social', label: 'Social' },
  { key: 'usage', label: 'Usage' },
  { key: 'reputation', label: 'Reputation' },
  { key: 'cards', label: 'Cards & Shares' },
  { key: 'front-desk-guests', label: 'Front Desk & Guests' },
  { key: 'front-desk-quotes', label: 'Front Desk & Quotes' },
  { key: 'care-drift', label: 'Care & Drift' },
  { key: 'customer-care', label: 'Customer Care' },
  { key: 'sundays-comms', label: 'Sundays & Comms' },
  { key: 'reputation-marketing', label: 'Reputation & Marketing' },
  { key: 'insights', label: 'Insights' },
  { key: 'giving', label: 'Giving' },
  { key: 'support', label: 'Support' },
  { key: 'customers', label: 'Customers' },
  { key: 'users', label: 'Users' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'calls', label: 'Calls' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'reactivation', label: 'Reactivation' },
  {
    key: 'marketing',
    label: 'Marketing',
    subtabs: [
      { key: 'email', label: 'Email' },
      { key: 'social', label: 'Social' },
      { key: 'listening', label: 'Listening' },
    ],
  },
  { key: 'crm', label: 'CRM' },
  { key: 'projects', label: 'Projects' },
  { key: 'settings', label: 'Settings' },
]

export interface TabBadge {
  count: number
  tone?: 'info' | 'warn' | 'danger'
}

export interface ModuleDefinition {
  key: string
  label: string
  description: string
  component: Component
  // Bypass the default single-column card wrap on the dashboard home.
  // Full-width modules render their own layout across the grid.
  fullWidth?: boolean
  // Which dashboard tab this module renders inside. Modules without a
  // tab render on the legacy "home" view (no tab parameter).
  tab?: string
  // For tabs that declare subtabs, which one this module belongs to.
  // Ignored on tabs without subtabs.
  subtab?: string
  // Optional live badge — number rendered next to the tab label so the
  // owner sees "3 things to look at" without entering the tab. If
  // multiple modules under one tab return badges, counts sum and the
  // strongest tone wins (danger > warn > info).
  badge?: () => TabBadge | null
}

// Single source of truth for available modules.
// Add new modules here — the admin UI and client dashboard both read from this list.
export const moduleRegistry: ModuleDefinition[] = [
  {
    key: 'metrics',
    label: 'Metrics',
    description: 'KPIs, charts, and business health overview.',
    component: MetricsModule,
    tab: 'metrics',
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Contacts, deals, and pipeline.',
    component: CrmModule,
    tab: 'crm',
  },
  {
    key: 'projects',
    label: 'Project Management',
    description: 'Tasks, milestones, and team workload.',
    component: ProjectsModule,
    tab: 'projects',
  },
  {
    key: 'social',
    label: 'Social Media',
    description: 'Post scheduling and engagement stats.',
    component: SocialModule,
    tab: 'marketing',
    subtab: 'social',
  },
  {
    key: 'ufd-metrics',
    label: 'UFD Metrics',
    description: 'Ultimate Fantasy Dashboard subscription metrics and trends.',
    component: UfdMetricsModule,
    fullWidth: true,
    tab: 'metrics',
  },
  {
    key: 'ufd-revenue',
    label: 'UFD Revenue',
    description: 'Stripe-backed MRR, ARR, churn, plan mix, and failed payments.',
    component: UfdRevenueModule,
    fullWidth: true,
    tab: 'metrics',
  },
  {
    key: 'ufd-funnel',
    label: 'UFD Funnel',
    description: 'Signup → connected league → trial week → paid → renewed conversion funnel.',
    component: UfdFunnelModule,
    fullWidth: true,
    tab: 'metrics',
  },
  {
    key: 'ufd-shares',
    label: 'UFD Card Shares',
    description: 'Card-share analytics — top dashboards, top sharers, conversion correlation.',
    component: UfdSharesModule,
    fullWidth: true,
    tab: 'metrics',
  },
  {
    key: 'ufd-email',
    label: 'UFD Email',
    description: 'Resend email metrics, deliverability rates, and per-campaign performance.',
    component: UfdEmailModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'email',
  },
  {
    key: 'ufd-email-pipeline',
    label: 'UFD Email Pipeline',
    description: 'Kanban view of where each trial user is in the lifecycle sequence; per-user Send Now / Skip actions.',
    component: UfdEmailPipelineModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'email',
  },
  {
    key: 'ai-social',
    label: 'AI Marketing',
    description: 'AI-driven multi-channel marketing: brand profile, strategist, social writer, email composer.',
    component: AiSocialModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'social',
  },
  {
    key: 'social-planner',
    label: 'Social Planner',
    description: 'AI-driven 7-day content calendar; weaves brand profile, strategist themes, and sport calendar into actual planned posts.',
    component: SocialPlannerModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'social',
  },
  {
    key: 'social-distribution',
    label: 'Social Distribution',
    description: 'Compose, schedule, and queue Reddit + X posts with manual or (later) API publishing.',
    component: SocialDistributionModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'social',
  },
  {
    key: 'social-listening',
    label: 'Social Listening',
    description: 'Track UFD mentions and questions across Reddit + X. Phase 1 manual entry, Phase 2 auto-monitoring.',
    component: SocialListeningModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'listening',
  },

  // ── Apex Heating & Air (Option 3 role-led layout) ──────────────────────
  {
    key: 'apex-overview',
    label: 'Apex Today',
    description: 'Ada overview + Ask-Ada chat + roles status grid + recent activity.',
    component: ApexOverviewModule,
    fullWidth: true,
    tab: 'overview',
  },
  {
    key: 'apex-front-desk-quotes',
    label: 'Apex Front Desk & Quotes',
    description: "Ada's first-touch roles — Front Desk + Quote Follow-Up.",
    component: ApexFrontDeskQuotesModule,
    fullWidth: true,
    tab: 'front-desk-quotes',
    badge: () => {
      // Aging quotes that need a nudge
      const aging = apexQuotes.filter((q) =>
        q.stage === 'followup_day_7' ||
        q.stage === 'followup_day_14' ||
        q.stage === 'followup_day_30',
      ).length
      return aging > 0 ? { count: aging, tone: 'info' } : null
    },
  },
  {
    key: 'apex-customer-care',
    label: 'Apex Customer Care',
    description: "Ada's customer-keeping roles — Customer Health + Reactivation.",
    component: ApexCustomerCareModule,
    fullWidth: true,
    tab: 'customer-care',
    badge: () => {
      const dormant = apexCustomers.filter((c) => c.funnel_stage === 'dormant').length
      return dormant > 0 ? { count: dormant, tone: 'warn' } : null
    },
  },
  {
    key: 'apex-reputation-marketing',
    label: 'Apex Reputation & Marketing',
    description: "Ada's outbound brand work — Review Engine + Email Marketing.",
    component: ApexReputationMarketingModule,
    fullWidth: true,
    tab: 'reputation-marketing',
    badge: () => {
      const unanswered = apexReviews.filter((r) => !r.response).length
      const lowRated = apexReviews.filter((r) => !r.response && r.rating <= 3).length
      if (unanswered <= 0) return null
      return { count: unanswered, tone: lowRated > 0 ? 'warn' : 'info' }
    },
  },
  {
    key: 'apex-schedule',
    label: 'Apex Schedule',
    description: "Ada's Schedule Coordination role — today's dispatch board, week-ahead grouped list, weather reshuffles.",
    component: ApexScheduleModule,
    fullWidth: true,
    tab: 'schedule',
    badge: () => {
      const ahead = apexTodayJobs.filter((j) => j.status === 'scheduled' || j.status === 'en_route').length
      return ahead > 0 ? { count: ahead, tone: 'info' } : null
    },
  },
  {
    key: 'apex-metrics',
    label: 'Apex Insights',
    description: "Ada's Performance Reporting role — revenue trend, lead-source ROI, tech leaderboard, service mix, conversion funnel.",
    component: ApexMetricsModule,
    fullWidth: true,
    tab: 'insights',
  },
  {
    key: 'apex-settings',
    label: 'Apex Settings',
    description: 'Business hours, technician roster, Ada config, integrations, service area.',
    component: ApexSettingsModule,
    fullWidth: true,
    tab: 'settings',
  },

  // ── CommandSite (the business — Josh's own dashboard) ───────────────
  {
    key: 'commandsite-today',
    label: 'CommandSite Today',
    description: 'Action queue — pipeline replies, customer-health alerts, MRR changes, demos, expansion signals.',
    component: CommandSiteTodayModule,
    fullWidth: true,
    tab: 'today',
    badge: () => {
      const high = csTodayItems.filter((t) => t.priority === 'high').length
      if (high <= 0) return null
      return { count: high, tone: 'danger' }
    },
  },
  {
    key: 'commandsite-pipeline',
    label: 'CommandSite Pipeline',
    description: 'Sales kanban — Cold → Researched → Contacted → Replied → Demo → Proposal → Closed.',
    component: CommandSitePipelineModule,
    fullWidth: true,
    tab: 'pipeline',
    badge: () => {
      // Deals with action overdue or due today.
      const dueOrOverdue = csDeals.filter((d) => {
        if (d.stage === 'closed_won' || d.stage === 'closed_lost') return false
        const ms = new Date(d.next_action_due_at).getTime() - Date.now()
        return ms < 24 * 60 * 60 * 1000
      }).length
      return dueOrOverdue > 0 ? { count: dueOrOverdue, tone: 'warn' } : null
    },
  },
  {
    key: 'commandsite-leads',
    label: 'CommandSite Leads',
    description: 'Pre-pipeline prospect list — CSV import + ICP scoring + promote-to-pipeline.',
    component: CommandSiteLeadsModule,
    fullWidth: true,
    tab: 'leads',
  },
  {
    key: 'commandsite-customers',
    label: 'CommandSite Customers',
    description: 'B2B accounts with health score, plan, MRR, and expansion / at-risk signals.',
    component: CommandSiteCustomersModule,
    fullWidth: true,
    tab: 'customers',
    badge: () => {
      const atRisk = csCompanies.filter((c) => c.stage === 'at_risk').length
      return atRisk > 0 ? { count: atRisk, tone: 'danger' } : null
    },
  },
  {
    key: 'commandsite-outreach',
    label: 'CommandSite Outreach',
    description: 'Cold-email + cold-call + LinkedIn sequences with AI-classified reply inbox and manual call queue.',
    component: CommandSiteOutreachModule,
    fullWidth: true,
    tab: 'outreach',
    badge: () => {
      // Unread positive + objection replies that need a human response.
      const actionable = csReplies.filter((r) =>
        r.classification === 'positive' || r.classification === 'objection',
      ).length
      return actionable > 0 ? { count: actionable, tone: 'info' } : null
    },
  },
  {
    key: 'commandsite-revenue',
    label: 'CommandSite Revenue',
    description: 'MRR, ARR, churn, plan mix, cohort retention, LTV:CAC, failed payments.',
    component: CommandSiteRevenueModule,
    fullWidth: true,
    tab: 'revenue',
    badge: () => {
      const failed = csFailedPayments.length
      return failed > 0 ? { count: failed, tone: 'warn' } : null
    },
  },
  {
    key: 'commandsite-social',
    label: 'CommandSite Social',
    description: 'Calendar, AI composer (cross-platform variations), engagement inbox, ICP-scored engaged leads, performance with pipeline attribution.',
    component: CommandSiteSocialModule,
    fullWidth: true,
    tab: 'social',
    badge: () => {
      // Inbox engagements that need a reply + high-fit leads not yet in pipeline.
      const actionable = csEngagements.filter((e) =>
        e.classification === 'lead_signal' || e.classification === 'question' ||
        e.classification === 'critique' || e.classification === 'praise',
      ).length
      const hotLeads = csEngagedLeads.filter((l) => !l.in_pipeline && l.icp_fit_score >= 80).length
      const total = actionable + hotLeads
      return total > 0 ? { count: total, tone: 'info' } : null
    },
  },
  {
    key: 'commandsite-usage',
    label: 'CommandSite Product Usage',
    description: 'Per-customer feature adoption heatmap, activation funnel, and cross-sell opportunities (activation + expansion plays).',
    component: CommandSiteUsageModule,
    fullWidth: true,
    tab: 'usage',
    badge: () => {
      // Number of expansion-play cross-sells (real upsell dollars).
      const expansion = csCrossSell().filter((f) => f.kind === 'expansion').length
      return expansion > 0 ? { count: expansion, tone: 'info' } : null
    },
  },
  {
    key: 'commandsite-reputation',
    label: 'CommandSite Reputation',
    description: 'B2B reviews (G2/Capterra/PH/Reddit) with AI-drafted replies, in-product NPS, and public mentions feed.',
    component: CommandSiteReputationModule,
    fullWidth: true,
    tab: 'reputation',
    badge: () => {
      const unanswered = csB2BReviews.filter((r) => !r.response).length
      // 1- or 2-star unanswered bumps to warn.
      const lowRated = csB2BReviews.filter((r) => !r.response && r.rating <= 2).length
      if (unanswered <= 0) return null
      return { count: unanswered, tone: lowRated > 0 ? 'warn' : 'info' }
    },
  },
  {
    key: 'commandsite-support',
    label: 'CommandSite Support',
    description: 'Open tickets queue, active customer onboardings with checklist progress, and KB hot articles.',
    component: CommandSiteSupportModule,
    fullWidth: true,
    tab: 'support',
    badge: () => {
      const open = csTickets.filter((t) => t.status !== 'resolved').length
      const urgent = csTickets.filter((t) => t.status !== 'resolved' && t.severity === 'urgent').length
      if (open <= 0) return null
      return { count: open, tone: urgent > 0 ? 'danger' : 'info' }
    },
  },
  {
    key: 'commandsite-settings',
    label: 'CommandSite Settings',
    description: 'Team, plans, sending domains, suppression list, integrations, API keys + webhooks, ICP definition.',
    component: CommandSiteSettingsModule,
    fullWidth: true,
    tab: 'settings',
  },

  // ── UFD Redesign (B2C — fresh take on UFD using the new pattern) ─────
  {
    key: 'ufd-redesign-today',
    label: 'UFD Today',
    description: 'B2C action queue — trial conversions, viral spikes, payment dunning, churn saves, season events.',
    component: UfdRedesignTodayModule,
    fullWidth: true,
    tab: 'today',
    badge: () => {
      const high = ufdRedesignTodayItems.filter((t) => t.priority === 'high').length
      return high > 0 ? { count: high, tone: 'danger' } : null
    },
  },
  {
    key: 'ufd-redesign-users',
    label: 'UFD Users',
    description: 'Per-user list — real cohort data + Bones-drafted founder outreach per row.',
    component: UfdRedesignUsersModule,
    fullWidth: true,
    tab: 'users',
    badge: () => {
      const atRisk = ufdRedesignUsers.filter((u) => u.lifecycle_stage === 'at_risk').length
      const expiring = ufdRedesignUsers.filter((u) => u.lifecycle_stage === 'trial_expiring').length
      const total = atRisk + expiring
      return total > 0 ? { count: total, tone: 'warn' } : null
    },
  },
  {
    key: 'ufd-redesign-funnel',
    label: 'UFD Funnel',
    description: 'Activation (first 7 days) + conversion (trial → paid → renewed) funnels with per-platform breakdown and drop-off insights.',
    component: UfdRedesignFunnelModule,
    fullWidth: true,
    tab: 'metrics',
  },
  {
    key: 'ufd-redesign-revenue',
    label: 'UFD Revenue',
    description: 'MRR/ARR/churn with NFL-season annotations, plan mix (Monthly vs Annual), cohort retention heatmap, LTV:CAC, failed payments.',
    component: UfdRedesignRevenueModule,
    fullWidth: true,
    tab: 'revenue',
  },
  {
    key: 'ufd-redesign-cards',
    label: 'UFD Cards & Shares',
    description: 'Viral product surface — top viral cards leaderboard, card-type performance, share funnel, channel breakdown, pattern insights.',
    component: UfdRedesignCardsModule,
    fullWidth: true,
    tab: 'cards',
  },
  {
    key: 'ufd-redesign-email',
    label: 'UFD Lifecycle Email',
    description: 'Templates + per-user pipeline kanban + performance — UFD\'s #1 retention surface in one place.',
    component: UfdRedesignEmailModule,
    fullWidth: true,
    tab: 'marketing',
    subtab: 'email',
  },
  {
    key: 'ufd-redesign-social',
    label: 'UFD Reddit & Social',
    description: 'Reddit-first Calendar + AI Composer + Listening inbox + Performance with trial-signup attribution.',
    component: UfdRedesignSocialModule,
    fullWidth: true,
    tab: 'social',
    badge: () => {
      const actionable = ufdRedesignMentions.filter((m) =>
        m.classification === 'lead_signal' || m.classification === 'question' ||
        m.classification === 'complaint' || m.classification === 'praise',
      ).length
      return actionable > 0 ? { count: actionable, tone: 'info' } : null
    },
  },
  {
    key: 'ufd-redesign-settings',
    label: 'UFD Settings',
    description: 'Team, plans, sending domains, suppression, integrations (Stripe/Resend/ESPN/Yahoo/Sleeper/Reddit/PostHog), API keys + webhooks, AI brand-voice prompt.',
    component: UfdRedesignSettingsModule,
    fullWidth: true,
    tab: 'settings',
  },

  // ── Josh Personal — private personal dashboard, sage-themed ─────────
  {
    key: 'josh-personal-today',
    label: 'Josh Personal · Today',
    description: 'AI-assistant landing — Sage\'s morning brief, today\'s focus, calculated targets, snapshot KPIs.',
    component: JoshPersonalTodayModule,
    fullWidth: true,
    tab: 'today',
  },
  {
    key: 'josh-personal-plan',
    label: 'Josh Personal · Plan',
    description: 'Weekly meal + workout plan with Sage\'s Saturday-morning draft, swap rationale, and shopping list.',
    component: JoshPersonalPlanModule,
    fullWidth: true,
    tab: 'plan',
  },
  {
    key: 'josh-personal-trends',
    label: 'Josh Personal · Trends',
    description: 'Time-series across Apple Health: weight, sleep, HRV, steps (with 10k goal), active calories, weekly workout count.',
    component: JoshPersonalTrendsModule,
    fullWidth: true,
    tab: 'trends',
  },
  {
    key: 'josh-personal-bloodwork',
    label: 'Josh Personal · Bloodwork',
    description: 'Active concerns + full marker table with sparklines + Sage\'s panel-level read + upload UI for next draw.',
    component: JoshPersonalBloodworkModule,
    fullWidth: true,
    tab: 'bloodwork',
  },
  {
    key: 'josh-personal-goals',
    label: 'Josh Personal · Goals',
    description: 'Goal cards with progress bars + per-goal Sage narrative connecting the data to the goal.',
    component: JoshPersonalGoalsModule,
    fullWidth: true,
    tab: 'goals',
  },

  // ── Cornerstone Community Church (Option 3 role-led layout) ─────────
  {
    key: 'cornerstone-today',
    label: 'Cornerstone Today',
    description: 'Grace overview + chat + roles status grid + automation activity feed.',
    component: CornerstoneTodayModule,
    fullWidth: true,
    tab: 'today',
    badge: () => {
      const urgent = cornerstoneCareStats().urgent_cases
      return urgent > 0 ? { count: urgent, tone: 'danger' } : null
    },
  },
  {
    key: 'cornerstone-front-desk-guests',
    label: 'Cornerstone Front Desk & Guests',
    description: "Grace's first-touch roles — Front Desk, Guest Follow-Up, Story Engine.",
    component: CornerstoneFrontDeskGuestsModule,
    fullWidth: true,
    tab: 'front-desk-guests',
  },
  {
    key: 'cornerstone-care-drift',
    label: 'Cornerstone Care & Drift',
    description: "Grace's pastoral roles — Drift Detection, Re-engagement, Care Triage.",
    component: CornerstoneCareDriftModule,
    fullWidth: true,
    tab: 'care-drift',
    badge: () => {
      const atRisk = cornerstoneHouseholds.filter((h) => cornerstoneFlagCount(h) >= 2).length
      return atRisk > 0 ? { count: atRisk, tone: 'warn' } : null
    },
  },
  {
    key: 'cornerstone-sundays-comms',
    label: 'Cornerstone Sundays & Comms',
    description: "Grace's operational roles — Volunteer Coordination + Communications.",
    component: CornerstoneSundaysCommsModule,
    fullWidth: true,
    tab: 'sundays-comms',
  },
  {
    key: 'cornerstone-metrics',
    label: 'Cornerstone Insights',
    description: "Grace's reporting role — Sunday attendance trends, YoY compare, visitor flow, engagement breadth, giving trend.",
    component: CornerstoneMetricsModule,
    fullWidth: true,
    tab: 'insights',
  },
  {
    key: 'cornerstone-giving',
    label: 'Cornerstone Giving',
    description: 'Per-giver health, monthly trend, designated breakdown + stopped-giving households. Grace flags + reminders.',
    component: CornerstoneGivingModule,
    fullWidth: true,
    tab: 'giving',
    badge: () => {
      const priority = cornerstoneStoppedGiving.filter((h) => h.also_kids_flag || h.also_serving_flag).length
      return priority > 0 ? { count: priority, tone: 'warn' } : null
    },
  },
  {
    key: 'cornerstone-settings',
    label: 'Cornerstone Settings',
    description: 'Team + role gating, service times, integrations (Planning Center / Tithe.ly / Mailchimp / Twilio / etc.), privacy rules.',
    component: CornerstoneSettingsModule,
    fullWidth: true,
    tab: 'settings',
  },
]

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((m) => m.key === key)
}

// Aggregate badge counts for the tab nav. Sums counts across enabled
// modules under the tab; strongest tone wins.
export function badgesForTab(
  tabKey: string,
  enabledModuleKeys: Set<string>,
): TabBadge | null {
  const tonePriority: Record<NonNullable<TabBadge['tone']>, number> = {
    info: 0, warn: 1, danger: 2,
  }
  let total = 0
  let tone: TabBadge['tone'] | undefined
  for (const m of moduleRegistry) {
    if (!enabledModuleKeys.has(m.key) || m.tab !== tabKey || !m.badge) continue
    const b = m.badge()
    if (!b || b.count <= 0) continue
    total += b.count
    const t = b.tone ?? 'info'
    if (tone === undefined || tonePriority[t] > tonePriority[tone]) tone = t
  }
  if (total <= 0) return null
  return { count: total, tone }
}

// Helper: tabs (with optional subtabs) the given client's module set
// actually needs. A subtab is only included if at least one enabled
// module targets it.
export function visibleTabsFor(enabledModuleKeys: Set<string>): TabDefinition[] {
  // Map tab → set of subtab keys with at least one enabled module
  const tabSubtabsInUse = new Map<string, Set<string>>()
  for (const m of moduleRegistry) {
    if (!enabledModuleKeys.has(m.key) || !m.tab) continue
    if (!tabSubtabsInUse.has(m.tab)) tabSubtabsInUse.set(m.tab, new Set())
    if (m.subtab) tabSubtabsInUse.get(m.tab)!.add(m.subtab)
  }
  const out: TabDefinition[] = []
  for (const tab of dashboardTabs) {
    if (!tabSubtabsInUse.has(tab.key)) continue
    if (tab.subtabs) {
      const used = tabSubtabsInUse.get(tab.key)!
      const filteredSubtabs = tab.subtabs.filter((s) => used.has(s.key))
      out.push({ ...tab, subtabs: filteredSubtabs })
    } else {
      out.push(tab)
    }
  }
  return out
}
