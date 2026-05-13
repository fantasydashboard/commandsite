// CommandSite gmail-inbox-poll Edge Function
// ---------------------------------------------------------------------------
// Scans the connected Gmail account's inbox for activity related to
// emails we sent through the Approval Queue. Two things to find:
//
//   1. REPLIES — messages whose In-Reply-To / References headers match
//      an external_message_id we stored in cs_outreach_sends.
//      → Insert cs_replies row (idempotent via gmail_message_id unique
//        index). Calls classify-manual-reply for tone if we can.
//
//   2. BOUNCES — messages from mailer-daemon@googlemail.com whose body
//      mentions one of our outbound recipients.
//      → Set cs_leads.bounced_at + bounce_reason. Halts further sends.
//
// Trigger: GET (pg_cron via pg_net.http_get, no auth header)
// Returns: { processed, replies_inserted, bounces_recorded, errors? }
//
// Window: looks back 24h on each poll. Idempotency lives in the unique
// index on cs_replies.gmail_message_id and a guard on cs_leads.bounced_at
// (never overwritten once set).

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

// How far back to look on each poll. The unique index on
// gmail_message_id handles dedup so the window can be generous.
const LOOKBACK_DAYS = 1
const PAGE_SIZE = 50

interface GmailMessageStub { id: string; threadId: string }
interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string
  threadId: string
  internalDate: string  // ms since epoch as string
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

/** Extract plain-text body from a Gmail message payload. Recursively
 *  walks parts to find a text/plain part; falls back to snippet. */
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
      if (p.mimeType === 'text/plain' && p.body?.data) {
        return decode(p.body.data)
      }
    }
    // Fallback: try nested parts (multipart/alternative inside multipart/mixed)
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

/** "Mike Smith <m@x.com>" → { name: "Mike Smith", email: "m@x.com" } */
function parseFromHeader(from: string | null): { name: string | null; email: string } {
  if (!from) return { name: null, email: '' }
  const m = from.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: from.trim().toLowerCase() }
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / SECRET not configured')
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
  if (!res.ok) throw new Error(`Refresh failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Pull refresh token
  const { data: settings, error: setErr } = await admin
    .from('cs_settings')
    .select('gmail_refresh_token')
    .eq('id', 1)
    .maybeSingle()
  if (setErr) return json({ error: `Settings: ${setErr.message}` }, 500)
  const refreshToken = (settings as { gmail_refresh_token?: string } | null)?.gmail_refresh_token
  if (!refreshToken) {
    return json({ error: 'Gmail not connected', skipped: true })
  }

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (err) {
    return json({ error: `OAuth refresh: ${err instanceof Error ? err.message : String(err)}` }, 500)
  }

  // ── Build the Gmail search query: anything received in the last N days
  // in the inbox category (excludes Promotions/Forums by default).
  // We don't filter to specific senders — replies arrive from prospects'
  // own domains, which we can't enumerate up front.
  const q = `newer_than:${LOOKBACK_DAYS}d in:inbox`

  // ── List recent messages
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', q)
  listUrl.searchParams.set('maxResults', String(PAGE_SIZE))

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) {
    return json({ error: `Gmail list failed (${listRes.status}): ${await listRes.text()}` }, 502)
  }
  const listJson = (await listRes.json()) as { messages?: GmailMessageStub[] }
  const messageStubs = listJson.messages ?? []

  if (messageStubs.length === 0) {
    return json({ processed: 0, replies_inserted: 0, bounces_recorded: 0, message: 'inbox empty for window' })
  }

  // ── For matching: load thread IDs we've sent. external_message_id
  // stores the Gmail threadId (set by gmail-send → useAutoOutreach).
  // Inbound replies share threadId with the original send because
  // Gmail auto-threads them server-side. No header parsing required.
  const { data: sendsData } = await admin
    .from('cs_outreach_sends')
    .select('id, lead_id, external_message_id')
    .not('external_message_id', 'is', null)
    .limit(2000)
  const sentByThreadId = new Map<string, { send_id: string; lead_id: string }>()
  for (const s of (sendsData ?? []) as Array<{ id: string; lead_id: string; external_message_id: string }>) {
    sentByThreadId.set(s.external_message_id, { send_id: s.id, lead_id: s.lead_id })
  }

  // ── Also need lead lookup by email for bounce matching
  const { data: leadEmails } = await admin
    .from('cs_leads')
    .select('id, contact_email')
    .not('contact_email', 'is', null)
    .is('bounced_at', null)
  const leadByEmail = new Map<string, string>()
  for (const l of (leadEmails ?? []) as Array<{ id: string; contact_email: string }>) {
    leadByEmail.set(l.contact_email.toLowerCase(), l.id)
  }

  // ── Walk messages
  let repliesInserted = 0
  let bouncesRecorded = 0
  const errors: string[] = []

  for (const stub of messageStubs) {
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
    const body = extractBody(msg)

    // ── BOUNCE: from mailer-daemon
    if (
      from.email.includes('mailer-daemon') ||
      from.email.endsWith('@googlemail.com') && /undeliverable|delivery (status|failure)/i.test(subject)
    ) {
      // Find which lead this bounce is about — scan body for one of our contact emails
      let bouncedLeadId: string | null = null
      let bouncedEmail = ''
      const bodyLower = body.toLowerCase()
      for (const [email, leadId] of leadByEmail) {
        if (bodyLower.includes(email)) {
          bouncedLeadId = leadId
          bouncedEmail = email
          break
        }
      }
      if (bouncedLeadId) {
        // Pull a short reason from the bounce snippet
        const reasonMatch = body.match(/(?:reason|status|error)[:\s][^.\n]{5,120}/i)
        const reason = reasonMatch?.[0].replace(/\s+/g, ' ').slice(0, 200) ?? 'Delivery failed'
        const { error: updErr } = await admin
          .from('cs_leads')
          .update({
            bounced_at: receivedAt,
            bounce_reason: reason,
            status: 'disqualified',  // Don't keep sending
          })
          .eq('id', bouncedLeadId)
          .is('bounced_at', null)  // guard against overwrite
        if (updErr) errors.push(`bounce ${bouncedEmail}: ${updErr.message}`)
        else bouncesRecorded++
      }
      continue
    }

    // ── REPLY: match by threadId (Gmail auto-threads replies into
    // the original outbound's thread, so threadId stays the same).
    const matched = sentByThreadId.get(msg.threadId) ?? null
    if (!matched) continue

    // Insert (unique index dedupes — silently no-op on repeat polls)
    const { error: insErr } = await admin
      .from('cs_replies')
      .insert({
        lead_id: matched.lead_id,
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
      // Skip dedup conflicts silently — that's the index doing its job
      if (!insErr.message.includes('duplicate key')) {
        errors.push(`reply ${msg.id}: ${insErr.message}`)
      }
      continue
    }
    repliesInserted++

    // Halt further cadence for this lead — flip status to 'replied'
    await admin
      .from('cs_leads')
      .update({ status: 'replied' })
      .eq('id', matched.lead_id)
      .neq('status', 'replied')  // idempotent
  }

  // Fire-and-forget: classify newly-inserted replies. classify-manual-reply
  // picks up needs_review rows; we just nudge it to run.
  if (repliesInserted > 0) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/classify-manual-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ classify_unreviewed: true }),
      })
    } catch (_) {
      // Non-fatal; replies still surface, just unclassified for one cycle
    }
  }

  return json({
    processed: messageStubs.length,
    replies_inserted: repliesInserted,
    bounces_recorded: bouncesRecorded,
    errors: errors.length > 0 ? errors : undefined,
  })
})
