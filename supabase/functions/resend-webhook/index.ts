// CommandSite resend-webhook Edge Function
// ---------------------------------------------------------------------------
// Public endpoint hit by Resend (via Svix) when an email event fires.
// Verifies the Svix signature against UFD_RESEND_WEBHOOK_SECRET, then
// inserts the event into public.ufd_email_events. Deploy with
// `--no-verify-jwt` — this endpoint is intentionally unauthenticated at
// the gateway level; security is the signature check.
//
// Secrets expected:
//   UFD_RESEND_WEBHOOK_SECRET  — "whsec_..." value from the Resend webhook UI
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

// Verify Svix signature: HMAC-SHA256 of `{id}.{timestamp}.{body}` using
// the raw secret bytes (secret is stored as `whsec_<base64>`). The
// signature header holds space-separated `v1,<base64>` entries — any
// match wins.
async function verifySvix(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): Promise<boolean> {
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const message = new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`)
  const sig = await crypto.subtle.sign('HMAC', key, message)
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

  const presented = svixSignature
    .split(' ')
    .map((chunk) => chunk.split(',')[1])
    .filter(Boolean)
  return presented.some((s) => s === expected)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const secret = Deno.env.get('UFD_RESEND_WEBHOOK_SECRET')
  if (!secret) return new Response('Webhook secret not configured', { status: 500 })

  const body = await req.text()

  // Reject events with a >5min timestamp skew to prevent replay attacks.
  const now = Math.floor(Date.now() / 1000)
  const ts = Number.parseInt(svixTimestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) {
    return new Response('Timestamp out of tolerance', { status: 400 })
  }

  const valid = await verifySvix(secret, svixId, svixTimestamp, svixSignature, body)
  if (!valid) return new Response('Invalid signature', { status: 401 })

  // deno-lint-ignore no-explicit-any
  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventType = typeof event.type === 'string'
    ? event.type.replace(/^email\./, '')
    : 'unknown'
  const data = event.data ?? {}
  const recipient = Array.isArray(data.to) ? data.to[0] : data.to
  const clickUrl = data.click?.link ?? data.click?.url ?? null

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { error } = await admin.from('ufd_email_events').insert({
    svix_id: svixId,
    email_id: data.email_id ?? data.id ?? svixId,
    event_type: eventType,
    recipient: (recipient ?? '').toString().toLowerCase(),
    subject: data.subject ?? null,
    from_address: data.from ?? null,
    click_url: clickUrl,
    occurred_at: event.created_at ?? new Date().toISOString(),
    payload: event,
  })

  if (error) {
    // Duplicate svix_id → already processed, ack cleanly so Resend stops retrying.
    if (error.code === '23505') return new Response('ok (duplicate)', { status: 200 })
    console.error('ufd_email_events insert failed:', error)
    return new Response(`Insert failed: ${error.message}`, { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
