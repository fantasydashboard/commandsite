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
import AiSocialModule from './AiSocialModule.vue'
import SocialDistributionModule from './SocialDistributionModule.vue'
import SocialListeningModule from './SocialListeningModule.vue'

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
export const dashboardTabs: TabDefinition[] = [
  { key: 'metrics', label: 'Metrics' },
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
]

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
    key: 'ai-social',
    label: 'AI Marketing',
    description: 'AI-driven multi-channel marketing: brand profile, strategist, social writer, email composer.',
    component: AiSocialModule,
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
]

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((m) => m.key === key)
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
