// UI-level access gating for church client users: which dashboard tabs a user's
// permission scope may see. This filters the module list so a scoped staffer only
// gets their tabs (and, via that, the sensitive categories those tabs contain).
// Admins and public demos bypass entirely. This is UI-level gating, not RLS; hard
// enforcement arrives with the server-data phase.
import { modulesForClient, type ClientModuleConfig } from '@/config/clients'
import { moduleRegistry } from '@/modules/registry'

// Church permission scope -> tabs it may see. (Settings is church-admin only.)
export const SCOPE_TABS: Record<string, string[]> = {
  full: ['today', 'front-desk-guests', 'care-drift', 'sundays-comms', 'insights', 'giving', 'settings'],
  finance: ['today', 'insights', 'giving'],
  pastoral_care: ['today', 'front-desk-guests', 'care-drift'],
  comms_only: ['today', 'sundays-comms'],
  volunteers: ['today', 'sundays-comms'],
  member: ['today'],
}

const MODULE_TAB = new Map(moduleRegistry.map((m) => [m.key, m.tab]))

// The modules a viewer may see. Client users are gated to the tabs their scope
// allows; admins and non-client viewers (public demos, unauthenticated) see all.
// Modules with no tab (legacy home view) always show.
export function modulesForUser(
  slug: string,
  ctx: { role?: string | null; permissionScope?: string | null },
): ClientModuleConfig[] {
  const all = modulesForClient(slug)
  if (ctx.role !== 'client') return all
  const allowed = SCOPE_TABS[ctx.permissionScope ?? 'member'] ?? SCOPE_TABS.member
  return all.filter((m) => {
    const tab = MODULE_TAB.get(m.key)
    return !tab || allowed.includes(tab)
  })
}
