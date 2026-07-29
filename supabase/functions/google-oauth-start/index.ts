// CommandSite google-oauth-start Edge Function
// ---------------------------------------------------------------------------
// Returns the Google consent URL a church should hit to authorize
// CommandSite. This is the multi-tenant replacement for a Personal Access
// Token: the church approves on Google's own screen, and CommandSite receives a
// token scoped to THAT church at THAT staffer's permission level. Josh never
// needs admin on their Google account.
//
// Auth:    Bearer user JWT. Admins may connect any tenant; a client user may
//          connect only their own church's tenant. Service role bypasses.
// Body:    { tenant: string (church slug), display_label?: string, scopes?: string }
// Returns: { auth_url, redirect_uri, scope, tenant }
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Register the OAuth app once in the Google Cloud Console:
//   https://console.cloud.google.com/apis/credentials
// with redirect URI = <SUPABASE_URL>/functions/v1/google-oauth-callback

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`

// Minimum scopes for the pilot: identity (openid, email) plus send-only Gmail
// access. We deliberately do NOT request broader Gmail/Drive scopes until
// those integrations are actually built, so they never sit in our token
// store before we need them.
const DEFAULT_SCOPE = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/gmail.send'].join(' ')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (!CLIENT_ID) {
    return json({ error: 'GOOGLE_OAUTH_CLIENT_ID secret not set in Supabase Edge Functions.' }, 500)
  }

  // Tenant = the church's dashboard slug. Parsed before auth because the auth
  // check depends on it: a church-scoped user may connect ONLY their own tenant.
  let body: { tenant?: string; display_label?: string; scopes?: string } = {}
  try { body = await req.json() } catch { /* GET or no body */ }
  const tenant = (body.tenant ?? '').trim()
  if (!tenant || !/^[a-z0-9][a-z0-9_-]*$/.test(tenant)) {
    return json({ error: 'A valid tenant (church slug) is required, e.g. "focal-point-church".' }, 400)
  }

  // ── Auth: who may start a connect for THIS tenant?
  //   • service role (server-side callers) → always
  //   • admin users → any tenant (white-glove onboarding)
  //   • client users → only the tenant matching their OWN client's slug
  // That last rule is the self-serve gate: a church admin connects their own
  // Google account from their dashboard, but can never target another church.
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ error: 'Missing Authorization header' }, 401)
    // Identify the caller with their own JWT...
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)

    // ...but resolve role + tenant ownership with the service role, so the
    // decision never depends on the caller's own RLS visibility.
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile } = await svc
      .from('users')
      .select('role, client_id')
      .eq('id', userData.user.id)
      .maybeSingle()
    const role = (profile as { role?: string } | null)?.role
    const clientId = (profile as { client_id?: string } | null)?.client_id

    if (role !== 'admin') {
      if (role !== 'client' || !clientId) {
        return json({ error: 'You do not have access to connect Google.' }, 403)
      }
      const { data: ownClient } = await svc
        .from('clients')
        .select('slug')
        .eq('id', clientId)
        .maybeSingle()
      const ownSlug = (ownClient as { slug?: string } | null)?.slug
      if (!ownSlug || ownSlug !== tenant) {
        return json({ error: 'You can only connect Google for your own church.' }, 403)
      }
    }
  }
  const displayLabel = body.display_label ?? tenant
  const scope = (body.scopes ?? DEFAULT_SCOPE).trim()

  // Pack tenant + a random nonce into OAuth state. The nonce makes the state
  // unguessable so a third party can't forge a callback for a chosen tenant.
  // (A full nonce-store round-trip would be stricter CSRF; tracked as a
  // hardening follow-up. The exchange itself still requires our client secret.)
  const nonce = crypto.randomUUID()
  const stateObj = { tenant, display_label: displayLabel, nonce }
  const state = btoa(JSON.stringify(stateObj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope,
    state,
    access_type: 'offline',
    prompt: 'consent',
  })

  return json({
    auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirect_uri: REDIRECT_URI,
    scope,
    tenant,
  })
})
