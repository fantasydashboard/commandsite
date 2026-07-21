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

// Returns a set-password link to share with the new member (email delivery is
// decoupled; wire SMTP later to also send it automatically).
export async function inviteMember(tenant: string, email: string, name: string, scope: string, congregation: string): Promise<string | null> {
  const res = await invoke<{ invite_link?: string | null }>({ action: 'invite', tenant, email, name, scope, congregation })
  return res.invite_link ?? null
}

export async function setScope(tenant: string, userId: string, scope: string): Promise<void> {
  await invoke({ action: 'set-scope', tenant, user_id: userId, scope })
}

export async function setCongregation(tenant: string, userId: string, congregation: string): Promise<void> {
  await invoke({ action: 'set-congregation', tenant, user_id: userId, congregation })
}

export async function sendReset(email: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io'
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/set-password` })
  if (error) throw new Error(error.message)
}
