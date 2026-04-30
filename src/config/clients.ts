// Per-client dashboard configuration.
// ---------------------------------------------------------------------------
// Single source of truth for which modules appear on each client's dashboard.
// Edit this file to add/remove modules for a client — no DB toggles, no
// redeploy of anything besides the frontend.
//
// `modules` entries must match keys registered in `src/modules/registry.ts`.
// `config` is optional per-module arbitrary data passed to the component.

export type ClientModuleConfig = {
  key: string
  config?: Record<string, unknown>
}

export type ClientSlug = string

export const clientModuleConfigs: Record<ClientSlug, ClientModuleConfig[]> = {
  'ultimate-fantasy-dashboard': [
    { key: 'ufd-metrics' },
    { key: 'ufd-revenue' },
    { key: 'ufd-funnel' },
    { key: 'ufd-shares' },
    { key: 'ufd-email' },
    { key: 'ai-social' },
    { key: 'social-distribution' },
    { key: 'social-listening' },
  ],
}

export function modulesForClient(slug: string): ClientModuleConfig[] {
  return clientModuleConfigs[slug] ?? []
}
