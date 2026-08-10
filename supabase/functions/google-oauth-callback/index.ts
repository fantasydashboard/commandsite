// CommandSite google-oauth-callback Edge Function
// ---------------------------------------------------------------------------
// Final hop of the Google OAuth dance. Google redirects the browser here
// with ?code=…&state=… after the church authorizes. We:
//   1. Exchange the code for access_token + refresh_token (our client secret).
//   2. Hit the userinfo endpoint to learn who connected (best-effort identity).
//   3. Encrypt both tokens (AES-GCM) and upsert the google_connections row for
//      this church (tenant = slug packed into state).
//   4. Redirect to /connected on our own domain, which renders the outcome and
//      offers a "Close tab" button. See the note on `finish` for why this
//      function cannot render that page itself.
//
// Trigger:  GET (Google's redirect)
// Query:    code (required), state (tenant + nonce), error (on decline)
// Secrets:  GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, TOKEN_ENC_KEY,
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { encryptToken } from '../_shared/crypto.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`

// This function CANNOT render its own confirmation page. Supabase Edge Functions
// rewrite a `text/html` Content-Type to a bare `text/plain` (it stops functions
// being used to host phishing pages on the shared supabase.co domain), so the
// browser shows the markup as source, and with no charset it decodes the UTF-8
// emoji as mojibake. No combination of response headers gets around it;
// pco-oauth-callback has the same code and the same symptom.
//
// So finish the OAuth hop with a redirect to a static page on our own domain
// (public/connected.html, routed by the vercel.json rewrite) and let that render
// the outcome. Google's registered redirect_uri still points here and is
// unchanged, so this needs no Cloud Console edit.
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://www.commandsite.io'

function finish(title: string, detail: string, isError = false): Response {
  const params = new URLSearchParams({
    status: isError ? 'error' : 'ok',
    title,
    detail,
  })
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${APP_ORIGIN}/connected?${params.toString()}`,
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return finish(
      'Configuration missing',
      "Supabase secrets GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET aren't set yet.",
      true,
    )
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')
  const stateParam = url.searchParams.get('state') ?? ''

  // Decode tenant from state (base64url JSON). Without a valid tenant we can't
  // route the token, so this is required (unlike the gmail default).
  let tenant = ''
  let displayLabel = ''
  if (stateParam) {
    try {
      const padded = stateParam.replace(/-/g, '+').replace(/_/g, '/')
        + '==='.slice(0, (4 - stateParam.length % 4) % 4)
      const decoded = JSON.parse(atob(padded)) as { tenant?: string; display_label?: string }
      if (decoded.tenant && /^[a-z0-9][a-z0-9_-]*$/.test(decoded.tenant)) tenant = decoded.tenant
      if (decoded.display_label) displayLabel = decoded.display_label
    } catch { /* malformed */ }
  }

  if (errorParam) {
    return finish(
      'Authorization declined',
      `Google returned: ${errorParam}. You can try again from the dashboard when you're ready.`,
      true,
    )
  }
  if (!code) {
    return finish('Missing code',
      'No authorization code in the callback URL. Start again from the dashboard.', true)
  }
  if (!tenant) {
    return finish('Missing church',
      "The callback state didn't identify a church. Start again from the dashboard.", true)
  }
  if (!displayLabel) displayLabel = tenant

  // ── 1. Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    return finish('Token exchange failed',
      `Google said ${tokenRes.status}: ${errText}`, true)
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
    token_type: string
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return finish('Incomplete token response',
      "Google didn't return both tokens. Try connecting again.", true)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // ── 2. Best-effort identity (never load-bearing; the token is the truth).
  let connectedBy: string | null = null
  let connectedEmail: string | null = null
  const orgName: string | null = null
  try {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    })
    if (uiRes.ok) {
      const ui = (await uiRes.json()) as { email?: string; name?: string }
      connectedEmail = ui.email ?? null
      connectedBy = ui.name ?? null
    }
  } catch { /* identity is optional */ }

  if (!connectedEmail) {
    return finish('Missing email address',
      'Google did not return an email address for this account. Make sure the userinfo/email scope is granted and try again.', true)
  }

  // ── 3. Encrypt + persist
  let accessEnc: string
  let refreshEnc: string
  try {
    accessEnc = await encryptToken(tokens.access_token)
    refreshEnc = await encryptToken(tokens.refresh_token)
  } catch (err) {
    return finish('Encryption not configured',
      err instanceof Error ? err.message : String(err), true)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // A church's first connection becomes its default sender. Re-connecting an
  // existing address (count >= 1) must NOT flip an existing default back to
  // false, so is_default is only included in the upsert payload when true.
  const { count } = await admin
    .from('google_connections')
    .select('tenant_key', { count: 'exact', head: true })
    .eq('tenant_key', tenant)
  const isDefault = (count ?? 0) === 0

  const { error: dbErr } = await admin
    .from('google_connections')
    .upsert({
      tenant_key: tenant,
      display_label: displayLabel,
      access_token_enc: accessEnc,
      refresh_token_enc: refreshEnc,
      expires_at: expiresAt,
      scopes: tokens.scope ?? '',
      org_name: orgName,
      connected_by: connectedBy,
      connected_email: connectedEmail,
      connected_at: new Date().toISOString(),
      last_refreshed_at: null,
      ...(isDefault ? { is_default: true } : {}),
    }, { onConflict: 'tenant_key,connected_email' })

  if (dbErr) {
    return finish("Couldn't save the connection",
      `Database write failed: ${dbErr.message}`, true)
  }

  return finish(
    `${connectedEmail ?? displayLabel} connected`,
    `Google is linked${connectedBy ? ` (authorized by ${connectedBy})` : ''}. Grace can now send email as this address on your behalf. She never reads your inbox.`,
  )
})
