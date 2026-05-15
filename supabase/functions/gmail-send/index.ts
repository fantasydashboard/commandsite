// CommandSite gmail-send Edge Function
// ---------------------------------------------------------------------------
// Sends an email through the connected Gmail account. Used by the
// Approval Queue's "Approve" action (when Gmail is connected) and by
// auto-approve mode (which can't open a compose tab and needs direct
// delivery).
//
// Flow each call:
//   1. Read cs_settings.gmail_refresh_token (the long-lived token).
//   2. Exchange it for a fresh access_token (~1h lifetime).
//   3. Build an RFC 822 message, base64url it, POST to Gmail's
//      users.messages.send endpoint.
//   4. Return the message id Google assigned.
//
// Auth:    Authorization: Bearer <user-jwt> — caller must be admin.
//          (Service role bypasses this check.)
// Body:    { to: string, subject: string, body: string, lead_id?: string }
// Returns: { ok: true, message_id, thread_id, sent_from }
//          { ok: false, error: '...' }
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')

interface SendBody {
  to?: string
  subject?: string
  body?: string
  lead_id?: string
  /** When set, Gmail places this message in the existing thread. Used
   *  by the Reply Approval Queue so responses land in-thread with the
   *  recipient's original reply. */
  thread_id?: string
  /** Optional: the RFC 822 Message-ID of the message we're replying
   *  to. Adds In-Reply-To + References headers for non-Gmail clients
   *  that thread by header rather than threadId. */
  in_reply_to_message_id?: string
  /** Multi-tenant routing. Defaults to 'commandsite' (cs_settings).
   *  Other tenants ('ufd', 'cust-<uuid>') resolve to the
   *  email_accounts table. Determines which Gmail account the message
   *  sends from. */
  tenant?: string
}

/** Base64url encoding per Gmail's API spec (no padding, URL-safe alphabet). */
function base64UrlEncode(s: string): string {
  // TextEncoder → Uint8Array → base64 → url-safe substitutions
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build a minimal RFC 822 message. Subject is encoded so emoji + unicode
 *  in the subject line survive transit. Body is plain text. If
 *  inReplyTo is provided, adds In-Reply-To + References headers so
 *  non-Gmail clients thread the reply. */
function buildRfc822(from: string, to: string, subject: string, body: string, inReplyTo?: string): string {
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ]
  if (inReplyTo) {
    // Normalize to angle-bracketed form
    const formatted = inReplyTo.startsWith('<') ? inReplyTo : `<${inReplyTo}>`
    headers.push(`In-Reply-To: ${formatted}`)
    headers.push(`References: ${formatted}`)
  }
  return headers.join('\r\n') + '\r\n\r\n' + body
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  if (!body.to || !body.subject || !body.body) {
    return json({ ok: false, error: 'Missing required fields: to, subject, body' }, 400)
  }

  // ── Auth: caller must be admin OR using service role
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ ok: false, error: 'Missing Authorization header' }, 401)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ ok: false, error: 'Invalid auth token' }, 401)
    const { data: profile } = await userClient
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return json({ ok: false, error: 'Admin only' }, 403)
    }
  }

  // ── Pull refresh token + email for the requested tenant
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const tenant = body.tenant ?? 'commandsite'
  let refreshToken: string | undefined
  let fromEmail: string | undefined

  if (tenant === 'commandsite') {
    // Backwards-compat: read from cs_settings.gmail_*
    const { data: settings, error: setErr } = await admin
      .from('cs_settings')
      .select('gmail_refresh_token, gmail_account_email')
      .eq('id', 1)
      .maybeSingle()
    if (setErr) return json({ ok: false, error: `Settings read failed: ${setErr.message}` }, 500)
    refreshToken = (settings as { gmail_refresh_token?: string } | null)?.gmail_refresh_token ?? undefined
    fromEmail = (settings as { gmail_account_email?: string } | null)?.gmail_account_email ?? undefined
  } else {
    // Multi-tenant: read from email_accounts
    const { data: account, error: acctErr } = await admin
      .from('email_accounts')
      .select('refresh_token, account_email')
      .eq('tenant_key', tenant)
      .maybeSingle()
    if (acctErr) return json({ ok: false, error: `email_accounts read failed: ${acctErr.message}` }, 500)
    refreshToken = (account as { refresh_token?: string } | null)?.refresh_token ?? undefined
    fromEmail = (account as { account_email?: string } | null)?.account_email ?? undefined
  }

  if (!refreshToken) {
    return json({
      ok: false,
      error: `Gmail not connected for tenant '${tenant}'. Visit Settings to connect.`,
    }, 400)
  }

  // ── Mint a fresh access token + send
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ ok: false, error: `OAuth refresh failed: ${msg}` }, 500)
  }

  const raw = base64UrlEncode(buildRfc822(
    fromEmail ?? 'me',
    body.to,
    body.subject,
    body.body,
    body.in_reply_to_message_id,
  ))
  const sendPayload: { raw: string; threadId?: string } = { raw }
  if (body.thread_id) sendPayload.threadId = body.thread_id
  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sendPayload),
  })

  if (!sendRes.ok) {
    const errText = await sendRes.text()
    return json({
      ok: false,
      error: `Gmail send failed (${sendRes.status}): ${errText}`,
    }, 502)
  }

  const sent = (await sendRes.json()) as { id?: string; threadId?: string }
  return json({
    ok: true,
    message_id: sent.id,
    thread_id: sent.threadId,
    sent_from: fromEmail,
  })
})
