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
  'apex-heating-and-air': [
    // Apex Heating & Air — Option 3 role-led layout for Ada.
    // Same 7-tab structure as Cornerstone's Grace setup.
    { key: 'apex-overview' },
    { key: 'apex-front-desk-quotes' },
    { key: 'apex-customer-care' },
    { key: 'apex-schedule' },
    { key: 'apex-reputation-marketing' },
    { key: 'apex-metrics' },
    { key: 'apex-settings' },
  ],
  'commandsite': [
    // CommandSite-as-a-business — solo-founder mode.
    // Premature tabs hidden until milestone reached (see comments below).
    { key: 'commandsite-today' },
    { key: 'commandsite-leads' },
    { key: 'commandsite-outreach' },
    { key: 'commandsite-pipeline' },
    { key: 'commandsite-customers' },
    { key: 'commandsite-revenue' },
    { key: 'commandsite-social' },
    { key: 'commandsite-settings' },
    // Hidden until customer #10:
    // { key: 'commandsite-reputation' },   // NPS sample size + G2/Capterra reviews matter at scale
    // Hidden until customer #15:
    // { key: 'commandsite-usage' },        // cross-sell flags need a real customer base
    // Hidden until customer #20:
    // { key: 'commandsite-support' },      // ticket dashboard adds value when ticket volume > Slack DMs
  ],
  'commandsite-demo': [
    // Frozen reference snapshot — same modules as `commandsite` were on
    // the day we started wiring real data. Compare against the live
    // version anytime to spot regressions or design drift.
    { key: 'commandsite-today' },
    { key: 'commandsite-outreach' },
    { key: 'commandsite-pipeline' },
    { key: 'commandsite-customers' },
    { key: 'commandsite-revenue' },
    { key: 'commandsite-social' },
    { key: 'commandsite-settings' },
  ],
  'cornerstone-church': [
    // Cornerstone Community Church — Option 3 role-led layout.
    // Each tab corresponds to one or more of Grace's 10 AI ministry-
    // assistant roles. Roles status grid lives on Today.
    { key: 'cornerstone-today' },
    { key: 'cornerstone-front-desk-guests' },
    { key: 'cornerstone-care-drift' },
    { key: 'cornerstone-sundays-comms' },
    { key: 'cornerstone-metrics' },
    { key: 'cornerstone-giving' },
    { key: 'cornerstone-settings' },
  ],
  'ufd-redesign': [
    // Ultimate Fantasy Dashboard — fresh design exploration following the
    // Apex/CommandSite pattern. Full mock buildout across 6 phases.
    { key: 'ufd-redesign-today' },
    { key: 'ufd-redesign-funnel' },
    { key: 'ufd-redesign-revenue' },
    { key: 'ufd-redesign-cards' },
    { key: 'ufd-redesign-email' },
    { key: 'ufd-redesign-social' },
    { key: 'ufd-redesign-users' },
    { key: 'ufd-redesign-settings' },
  ],
  'ultimate-fantasy-dashboard': [
    { key: 'ufd-metrics' },
    { key: 'ufd-revenue' },
    { key: 'ufd-funnel' },
    { key: 'ufd-shares' },
    { key: 'ufd-email' },
    { key: 'ufd-email-pipeline' },
    { key: 'ai-social' },
    { key: 'social-planner' },
    { key: 'social-distribution' },
    { key: 'social-listening' },
  ],
}

export function modulesForClient(slug: string): ClientModuleConfig[] {
  return clientModuleConfigs[slug] ?? []
}
