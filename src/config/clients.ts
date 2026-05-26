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
    { key: 'commandsite-conversations' },
    { key: 'commandsite-linkedin' },
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
  'focal-point-test': [
    // Focal Point (TEST) — pre-pitch test client modeled after
    // Cornerstone. Same Grace module set + fixture data — used to walk
    // through what Focal Point would experience before the real pitch.
    // Swap fixture data for live Planning Center reads once integration
    // is wired (cornerstone-settings has the Planning Center config form).
    { key: 'cornerstone-today' },
    { key: 'cornerstone-front-desk-guests' },
    { key: 'cornerstone-care-drift' },
    { key: 'cornerstone-sundays-comms' },
    { key: 'cornerstone-metrics' },
    { key: 'cornerstone-giving' },
    { key: 'cornerstone-settings' },
  ],
  'ultimate-fantasy-dashboard': [
    // Ultimate Fantasy Dashboard — Bones operates here. Was two parallel
    // slugs (this one + 'ufd-redesign') showing the same product with
    // different layouts; consolidated 2026-05-14 so admin only sees one
    // UFD dashboard. Redesign modules win because they're the newer
    // pattern matching Ada/Grace surfaces.
    { key: 'ufd-redesign-today' },
    { key: 'ufd-redesign-funnel' },
    { key: 'ufd-redesign-revenue' },
    { key: 'ufd-redesign-cards' },
    { key: 'ufd-redesign-email' },
    { key: 'ufd-redesign-social' },
    { key: 'ufd-redesign-users' },
    { key: 'ufd-redesign-settings' },
  ],
  'josh-personal': [
    // Josh Personal — private personal dashboard, sage-themed.
    // Sage is the personal AI coach (vs. Ada/Grace on the business
    // surfaces). 5 tabs covering the daily landing + the deeper
    // surfaces. Mock data lives in src/lib/clients/josh-personal/health.ts
    // and gets swapped for real Supabase reads once Phase 0+1 (Apple
    // Health webhook ingestion) lands.
    { key: 'josh-personal-today' },
    { key: 'josh-personal-plan' },
    { key: 'josh-personal-trends' },
    { key: 'josh-personal-history' },
    { key: 'josh-personal-bloodwork' },
  ],
}

export function modulesForClient(slug: string): ClientModuleConfig[] {
  return clientModuleConfigs[slug] ?? []
}
