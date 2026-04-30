// CommandSite ufd-email-backfill Edge Function
// ---------------------------------------------------------------------------
// Admin-only one-shot: pulls historical emails from Resend's /emails list
// and seeds public.ufd_email_events with synthesized rows so the engagement
// columns on the cohort modals have data *before* webhook-captured events
// accumulate.
//
// Resend /emails only surfaces `last_event` per email (the latest state),
// not the full event trail. We insert ONE synthesized row per email using
// that last_event — good enough to power per-user "last received" / "last
// opened" lookups. svix_id is namespaced to "backfill:<email_id>" so it
// never collides with real webhook deliveries.
//
// Auth:   Authorization: Bearer <supabase-user-jwt> (admin only)
// Body:   { days?: number }   — how far back to walk Resend, default 180
// Secrets: UFD_RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

interface ResendEmail {
  id: string
  to: string[]
  from: string
  subject: string
  created_at: string
  last_event: string
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
    .select('role, client_id')
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
  if (!allowed) return json({ error: 'Not allowed' }, 403)

  let body: { days?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body ok */
  }
  const days = Math.min(Math.max(body.days ?? 180, 1), 365)
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000

  const apiKey = Deno.env.get('UFD_RESEND_API_KEY')
  if (!apiKey) return json({ error: 'Resend API key not configured' }, 500)

  // Pull all pages of /emails back to the cutoff (newest-first).
  const all: ResendEmail[] = []
  const MAX_PAGES = 50 // 50 × 100 = 5000 email ceiling; UFD is well below this
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await new Promise((r) => setTimeout(r, 250))
    const url = new URL('https://api.resend.com/emails')
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('after', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Resend ${res.status}: ${text.slice(0, 200)}` }, 502)
    }
    const body: { data: ResendEmail[]; has_more?: boolean } = await res.json()
    const rows = body.data ?? []
    if (rows.length === 0) break

    let stopped = false
    for (const row of rows) {
      if (new Date(row.created_at).getTime() < cutoffMs) {
        stopped = true
        break
      }
      all.push(row)
    }
    if (stopped) break
    if (!body.has_more) break
    cursor = rows[rows.length - 1].id
  }

  // Build event rows. Translate last_event into a consistent event_type
  // the aggregator in ufd-users understands.
  const rows = all.map((e) => {
    const event_type =
      e.last_event === 'sent' || e.last_event === 'delivery_delayed'
        ? 'sent'
        : e.last_event
    const recipient = Array.isArray(e.to) ? e.to[0] : e.to
    return {
      svix_id: `backfill:${e.id}`,
      email_id: e.id,
      event_type,
      recipient: (recipient ?? '').toString().toLowerCase(),
      subject: e.subject ?? null,
      from_address: e.from ?? null,
      click_url: null,
      occurred_at: e.created_at,
      payload: { backfill: true, source: 'resend /emails list', last_event: e.last_event },
    }
  })

  // Insert in chunks; ignore unique-constraint collisions so the endpoint
  // is safe to re-run.
  let inserted = 0
  let skipped = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { data, error } = await admin
      .from('ufd_email_events')
      .upsert(slice, { onConflict: 'svix_id', ignoreDuplicates: true })
      .select('id')
    if (error) {
      return json(
        { error: `Insert failed: ${error.message}`, inserted },
        500,
      )
    }
    const added = data?.length ?? 0
    inserted += added
    skipped += slice.length - added
  }

  return json({
    scanned: all.length,
    inserted,
    skipped,
    days,
  })
})
