// CommandSite ufd-user-emails Edge Function
// ---------------------------------------------------------------------------
// Returns the email event history for a single recipient so the cohort
// modal can expand an inline drill-down per user. Only the events we
// already have locally (ufd_email_events) — populated by the webhook and
// the backfill — are returned; no Resend API round-trip is made here.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.
// Body:   { recipient: string }
// Resp:   { recipient, emails: [{ email_id, subject, occurred_at, events: [{ event_type, occurred_at, click_url }] }] }

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: profile } = await admin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!profile) return json({ error: 'Profile not found' }, 403)

  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await admin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  const allowed = profile.role === 'admin' || profile.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  let body: { recipient?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const recipient = (body.recipient ?? '').toString().trim().toLowerCase()
  if (!recipient) return json({ error: 'Missing recipient' }, 400)

  const { data: events, error: eventsErr } = await admin
    .from('ufd_email_events')
    .select('email_id, event_type, subject, occurred_at, click_url')
    .eq('recipient', recipient)
    .order('occurred_at', { ascending: false })
    .limit(500)

  if (eventsErr) return json({ error: `events query: ${eventsErr.message}` }, 500)

  // Group events by email_id so the UI can show one row per email with its
  // latest status + expandable event trail.
  interface EmailRollup {
    email_id: string
    subject: string | null
    first_seen: string
    latest_status: string
    opened: boolean
    clicked: boolean
    events: {
      event_type: string
      occurred_at: string
      click_url: string | null
    }[]
  }
  const STATUS_ORDER: Record<string, number> = {
    sent: 1,
    delivery_delayed: 2,
    delivered: 3,
    opened: 4,
    clicked: 5,
    bounced: 6,
    complained: 7,
  }

  const byEmail = new Map<string, EmailRollup>()
  for (const ev of events ?? []) {
    let roll = byEmail.get(ev.email_id)
    if (!roll) {
      roll = {
        email_id: ev.email_id,
        subject: ev.subject,
        first_seen: ev.occurred_at,
        latest_status: ev.event_type,
        opened: false,
        clicked: false,
        events: [],
      }
      byEmail.set(ev.email_id, roll)
    }
    roll.events.push({
      event_type: ev.event_type,
      occurred_at: ev.occurred_at,
      click_url: ev.click_url ?? null,
    })
    if (ev.subject && !roll.subject) roll.subject = ev.subject
    if (ev.occurred_at < roll.first_seen) roll.first_seen = ev.occurred_at
    if ((STATUS_ORDER[ev.event_type] ?? 0) > (STATUS_ORDER[roll.latest_status] ?? 0)) {
      roll.latest_status = ev.event_type
    }
    if (ev.event_type === 'opened' || ev.event_type === 'clicked') roll.opened = true
    if (ev.event_type === 'clicked') roll.clicked = true
  }

  const emails = Array.from(byEmail.values()).sort((a, b) =>
    b.first_seen.localeCompare(a.first_seen),
  )

  return json({ recipient, emails })
})
