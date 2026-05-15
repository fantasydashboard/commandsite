// CommandSite · ufd-inbox-poll Edge Function
// ---------------------------------------------------------------------------
// Parallel to gmail-inbox-poll but for the UFD support inbox
// (support@ultimatefantasydashboard.com). Polls every 10 min via
// pg_cron, matches inbound replies by gmail thread_id against the
// UFD lifecycle log tables (ufd_welcome_log + ufd_lifecycle_email_log),
// and routes matches into ufd_replies for Bones to draft a response.
//
// Auth: pg_cron via pg_net.http_get (no auth header — function deploys
// with --no-verify-jwt).

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

const LOOKBACK_DAYS = 1
const PAGE_SIZE = 50
const TENANT = 'ufd'

interface GmailMessageStub { id: string; threadId: string }
interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string
  threadId: string
  internalDate: string
  snippet?: string
  payload?: {
    headers?: GmailHeader[]
    body?: { data?: string; size?: number }
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>
  }
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

function extractBody(msg: GmailMessage): string {
  function decode(b64url: string): string {
    try {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '==='.slice(0, (4 - b64.length % 4) % 4)
      const binary = atob(padded)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    } catch { return '' }
  }
  function walk(parts: NonNullable<NonNullable<GmailMessage['payload']>['parts']>): string {
    for (const p of parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) return decode(p.body.data)
    }
    for (const p of parts) {
      const nested = (p as { parts?: typeof parts }).parts
      if (Array.isArray(nested)) {
        const got = walk(nested)
        if (got) return got
      }
    }
    return ''
  }
  if (msg.payload?.body?.data) {
    const got = decode(msg.payload.body.data)
    if (got) return got
  }
  if (msg.payload?.parts) {
    const got = walk(msg.payload.parts)
    if (got) return got
  }
  return msg.snippet ?? ''
}

function parseFromHeader(from: string | null): { name: string | null; email: string } {
  if (!from) return { name: null, email: '' }
  const m = from.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: from.trim().toLowerCase() }
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('GOOGLE_OAUTH_CLIENT_ID / SECRET not configured')
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
  if (!res.ok) throw new Error(`Refresh failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Look up the UFD tenant's refresh token from email_accounts
  const { data: account, error: acctErr } = await admin
    .from('email_accounts')
    .select('refresh_token, account_email')
    .eq('tenant_key', TENANT)
    .maybeSingle()
  if (acctErr) return json({ error: `email_accounts: ${acctErr.message}` }, 500)
  const refreshToken = (account as { refresh_token?: string } | null)?.refresh_token
  if (!refreshToken) {
    return json({ error: `Tenant '${TENANT}' not connected. Connect from Settings.`, skipped: true })
  }

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (err) {
    return json({ error: `OAuth refresh: ${err instanceof Error ? err.message : String(err)}` }, 500)
  }

  // ── Pull recent inbox messages
  const q = `newer_than:${LOOKBACK_DAYS}d in:inbox`
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', q)
  listUrl.searchParams.set('maxResults', String(PAGE_SIZE))

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) {
    return json({ error: `Gmail list ${listRes.status}: ${await listRes.text()}` }, 502)
  }
  const listJson = (await listRes.json()) as { messages?: GmailMessageStub[] }
  const stubs = listJson.messages ?? []

  if (stubs.length === 0) {
    return json({ processed: 0, replies_inserted: 0, message: 'inbox empty for window' })
  }

  // ── Build thread index from UFD log tables
  // For each lifecycle email we sent, we have a Gmail message_id. The
  // threadId on the SENT message equals the threadId on the REPLY (Gmail
  // auto-threads). So we need a map: send_message_id → thread metadata.
  // BUT we don't store threadId per send today — only message_id. So
  // we'll match inbound by thread participants instead: any message
  // whose thread we recognize as having one of our outbound message_ids.
  //
  // Practical approach: pull all message_ids we've sent, then for each
  // inbound check if its thread contains any of them. Gmail's
  // threads.get endpoint returns all messages in a thread; we check
  // each inbound's thread for overlap with our log.
  const { data: welcomeLog } = await admin
    .from('ufd_welcome_log')
    .select('user_email, user_name, message_id')
    .not('message_id', 'is', null)
    .limit(500)
  const { data: lifecycleLog } = await admin
    .from('ufd_lifecycle_email_log')
    .select('user_email, user_name, step, message_id')
    .not('message_id', 'is', null)
    .limit(500)

  type LogEntry = { user_email: string; user_name: string | null; step: string; message_id: string }
  const sentByGmailId = new Map<string, LogEntry>()
  for (const r of (welcomeLog ?? []) as Array<{ user_email: string; user_name: string | null; message_id: string }>) {
    sentByGmailId.set(r.message_id, { ...r, step: 'welcome' })
  }
  for (const r of (lifecycleLog ?? []) as Array<{ user_email: string; user_name: string | null; step: string; message_id: string }>) {
    sentByGmailId.set(r.message_id, r)
  }

  // ── Walk inbound messages
  let repliesInserted = 0
  const errors: string[] = []

  for (const stub of stubs) {
    // Get the full message
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!msgRes.ok) {
      errors.push(`msg ${stub.id}: ${msgRes.status}`)
      continue
    }
    const msg = (await msgRes.json()) as GmailMessage
    const headers = msg.payload?.headers
    const from = parseFromHeader(header(headers, 'From'))
    const subject = header(headers, 'Subject') ?? ''
    const receivedAt = new Date(Number(msg.internalDate || Date.now())).toISOString()

    // Skip messages we sent (gmail inbox includes both sent + received)
    // The UFD account is sending FROM support@ — anything FROM that
    // address is our own outbound, skip it.
    const ufdEmail = (account as { account_email?: string } | null)?.account_email?.toLowerCase()
    if (ufdEmail && from.email === ufdEmail) continue

    // Match: does this thread contain one of our outbound message_ids?
    // Fetch the thread to check.
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${stub.threadId}?format=metadata&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!threadRes.ok) continue
    const threadJson = await threadRes.json() as { messages?: Array<{ id: string }> }
    const threadMessageIds = (threadJson.messages ?? []).map((m) => m.id)
    let matched: LogEntry | null = null
    for (const id of threadMessageIds) {
      const hit = sentByGmailId.get(id)
      if (hit) { matched = hit; break }
    }
    if (!matched) continue

    const body = extractBody(msg)

    // Insert (unique on gmail_message_id dedupes across polls)
    const { error: insErr } = await admin
      .from('ufd_replies')
      .insert({
        user_email: matched.user_email,
        user_name: matched.user_name,
        reply_to_step: matched.step,
        reply_to_message_id: matched.message_id,
        from_email: from.email,
        from_name: from.name,
        subject,
        body,
        received_at: receivedAt,
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
        needs_review: true,
      })
    if (insErr) {
      if (!insErr.message.includes('duplicate key')) {
        errors.push(`insert ${msg.id}: ${insErr.message}`)
      }
      continue
    }
    repliesInserted++

    // Fire-and-forget: ask Bones to draft a response
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/draft-ufd-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          gmail_message_id: msg.id,
        }),
      })
    } catch { /* non-fatal — draft will lag one cycle */ }
  }

  return json({
    processed: stubs.length,
    replies_inserted: repliesInserted,
    errors: errors.length > 0 ? errors : undefined,
  })
})
