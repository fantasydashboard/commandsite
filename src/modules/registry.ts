import type { Component } from 'vue'
import MetricsModule from './MetricsModule.vue'
import CrmModule from './CrmModule.vue'
import ProjectsModule from './ProjectsModule.vue'
import SocialModule from './SocialModule.vue'

export interface ModuleDefinition {
  key: string
  label: string
  description: string
  component: Component
}

// Single source of truth for available modules.
// Add new modules here — the admin UI and client dashboard both read from this list.
export const moduleRegistry: ModuleDefinition[] = [
  {
    key: 'metrics',
    label: 'Metrics',
    description: 'KPIs, charts, and business health overview.',
    component: MetricsModule,
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Contacts, deals, and pipeline.',
    component: CrmModule,
  },
  {
    key: 'projects',
    label: 'Project Management',
    description: 'Tasks, milestones, and team workload.',
    component: ProjectsModule,
  },
  {
    key: 'social',
    label: 'Social Media',
    description: 'Post scheduling and engagement stats.',
    component: SocialModule,
  },
]

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((m) => m.key === key)
}
