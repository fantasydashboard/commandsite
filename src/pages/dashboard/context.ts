import { inject, type InjectionKey, type Ref } from 'vue'
import type { Client } from '@/types/database'

// Shared state provided by DashboardLayout and consumed by any page
// rendered inside /dashboard/:slug/*. Keeps us from refetching the client
// and enabled-modules list on every sub-route.
export type DashboardContext = {
  client: Ref<Client | null>
  enabledModuleKeys: Ref<Set<string>>
  loading: Ref<boolean>
  error: Ref<string | null>
}

export const DashboardContextKey: InjectionKey<DashboardContext> =
  Symbol('DashboardContext')

export function useDashboardContext(): DashboardContext {
  const ctx = inject(DashboardContextKey)
  if (!ctx) {
    throw new Error('useDashboardContext must be used inside DashboardLayout')
  }
  return ctx
}
