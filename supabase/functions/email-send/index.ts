// CommandSite email-send Edge Function
// ---------------------------------------------------------------------------
// Send a saved template OR a draft to either a single recipient or a
// cohort (free_trial, expired, all, etc.). Logs every send to
// public.email_send_log for audit + idempotency.
//
// Auth:   Authorization: Bearer <supabase-user-jwt> (admin or UFD client)
// Body:   {
//           template_id?: string,    // OR template_key
//           template_key?: string,
//           draft_id?: string,
//           subject_override?: string,
//           recipient?: string,      // single email
//           cohort?: 'free_trial' | 'expired' | 'individual_monthly'
//                  | 'individual_annual' | 'league_passes' | 'total_users'
//                  | 'total_passes',
//           dry_run?: boolean,
//           limit?: number,          // safety cap on recipient count, default 200
//         }
//
// Secrets: UFD_RESEND_API_KEY, UFD_SUPABASE_URL, UFD_SERVICE_ROLE_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UFD_CLIENT_SLUG

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

const VALID_COHORTS = new Set([
  'total_users',
  'free_trial',
  'at_risk',
  'expired',
  'total_passes',
  'individual_monthly',
  'individual_annual',
  'league_passes',
])

// Mirrors ufd-stats: 21 days post-expiry is the "still being followed up
// with" window. After that, a user moves from at_risk → expired.
const AT_RISK_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

interface UfdProfile {
  id: string
  email: string
  full_name?: string | null
  trial_started_at?: string | null
  trial_expires_at?: string | null
  created_at?: string | null
}

// Resolve cohort key → list of UFD profiles. Mirrors the classification
// logic in ufd-stats so cohort meanings stay consistent across the app.
async function resolveCohort(
  ufd: ReturnType<typeof createClient>,
  cohort: string,
): Promise<UfdProfile[]> {
  const nowMs = Date.now()
  const [
    { data: profiles },
    { data: indivSubs },
    { data: leaguePasses },
  ] = await Promise.all([
    ufd
      .from('profiles')
      .select('id, email, full_name, created_at, trial_started_at, trial_expires_at'),
    ufd
      .from('individual_subscriptions')
      .select('user_id, tier, status, current_period_end'),
    ufd
      .from('league_passes')
      .select('purchased_by_user_id, active, expires_at'),
  ])

  // deno-lint-ignore no-explicit-any
  const isActiveSub = (s: any) =>
    s.status === 'active' &&
    (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs)
  // deno-lint-ignore no-explicit-any
  const isActivePass = (p: any) =>
    p.active === true && (!p.expires_at || new Date(p.expires_at).getTime() > nowMs)

  const paidUserIds = new Set<string>()
  // deno-lint-ignore no-explicit-any
  for (const s of (indivSubs ?? []) as any[]) if (isActiveSub(s)) paidUserIds.add(s.user_id)
  // deno-lint-ignore no-explicit-any
  for (const p of (leaguePasses ?? []) as any[]) if (isActivePass(p)) paidUserIds.add(p.purchased_by_user_id)

  const all = ((profiles ?? []) as UfdProfile[]).filter((p) => p.email)

  switch (cohort) {
    case 'total_users':
      return all
    case 'free_trial':
      return all.filter(
        (p) =>
          p.trial_expires_at &&
          new Date(p.trial_expires_at).getTime() > nowMs &&
          !paidUserIds.has(p.id),
      )
    case 'at_risk':
      return all.filter(
        (p) =>
          p.trial_expires_at &&
          new Date(p.trial_expires_at).getTime() <= nowMs &&
          nowMs - new Date(p.trial_expires_at).getTime() <= AT_RISK_WINDOW_MS &&
          !paidUserIds.has(p.id),
      )
    case 'expired':
      return all.filter(
        (p) =>
          p.trial_expires_at &&
          nowMs - new Date(p.trial_expires_at).getTime() > AT_RISK_WINDOW_MS &&
          !paidUserIds.has(p.id),
      )
    case 'total_passes':
      return all.filter((p) => paidUserIds.has(p.id))
    case 'individual_monthly': {
      // deno-lint-ignore no-explicit-any
      const monthlyIds = new Set<string>(
        // deno-lint-ignore no-explicit-any
        ((indivSubs ?? []) as any[])
          .filter((s) => isActiveSub(s) && s.tier === 'individual_monthly')
          .map((s) => s.user_id as string),
      )
      return all.filter((p) => monthlyIds.has(p.id))
    }
    case 'individual_annual': {
      // deno-lint-ignore no-explicit-any
      const annualIds = new Set<string>(
        // deno-lint-ignore no-explicit-any
        ((indivSubs ?? []) as any[])
          .filter((s) => isActiveSub(s) && s.tier === 'individual_annual')
          .map((s) => s.user_id as string),
      )
      return all.filter((p) => annualIds.has(p.id))
    }
    case 'league_passes': {
      const leagueIds = new Set<string>(
        // deno-lint-ignore no-explicit-any
        ((leaguePasses ?? []) as any[])
          .filter(isActivePass)
          .map((p) => p.purchased_by_user_id as string),
      )
      return all.filter((p) => leagueIds.has(p.id))
    }
    default:
      return []
  }
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

  let body: {
    template_id?: string
    template_key?: string
    draft_id?: string
    subject_override?: string
    recipient?: string
    cohort?: string
    dry_run?: boolean
    limit?: number
  } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // ── Resolve content (template or draft) ─────────────────────────────────
  let subject: string | null = null
  let html: string | null = null
  let templateKey: string | null = null
  let templateId: string | null = null
  let draftId: string | null = null

  if (body.template_id || body.template_key) {
    let q = admin.from('email_templates').select('*').eq('client_id', ufdClient.id).limit(1)
    q = body.template_id ? q.eq('id', body.template_id) : q.eq('key', body.template_key)
    const { data: tpl, error: tplErr } = await q.maybeSingle()
    if (tplErr) return json({ error: `Template lookup: ${tplErr.message}` }, 500)
    if (!tpl) return json({ error: 'Template not found' }, 404)
    subject = body.subject_override ?? tpl.subject
    html = tpl.html
    templateKey = tpl.key
    templateId = tpl.id
  } else if (body.draft_id) {
    const { data: draft, error: draftErr } = await admin
      .from('email_drafts')
      .select('*')
      .eq('client_id', ufdClient.id)
      .eq('id', body.draft_id)
      .maybeSingle()
    if (draftErr) return json({ error: `Draft lookup: ${draftErr.message}` }, 500)
    if (!draft) return json({ error: 'Draft not found' }, 404)
    subject = body.subject_override ?? draft.subject
    html = draft.html
    draftId = draft.id
  } else {
    return json({ error: 'Provide template_id, template_key, or draft_id' }, 400)
  }
  if (!subject || !html) return json({ error: 'Resolved content missing subject or html' }, 400)

  // ── Build recipient list ────────────────────────────────────────────────
  let recipients: { email: string; user_id?: string }[] = []
  if (body.recipient) {
    recipients = [{ email: body.recipient.trim().toLowerCase() }]
  } else if (body.cohort) {
    if (!VALID_COHORTS.has(body.cohort)) return json({ error: 'Invalid cohort' }, 400)
    const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
    const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
    if (!ufdUrl || !ufdKey) return json({ error: 'UFD credentials not configured' }, 500)
    const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })
    const profiles = await resolveCohort(ufd, body.cohort)
    recipients = profiles.map((p) => ({
      email: p.email.toLowerCase(),
      user_id: p.id,
    }))
  } else {
    return json({ error: 'Provide recipient or cohort' }, 400)
  }

  const limit = Math.min(body.limit ?? 200, 1000)
  const truncated = recipients.length > limit
  recipients = recipients.slice(0, limit)

  if (body.dry_run) {
    return json({
      dry_run: true,
      subject,
      template_key: templateKey,
      cohort: body.cohort ?? null,
      recipients_count: recipients.length,
      truncated,
      sample_recipients: recipients.slice(0, 5).map((r) => r.email),
    })
  }

  // ── Send via Resend ─────────────────────────────────────────────────────
  const resendKey = Deno.env.get('UFD_RESEND_API_KEY')
  if (!resendKey) return json({ error: 'Resend API key not configured' }, 500)
  const FROM = 'Ultimate Fantasy Dashboard <notifications@ultimatefantasydashboard.com>'

  const result = { sent: 0, skipped: 0, failed: 0, errors: [] as { email: string; error: string }[] }

  for (const r of recipients) {
    // Idempotency check for sequence-attached templates is enforced by
    // unique index; for one-offs, allow resends but log them all.
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [r.email],
          subject,
          html,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        result.failed++
        result.errors.push({ email: r.email, error: text.slice(0, 200) })
        await admin.from('email_send_log').insert({
          client_id: ufdClient.id,
          recipient: r.email,
          user_id: r.user_id ?? null,
          template_key: templateKey,
          template_id: templateId,
          draft_id: draftId,
          subject,
          status: 'failed',
          error_message: text.slice(0, 500),
        })
      } else {
        const sendBody = await res.json()
        result.sent++
        await admin.from('email_send_log').insert({
          client_id: ufdClient.id,
          recipient: r.email,
          user_id: r.user_id ?? null,
          template_key: templateKey,
          template_id: templateId,
          draft_id: draftId,
          subject,
          status: 'sent',
          resend_id: sendBody.id ?? null,
        })
      }
    } catch (e) {
      result.failed++
      result.errors.push({ email: r.email, error: (e as Error).message })
    }
    // Stay under Resend's 5 req/sec limit.
    await new Promise((r) => setTimeout(r, 250))
  }

  // If sending a draft, update its status.
  if (draftId) {
    await admin
      .from('email_drafts')
      .update({
        status: result.sent > 0 ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
      })
      .eq('id', draftId)
  }

  return json({
    ...result,
    truncated,
    recipients_count: recipients.length,
  })
})
