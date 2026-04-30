// CommandSite ufd-stripe Edge Function
// ---------------------------------------------------------------------------
// Pass-through revenue dashboard for UFD. Pulls subscriptions + charges from
// Stripe and computes MRR, ARR, plan mix, new/churned MRR in window, and
// total revenue. Same auth pattern as the other ufd-* functions.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.
// Body:   { window: 'today'|'7d'|'15d'|'30d'|'90d'|'1y'|'all' }
// Secrets expected:
//   UFD_STRIPE_SECRET_KEY  — Stripe API secret key (sk_live_... or sk_test_...)
//                            A restricted key with read access to subscriptions,
//                            charges, and customers is sufficient.

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

type Window = 'today' | '7d' | '15d' | '30d' | '90d' | '1y' | 'all'

function windowRange(w: Window): { since: number | null; now: number } {
  const now = Math.floor(Date.now() / 1000)
  if (w === 'all') return { since: null, now }
  const days = w === 'today' ? 1 : w === '7d' ? 7 : w === '15d' ? 15 : w === '30d' ? 30 : w === '90d' ? 90 : 365
  const since = now - days * 24 * 60 * 60
  return { since, now }
}

interface StripePrice {
  id: string
  unit_amount: number | null
  currency: string
  nickname: string | null
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year'
    interval_count: number
  } | null
  product: string
}

interface StripeSubscriptionItem {
  id: string
  price: StripePrice
  quantity: number
}

interface StripeCustomer {
  id: string
  email: string | null
  name: string | null
}

// Stripe returns `customer` as a bare ID unless we expand it; with
// `expand[]=data.customer` it becomes the full object. Handle both.
type CustomerField = string | StripeCustomer | null | undefined

interface StripeSubscription {
  id: string
  status: string // active | past_due | canceled | incomplete | incomplete_expired | trialing | unpaid
  customer: CustomerField
  start_date: number
  current_period_end: number
  canceled_at: number | null
  created: number
  items: { data: StripeSubscriptionItem[] }
}

interface StripeCharge {
  id: string
  amount: number
  amount_refunded: number
  currency: string
  created: number
  paid: boolean
  refunded: boolean
  status: string // succeeded | pending | failed
  description: string | null
  customer: CustomerField
  failure_message: string | null
}

// Normalize whatever Stripe gave us for `customer` (ID string, object, or
// null) into a display-friendly shape. Keeps downstream code simple.
function unwrapCustomer(c: CustomerField): {
  id: string | null
  email: string | null
  name: string | null
} {
  if (!c) return { id: null, email: null, name: null }
  if (typeof c === 'string') return { id: c, email: null, name: null }
  return { id: c.id ?? null, email: c.email ?? null, name: c.name ?? null }
}

// Normalize a subscription's unit price to monthly USD cents so MRR math
// works across mixed monthly / annual / custom-interval plans.
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

// ACTIVE states that contribute to current MRR.
const ACTIVE_STATES = new Set(['active', 'trialing', 'past_due'])

// Paginate a Stripe list endpoint. Deno fetch + basic auth (secret as user,
// empty password). Stops early for safety at 20 pages (2000 rows).
async function stripeList<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>,
  expand: string[] = [],
): Promise<T[]> {
  const auth = btoa(`${apiKey}:`)
  const out: T[] = []
  const MAX_PAGES = 20
  let startingAfter: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://api.stripe.com${path}`)
    url.searchParams.set('limit', '100')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    for (const exp of expand) url.searchParams.append('expand[]', exp)
    if (startingAfter) url.searchParams.set('starting_after', startingAfter)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Stripe ${res.status} ${path}: ${text.slice(0, 300)}`)
    }
    // deno-lint-ignore no-explicit-any
    const body: any = await res.json()
    const rows = (body.data ?? []) as T[]
    out.push(...rows)
    if (!body.has_more || rows.length === 0) break
    // deno-lint-ignore no-explicit-any
    startingAfter = (rows[rows.length - 1] as any).id
  }

  return out
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
  let body: { window?: Window }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const w: Window = (body.window ?? '30d') as Window
  const valid: Window[] = ['today', '7d', '15d', '30d', '90d', '1y', 'all']
  if (!valid.includes(w)) return json({ error: 'Invalid window' }, 400)
  const { since, now } = windowRange(w)

  // ── Fetch from Stripe ───────────────────────────────────────────────────
  const apiKey = Deno.env.get('UFD_STRIPE_SECRET_KEY')
  if (!apiKey) return json({ error: 'Stripe API key not configured on server' }, 500)

  let subscriptions: StripeSubscription[]
  let charges: StripeCharge[]
  try {
    // All subs (any status) so we can compute active MRR + churned in window.
    // Expand customer so we can show email/name instead of raw cus_ IDs.
    subscriptions = await stripeList<StripeSubscription>(
      apiKey,
      '/v1/subscriptions',
      { status: 'all' },
      ['data.items.data.price', 'data.customer'],
    )
    // Charges in window (or all-time for 'all').
    const chargeParams: Record<string, string> = {}
    if (since !== null) chargeParams['created[gte]'] = String(since)
    charges = await stripeList<StripeCharge>(apiKey, '/v1/charges', chargeParams, [
      'data.customer',
    ])
  } catch (e) {
    return json({ error: `Stripe fetch: ${(e as Error).message}` }, 502)
  }

  // ── Compute metrics ─────────────────────────────────────────────────────
  const inWindow = (t: number | null | undefined) =>
    t !== null && t !== undefined && (since === null || (t >= since && t <= now))

  // Current MRR: sum over active subscriptions.
  const activeSubs = subscriptions.filter((s) => ACTIVE_STATES.has(s.status))
  let mrrCents = 0
  for (const s of activeSubs) mrrCents += subMonthlyCents(s)

  // New MRR in window: subs whose start_date falls in the window.
  const newSubsInWindow = activeSubs.filter((s) => inWindow(s.start_date))
  const newMrrCents = newSubsInWindow.reduce(
    (sum, s) => sum + subMonthlyCents(s),
    0,
  )

  // Churned MRR: subs canceled in window (count their MRR contribution at
  // the time they were active — items are still in the response).
  const churnedSubsInWindow = subscriptions.filter(
    (s) => s.status === 'canceled' && inWindow(s.canceled_at),
  )
  const churnedMrrCents = churnedSubsInWindow.reduce(
    (sum, s) => sum + subMonthlyCents(s),
    0,
  )

  // Trial conversions in window: subs that transitioned out of 'trialing'
  // to 'active' — we approximate this as subs with status='active' and
  // start_date in window (Stripe doesn't expose a direct conversion event).
  // Good enough for a first-pass gauge.
  const paidStartsInWindow = activeSubs.filter(
    (s) => inWindow(s.start_date) && s.status === 'active',
  ).length

  // Revenue (succeeded charges, net of refunds) in window.
  const succeeded = charges.filter((c) => c.status === 'succeeded' && c.paid)
  const netRevenueCents = succeeded.reduce(
    (sum, c) => sum + (c.amount - c.amount_refunded),
    0,
  )
  const grossRevenueCents = succeeded.reduce((sum, c) => sum + c.amount, 0)
  const refundedCents = succeeded.reduce((sum, c) => sum + c.amount_refunded, 0)

  const failed = charges.filter((c) => c.status === 'failed')

  // Plan mix from active subs — group by a human label derived from price.
  // Falls back to price.id if no nickname/product is set.
  const planMix = new Map<string, { label: string; count: number; mrr_cents: number }>()
  for (const s of activeSubs) {
    for (const item of s.items.data) {
      const p = item.price
      const label =
        p.nickname ||
        (p.recurring
          ? `${p.currency?.toUpperCase() ?? 'USD'} ${((p.unit_amount ?? 0) / 100).toFixed(2)} / ${p.recurring.interval}`
          : p.id)
      const entry = planMix.get(label) ?? { label, count: 0, mrr_cents: 0 }
      entry.count += 1
      // Partial MRR contribution from just this item.
      const amount = p.unit_amount ?? 0
      const qty = item.quantity ?? 1
      const r = p.recurring
      let perMonth = 0
      if (r) {
        if (r.interval === 'month') perMonth = amount / r.interval_count
        else if (r.interval === 'year') perMonth = amount / (12 * r.interval_count)
        else if (r.interval === 'week') perMonth = (amount * 4.333) / r.interval_count
        else if (r.interval === 'day') perMonth = (amount * 30) / r.interval_count
      }
      entry.mrr_cents += perMonth * qty
      planMix.set(label, entry)
    }
  }
  const planMixArray = Array.from(planMix.values()).sort((a, b) => b.mrr_cents - a.mrr_cents)

  // Revenue time series — bucket succeeded charges by YYYY-MM-DD.
  const dailyRevenue: Record<string, number> = {}
  for (const c of succeeded) {
    const key = new Date(c.created * 1000).toISOString().slice(0, 10)
    dailyRevenue[key] = (dailyRevenue[key] ?? 0) + (c.amount - c.amount_refunded)
  }

  // Recent events lists — keep them small for UI.
  const recentFailed = failed
    .slice()
    .sort((a, b) => b.created - a.created)
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      created: c.created,
      description: c.description,
      customer: unwrapCustomer(c.customer),
      failure_message: c.failure_message,
    }))

  const recentCancellations = churnedSubsInWindow
    .slice()
    .sort((a, b) => (b.canceled_at ?? 0) - (a.canceled_at ?? 0))
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      customer: unwrapCustomer(s.customer),
      canceled_at: s.canceled_at,
      mrr_cents: Math.round(subMonthlyCents(s)),
    }))

  return json({
    window: w,
    range: {
      since: since !== null ? new Date(since * 1000).toISOString() : null,
      now: new Date(now * 1000).toISOString(),
    },
    cards: {
      mrr_cents: Math.round(mrrCents),
      arr_cents: Math.round(mrrCents * 12),
      active_subscriptions: activeSubs.length,
      new_mrr_cents: Math.round(newMrrCents),
      churned_mrr_cents: Math.round(churnedMrrCents),
      net_new_mrr_cents: Math.round(newMrrCents - churnedMrrCents),
      arpu_cents: activeSubs.length > 0 ? Math.round(mrrCents / activeSubs.length) : 0,
      new_subs_in_window: newSubsInWindow.length,
      canceled_in_window: churnedSubsInWindow.length,
      paid_starts_in_window: paidStartsInWindow,
      net_revenue_cents: netRevenueCents,
      gross_revenue_cents: grossRevenueCents,
      refunded_cents: refundedCents,
      failed_payments_in_window: failed.length,
    },
    plan_mix: planMixArray.map((p) => ({
      label: p.label,
      count: p.count,
      mrr_cents: Math.round(p.mrr_cents),
    })),
    series: { daily_revenue_cents: dailyRevenue },
    recent_failed: recentFailed,
    recent_cancellations: recentCancellations,
  })
})
