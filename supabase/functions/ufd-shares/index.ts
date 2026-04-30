// CommandSite ufd-shares Edge Function
// ---------------------------------------------------------------------------
// Reads UFD's card_shares table + profiles + paid sets, returns analytics
// for the Card Shares module:
//   top_dashboards   — counts by dashboard_type in the window
//   top_users        — per-user share counts (with email, name, paid status)
//   conversion       — paid rate among 3+-sharer trial users vs 0-2 sharers
//                      (the cards-as-product thesis quantified)
//   timeseries       — daily share volume for the window
//
// Auth:  Authorization: Bearer <user-jwt>; admin or UFD client member
// Body:  { window_days?: number }    // default 30
//
// Source tables (UFD project):
//   card_shares                  — every Share/Download click (instrumented
//                                  in UFD frontend's downloadX functions)
//   profiles                     — for joining email + trial dates
//   individual_subscriptions     — paid status (active subs)
//   league_passes                — paid status (active passes)

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

interface UserShareRow {
  user_id: string
  email: string
  full_name: string | null
  share_count: number
  is_paid: boolean
  in_trial: boolean         // signed up but not paid; covers trial cohort
  trial_started_at: string | null
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

  const { data: caller } = await admin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller) return json({ error: 'Profile not found' }, 403)

  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await admin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)
  const allowed = caller.role === 'admin' || caller.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  let body: { window_days?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body fine */
  }
  const windowDays = Math.max(1, Math.min(365, body.window_days ?? 30))
  const nowMs = Date.now()
  const windowStartMs = nowMs - windowDays * 86400000
  const windowStartIso = new Date(windowStartMs).toISOString()

  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) return json({ error: 'UFD credentials missing' }, 500)
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  // ── Pull everything in parallel ─────────────────────────────────────────
  const [
    { data: shares },
    { data: profiles },
    { data: indivSubs },
    { data: leaguePasses },
  ] = await Promise.all([
    ufd
      .from('card_shares')
      .select('user_id, dashboard_type, created_at')
      .gte('created_at', windowStartIso),
    ufd
      .from('profiles')
      .select('id, email, full_name, trial_started_at, trial_expires_at, created_at'),
    ufd
      .from('individual_subscriptions')
      .select('user_id, status, current_period_end'),
    ufd
      .from('league_passes')
      .select('purchased_by_user_id, active, expires_at'),
  ])

  // Paid set
  const paidIds = new Set<string>()
  // deno-lint-ignore no-explicit-any
  for (const s of (indivSubs ?? []) as any[]) {
    if (
      s.status === 'active' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs)
    ) {
      paidIds.add(s.user_id)
    }
  }
  // deno-lint-ignore no-explicit-any
  for (const p of (leaguePasses ?? []) as any[]) {
    if (p.active === true && (!p.expires_at || new Date(p.expires_at).getTime() > nowMs)) {
      paidIds.add(p.purchased_by_user_id)
    }
  }

  // Profile lookup: id → { email, full_name, trial_started_at }
  const profileById = new Map<
    string,
    { email: string; full_name: string | null; trial_started_at: string | null }
  >()
  // deno-lint-ignore no-explicit-any
  for (const p of (profiles ?? []) as any[]) {
    if (p.id && p.email) {
      profileById.set(p.id, {
        email: p.email,
        full_name: p.full_name ?? null,
        trial_started_at: p.trial_started_at ?? null,
      })
    }
  }

  // ── Aggregate shares ────────────────────────────────────────────────────
  const dashboardCounts: Record<string, number> = {}
  const sharesByUser = new Map<string, number>()
  const dailySeries: Record<string, number> = {}
  // deno-lint-ignore no-explicit-any
  for (const row of (shares ?? []) as any[]) {
    const d = row.dashboard_type ?? 'unknown'
    dashboardCounts[d] = (dashboardCounts[d] ?? 0) + 1
    if (row.user_id) {
      sharesByUser.set(row.user_id, (sharesByUser.get(row.user_id) ?? 0) + 1)
    }
    if (row.created_at) {
      const day = row.created_at.slice(0, 10)
      dailySeries[day] = (dailySeries[day] ?? 0) + 1
    }
  }

  const topDashboards = Object.entries(dashboardCounts)
    .map(([dashboard_type, count]) => ({ dashboard_type, count }))
    .sort((a, b) => b.count - a.count)

  // Per-user table
  const topUsers: UserShareRow[] = []
  for (const [user_id, share_count] of sharesByUser.entries()) {
    const profile = profileById.get(user_id)
    if (!profile) continue
    const isPaid = paidIds.has(user_id)
    const trialStartedMs = profile.trial_started_at
      ? new Date(profile.trial_started_at).getTime()
      : null
    const inTrial = trialStartedMs !== null && !isPaid
    topUsers.push({
      user_id,
      email: profile.email,
      full_name: profile.full_name,
      share_count,
      is_paid: isPaid,
      in_trial: inTrial,
      trial_started_at: profile.trial_started_at,
    })
  }
  topUsers.sort((a, b) => b.share_count - a.share_count)

  // ── Conversion correlation ──────────────────────────────────────────────
  // For trial-cohort users (have trial_started_at) where the trial started
  // INSIDE the window — count how many shared 3+ vs 0-2 cards in-window,
  // and what % converted to paid.
  let highSharers = 0
  let highSharersPaid = 0
  let lowSharers = 0
  let lowSharersPaid = 0
  // deno-lint-ignore no-explicit-any
  for (const p of (profiles ?? []) as any[]) {
    if (!p.id || !p.trial_started_at) continue
    const trialMs = new Date(p.trial_started_at).getTime()
    if (trialMs < windowStartMs) continue // older trials skew the comparison
    const count = sharesByUser.get(p.id) ?? 0
    const paid = paidIds.has(p.id)
    if (count >= 3) {
      highSharers++
      if (paid) highSharersPaid++
    } else {
      lowSharers++
      if (paid) lowSharersPaid++
    }
  }
  const conversion = {
    threshold: 3,
    high_sharers: { total: highSharers, paid: highSharersPaid },
    low_sharers: { total: lowSharers, paid: lowSharersPaid },
    high_paid_rate: highSharers > 0 ? highSharersPaid / highSharers : null,
    low_paid_rate: lowSharers > 0 ? lowSharersPaid / lowSharers : null,
  }

  // ── Daily timeseries — fill missing days ────────────────────────────────
  const series: { date: string; shares: number }[] = []
  for (let i = 0; i < windowDays; i++) {
    const dt = new Date(windowStartMs + i * 86400000)
    const key = dt.toISOString().slice(0, 10)
    series.push({ date: key, shares: dailySeries[key] ?? 0 })
  }

  return json({
    window_days: windowDays,
    total_shares: (shares ?? []).length,
    unique_sharers: sharesByUser.size,
    top_dashboards: topDashboards,
    top_users: topUsers,
    conversion,
    timeseries: series,
  })
})
