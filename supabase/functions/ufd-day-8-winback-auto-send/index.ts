// CommandSite · ufd-day-8-winback-auto-send Edge Function
// ---------------------------------------------------------------------------
// Fourth email in the UFD trial lifecycle: post-expiry winback +
// feedback extraction. Fires 1-3 days after a trial expires for users
// who didn't convert. Reads from `at_risk` cohort (trial expired ≤21d,
// no payment yet).
//
// Goal isn't conversion — it's data. Users who didn't convert often
// tell you WHY when asked simply, and that's the highest-value signal
// for product decisions. Mirrors the feedback-ask pattern from
// CommandSite cold-outreach Touch 3.
//
// Conscious decision: NO discount offered. Discounts at this stage
// signal desperation and train future users to expect them.

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

const STEP_KEY = 'day_8_winback'
const BATCH_CAP = 20

// Window: trial expired 1-3 days ago
const EXPIRED_WINDOW_MIN_DAYS = 1
const EXPIRED_WINDOW_MAX_DAYS = 3

function subjectFor(firstName: string): string {
  return firstName ? `quick favor, ${firstName.toLowerCase()}?` : 'quick favor?'
}

function emailBody(firstName: string): string {
  const opener = firstName ? `Hey ${firstName},` : 'Hey,'
  return `${opener}

Josh — your trial wrapped up. No worries either way.

If you've got 10 seconds though: what was the thing that didn't click? Bad timing, missing feature, just busy? Helps me not waste people's inbox going forward.

Door's open if anything changes.

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

  // Pull at_risk users (trial expired ≤21d, no payment)
  const ufdRes = await fetch(`${SUPABASE_URL}/functions/v1/ufd-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ cohort: 'at_risk' }),
  })
  if (!ufdRes.ok) {
    return json({ error: `ufd-users: ${ufdRes.status} ${await ufdRes.text()}` }, 502)
  }
  const ufdData = await ufdRes.json() as { rows?: UfdUserRow[] }
  const allAtRisk = (ufdData.rows ?? []) as UfdUserRow[]

  // Window: trial_expires_at was 1-3 days ago
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  const minMs = now - EXPIRED_WINDOW_MAX_DAYS * day
  const maxMs = now - EXPIRED_WINDOW_MIN_DAYS * day
  const inWindow = allAtRisk.filter((u) => {
    if (!u.trial_expires_at) return false
    const t = new Date(u.trial_expires_at).getTime()
    return t >= minMs && t <= maxMs
  })

  if (inWindow.length === 0) {
    return json({
      processed: 0,
      sent: 0,
      message: `No at-risk users with trial expired ${EXPIRED_WINDOW_MIN_DAYS}-${EXPIRED_WINDOW_MAX_DAYS}d ago`,
    })
  }

  // Dedup
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
    const subject = subjectFor(firstName)
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
        body: JSON.stringify({ to: user.email, subject, body }),
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
