// CommandSite · Google (Gmail) token access (per church)
// Mirror of pco-auth.ts. Loads the church's google_connections row, decrypts the
// access token, refreshes when expired. KEY DIFFERENCE FROM PCO: Google does NOT
// return a new refresh_token on refresh, so we preserve the stored one and update
// only the access token + expiry.
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, TOKEN_ENC_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { encryptToken, decryptToken } from './crypto.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

interface ConnectionRow {
  tenant_key: string
  connected_email: string
  access_token_enc: string
  refresh_token_enc: string
  expires_at: string
  scopes: string
  is_default: boolean
}

export class GoogleNotConnectedError extends Error {
  constructor(tenant: string) {
    super(`No Google connection for "${tenant}". Connect it from the dashboard first.`)
    this.name = 'GoogleNotConnectedError'
  }
}

export async function getGoogleAccessToken(tenant: string, email?: string): Promise<string> {
  const db = admin()
  let query = db
    .from('google_connections')
    .select('tenant_key, connected_email, access_token_enc, refresh_token_enc, expires_at, scopes, is_default')
    .eq('tenant_key', tenant)
  query = email ? query.eq('connected_email', email) : query.eq('is_default', true)
  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(`Failed to load Google connection: ${error.message}`)
  if (!data) throw new GoogleNotConnectedError(tenant)
  const row = data as ConnectionRow

  const expiresMs = new Date(row.expires_at).getTime()
  if (Date.now() < expiresMs - EXPIRY_BUFFER_MS) {
    return await decryptToken(row.access_token_enc)
  }
  return await refreshAndStore(db, row)
}

async function refreshAndStore(
  // deno-lint-ignore no-explicit-any
  db: any,
  row: ConnectionRow,
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET secrets are not set.')
  }

  const refreshToken = await decryptToken(row.refresh_token_enc)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Google token refresh failed (${res.status}) for "${row.tenant_key}": ${detail}`)
  }

  // Google returns a fresh access_token + expires_in but NO new refresh_token.
  // Preserve the stored refresh_token_enc; update only the access token + expiry.
  const t = (await res.json()) as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString()

  const { error } = await db
    .from('google_connections')
    .update({
      access_token_enc: await encryptToken(t.access_token),
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('tenant_key', row.tenant_key)
    .eq('connected_email', row.connected_email)

  if (error) throw new Error(`Failed to persist refreshed Google token: ${error.message}`)
  return t.access_token
}

// Authenticated fetch against a FULL Google API URL for a church (Phase 2's send
// function uses this against the Gmail API). Unlike pcoFetch, `url` is absolute.
export async function googleFetch(tenant: string, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGoogleAccessToken(tenant)
  return await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
}
