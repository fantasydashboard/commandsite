// CommandSite ufd-user-detail Edge Function
// ---------------------------------------------------------------------------
// Aggregator for the unified User Detail Drawer. Given an email address
// (the natural key that ties UFD profiles, Stripe customers, and Resend
// events together), returns a single combined response so the drawer can
// render in one round-trip:
//
//   - UFD profile      (UFD Supabase, service-role)
//   - Stripe customer  (lookup by email, then subs + charges history)
//   - Email events     (CommandSite's ufd_email_events, joined per-email_id)
//   - Notes            (CommandSite's user_notes)
//   - Aggregate stats  (lifetime spend, total emails, last activity)
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.
// Body:   { email: string }
// Secrets expected (already configured for prior UFD functions):
//   UFD_SUPABASE_URL, UFD_SERVICE_ROLE_KEY, UFD_STRIPE_SECRET_KEY,
//   UFD_CLIENT_SLUG, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

interface StripePrice {
  id: string
  unit_amount: number | null
  currency: string
  nickname: string | null
  recurring: { interval: string; interval_count: number } | null
}

interface StripeSubscription {
  id: string
  status: string
  start_date: number
  current_period_end: number
  canceled_at: number | null
  created: number
  cancel_at_period_end: boolean
  items: { data: { id: string; price: StripePrice; quantity: number }[] }
}

interface StripeCharge {
  id: string
  amount: number
  amount_refunded: number
  currency: string
  created: number
  paid: boolean
  status: string
  description: string | null
  failure_message: string | null
  receipt_url: string | null
}

// Stripe basic auth helper.
async function stripeFetch<T>(apiKey: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.stripe.com${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const auth = btoa(`${apiKey}:`)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Sub MRR contribution at any moment in time.
function subMonthlyCents(sub: StripeSubscription): number {
  let total = 0
  for (const item of sub.items.data) {
    const amount = item.price.unit_amount ?? 0
    const qty = item.quantity ?? 1
    const r = item.price.recurring
    if (!r) continue
    let perMonth = 0
    if (r.interval === 'month') perMonth = amount / r.interval_count
    else if (r.interval === 'year') perMonth = amount / (12 * r.interval_count)
    else if (r.interval === 'week') perMonth = (amount * 4.333) / r.interval_count
    else if (r.interval === 'day') perMonth = (amount * 30) / r.interval_count
    total += perMonth * qty
  }
  return total
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  // ── Auth ────────────────────────────────────────────────────────────────
  const csAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data: userData, error: userErr } = await csAdmin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: profile } = await csAdmin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!profile) return json({ error: 'Profile not found' }, 403)

  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await csAdmin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  const allowed = profile.role === 'admin' || profile.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  // ── Body ────────────────────────────────────────────────────────────────
  let body: { email?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'email is required' }, 400)

  // ── UFD profile (best-effort) ───────────────────────────────────────────
  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  // deno-lint-ignore no-explicit-any
  let ufdProfile: any = null
  if (ufdUrl && ufdKey) {
    const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })
    const { data } = await ufd
      .from('profiles')
      .select('id, email, full_name, created_at, trial_started_at, trial_expires_at')
      .ilike('email', email)
      .maybeSingle()
    ufdProfile = data ?? null
  }

  // ── Stripe (lookup by email, then sub + charge history) ─────────────────
  const stripeKey = Deno.env.get('UFD_STRIPE_SECRET_KEY')
  let stripeCustomer: { id: string; email: string | null; name: string | null } | null = null
  let subscriptions: StripeSubscription[] = []
  let charges: StripeCharge[] = []
  if (stripeKey) {
    try {
      const customerLookup = await stripeFetch<{ data: { id: string; email: string | null; name: string | null }[] }>(
        stripeKey,
        '/v1/customers',
        { email, limit: '1' },
      )
      stripeCustomer = customerLookup.data?.[0] ?? null
      if (stripeCustomer) {
        const subsRes = await stripeFetch<{ data: StripeSubscription[] }>(
          stripeKey,
          '/v1/subscriptions',
          {
            customer: stripeCustomer.id,
            status: 'all',
            limit: '100',
            // expand items so MRR math works
            'expand[]': 'data.items.data.price',
          },
        )
        subscriptions = subsRes.data ?? []
        const chargesRes = await stripeFetch<{ data: StripeCharge[] }>(
          stripeKey,
          '/v1/charges',
          { customer: stripeCustomer.id, limit: '100' },
        )
        charges = chargesRes.data ?? []
      }
    } catch (e) {
      // Non-fatal — drawer still opens with everything else.
      console.error('Stripe fetch failed:', (e as Error).message)
    }
  }

  // ── Email events ────────────────────────────────────────────────────────
  const { data: rawEvents } = await csAdmin
    .from('ufd_email_events')
    .select('email_id, event_type, subject, occurred_at, click_url')
    .eq('recipient', email)
    .order('occurred_at', { ascending: false })
    .limit(500)

  // Group events by email_id for the per-email summary.
  interface EmailRollup {
    email_id: string
    subject: string | null
    first_seen: string
    latest_status: string
    opened: boolean
    clicked: boolean
    events: { event_type: string; occurred_at: string; click_url: string | null }[]
  }
  const STATUS_ORDER: Record<string, number> = {
    sent: 1, delivery_delayed: 2, delivered: 3, opened: 4, clicked: 5, bounced: 6, complained: 7,
  }
  const byEmail = new Map<string, EmailRollup>()
  // deno-lint-ignore no-explicit-any
  for (const ev of (rawEvents ?? []) as any[]) {
    let roll = byEmail.get(ev.email_id)
    if (!roll) {
      roll = {
        email_id: ev.email_id,
        subject: ev.subject ?? null,
        first_seen: ev.occurred_at,
        latest_status: ev.event_type,
        opened: false,
        clicked: false,
        events: [],
      }
      byEmail.set(ev.email_id, roll)
    }
    roll.events.push({ event_type: ev.event_type, occurred_at: ev.occurred_at, click_url: ev.click_url ?? null })
    if (ev.subject && !roll.subject) roll.subject = ev.subject
    if (ev.occurred_at < roll.first_seen) roll.first_seen = ev.occurred_at
    if ((STATUS_ORDER[ev.event_type] ?? 0) > (STATUS_ORDER[roll.latest_status] ?? 0)) {
      roll.latest_status = ev.event_type
    }
    if (ev.event_type === 'opened' || ev.event_type === 'clicked') roll.opened = true
    if (ev.event_type === 'clicked') roll.clicked = true
  }
  const emails = Array.from(byEmail.values()).sort((a, b) => b.first_seen.localeCompare(a.first_seen))

  // ── Notes ───────────────────────────────────────────────────────────────
  const { data: notes } = await csAdmin
    .from('user_notes')
    .select('id, body, created_by, created_at, updated_at')
    .eq('client_id', ufdClient.id)
    .eq('user_email', email)
    .order('created_at', { ascending: false })

  // Resolve note authors to emails (best-effort).
  const authorIds = Array.from(new Set((notes ?? []).map((n) => n.created_by).filter(Boolean)))
  // deno-lint-ignore no-explicit-any
  let authorMap = new Map<string, any>()
  if (authorIds.length > 0) {
    const { data: authors } = await csAdmin
      .from('users')
      .select('id, email, role')
      .in('id', authorIds)
    for (const a of authors ?? []) authorMap.set(a.id, a)
  }
  const notesWithAuthor = (notes ?? []).map((n) => ({
    ...n,
    author: n.created_by ? authorMap.get(n.created_by) ?? null : null,
  }))

  // ── Aggregate stats ─────────────────────────────────────────────────────
  const succeededCharges = charges.filter((c) => c.status === 'succeeded' && c.paid)
  const lifetime_revenue_cents = succeededCharges.reduce(
    (sum, c) => sum + (c.amount - c.amount_refunded),
    0,
  )
  const activeSubs = subscriptions.filter((s) => ['active', 'trialing', 'past_due'].includes(s.status))
  const current_mrr_cents = activeSubs.reduce((sum, s) => sum + subMonthlyCents(s), 0)

  const last_email_received = emails.length > 0 ? emails[0].first_seen : null
  const last_email_opened =
    emails.find((e) => e.opened)?.events.find((ev) => ev.event_type === 'opened')?.occurred_at ?? null

  return json({
    email,
    profile: ufdProfile,
    stripe: {
      customer: stripeCustomer,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end,
        start_date: s.start_date,
        current_period_end: s.current_period_end,
        canceled_at: s.canceled_at,
        items: s.items.data.map((it) => ({
          price_id: it.price.id,
          nickname: it.price.nickname,
          unit_amount: it.price.unit_amount,
          currency: it.price.currency,
          interval: it.price.recurring?.interval ?? null,
          interval_count: it.price.recurring?.interval_count ?? null,
          quantity: it.quantity,
        })),
        mrr_cents: Math.round(subMonthlyCents(s)),
      })),
      charges: charges.map((c) => ({
        id: c.id,
        amount: c.amount,
        amount_refunded: c.amount_refunded,
        currency: c.currency,
        created: c.created,
        status: c.status,
        paid: c.paid,
        description: c.description,
        failure_message: c.failure_message,
        receipt_url: c.receipt_url,
      })),
    },
    emails,
    notes: notesWithAuthor,
    stats: {
      lifetime_revenue_cents,
      current_mrr_cents,
      total_emails_received: emails.length,
      last_email_received,
      last_email_opened,
    },
  })
})
