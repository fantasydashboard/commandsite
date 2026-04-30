// CommandSite email-pipeline-stats Edge Function
// ---------------------------------------------------------------------------
// Returns "where is each UFD trial user currently in this sequence" for the
// Email Pipeline (Kanban) view. Read-only.
//
// For each user in the trial cohort, derives a bucket:
//   not_started — in cohort but no emails sent yet (runner hasn't picked
//                  them up, or day-0 step day_offset hasn't been reached)
//   step_<id>   — bucket = the step matching their *last sent* template
//                  in this sequence
//   paid        — user upgraded; sequence stops applying to them
//   completed   — user has received every step in the sequence
//
// Auth:   Authorization: Bearer <user-jwt>; admin or UFD client member
// Body:   { sequence_id?: string }   // defaults to UFD's trial_drip
// Response shape (TypeScript):
//   {
//     sequence: { id, key, name, anchor_field },
//     steps:    Array<{ id, template_key, day_offset, step_order,
//                       skip_if_paid, use_expiry_date }>,
//     buckets: {
//       not_started: BucketUser[]
//       paid:        BucketUser[]
//       completed:   BucketUser[]
//       by_step_id:  Record<string, BucketUser[]>
//     },
//     totals: { not_started: n, paid: n, completed: n, by_step_id: {…} }
//   }
//
// BucketUser:
//   { user_id, email, full_name, trial_started_at, trial_expires_at,
//     last_sent_at, last_sent_template_key, days_at_step }

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

interface Step {
  id: string
  template_key: string
  day_offset: number
  step_order: number
  skip_if_paid: boolean
  use_expiry_date: boolean
}

interface BucketUser {
  user_id: string
  email: string
  full_name: string | null
  trial_started_at: string | null
  trial_expires_at: string | null
  last_sent_at: string | null
  last_sent_template_key: string | null
  days_at_step: number | null
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

  // ── Body ────────────────────────────────────────────────────────────────
  let body: { sequence_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body fine */
  }

  // ── Sequence + steps ────────────────────────────────────────────────────
  let seqQuery = admin
    .from('email_sequences')
    .select('id, key, name, cohort, anchor_field, client_id')
    .eq('client_id', ufdClient.id)
  if (body.sequence_id) {
    seqQuery = seqQuery.eq('id', body.sequence_id)
  } else {
    seqQuery = seqQuery.eq('key', 'trial_drip')
  }
  const { data: seq } = await seqQuery.maybeSingle()
  if (!seq) return json({ error: 'Sequence not found' }, 404)

  const { data: stepsRaw } = await admin
    .from('email_sequence_steps')
    .select('id, template_key, day_offset, step_order, skip_if_paid, use_expiry_date')
    .eq('sequence_id', seq.id)
    .order('step_order', { ascending: true })

  const steps = (stepsRaw ?? []) as Step[]
  const stepIdByKey = new Map<string, string>()
  for (const s of steps) stepIdByKey.set(s.template_key, s.id)

  // ── UFD data ────────────────────────────────────────────────────────────
  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) return json({ error: 'UFD credentials missing' }, 500)
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  const [{ data: profiles }, { data: indivSubs }, { data: leaguePasses }] = await Promise.all([
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

  const nowMs = Date.now()
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

  // ── Send log for this sequence ──────────────────────────────────────────
  const { data: logRows } = await admin
    .from('email_send_log')
    .select('recipient, template_key, sent_at, status')
    .eq('client_id', ufdClient.id)
    .eq('sequence_id', seq.id)
    .eq('status', 'sent')

  // Group by recipient (lowercased email): collect template_keys + most-recent send.
  const sendsByEmail = new Map<
    string,
    { keys: Set<string>; lastSentAt: string; lastTemplateKey: string }
  >()
  for (const r of logRows ?? []) {
    if (!r.recipient || !r.template_key || !r.sent_at) continue
    const key = r.recipient.toLowerCase()
    const existing = sendsByEmail.get(key)
    if (!existing) {
      sendsByEmail.set(key, {
        keys: new Set([r.template_key]),
        lastSentAt: r.sent_at,
        lastTemplateKey: r.template_key,
      })
    } else {
      existing.keys.add(r.template_key)
      if (r.sent_at > existing.lastSentAt) {
        existing.lastSentAt = r.sent_at
        existing.lastTemplateKey = r.template_key
      }
    }
  }

  // ── Bucket every trial-cohort profile ──────────────────────────────────
  const buckets = {
    not_started: [] as BucketUser[],
    paid: [] as BucketUser[],
    completed: [] as BucketUser[],
    by_step_id: {} as Record<string, BucketUser[]>,
  }
  for (const s of steps) buckets.by_step_id[s.id] = []

  const totalSteps = steps.length

  // deno-lint-ignore no-explicit-any
  for (const p of (profiles ?? []) as any[]) {
    if (!p.email || !p.trial_started_at) continue
    const emailKey = p.email.toLowerCase()
    const sends = sendsByEmail.get(emailKey)
    const isPaid = paidIds.has(p.id)

    const bucketUser: BucketUser = {
      user_id: p.id,
      email: p.email,
      full_name: p.full_name ?? null,
      trial_started_at: p.trial_started_at,
      trial_expires_at: p.trial_expires_at,
      last_sent_at: sends?.lastSentAt ?? null,
      last_sent_template_key: sends?.lastTemplateKey ?? null,
      days_at_step: sends
        ? Math.floor((nowMs - new Date(sends.lastSentAt).getTime()) / 86400000)
        : null,
    }

    // Bucketing rules — checked in priority order.
    if (isPaid) {
      buckets.paid.push(bucketUser)
      continue
    }
    if (!sends) {
      buckets.not_started.push(bucketUser)
      continue
    }
    if (sends.keys.size >= totalSteps) {
      buckets.completed.push(bucketUser)
      continue
    }
    const stepId = stepIdByKey.get(sends.lastTemplateKey)
    if (stepId && buckets.by_step_id[stepId]) {
      buckets.by_step_id[stepId].push(bucketUser)
    } else {
      // Unknown template_key (e.g., template was renamed) — drop into completed.
      buckets.completed.push(bucketUser)
    }
  }

  // Sort each bucket: most-stalled first (largest days_at_step), then by email.
  const sortBucket = (arr: BucketUser[]) =>
    arr.sort((a, b) => {
      const da = a.days_at_step ?? -1
      const db = b.days_at_step ?? -1
      if (db !== da) return db - da
      return a.email.localeCompare(b.email)
    })
  sortBucket(buckets.not_started)
  sortBucket(buckets.paid)
  sortBucket(buckets.completed)
  for (const k of Object.keys(buckets.by_step_id)) sortBucket(buckets.by_step_id[k])

  const totals = {
    not_started: buckets.not_started.length,
    paid: buckets.paid.length,
    completed: buckets.completed.length,
    by_step_id: Object.fromEntries(
      Object.entries(buckets.by_step_id).map(([k, v]) => [k, v.length]),
    ),
  }

  return json({
    sequence: {
      id: seq.id,
      key: seq.key,
      name: seq.name,
      anchor_field: seq.anchor_field,
    },
    steps,
    buckets,
    totals,
  })
})
