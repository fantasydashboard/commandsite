// Dashboard tab constants.
//
// A LEAF MODULE ON PURPOSE: no imports, so anything can reference it without
// pulling in the module registry.
//
// These lived in access.ts, which imports @/modules/registry. TeamSettings is
// reachable FROM the registry (registry -> CornerstoneSettingsModule ->
// TeamSettings), so importing them from access.ts created a cycle:
// access -> registry -> settings module -> TeamSettings -> access. access.ts
// builds its module/tab map at module scope, so on the wrong initialisation
// order `moduleRegistry` was undefined, that line threw, and every dashboard
// page failed to load.
//
// Same class of bug as the one carePipeline.ts documents. Keeping shared
// constants in a leaf makes it structurally impossible to repeat.

/**
 * Tabs every church user gets regardless of assignment. Today is a personal
 * view: it shows only the actions routed to you, so there is nothing to gate.
 */
export const ALWAYS_TABS = ['today']

/**
 * Selectable pages, in nav order. Settings is deliberately absent: it is
 * governed by permission_scope 'full' (which also controls settings WRITES at
 * the RLS level), not by a per-page tick, so it cannot be granted to someone
 * who is not trusted with the church's configuration.
 */
export const ASSIGNABLE_TABS: { key: string; label: string }[] = [
  { key: 'front-desk-guests', label: 'Front Desk & Guests' },
  { key: 'care-drift', label: 'Care & Drift' },
  { key: 'sundays-comms', label: 'Serving' },
  { key: 'insights', label: 'Insights' },
  { key: 'giving', label: 'Giving' },
]
