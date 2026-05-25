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
  /** Which touch this send represents. 1=cold (T1), 2=first follow-up,
   *  3=breakup. Defaults to 1 (treated as cold). The reserve gate
   *  uses this to decide whether the call is subject to the T1
   *  sub-budget or the full daily cap. */
  touch_number?: number
  /** Skip the send-window + daily-cap gate. Use for 1:1 transactional
   *  emails (welcome, discovery brief, kickoff confirmation, etc.)
   *  that the operator triggers manually. These aren't bulk cold
   *  outreach, so they shouldn't be subject to the same time-of-day
   *  + volume protections. Defaults to false. */
  bypass_send_window?: boolean
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

/** Send-window shape stored in cs_settings.outreach_send_window. */
interface SendWindow {
  tz_strategy: 'recipient_local' | 'sender_local' | 'fixed_et'
  weekday_hours: { start: number; end: number }
  allowed_days: string[]  // 'mon','tue',...,'sun'
  blocked_dates: string[] // 'yyyy-mm-dd'
  max_per_day: number
  jitter_minutes: number
  /** 0-100. Reserves this percentage of max_per_day for Touch 2/3.
   *  Default 60 (set in migration 0071). When omitted, the gate
   *  behaves like the pre-reserve version (no T1 sub-cap). */
  followup_reserve_pct?: number
}

/** Today's send count broken down by touch. Returned by the
 *  cs_outreach_sends_today_split RPC; reserve logic needs the
 *  cold-only count to decide whether T1 budget is exhausted. */
interface SendsTodaySplit {
  total: number
  cold_t1: number
  followup: number
}

/** Decision the caller can act on without re-asking. */
type SendGateResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'outside_window'
        | 'day_blocked'
        | 'daily_cap_reached'
        | 'cold_budget_reached'
      reason: string
    }

/** Map ISO weekday (0=Sun..6=Sat) to the 3-letter key used in the window. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Decide whether "now" passes the send window + the daily cap.
 *
 * Important: this function does NOT decide WHETHER to enforce the gate.
 * Callers do that (e.g., skip the gate when the send is an in-thread reply).
 *
 * tz_strategy='sender_local' uses the sender's wall-clock time. Other strategies
 * (recipient_local, fixed_et) are stubs — recipient_local would need a per-lead
 * geo→tz lookup; fixed_et just hardcodes America/New_York. For now both fall
 * back to sender-local, which for CommandSite is America/New_York anyway. */
function evaluateSendGate(
  window: SendWindow,
  split: SendsTodaySplit,
  touchNumber: number,
  now: Date = new Date(),
): SendGateResult {
  const tz = 'America/New_York'  // TODO: per-strategy resolution
  const sendsToday = split.total

  // Hard cap first — applies to every send regardless of touch.
  if (sendsToday >= window.max_per_day) {
    return {
      ok: false,
      code: 'daily_cap_reached',
      reason: `Daily send cap reached (${sendsToday}/${window.max_per_day}). Resumes tomorrow.`,
    }
  }

  // Reserve check: cold T1 sends are capped at (max_per_day - reserve).
  // Follow-ups (touch >= 2) get to use the entire daily cap. The reserve
  // protects the follow-up cadence from being squeezed by heavy T1 days.
  if (touchNumber === 1) {
    const reservePct = Math.max(0, Math.min(100, window.followup_reserve_pct ?? 0))
    const reserveCount = Math.floor(window.max_per_day * reservePct / 100)
    const t1Budget = Math.max(0, window.max_per_day - reserveCount)
    if (split.cold_t1 >= t1Budget) {
      return {
        ok: false,
        code: 'cold_budget_reached',
        reason: `Cold-outreach budget reached for today (${split.cold_t1}/${t1Budget}). The remaining ${reserveCount} slots are reserved for Touch 2/3 follow-ups. Cold drafts will queue and fire tomorrow.`,
      }
    }
  }

  // Parse "now" into the chosen tz to read hour + weekday + date.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit', hour12: false,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const hour = parseInt(parts.hour, 10)
  const weekday3 = parts.weekday.toLowerCase().slice(0, 3)  // 'mon','tue',...
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`

  if (window.blocked_dates.includes(isoDate)) {
    return {
      ok: false,
      code: 'day_blocked',
      reason: `${isoDate} is on the blocked-dates list (holiday or blackout).`,
    }
  }
  if (!window.allowed_days.includes(weekday3)) {
    return {
      ok: false,
      code: 'day_blocked',
      reason: `${weekday3} is not in the allowed-days list (${window.allowed_days.join(', ')}).`,
    }
  }
  if (hour < window.weekday_hours.start || hour >= window.weekday_hours.end) {
    return {
      ok: false,
      code: 'outside_window',
      reason: `Current hour (${hour}:00 ${tz}) is outside the send window (${window.weekday_hours.start}:00–${window.weekday_hours.end}:00).`,
    }
  }
  return { ok: true }
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
  let sendWindow: SendWindow | null = null

  if (tenant === 'commandsite') {
    // Backwards-compat: read from cs_settings.gmail_* AND the outreach window.
    const { data: settings, error: setErr } = await admin
      .from('cs_settings')
      .select('gmail_refresh_token, gmail_account_email, outreach_send_window')
      .eq('id', 1)
      .maybeSingle()
    if (setErr) return json({ ok: false, error: `Settings read failed: ${setErr.message}` }, 500)
    refreshToken = (settings as { gmail_refresh_token?: string } | null)?.gmail_refresh_token ?? undefined
    fromEmail = (settings as { gmail_account_email?: string } | null)?.gmail_account_email ?? undefined
    sendWindow = (settings as { outreach_send_window?: SendWindow } | null)?.outreach_send_window ?? null
  } else {
    // Multi-tenant: read from email_accounts. Other tenants don't have the
    // outreach_send_window column yet — they bypass the gate until added.
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

  // ── Send gate: window + daily cap + reserve.
  // Skipped in two cases:
  //   1. body.thread_id present — in-thread reply, send NOW (human
  //      wrote, operator wants to respond, time-of-day doesn't apply).
  //   2. body.bypass_send_window === true — transactional 1:1 email
  //      (welcome, discovery brief, kickoff, shadow, live announcement).
  //      These are operator-triggered, single recipient, expected
  //      communication. The window is for bulk cold outreach.
  // Cold-outreach sends + Touch 2/3 followups all pass through the gate;
  // only T1 is subject to the cold sub-budget.
  const touchNumber = Math.max(1, Math.min(3, body.touch_number ?? 1))
  const isInThreadReply = Boolean(body.thread_id)
  const bypassWindow = Boolean(body.bypass_send_window)
  if (sendWindow && !isInThreadReply && !bypassWindow) {
    const { data: splitRow } = await admin.rpc('cs_outreach_sends_today_split', {
      p_tz: 'America/New_York',
    } as never)
    // pg returns the function as a single-row array; normalize to scalars.
    const splitRaw = Array.isArray(splitRow) ? splitRow[0] : splitRow
    const split: SendsTodaySplit = {
      total: Number((splitRaw as { total?: number } | null)?.total ?? 0),
      cold_t1: Number((splitRaw as { cold_t1?: number } | null)?.cold_t1 ?? 0),
      followup: Number((splitRaw as { followup?: number } | null)?.followup ?? 0),
    }

    const gate = evaluateSendGate(sendWindow, split, touchNumber)
    if (!gate.ok) {
      return json({
        ok: false,
        deferred: true,
        code: gate.code,
        reason: gate.reason,
        sendsToday: split.total,
        coldSendsToday: split.cold_t1,
        followupSendsToday: split.followup,
        capPerDay: sendWindow.max_per_day,
        touchNumber,
      }, 429)
    }
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
