// CommandSite · ufd-day-3-check-auto-send Edge Function
// ---------------------------------------------------------------------------
// Second email in the UFD trial lifecycle: a universal "still poking
// around?" stuck-check sent 2-4 days after signup. Fixed template,
// firstName + UFD-named, no LLM call per send.
//
// TODO (revisit when activity data is available):
//   Currently this sends to ALL trial users in the window — universal
//   stuck check. Once we wire login + cards-made data from UFD, fork
//   this into Option B from the research:
//     • Users who never logged in: "anything blocking you on the way in?"
//     • Users who logged in but no cards: "fastest way to feel UFD..."
//     • Users actively using it: skip the lifecycle email entirely
//   Today we don't have that data, so universal it is. See
//   memory/ufd_lifecycle_email_roadmap.md
//
// Cron schedule: every 30 minutes (mig 0049). Less frequent than
// welcome (5 min) since the day-3 window is wider.

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

// Window: signed up 2-4 days ago. Wide enough that a missed cron tick
// still catches them on the next run; narrow enough that we don't
// hit them too late.
const WINDOW_MIN_DAYS = 2
const WINDOW_MAX_DAYS = 4
const BATCH_CAP = 20

const STEP_KEY = 'day_3_check'
const SUBJECT = 'still poking around?'

function emailBody(firstName: string): string {
  const opener = firstName ? `Hey ${firstName},` : 'Hey,'
  return `${opener}

Josh from UFD — you're a couple days in. Anything getting in your way, or any feature you can't figure out?

Hit reply with whatever. I read every one.

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
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Pull current trial users (only people still in trial get the
  // Day-3 nudge — converted/expired users skip it automatically by
  // being in a different cohort).
  const ufdUsersUrl = `${SUPABASE_URL}/functions/v1/ufd-users`
  const ufdRes = await fetch(ufdUsersUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ cohort: 'free_trial' }),
  })
  if (!ufdRes.ok) {
    return json({ error: `ufd-users returned ${ufdRes.status}: ${await ufdRes.text()}` }, 502)
  }
  const ufdData = await ufdRes.json() as { rows?: UfdUserRow[] }
  const allTrials = (ufdData.rows ?? []) as UfdUserRow[]

  // ── Filter to the 2-4 day window
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  const minMs = now - WINDOW_MAX_DAYS * day
  const maxMs = now - WINDOW_MIN_DAYS * day
  const inWindow = allTrials.filter((u) => {
    if (!u.signup_date) return false
    const t = new Date(u.signup_date).getTime()
    return t >= minMs && t <= maxMs
  })

  if (inWindow.length === 0) {
    return json({
      processed: 0,
      sent: 0,
      skipped_already_sent: 0,
      message: `No trial users in day ${WINDOW_MIN_DAYS}-${WINDOW_MAX_DAYS} window`,
    })
  }

  // ── Filter out users who already got the Day-3 check
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
      message: 'All eligible users already received the Day 3 check',
    })
  }

  // ── Send + log
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
      if (!sendRes.ok || !result.ok) {
        sendErr = `gmail-send: ${result.error ?? sendRes.statusText}`
      } else {
        messageId = result.message_id ?? null
      }
    } catch (err) {
      sendErr = err instanceof Error ? err.message : String(err)
    }

    await admin
      .from('ufd_lifecycle_email_log')
      .insert({
        user_email: user.email.toLowerCase(),
        user_name: user.full_name ?? null,
        step: STEP_KEY,
        sent_at: new Date().toISOString(),
        message_id: messageId,
        source: 'lifecycle_cron',
        error: sendErr,
      })

    if (sendErr) {
      failed++
      errors.push(`${user.email}: ${sendErr}`)
    } else {
      sent++
    }
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
