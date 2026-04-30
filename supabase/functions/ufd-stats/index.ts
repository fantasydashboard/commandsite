// CommandSite ufd-stats Edge Function
// ---------------------------------------------------------------------------
// Returns subscription metrics for the UFD client dashboard: card totals
// (total users, free trial, paid tiers, expired) and time-series (new users
// per day, new passes per day grouped by tier) for a requested time window.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be either CommandSite admin OR the UFD client user.
// Body:   { window: 'today'|'7d'|'15d'|'30d'|'90d'|'1y'|'all' }
//
// Data source: queries UFD's Supabase project directly using a server-held
// service-role key (UFD_SERVICE_ROLE_KEY env var). Neither the URL nor the
// key is exposed to the browser.
//
// Secrets expected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (CommandSite's — auto-injected)
//   UFD_SUPABASE_URL, UFD_SERVICE_ROLE_KEY   (UFD's — set via `supabase secrets set`)
//   UFD_CLIENT_SLUG                          (defaults to 'ufd' if unset)

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

// Returns [sinceISO, nowISO]. For 'all', sinceISO is null.
function windowRange(w: Window): { since: string | null; now: string } {
  const now = new Date()
  const nowISO = now.toISOString()
  if (w === 'all') return { since: null, now: nowISO }
  const days = w === 'today' ? 1 : w === '7d' ? 7 : w === '15d' ? 15 : w === '30d' ? 30 : w === '90d' ? 90 : 365
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  // For 'today' snap to start of day in UTC so counts feel natural.
  if (w === 'today') {
    since.setUTCHours(0, 0, 0, 0)
  }
  return { since: since.toISOString(), now: nowISO }
}

// Group a list of ISO timestamps into a per-day count map keyed by YYYY-MM-DD.
function bucketByDay(dates: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of dates) {
    const key = d.slice(0, 10)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

// Deno.serve ambient declared in the Deno runtime.
// deno-lint-ignore no-explicit-any
declare const Deno: any

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  // ── 1. Verify caller is a CommandSite user with access to UFD ──────────
  const csAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await csAdmin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: profile, error: profileErr } = await csAdmin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileErr || !profile) return json({ error: 'Profile not found' }, 403)

  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await csAdmin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()

  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  const allowed = profile.role === 'admin' || profile.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  // ── 2. Parse window ────────────────────────────────────────────────────
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

  // ── 3. Query UFD Supabase ──────────────────────────────────────────────
  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) {
    return json({ error: 'UFD credentials not configured on server' }, 500)
  }
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  // Active paid subs, tier-split.
  // Pull all active rows once; we need both the totals and the "new in window"
  // slice, and the table is small enough to avoid round-tripping twice.
  const [
    { data: indivSubs, error: subsErr },
    { data: leaguePasses, error: passesErr },
    { data: profiles, error: profilesErr },
  ] = await Promise.all([
    ufd
      .from('individual_subscriptions')
      .select('tier, status, created_at, current_period_end'),
    ufd
      .from('league_passes')
      .select('active, created_at, expires_at'),
    ufd
      .from('profiles')
      .select('id, created_at, trial_started_at, trial_expires_at'),
  ])

  if (subsErr) return json({ error: `subs query: ${subsErr.message}` }, 500)
  if (passesErr) return json({ error: `passes query: ${passesErr.message}` }, 500)
  if (profilesErr) return json({ error: `profiles query: ${profilesErr.message}` }, 500)

  const nowMs = new Date(now).getTime()
  const sinceMs = since ? new Date(since).getTime() : 0

  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    if (since === null) return true
    const t = new Date(iso).getTime()
    return t >= sinceMs && t <= nowMs
  }

  // Active subs are status='active' AND current_period_end is null or future.
  const activeMonthly = (indivSubs ?? []).filter(
    (s) =>
      s.status === 'active' &&
      s.tier === 'individual_monthly' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs),
  )
  const activeAnnual = (indivSubs ?? []).filter(
    (s) =>
      s.status === 'active' &&
      s.tier === 'individual_annual' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs),
  )
  const activePasses = (leaguePasses ?? []).filter(
    (p) =>
      p.active === true &&
      (!p.expires_at || new Date(p.expires_at).getTime() > nowMs),
  )

  // Set of user_ids with any active paid entitlement → used to classify
  // trial vs. expired on the profiles side.
  const paidUserIds = new Set<string>()
  for (const s of indivSubs ?? []) {
    // deno-lint-ignore no-explicit-any
    const userId = (s as any).user_id as string | undefined
    if (!userId) continue
    if (
      s.status === 'active' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs)
    ) {
      paidUserIds.add(userId)
    }
  }
  for (const p of leaguePasses ?? []) {
    // deno-lint-ignore no-explicit-any
    const userId = (p as any).purchased_by_user_id as string | undefined
    if (!userId) continue
    if (p.active === true && (!p.expires_at || new Date(p.expires_at).getTime() > nowMs)) {
      paidUserIds.add(userId)
    }
  }

  // Window after expiry where users are still being actively followed up
  // with — matches the trial_drip's last automated touch (day 21
  // reengagement). After this, they "graduate" from at_risk → expired.
  const AT_RISK_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

  const freeTrial = (profiles ?? []).filter(
    (pr) =>
      pr.trial_expires_at &&
      new Date(pr.trial_expires_at).getTime() > nowMs &&
      !paidUserIds.has(pr.id),
  )
  const atRisk = (profiles ?? []).filter(
    (pr) =>
      pr.trial_expires_at &&
      new Date(pr.trial_expires_at).getTime() <= nowMs &&
      nowMs - new Date(pr.trial_expires_at).getTime() <= AT_RISK_WINDOW_MS &&
      !paidUserIds.has(pr.id),
  )
  const expired = (profiles ?? []).filter(
    (pr) =>
      pr.trial_expires_at &&
      nowMs - new Date(pr.trial_expires_at).getTime() > AT_RISK_WINDOW_MS &&
      !paidUserIds.has(pr.id),
  )

  // ── 4. Build cards ─────────────────────────────────────────────────────
  const cards = {
    total_users: {
      value: (profiles ?? []).length,
      new_in_window: (profiles ?? []).filter((p) => inWindow(p.created_at)).length,
    },
    free_trial: {
      value: freeTrial.length,
      new_in_window: freeTrial.filter((p) => inWindow(p.trial_started_at)).length,
    },
    total_passes: {
      value: activeMonthly.length + activeAnnual.length + activePasses.length,
      new_in_window:
        activeMonthly.filter((s) => inWindow(s.created_at)).length +
        activeAnnual.filter((s) => inWindow(s.created_at)).length +
        activePasses.filter((p) => inWindow(p.created_at)).length,
    },
    individual_monthly: {
      value: activeMonthly.length,
      new_in_window: activeMonthly.filter((s) => inWindow(s.created_at)).length,
    },
    individual_annual: {
      value: activeAnnual.length,
      new_in_window: activeAnnual.filter((s) => inWindow(s.created_at)).length,
    },
    league_passes: {
      value: activePasses.length,
      new_in_window: activePasses.filter((p) => inWindow(p.created_at)).length,
    },
    at_risk: {
      value: atRisk.length,
      new_in_window: atRisk.filter((p) => inWindow(p.trial_expires_at)).length,
    },
    expired: {
      value: expired.length,
      new_in_window: expired.filter((p) => inWindow(p.trial_expires_at)).length,
    },
  }

  // ── 5. Time series ─────────────────────────────────────────────────────
  // Bucket only rows within the window; for 'all', use every row.
  const seriesProfiles = (profiles ?? [])
    .filter((p) => (since === null ? true : inWindow(p.created_at)))
    .map((p) => p.created_at!)
    .filter(Boolean)

  const seriesMonthly = activeMonthly
    .filter((s) => (since === null ? true : inWindow(s.created_at)))
    .map((s) => s.created_at!)
    .filter(Boolean)
  const seriesAnnual = activeAnnual
    .filter((s) => (since === null ? true : inWindow(s.created_at)))
    .map((s) => s.created_at!)
    .filter(Boolean)
  const seriesLeague = activePasses
    .filter((p) => (since === null ? true : inWindow(p.created_at)))
    .map((p) => p.created_at!)
    .filter(Boolean)

  const series = {
    new_users: bucketByDay(seriesProfiles),
    new_passes: {
      individual_monthly: bucketByDay(seriesMonthly),
      individual_annual: bucketByDay(seriesAnnual),
      league_passes: bucketByDay(seriesLeague),
    },
  }

  return json({
    window: w,
    range: { since, now },
    cards,
    series,
  })
})
