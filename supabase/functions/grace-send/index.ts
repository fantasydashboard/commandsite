// CommandSite grace-send Edge Function
// ---------------------------------------------------------------------------
// The security-sensitive orchestrator behind Grace's "Approve & send". Runs
// the guardrail gauntlet (decideSend, from _shared/grace-send/decide.ts),
// resolves the recipient + the church's connected Gmail sender, sends via the
// Gmail API when the gauntlet clears, and writes an audit/idempotency row to
// grace_send_log. Mirrors pco-fetch's tenant-authz gate: service role
// bypasses, otherwise the caller's JWT is verified and their role/client_id/
// permission_scope is re-resolved server-side.
//
// Body:    { tenant, messageType, cardId, personId, subject, body }
// Returns: { ok: true, status, detail }
//          { ok: false, status: 'failed', detail }, only for auth/lookup
//          failures and unexpected exceptions. Every reachable guardrail
//          outcome (blocked, suppressed, rate_limited, deferred_quiet_hours,
//          already_sent, sent, redirected_to_test, or a send-time failure)
//          is a normal `ok: true` result. grace-send never throws to the
//          client.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (google-auth.ts +
//          pco-auth.ts pull their own OAuth secrets).

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { pcoFetch } from '../_shared/pco-auth.ts'
import { getGoogleAccessToken } from '../_shared/google-auth.ts'
import { decideSend, buildRfc822, base64UrlEncode } from '../_shared/grace-send/decide.ts'
import type { SendAction } from '../_shared/grace-send/decide.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// deno-lint-ignore no-explicit-any
type Db = any

interface MessagingSettings {
  enabled: boolean
  testMode: boolean
  testRecipient: string
  timezone: string
  quietStartHour: number
  quietEndHour: number
  ratePerHour: number
  ratePerDay: number
}

// Safe by default: enabled=false, testMode=true. If church_settings.messaging
// is missing, empty, or malformed, this is exactly what resolveMessaging
// returns, so nothing sends until a church admin explicitly turns it on.
const SAFE_MESSAGING: MessagingSettings = {
  enabled: false,
  testMode: true,
  testRecipient: '',
  timezone: 'America/New_York',
  quietStartHour: 8,
  quietEndHour: 20,
  ratePerHour: 50,
  ratePerDay: 200,
}

function resolveMessaging(raw: unknown): MessagingSettings {
  if (!raw || typeof raw !== 'object') return { ...SAFE_MESSAGING }
  const m = raw as Partial<MessagingSettings>
  return {
    enabled: m.enabled === true,
    testMode: m.testMode !== false,
    testRecipient: typeof m.testRecipient === 'string' ? m.testRecipient : SAFE_MESSAGING.testRecipient,
    timezone: typeof m.timezone === 'string' && m.timezone ? m.timezone : SAFE_MESSAGING.timezone,
    quietStartHour: typeof m.quietStartHour === 'number' ? m.quietStartHour : SAFE_MESSAGING.quietStartHour,
    quietEndHour: typeof m.quietEndHour === 'number' ? m.quietEndHour : SAFE_MESSAGING.quietEndHour,
    ratePerHour: typeof m.ratePerHour === 'number' ? m.ratePerHour : SAFE_MESSAGING.ratePerHour,
    ratePerDay: typeof m.ratePerDay === 'number' ? m.ratePerDay : SAFE_MESSAGING.ratePerDay,
  }
}

type LogStatus =
  | 'sent' | 'redirected_to_test' | 'suppressed' | 'rate_limited'
  | 'deferred_quiet_hours' | 'blocked' | 'failed'

// decideSend's action vocabulary differs slightly from the grace_send_log
// status column: 'send' -> 'sent' and 'redirect_to_test' -> 'redirected_to_test'.
// Every other action name matches the log status verbatim. 'already_sent' is
// short-circuited by the caller before this is ever used.
function toLogStatus(action: SendAction): LogStatus {
  if (action === 'send') return 'sent'
  if (action === 'redirect_to_test') return 'redirected_to_test'
  return action as LogStatus
}

// Resolve a guest's email: the synced pco_people roster first (fast, no PCO
// call), then an on-demand PCO fetch for guests not yet in the roster mirror.
async function resolveRecipientEmail(db: Db, clientId: string, tenant: string, personId: string): Promise<string | null> {
  const { data: row } = await db.from('pco_people')
    .select('emails')
    .eq('client_id', clientId).eq('person_id', personId)
    .maybeSingle()
  const emails = (row?.emails ?? []) as string[]
  if (emails.length > 0 && emails[0]) return emails[0]

  try {
    const res = await pcoFetch(tenant, `/people/v2/people/${encodeURIComponent(personId)}?include=emails`)
    if (!res.ok) return null
    const data = await res.json()
    const included = (data?.included ?? []) as Array<{ type?: string; attributes?: { address?: string } }>
    const emailInc = included.find((i) => i.type === 'Email' && i.attributes?.address)
    return emailInc?.attributes?.address ?? null
  } catch {
    return null
  }
}

interface LogFields {
  recipient: string | null
  sender: string | null
  status: LogStatus
  gmailMessageId: string | null
  error: string | null
}

// Upserts the send-log row, keyed by (client_id, message_type, card_id),
// the idempotency anchor. Re-checks for an existing 'sent' row immediately
// before writing: decideSend's `alreadySent` was computed earlier in the
// request, so a concurrent request could in principle have written 'sent' in
// between. This is the last-instant guard that a lower-status write (failed,
// blocked, suppressed, ...) can never clobber a real 'sent' row.
async function writeLog(db: Db, clientId: string, messageType: string, cardId: string, personId: string, fields: LogFields): Promise<void> {
  const { data: existing } = await db.from('grace_send_log')
    .select('status')
    .eq('client_id', clientId).eq('message_type', messageType).eq('card_id', cardId)
    .maybeSingle()
  if (existing?.status === 'sent') return

  const { error } = await db.from('grace_send_log').upsert({
    client_id: clientId,
    message_type: messageType,
    card_id: cardId,
    person_id: personId,
    recipient: fields.recipient,
    sender: fields.sender,
    status: fields.status,
    gmail_message_id: fields.gmailMessageId,
    error: fields.error,
  }, { onConflict: 'client_id,message_type,card_id' })
  if (error) console.error(`grace-send log write failed (${clientId}/${messageType}/${cardId}): ${error.message}`)
}

interface SendArgs {
  messageType: string
  cardId: string
  personId: string
  subject: string
  body: string
}

async function handleSend(db: Db, clientId: string, tenant: string, args: SendArgs): Promise<Response> {
  const { messageType, cardId, personId, subject, body: messageBody } = args

  // 2. Messaging settings (safe default if the row/column is empty).
  const { data: settingsRow } = await db.from('church_settings').select('messaging').eq('client_id', clientId).maybeSingle()
  const messaging = resolveMessaging(settingsRow?.messaging)

  // 3. Recipient resolution.
  const recipient = await resolveRecipientEmail(db, clientId, tenant, personId)
  const hasRecipient = !!recipient

  // 4. Guardrail state.
  const { data: existingRow } = await db.from('grace_send_log')
    .select('status')
    .eq('client_id', clientId).eq('message_type', messageType).eq('card_id', cardId)
    .maybeSingle()
  const alreadySent = existingRow?.status === 'sent'

  let suppressed = false
  if (recipient) {
    const { data: suppRow } = await db.from('grace_suppressions')
      .select('email').eq('client_id', clientId).eq('email', recipient).maybeSingle()
    suppressed = !!suppRow
  }

  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { count: sentLastHourCount } = await db.from('grace_send_log')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['sent', 'redirected_to_test'])
    .gte('created_at', hourAgo)
  const { count: sentLastDayCount } = await db.from('grace_send_log')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['sent', 'redirected_to_test'])
    .gte('created_at', dayAgo)

  // Church-local hour. hour12:false can format midnight as "24" in some ICU
  // builds, so normalize with % 24.
  const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: messaging.timezone, hour: 'numeric', hour12: false }).format(now)
  const nowHourLocal = parseInt(hourStr, 10) % 24

  const d = decideSend({
    enabled: messaging.enabled,
    testMode: messaging.testMode,
    alreadySent,
    suppressed,
    hasRecipient,
    sentLastHour: sentLastHourCount ?? 0,
    sentLastDay: sentLastDayCount ?? 0,
    ratePerHour: messaging.ratePerHour,
    ratePerDay: messaging.ratePerDay,
    nowHourLocal,
    quietStartHour: messaging.quietStartHour,
    quietEndHour: messaging.quietEndHour,
  })

  // Idempotency: a 'sent' row already exists for this key. Do not write
  // (would be a no-op anyway) and do not touch the sender lookup below.
  if (d.action === 'already_sent') {
    return json({ ok: true, status: d.action, detail: d.reason })
  }

  // 6. Sender: the church's default connected Gmail address.
  const { data: conn } = await db.from('google_connections')
    .select('connected_email')
    .eq('tenant_key', tenant)
    .eq('is_default', true)
    .maybeSingle()
  if (!conn) {
    await writeLog(db, clientId, messageType, cardId, personId, {
      recipient, sender: null, status: 'failed', gmailMessageId: null, error: 'no Google connection',
    })
    return json({ ok: true, status: 'failed', detail: 'no Google connection' })
  }
  const senderEmail = conn.connected_email as string

  // 7. Send or redirect-to-test.
  if (d.action === 'send' || d.action === 'redirect_to_test') {
    const toAddr = d.recipient === 'test' ? messaging.testRecipient : recipient
    if (!toAddr) {
      await writeLog(db, clientId, messageType, cardId, personId, {
        recipient, sender: senderEmail, status: 'failed', gmailMessageId: null, error: 'no test recipient configured',
      })
      return json({ ok: true, status: 'failed', detail: 'Test mode is on but no test recipient is configured.' })
    }

    const raw = base64UrlEncode(buildRfc822({ from: senderEmail, to: toAddr, subject, body: messageBody }))
    try {
      const accessToken = await getGoogleAccessToken(tenant, senderEmail)
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      if (!res.ok) {
        const errText = await res.text()
        await writeLog(db, clientId, messageType, cardId, personId, {
          recipient, sender: senderEmail, status: 'failed', gmailMessageId: null, error: `Gmail send failed (${res.status}): ${errText}`,
        })
        return json({ ok: true, status: 'failed', detail: `Gmail send failed (${res.status}).` })
      }
      const sent = (await res.json()) as { id?: string }
      const status = toLogStatus(d.action)
      await writeLog(db, clientId, messageType, cardId, personId, {
        recipient, sender: senderEmail, status, gmailMessageId: sent.id ?? null, error: null,
      })
      return json({ ok: true, status, detail: d.reason })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await writeLog(db, clientId, messageType, cardId, personId, {
        recipient, sender: senderEmail, status: 'failed', gmailMessageId: null, error: msg,
      })
      return json({ ok: true, status: 'failed', detail: msg })
    }
  }

  // Blocked / suppressed / rate_limited / deferred_quiet_hours: log and report.
  const status = toLogStatus(d.action)
  await writeLog(db, clientId, messageType, cardId, personId, {
    recipient, sender: senderEmail, status, gmailMessageId: null, error: null,
  })
  return json({ ok: true, status, detail: d.reason })
}

interface SendBody {
  tenant?: string
  messageType?: string
  cardId?: string
  personId?: string
  subject?: string
  body?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, status: 'failed', detail: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ ok: false, status: 'failed', detail: 'Missing Authorization' }, 401)

  let body: SendBody = {}
  try { body = await req.json() } catch {
    return json({ ok: false, status: 'failed', detail: 'Invalid JSON body' }, 400)
  }
  const { tenant, messageType, cardId, personId, subject, body: messageBody } = body
  if (!tenant || !messageType || !cardId || !personId || !subject || !messageBody) {
    return json({ ok: false, status: 'failed', detail: 'Missing required fields: tenant, messageType, cardId, personId, subject, body' }, 400)
  }

  const db = svc()
  const { data: client, error: clientErr } = await db.from('clients').select('id').eq('slug', tenant).maybeSingle()
  if (clientErr) return json({ ok: false, status: 'failed', detail: `lookup failed: ${clientErr.message}` }, 500)
  if (!client) return json({ ok: false, status: 'failed', detail: `Unknown tenant "${tenant}"` }, 404)

  // Tenant authz, mirrors pco-fetch: service role bypasses, else verify the
  // caller's JWT and re-resolve role/client_id/permission_scope server-side.
  // Admin OR (role 'client' AND client_id matches this tenant AND
  // permission_scope 'full') may trigger a send.
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ ok: false, status: 'failed', detail: 'Invalid auth token' }, 401)
    const { data: me } = await db.from('users').select('role, client_id, permission_scope').eq('id', userData.user.id).maybeSingle()
    const ok = me?.role === 'admin' || (me?.role === 'client' && me?.client_id === client.id && me?.permission_scope === 'full')
    if (!ok) return json({ ok: false, status: 'failed', detail: 'You do not have permission to send for this church.' }, 403)
  }

  try {
    return await handleSend(db, client.id as string, tenant, { messageType, cardId, personId, subject, body: messageBody })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`grace-send ${tenant} failed: ${msg}`)
    return json({ ok: false, status: 'failed', detail: msg })
  }
})
