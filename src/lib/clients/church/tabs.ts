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

/**
 * Church module key -> the tab it provides. Mirrors the `tab` field on the
 * church entries in modules/registry.ts, duplicated here ONLY because this file
 * must stay import-free: the registry reaches TeamSettings, so importing it
 * would rebuild the cycle described above.
 *
 * Exists so the team picker can offer a church the pages it actually has.
 * Focal Point has no giving module (deliberately omitted until aggregate-only
 * giving is approved), but Giving was still tickable: it saved, produced no
 * tab, and gave no feedback, which reads as broken.
 */
export const CHURCH_MODULE_TAB: Record<string, string> = {
  'cornerstone-today': 'today',
  'cornerstone-front-desk-guests': 'front-desk-guests',
  'cornerstone-care-drift': 'care-drift',
  'cornerstone-sundays-comms': 'sundays-comms',
  'cornerstone-metrics': 'insights',
  'cornerstone-giving': 'giving',
  'cornerstone-settings': 'settings',
}

/** The assignable pages a given church actually has modules for. */
export function assignableTabsFor(enabledModuleKeys: Iterable<string>): { key: string; label: string }[] {
  const have = new Set<string>()
  for (const k of enabledModuleKeys) {
    const tab = CHURCH_MODULE_TAB[k]
    if (tab) have.add(tab)
  }
  return ASSIGNABLE_TABS.filter((t) => have.has(t.key))
}

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
