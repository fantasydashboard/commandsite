// Per-user access model. Two axes, exactly as the pilot needs them:
//   - congregations: which congregation(s) a user may see ('all' or a subset)
//   - tabs: which pages a user may open ('all' or a subset)
// Users are assigned a ROLE PRESET (below); per-user overrides are possible but
// rare. This is the client-#2 foundation too: it generalizes to any church.
//
// IMPORTANT: this shapes the UI (nav, lens lock, Today). It is NOT the security
// boundary. Real enforcement is Supabase RLS on the data layer (a later step);
// hiding a tab here is convenience, not access control.
export type Campus = 'english' | 'brazilian'
export type TabKey = 'today' | 'front-desk-guests' | 'care-drift' | 'sundays-comms' | 'insights' | 'settings'
export type RoleKey = 'admin' | 'pastor' | 'connections' | 'brazilian-leader' | 'comms'

export interface Permissions {
  role: RoleKey
  congregations: 'all' | Campus[] // which congregations this user may see
  tabs: 'all' | TabKey[] // which pages this user may open
}

// Role presets. Assign a person a role; the scope comes from here. Keep these the
// source of truth so access stays manageable as staff grow.
export const ROLE_PRESETS: Record<RoleKey, { label: string; blurb: string } & Omit<Permissions, 'role'>> = {
  admin: {
    label: 'Admin',
    blurb: 'Everything, every congregation. Can manage users.',
    congregations: 'all',
    tabs: 'all',
  },
  pastor: {
    label: 'Pastor',
    blurb: 'Everything, every congregation.',
    congregations: 'all',
    tabs: 'all',
  },
  connections: {
    label: 'Connections',
    blurb: 'Front door and care: guests and drift.',
    congregations: 'all',
    tabs: ['today', 'front-desk-guests', 'care-drift'],
  },
  'brazilian-leader': {
    label: 'Brazilian leader',
    blurb: 'Every page, but the Brazilian congregation only.',
    congregations: ['brazilian'],
    tabs: 'all',
  },
  comms: {
    label: 'Comms',
    blurb: 'Serving schedule and the numbers.',
    congregations: 'all',
    tabs: ['today', 'sundays-comms', 'insights'],
  },
}

const ALL_TABS: TabKey[] = ['today', 'front-desk-guests', 'care-drift', 'sundays-comms', 'insights', 'settings']
const ALL_CAMPUSES: Campus[] = ['english', 'brazilian']

// Build a Permissions object from a role (with optional per-user override).
export function permissionsFor(role: RoleKey, override?: Partial<Omit<Permissions, 'role'>>): Permissions {
  const preset = ROLE_PRESETS[role]
  return { role, congregations: preset.congregations, tabs: preset.tabs, ...override }
}

export function isAdmin(p: Permissions): boolean {
  return p.role === 'admin'
}

export function canSeeTab(p: Permissions, tab: TabKey): boolean {
  return p.tabs === 'all' || p.tabs.includes(tab)
}

export function allowedTabs(p: Permissions): TabKey[] {
  return p.tabs === 'all' ? ALL_TABS : p.tabs
}

// The congregations a user may view, resolved to a concrete list.
export function allowedCongregations(p: Permissions): Campus[] {
  return p.congregations === 'all' ? ALL_CAMPUSES : p.congregations
}

// True when the user is confined to a single congregation, so the lens should
// lock to it instead of offering the All / English / Brazilian toggle.
export function lensLocked(p: Permissions): boolean {
  return p.congregations !== 'all' && p.congregations.length === 1
}

// What the congregation lens should be pinned to. 'all' when the user may see
// everything; otherwise the single congregation they are scoped to.
export function lockedScope(p: Permissions): 'all' | Campus {
  return lensLocked(p) ? (p.congregations as Campus[])[0] : 'all'
}
