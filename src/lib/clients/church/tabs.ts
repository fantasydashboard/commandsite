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

// Church permission scope -> tabs it may see. Retained as the FALLBACK for users
// with no explicit page list, so existing accounts keep exactly what they had.
// (Settings is church-admin only.)
export const SCOPE_TABS: Record<string, string[]> = {
  full: ['today', 'front-desk-guests', 'care-drift', 'sundays-comms', 'insights', 'giving', 'settings'],
  finance: ['today', 'insights', 'giving'],
  pastoral_care: ['today', 'front-desk-guests', 'care-drift'],
  comms_only: ['today', 'sundays-comms'],
  volunteers: ['today', 'sundays-comms'],
  member: ['today'],
}

/**
 * The tabs a user may see: their explicit page list when set, otherwise the
 * scope bundle. Always includes Today, and full scope always includes Settings,
 * so an admin can never lock themselves out of the screen that grants access.
 *
 * Lives HERE, not in access.ts, because Today reads it to decide which sections
 * to build. access.ts imports the module registry, and Today is reachable FROM
 * that registry, so importing it from there would rebuild the exact cycle the
 * header of this file describes. This function needs nothing from the registry,
 * so the leaf is where it belongs.
 */
export function tabsFor(ctx: { permissionScope?: string | null; allowedTabs?: string[] | null }): string[] {
  const explicit = ctx.allowedTabs
  if (explicit && explicit.length) {
    const out = [...new Set([...ALWAYS_TABS, ...explicit])]
    if (ctx.permissionScope === 'full') out.push('settings')
    return out
  }
  return SCOPE_TABS[ctx.permissionScope ?? 'member'] ?? SCOPE_TABS.member
}
