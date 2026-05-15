// CommandSite gmail-oauth-callback Edge Function
// ---------------------------------------------------------------------------
// Final hop of the OAuth dance. Google redirects the browser here with
// ?code=…&state=… after Josh authorizes Gmail access. We:
//   1. Exchange the code for refresh_token + access_token using our
//      client_id/secret from Supabase secrets.
//   2. Hit Gmail's /profile endpoint with the access token to learn
//      which account just connected (emailAddress).
//   3. Store refresh_token + emailAddress + connected_at in
//      cs_settings (the singleton row id=1).
//   4. Return a "Connected!" HTML page that closes the tab.
//
// Trigger:  GET (Google's redirect)
// Query:    code (required), state (optional CSRF token)
// Secrets:  GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`

function htmlPage(body: string, isError = false): Response {
  const color = isError ? '#dc2626' : '#16a34a'
  // ASCII-only — some upstreams strip charset hints and we don't want
  // mojibake on the title bar. Plain dot replaces the middle dot.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Gmail | CommandSite</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh;
    margin: 0; background: #f6f7f9; color: #1a1f2e; }
  .card { background: white; padding: 2rem 2.5rem; border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.08); max-width: 420px; text-align: center; }
  h1 { color: ${color}; margin: 0 0 .5rem; font-size: 1.5rem; }
  p { color: #5b6478; line-height: 1.5; margin: .5rem 0; }
  .icon { font-size: 3rem; margin-bottom: .5rem; }
  button { background: #1a1f2e; color: white; border: 0; padding: .75rem 1.5rem;
    border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 1rem; }
</style></head>
<body><div class="card">${body}
<button onclick="window.close()">Close tab</button>
</div></body></html>`
  // Build headers with a Headers() instance — some Supabase edge
  // gateways have been observed dropping plain-object Content-Type
  // hints. Add X-Content-Type-Options to lock it in.
  const headers = new Headers()
  headers.set('Content-Type', 'text/html; charset=UTF-8')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'no-store')
  return new Response(html, { status: isError ? 400 : 200, headers })
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

  // Decode tenant from state (base64url-encoded JSON). Falls back to
  // 'commandsite' if state is missing/malformed (backwards compat).
  let tenant = 'commandsite'
  let displayLabel = 'CommandSite'
  if (stateParam) {
    try {
      const padded = stateParam.replace(/-/g, '+').replace(/_/g, '/')
        + '==='.slice(0, (4 - stateParam.length % 4) % 4)
      const decoded = JSON.parse(atob(padded)) as { tenant?: string; display_label?: string }
      if (decoded.tenant && /^[a-z0-9][a-z0-9_-]*$/.test(decoded.tenant)) {
        tenant = decoded.tenant
      }
      if (decoded.display_label) displayLabel = decoded.display_label
    } catch {
      // Malformed state — proceed with default tenant
    }
  }

  if (errorParam) {
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Authorization declined</h1>
       <p>Google returned: <code>${errorParam}</code></p>
       <p>Try again from the Settings page when you're ready.</p>`,
      true,
    )
  }

  if (!code) {
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Missing code</h1>
       <p>No authorization code in the callback URL. Try again from the Settings page.</p>`,
      true,
    )
  }

  // ── 1. Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Token exchange failed</h1>
       <p>Google said: <code>${tokenRes.status}</code></p>
       <p>Detail: <pre style="text-align:left;font-size:.75rem">${escapeHtml(errText)}</pre></p>`,
      true,
    )
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
  }

  if (!tokens.refresh_token) {
    // Google omits refresh_token on re-auth unless prompt=consent.
    // Our consent URL always passes prompt=consent so this should never
    // happen — but if it does, we surface it clearly so we can debug.
    return htmlPage(
      `<div class="icon">⚠️</div><h1>No refresh token returned</h1>
       <p>Google didn't issue a refresh token. This usually means Gmail was
       already authorized for this app on this account. Visit
       <a href="https://myaccount.google.com/permissions" target="_blank">
       Google's permissions page</a>, remove "CommandSite Outreach," then
       reconnect from Settings.</p>`,
      true,
    )
  }

  // ── 2. Get the account email via the OAuth2 userinfo endpoint.
  // gmail.send scope alone doesn't grant access to /gmail/v1/users/me/profile
  // — we need userinfo.email scope (requested in gmail-oauth-start)
  // and this OIDC userinfo endpoint, which returns { email, ... }.
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  let email = 'unknown'
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as { email?: string }
    email = profile.email ?? 'unknown'
  }

  // ── 3. Persist tokens. For backwards compat, tenant='commandsite'
  // continues to write to cs_settings.gmail_*; all other tenants
  // write to email_accounts (multi-tenant credential store).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  let dbErr: { message: string } | null = null

  if (tenant === 'commandsite') {
    const { error } = await admin
      .from('cs_settings')
      .update({
        gmail_refresh_token: tokens.refresh_token,
        gmail_account_email: email,
        gmail_connected_at: new Date().toISOString(),
      })
      .eq('id', 1)
    dbErr = error
  } else {
    const { error } = await admin
      .from('email_accounts')
      .upsert({
        tenant_key: tenant,
        display_label: displayLabel,
        account_email: email,
        refresh_token: tokens.refresh_token,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'tenant_key' })
    dbErr = error
  }

  if (dbErr) {
    return htmlPage(
      `<div class="icon">⚠️</div><h1>Couldn't save tokens</h1>
       <p>Database write failed: <code>${escapeHtml(dbErr.message)}</code></p>`,
      true,
    )
  }

  // ── 4. Success page
  return htmlPage(
    `<div class="icon">✅</div><h1>${escapeHtml(displayLabel)} connected</h1>
     <p>Future sends from this tenant will go through <strong>${escapeHtml(email)}</strong>.</p>
     <p>You can close this tab and head back to the dashboard.</p>`,
  )
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
