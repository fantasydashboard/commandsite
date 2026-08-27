// UI-level access gating for church client users: which dashboard tabs a user's
// permission scope may see. This filters the module list so a scoped staffer only
// gets their tabs (and, via that, the sensitive categories those tabs contain).
// Admins and public demos bypass entirely. This is UI-level gating, not RLS; hard
// enforcement arrives with the server-data phase.
import { modulesForClient, type ClientModuleConfig } from '@/config/clients'
import { moduleRegistry } from '@/modules/registry'
import { ALWAYS_TABS } from './tabs'

export { ALWAYS_TABS, ASSIGNABLE_TABS } from './tabs'

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

// Built on first use, never at module scope. `moduleRegistry` is undefined
// during a circular initialisation, and evaluating this eagerly turned that into
// a thrown TypeError that failed the whole dashboard chunk rather than a
// recoverable miss.
let _moduleTab: Map<string, string | undefined> | null = null
function moduleTab(): Map<string, string | undefined> {
  if (!_moduleTab) _moduleTab = new Map(moduleRegistry.map((m) => [m.key, m.tab]))
  return _moduleTab
}

// The modules a viewer may see. Client users are gated to the tabs their scope
// allows; admins and non-client viewers (public demos, unauthenticated) see all.
// Modules with no tab (legacy home view) always show.
/** The tabs a user may see: their explicit page list when set, otherwise the
 *  scope bundle. Always includes Today, and full scope always includes Settings,
 *  so an admin can never lock themselves out of the screen that grants access. */
export function tabsFor(ctx: { permissionScope?: string | null; allowedTabs?: string[] | null }): string[] {
  const explicit = ctx.allowedTabs
  if (explicit && explicit.length) {
    const out = [...new Set([...ALWAYS_TABS, ...explicit])]
    if (ctx.permissionScope === 'full') out.push('settings')
    return out
  }
  return SCOPE_TABS[ctx.permissionScope ?? 'member'] ?? SCOPE_TABS.member
}

export function modulesForUser(
  slug: string,
  ctx: { role?: string | null; permissionScope?: string | null; allowedTabs?: string[] | null },
): ClientModuleConfig[] {
  const all = modulesForClient(slug)
  if (ctx.role !== 'client') return all
  const allowed = tabsFor(ctx)
  return all.filter((m) => {
    const tab = moduleTab().get(m.key)
    return !tab || allowed.includes(tab)
  })
}
