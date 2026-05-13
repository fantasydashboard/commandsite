// CommandSite gmail-oauth-start Edge Function
// ---------------------------------------------------------------------------
// Returns the Google consent URL the user should hit to authorize
// Gmail send access. Keeps GOOGLE_OAUTH_CLIENT_ID out of the
// frontend bundle (it's not a secret per se, but there's no reason
// to ship it client-side either).
//
// Auth:    Admin (Bearer user JWT) — service role bypasses
// Body:    none
// Returns: { auth_url, redirect_uri, scope }
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (!CLIENT_ID) {
    return json({
      error: 'GOOGLE_OAUTH_CLIENT_ID secret not set in Supabase Edge Functions.',
    }, 500)
  }

  // ── Auth: admin only (service role bypasses)
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ error: 'Missing Authorization header' }, 401)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)
    const { data: profile } = await userClient
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // prompt=consent ensures we get a refresh_token even on re-auth.
    // Without it, Google may omit refresh_token on second-time auth.
    prompt: 'consent',
    include_granted_scopes: 'true',
  })

  return json({
    auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  })
})
