import type { Component } from 'vue'
import MetricsModule from './MetricsModule.vue'
import CrmModule from './CrmModule.vue'
import ProjectsModule from './ProjectsModule.vue'
import SocialModule from './SocialModule.vue'
import UfdMetricsModule from './UfdMetricsModule.vue'
import UfdRevenueModule from './UfdRevenueModule.vue'
import UfdFunnelModule from './UfdFunnelModule.vue'
import UfdEmailModule from './UfdEmailModule.vue'
import AiSocialModule from './AiSocialModule.vue'

// Tabs are derived from this list at render time. The dashboard nav shows
// every unique tab that has at least one enabled module for the current
// client. Order here is the source of truth for nav ordering.
export const dashboardTabs: { key: string; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'email', label: 'Email' },
  { key: 'social', label: 'Social' },
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
    tab: 'social',
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
    key: 'ufd-email',
    label: 'UFD Email',
    description: 'Resend email metrics, deliverability rates, and per-campaign performance.',
    component: UfdEmailModule,
    fullWidth: true,
    tab: 'email',
  },
  {
    key: 'ai-social',
    label: 'AI Marketing',
    description: 'AI-driven multi-channel marketing: brand profile, strategist, social writer, email composer.',
    component: AiSocialModule,
    fullWidth: true,
    tab: 'social',
  },
]

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((m) => m.key === key)
}
