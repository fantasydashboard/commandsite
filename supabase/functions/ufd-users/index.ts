// CommandSite ufd-users Edge Function
// ---------------------------------------------------------------------------
// Returns the user list for a given cohort used on the UFD metrics cards.
// Complement to `ufd-stats` — stats gives counts, this gives the underlying
// rows so a table + CSV export can be rendered in the UI.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.
// Body:   { cohort: 'total_users' | 'free_trial' | 'total_passes'
//                 | 'individual_monthly' | 'individual_annual'
//                 | 'league_passes' | 'expired' }
//
// Response: { cohort, rows: UserRow[] } — rows always include email,
//           full_name, signup_date; plus cohort-specific columns.

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

type Cohort =
  | 'total_users'
  | 'free_trial'
  | 'total_passes'
  | 'individual_monthly'
  | 'individual_annual'
  | 'league_passes'
  | 'at_risk'
  | 'expired'

const COHORTS: Cohort[] = [
  'total_users',
  'free_trial',
  'total_passes',
  'individual_monthly',
  'individual_annual',
  'league_passes',
  'at_risk',
  'expired',
]

// Window post-expiry during which a user is still in the active drip
// follow-up. Matches ufd-stats and the trial_drip's day-21 reengagement.
const AT_RISK_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

// Deno.serve ambient declared in the Deno runtime.
// deno-lint-ignore no-explicit-any
declare const Deno: any

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  // ── 1. Auth ─────────────────────────────────────────────────────────────
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

  // ── 2. Parse body ───────────────────────────────────────────────────────
  let body: { cohort?: Cohort }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const cohort = body.cohort
  if (!cohort || !COHORTS.includes(cohort)) {
    return json({ error: 'Invalid cohort' }, 400)
  }

  // ── 3. Pull raw data from UFD ───────────────────────────────────────────
  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) {
    return json({ error: 'UFD credentials not configured on server' }, 500)
  }
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  const [
    { data: profiles, error: profilesErr },
    { data: indivSubs, error: subsErr },
    { data: leaguePasses, error: passesErr },
  ] = await Promise.all([
    ufd
      .from('profiles')
      .select('id, email, full_name, created_at, trial_started_at, trial_expires_at'),
    ufd
      .from('individual_subscriptions')
      .select('user_id, tier, status, created_at, current_period_end'),
    ufd
      .from('league_passes')
      .select('purchased_by_user_id, active, created_at, expires_at'),
  ])

  if (profilesErr) return json({ error: `profiles query: ${profilesErr.message}` }, 500)
  if (subsErr) return json({ error: `subs query: ${subsErr.message}` }, 500)
  if (passesErr) return json({ error: `passes query: ${passesErr.message}` }, 500)

  const nowMs = Date.now()

  // Index profiles by id for quick joins.
  // deno-lint-ignore no-explicit-any
  const profById = new Map<string, any>()
  for (const p of profiles ?? []) profById.set(p.id, p)

  type Sub = { user_id: string; tier: string; status: string; created_at: string; current_period_end: string | null }
  type Pass = { purchased_by_user_id: string; active: boolean; created_at: string; expires_at: string | null }

  const activeMonthly = ((indivSubs ?? []) as Sub[]).filter(
    (s) =>
      s.status === 'active' &&
      s.tier === 'individual_monthly' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs),
  )
  const activeAnnual = ((indivSubs ?? []) as Sub[]).filter(
    (s) =>
      s.status === 'active' &&
      s.tier === 'individual_annual' &&
      (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs),
  )
  const activePasses = ((leaguePasses ?? []) as Pass[]).filter(
    (p) =>
      p.active === true &&
      (!p.expires_at || new Date(p.expires_at).getTime() > nowMs),
  )

  const paidUserIds = new Set<string>()
  for (const s of activeMonthly) paidUserIds.add(s.user_id)
  for (const s of activeAnnual) paidUserIds.add(s.user_id)
  for (const p of activePasses) paidUserIds.add(p.purchased_by_user_id)

  // deno-lint-ignore no-explicit-any
  const baseProfileRow = (p: any) => ({
    user_id: p.id,
    email: p.email ?? null,
    full_name: p.full_name ?? null,
    signup_date: p.created_at ?? null,
  })

  let rows: Record<string, unknown>[] = []

  switch (cohort) {
    case 'total_users': {
      rows = (profiles ?? []).map((p) => ({
        ...baseProfileRow(p),
        trial_expires_at: p.trial_expires_at ?? null,
      }))
      break
    }
    case 'free_trial': {
      rows = (profiles ?? [])
        .filter(
          (p) =>
            p.trial_expires_at &&
            new Date(p.trial_expires_at).getTime() > nowMs &&
            !paidUserIds.has(p.id),
        )
        .map((p) => ({
          ...baseProfileRow(p),
          trial_started_at: p.trial_started_at ?? null,
          trial_expires_at: p.trial_expires_at ?? null,
        }))
      break
    }
    case 'at_risk': {
      rows = (profiles ?? [])
        .filter(
          (p) =>
            p.trial_expires_at &&
            new Date(p.trial_expires_at).getTime() <= nowMs &&
            nowMs - new Date(p.trial_expires_at).getTime() <= AT_RISK_WINDOW_MS &&
            !paidUserIds.has(p.id),
        )
        .map((p) => ({
          ...baseProfileRow(p),
          trial_started_at: p.trial_started_at ?? null,
          trial_expires_at: p.trial_expires_at ?? null,
        }))
      break
    }
    case 'expired': {
      rows = (profiles ?? [])
        .filter(
          (p) =>
            p.trial_expires_at &&
            nowMs - new Date(p.trial_expires_at).getTime() > AT_RISK_WINDOW_MS &&
            !paidUserIds.has(p.id),
        )
        .map((p) => ({
          ...baseProfileRow(p),
          trial_started_at: p.trial_started_at ?? null,
          trial_expires_at: p.trial_expires_at ?? null,
        }))
      break
    }
    case 'individual_monthly':
    case 'individual_annual': {
      const subs = cohort === 'individual_monthly' ? activeMonthly : activeAnnual
      rows = subs.map((s) => {
        const p = profById.get(s.user_id) ?? {}
        return {
          ...baseProfileRow({ id: s.user_id, ...p }),
          plan_started_at: s.created_at,
          current_period_end: s.current_period_end,
        }
      })
      break
    }
    case 'league_passes': {
      rows = activePasses.map((pass) => {
        const p = profById.get(pass.purchased_by_user_id) ?? {}
        return {
          ...baseProfileRow({ id: pass.purchased_by_user_id, ...p }),
          pass_started_at: pass.created_at,
          expires_at: pass.expires_at,
        }
      })
      break
    }
    case 'total_passes': {
      const combined: Record<string, unknown>[] = []
      for (const s of activeMonthly) {
        const p = profById.get(s.user_id) ?? {}
        combined.push({
          ...baseProfileRow({ id: s.user_id, ...p }),
          plan_type: 'Individual Monthly',
          plan_started_at: s.created_at,
          period_end: s.current_period_end,
        })
      }
      for (const s of activeAnnual) {
        const p = profById.get(s.user_id) ?? {}
        combined.push({
          ...baseProfileRow({ id: s.user_id, ...p }),
          plan_type: 'Individual Annual',
          plan_started_at: s.created_at,
          period_end: s.current_period_end,
        })
      }
      for (const pass of activePasses) {
        const p = profById.get(pass.purchased_by_user_id) ?? {}
        combined.push({
          ...baseProfileRow({ id: pass.purchased_by_user_id, ...p }),
          plan_type: 'League Pass',
          plan_started_at: pass.created_at,
          period_end: pass.expires_at,
        })
      }
      // Newest first across the combined list.
      combined.sort((a, b) => {
        const ta = a.plan_started_at ? new Date(a.plan_started_at as string).getTime() : 0
        const tb = b.plan_started_at ? new Date(b.plan_started_at as string).getTime() : 0
        return tb - ta
      })
      rows = combined
      break
    }
  }

  // Sort cohorts that are keyed off signup_date newest-first, except
  // total_passes which has its own sort above.
  if (cohort !== 'total_passes') {
    rows.sort((a, b) => {
      const ta = a.signup_date ? new Date(a.signup_date as string).getTime() : 0
      const tb = b.signup_date ? new Date(b.signup_date as string).getTime() : 0
      return tb - ta
    })
  }

  // ── 4. Enrich with Resend engagement (best-effort) ──────────────────────
  // Joins ufd_email_events in CommandSite's Supabase on recipient email.
  // Best-effort: if the table is empty (webhooks not set up yet) or the
  // query fails, rows still return with nulls for the engagement fields.
  const recipients = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.email === 'string' ? r.email.toLowerCase() : null))
        .filter((x): x is string => !!x),
    ),
  )

  if (recipients.length > 0) {
    const { data: events } = await csAdmin
      .from('ufd_email_events')
      .select('recipient, email_id, event_type, occurred_at')
      .in('recipient', recipients)

    if (events && events.length > 0) {
      interface Agg {
        sent: Set<string>
        opened: Set<string>
        clicked: Set<string>
        last_received: string | null
        last_opened: string | null
        last_clicked: string | null
      }
      const byRecipient = new Map<string, Agg>()
      const touch = (r: string): Agg => {
        let a = byRecipient.get(r)
        if (!a) {
          a = {
            sent: new Set(),
            opened: new Set(),
            clicked: new Set(),
            last_received: null,
            last_opened: null,
            last_clicked: null,
          }
          byRecipient.set(r, a)
        }
        return a
      }

      // deno-lint-ignore no-explicit-any
      for (const ev of events as any[]) {
        const a = touch(ev.recipient)
        const t = ev.occurred_at as string
        switch (ev.event_type) {
          case 'sent':
          case 'delivered':
            a.sent.add(ev.email_id)
            if (!a.last_received || t > a.last_received) a.last_received = t
            break
          case 'opened':
            a.opened.add(ev.email_id)
            a.sent.add(ev.email_id) // opens imply a delivery happened
            if (!a.last_opened || t > a.last_opened) a.last_opened = t
            break
          case 'clicked':
            a.clicked.add(ev.email_id)
            a.opened.add(ev.email_id)
            a.sent.add(ev.email_id)
            if (!a.last_clicked || t > a.last_clicked) a.last_clicked = t
            break
        }
      }

      for (const row of rows) {
        const email =
          typeof row.email === 'string' ? row.email.toLowerCase() : null
        const a = email ? byRecipient.get(email) : undefined
        row.emails_sent = a ? a.sent.size : 0
        row.emails_opened = a ? a.opened.size : 0
        row.emails_clicked = a ? a.clicked.size : 0
        row.last_received = a?.last_received ?? null
        row.last_opened = a?.last_opened ?? null
        row.open_rate =
          a && a.sent.size > 0 ? a.opened.size / a.sent.size : null
      }
    } else {
      for (const row of rows) {
        row.emails_sent = 0
        row.emails_opened = 0
        row.emails_clicked = 0
        row.last_received = null
        row.last_opened = null
        row.open_rate = null
      }
    }
  }

  return json({ cohort, rows })
})
