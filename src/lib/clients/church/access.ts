// UI-level access gating for church client users: which dashboard tabs a user's
// permission scope may see. This filters the module list so a scoped staffer only
// gets their tabs (and, via that, the sensitive categories those tabs contain).
// Admins and public demos bypass entirely. This is UI-level gating, not RLS; hard
// enforcement arrives with the server-data phase.
import { modulesForClient, type ClientModuleConfig } from '@/config/clients'
import { moduleRegistry } from '@/modules/registry'
import { tabsFor } from './tabs'

// Re-exported so existing importers are unchanged. The definitions live in the
// leaf (./tabs) because components inside the module registry need tabsFor, and
// importing it from here would make them depend on the registry through this
// file. See the header of tabs.ts.
export { ALWAYS_TABS, ASSIGNABLE_TABS, SCOPE_TABS, tabsFor } from './tabs'

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
