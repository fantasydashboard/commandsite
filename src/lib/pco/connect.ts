// Frontend helper for the per-church Planning Center OAuth connection.
// The dashboard never touches tokens: it reads only NON-sensitive status
// columns (never the *_enc token columns), kicks off the consent flow via the
// admin-gated pco-oauth-start edge function, and can disconnect (admin/RLS).
import { supabase } from '@/lib/supabase'

export interface PcoConnectionStatus {
  tenant_key: string
  display_label: string
  org_name: string | null
  connected_by: string | null
  connected_email: string | null
  connected_at: string
  expires_at: string
  scopes: string
  last_refreshed_at: string | null
}

// Only status columns — the encrypted access/refresh tokens are deliberately
// NOT selected, so they never reach the browser even for an admin.
const SAFE_COLUMNS =
  'tenant_key,display_label,org_name,connected_by,connected_email,connected_at,expires_at,scopes,last_refreshed_at'

// pco_connections isn't in the generated Database types; cast narrowly (matches
// the codebase's existing Supabase generic-typing tolerance).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function getPcoConnection(tenant: string): Promise<PcoConnectionStatus | null> {
  const { data, error } = await sb
    .from('pco_connections')
    .select(SAFE_COLUMNS)
    .eq('tenant_key', tenant)
    .maybeSingle()
  // RLS returns nothing for non-admins (or when unconnected) — both read as
  // "no connection visible here," which is the correct, safe default.
  if (error) return null
  return (data as PcoConnectionStatus | null) ?? null
}

export async function startPcoConnect(
  tenant: string,
  displayLabel: string,
): Promise<{ auth_url: string }> {
  const { data, error } = await supabase.functions.invoke('pco-oauth-start', {
    body: { tenant, display_label: displayLabel },
  })
  if (error) throw new Error(error.message ?? 'Could not start the Planning Center connection.')
  const res = data as { auth_url?: string; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.auth_url) throw new Error('Planning Center did not return a consent URL.')
  return { auth_url: res.auth_url }
}

export async function disconnectPco(tenant: string): Promise<void> {
  const { error } = await sb.from('pco_connections').delete().eq('tenant_key', tenant)
  if (error) throw new Error(error.message ?? 'Could not disconnect Planning Center.')
}
