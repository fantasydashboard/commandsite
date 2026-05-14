// CommandSite · ufd-welcome-auto-send Edge Function
// ---------------------------------------------------------------------------
// Auto-sends the founder welcome email to every new UFD trial signup
// within ~5 minutes of their signup. Fired by pg_cron every 5 min;
// can also be triggered manually for testing.
//
// Flow each tick:
//   1. Pull UFD free_trial users via ufd-users (separate Supabase project)
//   2. Filter to users whose signup_date is in the last 2 hours (the
//      buffer catches any signups missed by previous cron ticks; the
//      ufd_welcome_log table prevents double-sends regardless)
//   3. Filter out users already in ufd_welcome_log (uniqued by email)
//   4. For each remaining: build template with first-name substitution,
//      call gmail-send, insert into ufd_welcome_log on success.
//
// Template is FIXED — no LLM call per send. Why: the welcome email's
// power comes from the question (sport + format), not personalization
// beyond first name. Free, instant, predictable.

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

const SIGNUP_LOOKBACK_HOURS = 2
const BATCH_CAP = 20  // safety: never send more than 20 in one tick

const WELCOME_SUBJECT = 'welcome to ufd + 1 question'

function welcomeBody(firstName: string): string {
  const opener = firstName ? `Hey ${firstName},` : 'Hey there,'
  return `${opener}

Josh here — I built UFD. Thanks for trying it out.

Quick question while you're poking around: what sport(s) are you playing this year, and what format — redraft, dynasty, keeper, points, etc.? Helps me know which features you're most likely to live in.

Hit reply with whatever fits. I read every one.

— Josh`
}

function extractFirstName(fullName: string | undefined | null, email: string): string {
  if (fullName && fullName.trim()) {
    const first = fullName.trim().split(/\s+/)[0]
    // Capitalize first letter
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }
  // Fall back to email local-part if it looks like a first name
  const local = email.split('@')[0]
  if (/^[a-zA-Z]+$/.test(local) && local.length >= 2 && local.length <= 20) {
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
  }
  return ''  // Triggers "Hey there," opener
}

interface UfdUserRow {
  email: string
  full_name?: string
  signup_date?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Step 1: pull recent UFD free_trial signups
  // Call ufd-users with cohort='free_trial' (uses UFD's separate Supabase).
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

  // ── Step 2: filter to recent signups
  const cutoffMs = Date.now() - SIGNUP_LOOKBACK_HOURS * 60 * 60 * 1000
  const recent = allTrials.filter((u) => {
    if (!u.signup_date) return false
    return new Date(u.signup_date).getTime() >= cutoffMs
  })

  if (recent.length === 0) {
    return json({
      processed: 0,
      sent: 0,
      skipped_already_sent: 0,
      message: 'No trial signups in lookback window',
      lookback_hours: SIGNUP_LOOKBACK_HOURS,
    })
  }

  // ── Step 3: filter out already-sent recipients
  const emails = recent.map((u) => u.email.toLowerCase())
  const { data: alreadySent } = await admin
    .from('ufd_welcome_log')
    .select('user_email')
    .in('user_email', emails)
  const alreadySentSet = new Set<string>(
    ((alreadySent ?? []) as { user_email: string }[]).map((r) => r.user_email.toLowerCase()),
  )

  const toSend = recent
    .filter((u) => !alreadySentSet.has(u.email.toLowerCase()))
    .slice(0, BATCH_CAP)

  if (toSend.length === 0) {
    return json({
      processed: recent.length,
      sent: 0,
      skipped_already_sent: recent.length,
      message: 'All recent signups already received the welcome',
    })
  }

  // ── Step 4: send + log per user
  const errors: string[] = []
  let sent = 0
  let failed = 0

  for (const user of toSend) {
    const firstName = extractFirstName(user.full_name, user.email)
    const subject = WELCOME_SUBJECT
    const body = welcomeBody(firstName)

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
      if (!sendRes.ok || !result.ok) {
        sendErr = `gmail-send: ${result.error ?? sendRes.statusText}`
      } else {
        messageId = result.message_id ?? null
      }
    } catch (err) {
      sendErr = err instanceof Error ? err.message : String(err)
    }

    // Always log — success rows track delivery, failure rows prevent
    // retry storms on a broken send. Manual cleanup if Josh wants
    // to retry a failed welcome.
    await admin
      .from('ufd_welcome_log')
      .insert({
        user_email: user.email.toLowerCase(),
        user_name: user.full_name ?? null,
        user_signup_date: user.signup_date ?? null,
        sent_at: new Date().toISOString(),
        message_id: messageId,
        source: 'welcome_cron',
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
    processed: recent.length,
    sent,
    failed,
    skipped_already_sent: recent.length - toSend.length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
