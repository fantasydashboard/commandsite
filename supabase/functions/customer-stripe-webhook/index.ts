// CommandSite · customer-stripe-webhook Edge Function
// ---------------------------------------------------------------------------
// Receives Stripe webhook events for customer onboarding. We care about one:
//
//   - checkout.session.completed — a client paid via their founding payment
//     link. Match them to their cs_customers row by the email they paid with,
//     then stamp payment_received_at + payment_method='stripe' +
//     payment_reference (subscription id). That flips the "First payment
//     received" task in the onboarding drawer automatically (see
//     src/lib/clients/commandsite/onboarding.ts, 'paid' stage).
//
// The stage machine is left alone on purpose: this only records the payment
// fact. The operator advances stages per the gates (contract, etc.).
//
// Stripe signs every webhook with HMAC-SHA256 over `${t}.${rawBody}` using the
// endpoint's signing secret (whsec_...). Same scheme as the Calendly webhook,
// so we verify it inline with no Stripe SDK dependency.
//
// Setup steps (Josh's todos):
//   1. Stripe → Developers → Webhooks → Add endpoint
//      URL: https://<project-ref>.supabase.co/functions/v1/customer-stripe-webhook
//      Event: checkout.session.completed
//   2. Copy the endpoint's Signing secret (whsec_...)
//   3. supabase secrets set STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...
//   4. supabase functions deploy customer-stripe-webhook
//   5. Use Stripe's "Send test webhook" (or a test-mode payment) to verify.
//
// Auth:    Stripe's HMAC signature (Stripe-Signature header)
// Returns: 200 on success or ignorable event, 401 on bad signature
// Secrets: STRIPE_WEBHOOK_SIGNING_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Verify Stripe's signature. Header format: "t=<unix-secs>,v1=<hex>,v1=<hex>..."
// Signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret.
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  signingSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  let timestamp = ''
  const v1: string[] = []
  for (const part of signatureHeader.split(',')) {
    const [k, val] = part.split('=')
    if (k?.trim() === 't') timestamp = val?.trim() ?? ''
    if (k?.trim() === 'v1' && val) v1.push(val.trim())
  }
  if (!timestamp || v1.length === 0) return false

  // Replay protection: reject signatures older than 5 minutes.
  const ageSecs = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (Math.abs(ageSecs) > 300) return false

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`))
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return v1.some((sig) => sig === expected)
}

interface Contact {
  email?: string
  name?: string
  primary?: boolean
}

interface CustomerRow {
  id: string
  org_name: string
  contacts: Contact[]
  payment_received_at: string | null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const signingSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!signingSecret) return json({ error: 'Server missing STRIPE_WEBHOOK_SIGNING_SECRET' }, 500)

  // Raw body needed for exact-bytes signature verification.
  const rawBody = await req.text()
  const signature = req.headers.get('Stripe-Signature') ?? req.headers.get('stripe-signature') ?? ''
  const valid = await verifyStripeSignature(rawBody, signature, signingSecret)
  if (!valid) {
    console.warn('[customer-stripe-webhook] invalid signature')
    return json({ error: 'Invalid signature' }, 401)
  }

  // deno-lint-ignore no-explicit-any
  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // We only act on the initial paid checkout. Everything else is a no-op 200
  // so Stripe doesn't retry-storm.
  if (event.type !== 'checkout.session.completed') {
    return json({ ok: true, message: `Event ${event.type} ignored` })
  }

  const session = event.data?.object ?? {}
  const email: string | null =
    session.customer_details?.email ?? session.customer_email ?? null
  const paymentRef: string | null =
    (typeof session.subscription === 'string' ? session.subscription : null) ?? session.id ?? null

  if (!email) {
    console.warn('[customer-stripe-webhook] no email on session', session.id)
    return json({ ok: true, matched: false, reason: 'no email on session' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Pull customers still in onboarding (small set) and match the paying email
  // case-insensitively across their contacts. Avoids jsonb-casing pitfalls.
  const { data: rows, error: fetchErr } = await admin
    .from('cs_customers')
    .select('id, org_name, contacts, payment_received_at')
    .not('onboarding_stage', 'is', null)
  if (fetchErr) {
    console.error('[customer-stripe-webhook] fetch failed:', fetchErr.message)
    return json({ error: `DB read: ${fetchErr.message}` }, 500)
  }

  const target = (rows as CustomerRow[] | null)?.find((c) =>
    (c.contacts ?? []).some((ct) => (ct.email ?? '').trim().toLowerCase() === email.toLowerCase()),
  )

  if (!target) {
    // No match: client paid before the operator created their record, or used
    // a different email. The operator will see the payment in Stripe and can
    // mark it manually in the drawer. 200 so Stripe stops retrying.
    console.warn('[customer-stripe-webhook] no cs_customer matched email', email)
    return json({ ok: true, matched: false, email })
  }

  if (target.payment_received_at) {
    return json({ ok: true, matched: true, already_recorded: true, customer_id: target.id })
  }

  const { error: updErr } = await admin
    .from('cs_customers')
    .update({
      payment_received_at: new Date().toISOString(),
      payment_method: 'stripe',
      payment_reference: paymentRef,
    } as never)
    .eq('id', target.id)
  if (updErr) {
    console.error('[customer-stripe-webhook] update failed:', updErr.message)
    return json({ error: `DB write: ${updErr.message}` }, 500)
  }

  return json({ ok: true, matched: true, customer_id: target.id, org_name: target.org_name })
})
