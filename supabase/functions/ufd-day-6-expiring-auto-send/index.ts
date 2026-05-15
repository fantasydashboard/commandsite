// CommandSite · ufd-day-6-expiring-auto-send Edge Function
// ---------------------------------------------------------------------------
// Third email in the UFD trial lifecycle: trial-expires-tomorrow nudge.
// This is the single biggest conversion-lift email in the chain —
// industry benchmarks show 25-40% reply rate on well-written
// day-before-expiry founder emails. Fires for trial users whose
// trial_expires_at is 12-36 hours from now.
//
// Key design choices (research-backed):
//   • Direct framing ("trial wraps up tomorrow") beats clever
//   • No pricing mention, no upgrade CTA button
//   • Open-ended reply invite — extracts WHY they didn't convert
//   • Plain text only

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

const STEP_KEY = 'day_6_expiring'
const SUBJECT = 'heads up — trial ends tomorrow'
const BATCH_CAP = 20

// Trial expires window: between 12h and 36h from now (i.e., "tomorrow")
const EXPIRES_WINDOW_MIN_HOURS = 12
const EXPIRES_WINDOW_MAX_HOURS = 36

function emailBody(firstName: string): string {
  const opener = firstName ? `Hey ${firstName},` : 'Hey,'
  return `${opener}

Josh — your UFD trial wraps up tomorrow. No pressure, just wanted you to know in case you wanted to keep going.

If something's missing or feels off, hit reply with one sentence. I might be able to fix it before you decide.

— Josh`
}

function extractFirstName(fullName: string | undefined | null, email: string): string {
  if (fullName && fullName.trim()) {
    const first = fullName.trim().split(/\s+/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }
  const local = email.split('@')[0]
  if (/^[a-zA-Z]+$/.test(local) && local.length >= 2 && local.length <= 20) {
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
  }
  return ''
}

interface UfdUserRow {
  email: string
  full_name?: string
  signup_date?: string
  trial_expires_at?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Pull current trial users
  const ufdRes = await fetch(`${SUPABASE_URL}/functions/v1/ufd-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ cohort: 'free_trial' }),
  })
  if (!ufdRes.ok) {
    return json({ error: `ufd-users: ${ufdRes.status} ${await ufdRes.text()}` }, 502)
  }
  const ufdData = await ufdRes.json() as { rows?: UfdUserRow[] }
  const allTrials = (ufdData.rows ?? []) as UfdUserRow[]

  // Window: trial_expires_at is 12-36h from now
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const minMs = now + EXPIRES_WINDOW_MIN_HOURS * hour
  const maxMs = now + EXPIRES_WINDOW_MAX_HOURS * hour
  const inWindow = allTrials.filter((u) => {
    if (!u.trial_expires_at) return false
    const t = new Date(u.trial_expires_at).getTime()
    return t >= minMs && t <= maxMs
  })

  if (inWindow.length === 0) {
    return json({
      processed: 0,
      sent: 0,
      message: `No trials expiring in the ${EXPIRES_WINDOW_MIN_HOURS}-${EXPIRES_WINDOW_MAX_HOURS}h window`,
    })
  }

  // Dedup against already-sent
  const emails = inWindow.map((u) => u.email.toLowerCase())
  const { data: alreadySent } = await admin
    .from('ufd_lifecycle_email_log')
    .select('user_email')
    .eq('step', STEP_KEY)
    .in('user_email', emails)
  const alreadySentSet = new Set<string>(
    ((alreadySent ?? []) as { user_email: string }[]).map((r) => r.user_email.toLowerCase()),
  )
  const toSend = inWindow
    .filter((u) => !alreadySentSet.has(u.email.toLowerCase()))
    .slice(0, BATCH_CAP)

  if (toSend.length === 0) {
    return json({
      processed: inWindow.length,
      sent: 0,
      skipped_already_sent: inWindow.length,
    })
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const user of toSend) {
    const firstName = extractFirstName(user.full_name, user.email)
    const body = emailBody(firstName)
    let messageId: string | null = null
    let sendErr: string | null = null
    try {
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ to: user.email, subject: SUBJECT, body, tenant: 'ufd' }),
      })
      const result = await sendRes.json() as { ok?: boolean; message_id?: string; error?: string }
      if (!sendRes.ok || !result.ok) sendErr = `gmail-send: ${result.error ?? sendRes.statusText}`
      else messageId = result.message_id ?? null
    } catch (err) {
      sendErr = err instanceof Error ? err.message : String(err)
    }
    await admin.from('ufd_lifecycle_email_log').insert({
      user_email: user.email.toLowerCase(),
      user_name: user.full_name ?? null,
      step: STEP_KEY,
      sent_at: new Date().toISOString(),
      message_id: messageId,
      source: 'lifecycle_cron',
      error: sendErr,
    })
    if (sendErr) { failed++; errors.push(`${user.email}: ${sendErr}`) }
    else sent++
  }

  return json({
    step: STEP_KEY,
    processed: inWindow.length,
    sent,
    failed,
    skipped_already_sent: inWindow.length - toSend.length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
