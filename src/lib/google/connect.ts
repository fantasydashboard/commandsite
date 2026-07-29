// Frontend helper for the per-church Google OAuth connection.
// The dashboard never touches tokens: it reads only NON-sensitive status
// columns (never the *_enc token columns), kicks off the consent flow via the
// admin-gated google-oauth-start edge function, and can disconnect (admin/RLS).
import { supabase } from '@/lib/supabase'

export interface GoogleConnectionStatus {
  tenant_key: string
  display_label: string
  org_name: string | null
  connected_by: string | null
  connected_email: string
  connected_at: string
  expires_at: string
  scopes: string
  last_refreshed_at: string | null
  is_default: boolean
}

// Only status columns. The encrypted access/refresh tokens are deliberately
// NOT selected, so they never reach the browser even for an admin.
const SAFE_COLUMNS =
  'tenant_key,display_label,org_name,connected_by,connected_email,connected_at,expires_at,scopes,last_refreshed_at,is_default'

// google_connections isn't in the generated Database types; cast narrowly (matches
// the codebase's existing Supabase generic-typing tolerance).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function getGoogleConnections(tenant: string): Promise<GoogleConnectionStatus[]> {
  const { data, error } = await sb
    .from('google_connections')
    .select(SAFE_COLUMNS)
    .eq('tenant_key', tenant)
    .order('is_default', { ascending: false })
    .order('connected_at', { ascending: true })
  // RLS returns nothing for non-admins (or when unconnected), both read as
  // "no connections visible here," which is the correct, safe default.
  if (error) return []
  return (data as GoogleConnectionStatus[] | null) ?? []
}

export async function startGoogleConnect(
  tenant: string,
  displayLabel: string,
): Promise<{ auth_url: string }> {
  const { data, error } = await supabase.functions.invoke('google-oauth-start', {
    body: { tenant, display_label: displayLabel },
  })
  if (error) throw new Error(error.message ?? 'Could not start the Google connection.')
  const res = data as { auth_url?: string; error?: string }
  if (res?.error) throw new Error(res.error)
  if (!res?.auth_url) throw new Error('Google did not return a consent URL.')
  return { auth_url: res.auth_url }
}

export async function disconnectGoogle(tenant: string, email: string): Promise<void> {
  const { error } = await sb
    .from('google_connections')
    .delete()
    .eq('tenant_key', tenant)
    .eq('connected_email', email)
  if (error) throw new Error(error.message ?? 'Could not disconnect Google.')
}
