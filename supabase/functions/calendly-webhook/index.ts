// CommandSite · calendly-webhook Edge Function
// ---------------------------------------------------------------------------
// Receives Calendly webhook events. Two event types we care about:
//
//   - invitee.created  — someone booked a call. Create cs_deals row,
//                        link to matching cs_lead by email, build the
//                        custom demo URL automatically, flip lead
//                        status to 'replied' (if not already past it).
//   - invitee.canceled — they backed out. Mark deal as canceled.
//
// Calendly signs every webhook with HMAC-SHA256. We verify before
// processing so randos can't spoof bookings.
//
// Setup steps (Josh's todos):
//   1. Calendly account + create the 15-min event type
//   2. Generate API token in Calendly settings
//   3. Subscribe to webhooks pointing at this Edge Function URL
//      (set scope to invitee.created + invitee.canceled)
//   4. Set CALENDLY_WEBHOOK_SIGNING_KEY in Supabase secrets — the
//      key Calendly returns when you create the subscription
//
// Auth:    Calendly's HMAC signature (X-Calendly-Webhook-Signature)
// Body:    Calendly webhook payload (event + payload)
// Returns: 200 on success, 401 on bad signature, 4xx on bad payload
// Secrets: CALENDLY_WEBHOOK_SIGNING_KEY, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-calendly-webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// HMAC-SHA256 verification of Calendly's webhook signature.
// Header format: "t=<unix-secs>,v1=<hex-digest>"
async function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string,
  signingKey: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split('=')
    if (k && v) acc[k.trim()] = v.trim()
    return acc
  }, {})
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  // Reject signatures older than 5 minutes (replay protection)
  const ageSecs = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (Math.abs(ageSecs) > 300) return false

  const payload = `${timestamp}.${rawBody}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

interface CalendlyInvitee {
  email: string
  name?: string
  uri: string  // calendly invitee URI
}

interface CalendlyEvent {
  uri: string                     // calendly event URI (the booking)
  start_time: string
  end_time: string
  // deno-lint-ignore no-explicit-any
  event_type?: any
}

interface CalendlyPayload {
  event: 'invitee.created' | 'invitee.canceled' | string
  payload: {
    event?: CalendlyEvent
    invitee?: CalendlyInvitee
    scheduled_event?: CalendlyEvent       // some payload variants nest it
    // deno-lint-ignore no-explicit-any
    [key: string]: any
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const signingKey = Deno.env.get('CALENDLY_WEBHOOK_SIGNING_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!signingKey) return json({ error: 'Server missing CALENDLY_WEBHOOK_SIGNING_KEY' }, 500)

  // Read raw body (need exact bytes for signature verification)
  const rawBody = await req.text()
  const signature = req.headers.get('Calendly-Webhook-Signature')
    ?? req.headers.get('calendly-webhook-signature') ?? ''
  const valid = await verifyCalendlySignature(rawBody, signature, signingKey)
  if (!valid) {
    console.warn('[calendly-webhook] invalid signature')
    return json({ error: 'Invalid signature' }, 401)
  }

  let body: CalendlyPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const event = body.payload?.event ?? body.payload?.scheduled_event
  const invitee = body.payload?.invitee

  if (!event || !invitee?.email) {
    return json({ error: 'Missing event/invitee in payload' }, 400)
  }

  // ── Find matching cs_lead by email ────────────────────────────────
  const { data: lead } = await admin
    .from('cs_leads')
    .select('id, company_name, contact_name, contact_email, industry, city, state')
    .eq('contact_email', invitee.email.toLowerCase())
    .maybeSingle()

  // ── Build the auto-prepared demo URL ──────────────────────────────
  // Same pattern as the manual modal — picks template by industry.
  function templateForIndustry(industry: string | null): string {
    const i = (industry ?? '').toLowerCase()
    if (i.includes('church') || i.includes('ministry')) return 'cornerstone-church'
    return 'apex-heating-and-air'
  }

  const company = (lead as { company_name?: string } | null)?.company_name
    ?? invitee.name ?? invitee.email.split('@')[0]
  const industry = (lead as { industry?: string } | null)?.industry ?? null
  const city = (lead as { city?: string } | null)?.city ?? null
  const state = (lead as { state?: string } | null)?.state ?? null

  const params = new URLSearchParams({ demo_company: company })
  if (industry) params.set('demo_industry', industry)
  if (city) params.set('demo_city', city)
  if (state) params.set('demo_state', state)
  const demoUrl = `https://commandsite.io/dashboard/${templateForIndustry(industry)}?${params.toString()}`

  if (body.event === 'invitee.created') {
    // Check for an existing deal with this calendly_event_id (replay protection)
    const { data: existing } = await admin
      .from('cs_deals')
      .select('id')
      .eq('calendly_event_id', event.uri)
      .maybeSingle()
    if (existing) {
      return json({ ok: true, message: 'Already recorded', deal_id: (existing as { id: string }).id })
    }

    const dealPayload = {
      lead_id: (lead as { id?: string } | null)?.id ?? null,
      company_name: company,
      contact_name: invitee.name ?? '',
      contact_email: invitee.email,
      industry: industry,
      city: city,
      state: state,
      stage: 'demo_booked',
      source: lead ? 'cold_email' : 'inbound_demo',
      next_action: 'Run the discovery call',
      next_action_due_at: event.start_time,
      last_touch_at: new Date().toISOString(),
      last_touch_kind: 'meeting',
      stage_entered_at: new Date().toISOString(),
      calendly_event_id: event.uri,
      calendly_event_uri: event.uri,
      calendly_invitee_uri: invitee.uri,
      scheduled_at: event.start_time,
      scheduled_call_duration_min: event.start_time && event.end_time
        ? Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60_000)
        : null,
      discovery_demo_url: demoUrl,
    }

    const { data: inserted, error: insErr } = await admin
      .from('cs_deals').insert(dealPayload as never).select('id').single()
    if (insErr) {
      console.error('[calendly-webhook] insert failed:', insErr.message)
      return json({ error: `DB write: ${insErr.message}` }, 500)
    }

    // Update lead status if applicable
    if (lead) {
      await admin.from('cs_leads')
        .update({ status: 'replied' } as never)
        .eq('id', (lead as { id: string }).id)
    }

    return json({
      ok: true,
      event: 'invitee.created',
      deal_id: (inserted as { id: string }).id,
      lead_matched: !!lead,
    })
  }

  if (body.event === 'invitee.canceled') {
    const { data: existing } = await admin
      .from('cs_deals')
      .select('id, stage')
      .eq('calendly_event_id', event.uri)
      .maybeSingle()
    if (!existing) {
      return json({ ok: true, message: 'No matching deal to cancel' })
    }
    await admin.from('cs_deals').update({
      stage: 'closed_lost',
      next_action: 'Demo canceled by prospect',
      last_touch_at: new Date().toISOString(),
      last_touch_kind: 'meeting',
    } as never).eq('id', (existing as { id: string }).id)
    return json({ ok: true, event: 'invitee.canceled', deal_id: (existing as { id: string }).id })
  }

  return json({ ok: true, message: `Event ${body.event} ignored` })
})
