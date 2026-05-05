// CommandSite ufd-funnel Edge Function
// ---------------------------------------------------------------------------
// Returns UFD's signup-forward conversion funnel for the Funnel module.
// Five stages: signed_up → connected_league → completed_trial_week → paid →
// renewed. Returns:
//   snapshot       — all-time counts at each stage
//   cohort         — same shape, limited to users who signed up in the
//                    current window (default last 30 days)
//   prev_cohort    — same shape for the immediately-preceding window
//                    (used to render delta vs cohort)
//   cohort_users   — per-stage list of {user_id, email, full_name} so the
//                    UI can drill into "who's stuck at stage X"
//   timeseries     — signups per day for the requested window
//
// Auth:   Authorization: Bearer <user-jwt> (admin or UFD client)
// Body:   { window_days?: number }     // default 30
//
// Source tables (UFD project):
//   profiles                     — signups + trial dates
//   leagues                      — league connections (now ESPN+Sleeper safe)
//   individual_subscriptions     — paid + renewal status
//   league_passes                — alternative paid path

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

interface FunnelStages {
  signed_up: number
  connected_league: number
  completed_trial_week: number
  paid: number
  renewed: number
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
  const sevenDaysMs = 7 * 86400000
  const windowStartMs = nowMs - windowDays * 86400000
  const prevWindowStartMs = nowMs - 2 * windowDays * 86400000
  const prevWindowEndMs = windowStartMs

  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) return json({ error: 'UFD credentials missing' }, 500)
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  // Single-pass fetch — same data drives snapshot + cohort + series.
  const [{ data: profiles }, { data: leagues }, { data: indivSubs }, { data: leaguePasses }] =
    await Promise.all([
      ufd
        .from('profiles')
        .select('id, email, full_name, created_at, trial_started_at, trial_expires_at'),
      ufd.from('leagues').select('user_id, is_active'),
      ufd
        .from('individual_subscriptions')
        .select('user_id, status, current_period_end, created_at, current_period_start'),
      ufd
        .from('league_passes')
        .select('purchased_by_user_id, active, expires_at, created_at'),
    ])

  // ── Build per-user paid + renewal flags ────────────────────────────────
  const paidIds = new Set<string>()
  const renewedIds = new Set<string>()
  // deno-lint-ignore no-explicit-any
  for (const s of (indivSubs ?? []) as any[]) {
    if (
      s.status === 'active' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs)
    ) {
      paidIds.add(s.user_id)
      // Heuristic for "renewed": current_period_start is significantly after
      // the original sub created_at (i.e., they've moved into a renewal
      // period rather than just being in their first cycle).
      if (s.current_period_start && s.created_at) {
        const periodStart = new Date(s.current_period_start).getTime()
        const subCreated = new Date(s.created_at).getTime()
        if (periodStart - subCreated > 25 * 86400000) {
          renewedIds.add(s.user_id)
        }
      }
    }
  }
  // deno-lint-ignore no-explicit-any
  for (const p of (leaguePasses ?? []) as any[]) {
    if (p.active === true && (!p.expires_at || new Date(p.expires_at).getTime() > nowMs)) {
      paidIds.add(p.purchased_by_user_id)
      // League Pass is an annual one-shot; "renewed" means a second pass
      // was purchased — outside what we can derive from a single row.
      // Skip renewal flagging for League Pass users for now.
    }
  }

  // ── Per-user league flag ───────────────────────────────────────────────
  const usersWithLeague = new Set<string>()
  // deno-lint-ignore no-explicit-any
  for (const l of (leagues ?? []) as any[]) {
    if (l.user_id && l.is_active !== false) usersWithLeague.add(l.user_id)
  }

  // ── Walk profiles once, accumulate snapshot + cohort + timeseries ──────
  function emptyStages(): FunnelStages {
    return {
      signed_up: 0,
      connected_league: 0,
      completed_trial_week: 0,
      paid: 0,
      renewed: 0,
    }
  }
  interface UserLite {
    user_id: string
    email: string
    full_name: string | null
  }
  function emptyUsers(): Record<keyof FunnelStages, UserLite[]> {
    return {
      signed_up: [],
      connected_league: [],
      completed_trial_week: [],
      paid: [],
      renewed: [],
    }
  }
  const snapshot = emptyStages()
  const cohort = emptyStages()
  const prevCohort = emptyStages()
  const cohortUsers = emptyUsers()
  const dailySignups: Record<string, number> = {}

  // deno-lint-ignore no-explicit-any
  for (const p of (profiles ?? []) as any[]) {
    if (!p.created_at || !p.email) continue
    const createdMs = new Date(p.created_at).getTime()
    const trialStartedMs = p.trial_started_at
      ? new Date(p.trial_started_at).getTime()
      : null
    const hasLeague = usersWithLeague.has(p.id)
    const isPaid = paidIds.has(p.id)
    const isRenewed = renewedIds.has(p.id)
    // "Completed trial week" includes anyone who paid early — converting
    // before day 7 still means they got through the trial-evaluation window.
    const completedTrialWeek =
      isPaid ||
      (trialStartedMs !== null && nowMs - trialStartedMs >= sevenDaysMs)
    const userLite: UserLite = {
      user_id: p.id,
      email: p.email,
      full_name: p.full_name ?? null,
    }

    // Funnel stages are CUMULATIVE — a user counts in stage N only if
    // they met every prior stage's condition. Guarantees monotonic
    // decrease (no "1150% kept" bugs from independently-counted stages).
    //
    // Order of nesting matches the stage order in STAGES:
    //   signed_up → connected_league → completed_trial_week → paid → renewed

    // Snapshot — all-time
    snapshot.signed_up++
    if (hasLeague) {
      snapshot.connected_league++
      if (completedTrialWeek) {
        snapshot.completed_trial_week++
        if (isPaid) {
          snapshot.paid++
          if (isRenewed) snapshot.renewed++
        }
      }
    }

    // Cohort — users who signed up in the current window
    if (createdMs >= windowStartMs) {
      cohort.signed_up++
      cohortUsers.signed_up.push(userLite)
      if (hasLeague) {
        cohort.connected_league++
        cohortUsers.connected_league.push(userLite)
        if (completedTrialWeek) {
          cohort.completed_trial_week++
          cohortUsers.completed_trial_week.push(userLite)
          if (isPaid) {
            cohort.paid++
            cohortUsers.paid.push(userLite)
            if (isRenewed) {
              cohort.renewed++
              cohortUsers.renewed.push(userLite)
            }
          }
        }
      }

      // Daily signups (UTC date key) for the current window only
      const dayKey = p.created_at.slice(0, 10)
      dailySignups[dayKey] = (dailySignups[dayKey] ?? 0) + 1
    }

    // Prev cohort — users who signed up in the immediately-preceding window
    if (createdMs >= prevWindowStartMs && createdMs < prevWindowEndMs) {
      prevCohort.signed_up++
      if (hasLeague) {
        prevCohort.connected_league++
        if (completedTrialWeek) {
          prevCohort.completed_trial_week++
          if (isPaid) {
            prevCohort.paid++
            if (isRenewed) prevCohort.renewed++
          }
        }
      }
    }
  }

  // Fill any missing days in the window with 0 so the chart has a continuous x-axis.
  const series: { date: string; signups: number }[] = []
  for (let d = 0; d < windowDays; d++) {
    const dt = new Date(windowStartMs + d * 86400000)
    const key = dt.toISOString().slice(0, 10)
    series.push({ date: key, signups: dailySignups[key] ?? 0 })
  }

  return json({
    window_days: windowDays,
    snapshot,
    cohort,
    prev_cohort: prevCohort,
    cohort_users: cohortUsers,
    timeseries: series,
  })
})
