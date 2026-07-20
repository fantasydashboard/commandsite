// CommandSite · Planning Center token access (per church)
// ---------------------------------------------------------------------------
// The read side of the OAuth store. Any edge function that pulls PCO data for a
// church calls getPcoAccessToken(tenant) or pcoFetch(tenant, path) instead of
// carrying a PAT. This helper:
//   • loads the church's pco_connections row (service role),
//   • decrypts the access token,
//   • refreshes it when expired — handling PCO's refresh-token ROTATION (each
//     refresh returns a brand-new refresh_token; the old one is now invalid),
//   • re-encrypts and persists the rotated tokens.
//
// PCO access tokens live ~2h; refresh tokens expire after ~90 days of non-use.
// Refreshing on demand (with a safety buffer) keeps a church connected
// indefinitely as long as pulls run within that window.
//
// Secrets: PCO_OAUTH_CLIENT_ID, PCO_OAUTH_CLIENT_SECRET, TOKEN_ENC_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { encryptToken, decryptToken } from './crypto.ts'

const PCO = 'https://api.planningcenteronline.com'
// Refresh a bit early so a token doesn't expire mid-pull.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

interface ConnectionRow {
  tenant_key: string
  access_token_enc: string
  refresh_token_enc: string
  expires_at: string
  scopes: string
}

export class PcoNotConnectedError extends Error {
  constructor(tenant: string) {
    super(`No Planning Center connection for "${tenant}". Connect it from the dashboard first.`)
    this.name = 'PcoNotConnectedError'
  }
}

// Returns a valid (fresh if needed) access token for a church, rotating stored
// tokens transparently.
export async function getPcoAccessToken(tenant: string): Promise<string> {
  const db = admin()
  const { data, error } = await db
    .from('pco_connections')
    .select('tenant_key, access_token_enc, refresh_token_enc, expires_at, scopes')
    .eq('tenant_key', tenant)
    .maybeSingle()

  if (error) throw new Error(`Failed to load PCO connection: ${error.message}`)
  if (!data) throw new PcoNotConnectedError(tenant)
  const row = data as ConnectionRow

  const expiresMs = new Date(row.expires_at).getTime()
  if (Date.now() < expiresMs - EXPIRY_BUFFER_MS) {
    // Still valid — decrypt and use.
    return await decryptToken(row.access_token_enc)
  }

  // Expired (or about to): refresh with the stored refresh token.
  return await refreshAndStore(db, row)
}

async function refreshAndStore(
  // deno-lint-ignore no-explicit-any
  db: any,
  row: ConnectionRow,
): Promise<string> {
  const clientId = Deno.env.get('PCO_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('PCO_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('PCO_OAUTH_CLIENT_ID / PCO_OAUTH_CLIENT_SECRET secrets are not set.')
  }

  const refreshToken = await decryptToken(row.refresh_token_enc)
  const res = await fetch(`${PCO}/oauth/token`, {
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
    // A hard 400/401 here usually means the refresh token was revoked or
    // expired past its window — the church must reconnect.
    throw new Error(`PCO token refresh failed (${res.status}) for "${row.tenant_key}": ${detail}`)
  }

  const t = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    created_at?: number
  }

  const baseMs = t.created_at ? t.created_at * 1000 : Date.now()
  const expiresAt = new Date(baseMs + t.expires_in * 1000).toISOString()

  // Persist the ROTATED pair. PCO invalidates the old refresh token, so if we
  // fail to store the new one the church would be locked out — write both.
  const { error } = await db
    .from('pco_connections')
    .update({
      access_token_enc: await encryptToken(t.access_token),
      refresh_token_enc: await encryptToken(t.refresh_token),
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('tenant_key', row.tenant_key)

  if (error) throw new Error(`Failed to persist refreshed PCO tokens: ${error.message}`)

  return t.access_token
}

// Convenience wrapper: authenticated PCO API fetch for a church. `path` is a
// PCO API path like "/people/v2/me" or "/check-ins/v2/check_ins?per_page=10".
export async function pcoFetch(tenant: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getPcoAccessToken(tenant)
  const fullPath = path.startsWith('/') ? path : `/${path}`
  return await fetch(`${PCO}${fullPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}
