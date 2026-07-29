// CommandSite google-oauth-callback Edge Function
// ---------------------------------------------------------------------------
// Final hop of the Google OAuth dance. Google redirects the browser here
// with ?code=…&state=… after the church authorizes. We:
//   1. Exchange the code for access_token + refresh_token (our client secret).
//   2. Hit the userinfo endpoint to learn who connected (best-effort identity).
//   3. Encrypt both tokens (AES-GCM) and upsert the google_connections row for
//      this church (tenant = slug packed into state).
//   4. Return a "Connected!" HTML page that closes the tab.
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

function htmlPage(body: string, isError = false): Response {
  const color = isError ? '#dc2626' : '#16a34a'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Google | CommandSite</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh;
    margin: 0; background: #f6f7f9; color: #1a1f2e; }
  .card { background: white; padding: 2rem 2.5rem; border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.08); max-width: 440px; text-align: center; }
  h1 { color: ${color}; margin: 0 0 .5rem; font-size: 1.5rem; }
  p { color: #5b6478; line-height: 1.5; margin: .5rem 0; }
  code { background: #f0f1f4; padding: .1rem .35rem; border-radius: 4px; font-size: .85em; }
  .icon { font-size: 3rem; margin-bottom: .5rem; }
  button { background: #1a1f2e; color: white; border: 0; padding: .75rem 1.5rem;
    border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 1rem; }
</style></head>
<body><div class="card">${body}
<button onclick="window.close()">Close tab</button>
</div></body></html>`
  const headers = new Headers()
  headers.set('Content-Type', 'text/html; charset=UTF-8')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'no-store')
  return new Response(html, { status: isError ? 400 : 200, headers })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

Deno.serve(async (req: Request) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Configuration missing</h1>
       <p>Supabase secrets <code>GOOGLE_OAUTH_CLIENT_ID</code> and
       <code>GOOGLE_OAUTH_CLIENT_SECRET</code> aren't set yet.</p>`,
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
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Authorization declined</h1>
       <p>Google returned: <code>${escapeHtml(errorParam)}</code></p>
       <p>You can try again from the dashboard when you're ready.</p>`,
      true,
    )
  }
  if (!code) {
    return htmlPage(`<div class="icon">⚠️</div><h1>Missing code</h1>
       <p>No authorization code in the callback URL. Start again from the dashboard.</p>`, true)
  }
  if (!tenant) {
    return htmlPage(`<div class="icon">⚠️</div><h1>Missing church</h1>
       <p>The callback state didn't identify a church. Start again from the dashboard.</p>`, true)
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
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Token exchange failed</h1>
       <p>Google said: <code>${tokenRes.status}</code></p>
       <pre style="text-align:left;font-size:.75rem;white-space:pre-wrap">${escapeHtml(errText)}</pre>`,
      true,
    )
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
    token_type: string
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return htmlPage(`<div class="icon">⚠️</div><h1>Incomplete token response</h1>
       <p>Google didn't return both tokens. Try connecting again.</p>`, true)
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
    return htmlPage(`<div class="icon">⚠️</div><h1>Missing email address</h1>
       <p>Google did not return an email address for this account. Make sure the
       userinfo/email scope is granted and try again.</p>`, true)
  }

  // ── 3. Encrypt + persist
  let accessEnc: string
  let refreshEnc: string
  try {
    accessEnc = await encryptToken(tokens.access_token)
    refreshEnc = await encryptToken(tokens.refresh_token)
  } catch (err) {
    return htmlPage(`<div class="icon">⚠️</div><h1>Encryption not configured</h1>
       <p><code>${escapeHtml(err instanceof Error ? err.message : String(err))}</code></p>`, true)
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
    return htmlPage(`<div class="icon">⚠️</div><h1>Couldn't save the connection</h1>
       <p>Database write failed: <code>${escapeHtml(dbErr.message)}</code></p>`, true)
  }

  return htmlPage(
    `<div class="icon">✅</div><h1>${escapeHtml(connectedEmail ?? displayLabel)} connected</h1>
     <p>Google is linked${connectedBy ? ` (authorized by <strong>${escapeHtml(connectedBy)}</strong>)` : ''}.</p>
     <p>Grace can now send email as this address on your behalf. She never reads your inbox. You can close this tab.</p>`,
  )
})
