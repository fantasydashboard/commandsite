// Real church team management. All admin ops go through the church-user-admin
// edge function (a church user can only read their own users row under RLS).
// Password reset uses Supabase's public reset flow directly.
import { supabase } from '@/lib/supabase'

export interface ChurchTeamMember {
  id: string
  email: string
  full_name: string | null
  permission_scope: string | null
  congregation_scope: string | null
  /** Explicit page access. Null falls back to the permission_scope bundle. */
  allowed_tabs: string[] | null
  created_at: string
}

// Focal Point runs an English and a Brazilian ministry. (Per-church congregation
// config is a later generalization; this is the one live church today.)
export const CONGREGATIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All congregations' },
  { key: 'english', label: 'English' },
  { key: 'brazilian', label: 'Brazilian' },
]

export function congregationLabel(c: string | null): string {
  return CONGREGATIONS.find((x) => x.key === c)?.label ?? 'All congregations'
}

export const PERMISSION_SCOPES: { key: string; label: string }[] = [
  { key: 'full', label: 'Full access (church admin)' },
  { key: 'pastoral_care', label: 'Pastoral care' },
  { key: 'finance', label: 'Finance' },
  { key: 'volunteers', label: 'Volunteers' },
  { key: 'comms_only', label: 'Comms only' },
  { key: 'member', label: 'Member' },
]

export function scopeLabel(scope: string | null): string {
  return PERMISSION_SCOPES.find((s) => s.key === scope)?.label ?? 'Member'
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('church-user-admin', { body })
  if (error) throw new Error(error.message ?? 'Request failed')
  const res = data as { error?: string } & T
  if (res?.error) throw new Error(res.error)
  return res
}

export async function listTeam(tenant: string): Promise<ChurchTeamMember[]> {
  const res = await invoke<{ members: ChurchTeamMember[] }>({ action: 'list', tenant })
  return res.members ?? []
}

/**
 * A readable starting password: two short words plus digits. Easy to read down
 * a phone or paste into a welcome email, and it does not expire the way a
 * recovery link does. Not meant to be kept; the member changes it on first
 * login. Uses crypto.getRandomValues rather than Math.random because this is a
 * real credential, however short-lived.
 */
const WORDS = ['harbor', 'lantern', 'meadow', 'anchor', 'copper', 'willow', 'pilot', 'summit', 'cedar', 'orbit', 'ridge', 'ember']
export function tempPassword(): string {
  const r = new Uint32Array(3)
  crypto.getRandomValues(r)
  const a = WORDS[r[0] % WORDS.length]
  const b = WORDS[r[1] % WORDS.length]
  const n = 100 + (r[2] % 900)
  return `${a}-${b}-${n}`
}

/**
 * Creates the church login and returns the starting password so the admin can
 * pass it on.
 *
 * Previously this created the account with no password and relied entirely on a
 * recovery email. That is fine for one person sitting next to you and bad for
 * provisioning a staff team: recovery links expire quickly and land in church
 * spam filters, so by the time someone acted the link was usually dead. Setting
 * a starting credential removes the race. The reset email still goes out as a
 * second path in, so either route works.
 */
export async function inviteMember(tenant: string, email: string, name: string, scope: string, congregation: string): Promise<string> {
  const password = tempPassword()
  await invoke({ action: 'invite', tenant, email, name, scope, congregation, password })
  // Best effort. The account already works with the password above, so a
  // delivery failure here must never look like a failed invite.
  try { await sendReset(email) } catch { /* password path still valid */ }
  return password
}

/** Sets which pages a member may see. An empty list clears back to the scope
 *  bundle rather than leaving someone with no pages at all. */
export async function setTabs(tenant: string, userId: string, tabs: string[]): Promise<void> {
  await invoke({ action: 'set-tabs', tenant, user_id: userId, tabs })
}

/** Removes a member's access and login. Cannot remove yourself or a CommandSite
 *  admin; the edge function enforces both. */
export async function removeMember(tenant: string, userId: string): Promise<{ warning?: string }> {
  return await invoke<{ warning?: string }>({ action: 'remove', tenant, user_id: userId })
}

export async function setScope(tenant: string, userId: string, scope: string): Promise<void> {
  await invoke({ action: 'set-scope', tenant, user_id: userId, scope })
}

export async function setCongregation(tenant: string, userId: string, congregation: string): Promise<void> {
  await invoke({ action: 'set-congregation', tenant, user_id: userId, congregation })
}

// Emails a set-password / reset link to the member via the configured SMTP.
export async function sendReset(email: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io'
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/set-password` })
  if (error) throw new Error(error.message)
}
