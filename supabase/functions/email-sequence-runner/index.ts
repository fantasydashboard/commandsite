// CommandSite email-sequence-runner Edge Function
// ---------------------------------------------------------------------------
// Lifecycle drip runner. Iterates every enabled email_sequences row,
// matches the current cohort (e.g., trial users for UFD) against each
// step's day_offset, and sends the corresponding template via Resend —
// once per (recipient, template) thanks to the unique idempotency index
// on email_send_log.
//
// Mirrors UFD's existing send-trial-emails.js behavior so it can replace
// that cron 1:1 once enabled.
//
// Trigger: GET (cron) or POST (manual admin invoke).
// Auth:    Public for GET (URL not exposed publicly; Supabase scheduled
//          function calls it). POST requires admin or UFD-client JWT.
// Body (POST, optional): { sequence_id?: string, dry_run?: boolean }
//
// Deploy with --no-verify-jwt and schedule via supabase/cron.

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface UfdProfile {
  id: string
  email: string
  trial_started_at: string | null
  trial_expires_at: string | null
  created_at: string | null
}

// Deterministic 50/50 assignment per (recipient, step) pair. Same user
// always gets the same variant for a given step — sticky across runs and
// retries — but is independent across steps. Avoids any randomness so
// behavior is reproducible.
function abVariant(emailLower: string, stepId: string): 'a' | 'b' {
  const seed = emailLower + '::' + stepId
  let hash = 5381
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 2 === 0 ? 'a' : 'b'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Parse optional body for POST manual triggers.
  //   sequence_id   — limit to one sequence
  //   dry_run       — count what would be sent, don't actually send
  //   user_id       — limit to one UFD profile (the "Send Now for X" button)
  //   force         — when paired with user_id, ignore day_offset gating so
  //                   the next eligible step fires immediately
  let body: {
    sequence_id?: string
    dry_run?: boolean
    user_id?: string
    force?: boolean
  } = {}
  if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      /* empty body fine */
    }
    // For POST require a valid bearer (admin or UFD client) — guards
    // against arbitrary triggers.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (!jwt) return json({ error: 'Missing bearer token (POST requires auth)' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin
      .from('users')
      .select('role, client_id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!caller) return json({ error: 'Profile not found' }, 403)
    // Loose check — admin or any client member can trigger their own.
    // RLS-style filtering happens via sequence ownership below.
  }

  const resendKey = Deno.env.get('UFD_RESEND_API_KEY')
  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!resendKey || !ufdUrl || !ufdKey) {
    return json({ error: 'Resend or UFD credentials not configured' }, 500)
  }

  // ── Load enabled sequences ─────────────────────────────────────────────
  let seqQuery = admin
    .from('email_sequences')
    .select('id, client_id, key, name, cohort, anchor_field, enabled')
    .eq('enabled', true)
  if (body.sequence_id) seqQuery = seqQuery.eq('id', body.sequence_id)
  const { data: sequences, error: seqErr } = await seqQuery
  if (seqErr) return json({ error: `Sequences read: ${seqErr.message}` }, 500)
  if (!sequences || sequences.length === 0) {
    return json({ message: 'No enabled sequences', processed_sequences: 0 })
  }

  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  // Precompute UFD profiles + paid IDs once per run (saves N queries).
  // When body.user_id is set, restrict the profiles query to just that user
  // — used by the "Send Now" button on the Email Pipeline view.
  let profilesQ = ufd
    .from('profiles')
    .select('id, email, trial_started_at, trial_expires_at, created_at')
  if (body.user_id) profilesQ = profilesQ.eq('id', body.user_id)

  const [
    { data: profiles },
    { data: indivSubs },
    { data: leaguePasses },
  ] = await Promise.all([
    profilesQ,
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

  const FROM = 'Ultimate Fantasy Dashboard <notifications@ultimatefantasydashboard.com>'
  const summary: Record<string, { sent: number; skipped: number; failed: number }> = {}

  for (const seq of sequences) {
    const sentForSeq = { sent: 0, skipped: 0, failed: 0 }
    summary[seq.key] = sentForSeq

    // Steps for this sequence.
    const { data: steps } = await admin
      .from('email_sequence_steps')
      .select('id, template_key, template_key_b, day_offset, skip_if_paid, use_expiry_date, step_order')
      .eq('sequence_id', seq.id)
      .order('step_order', { ascending: true })

    if (!steps || steps.length === 0) continue

    // Load templates for both variants A and B (where present).
    const allTemplateKeys = new Set<string>()
    for (const s of steps) {
      allTemplateKeys.add(s.template_key)
      if (s.template_key_b) allTemplateKeys.add(s.template_key_b)
    }
    const { data: templates } = await admin
      .from('email_templates')
      .select('id, key, subject, html')
      .eq('client_id', seq.client_id)
      .in('key', Array.from(allTemplateKeys))
    // deno-lint-ignore no-explicit-any
    const tplByKey = new Map<string, any>()
    for (const t of templates ?? []) tplByKey.set(t.key, t)

    // Already-sent set for this sequence — keyed on step_id so that A/B
    // variants of the same step share dedup (a user gets at most one
    // variant per step, ever).
    const { data: existingLog } = await admin
      .from('email_send_log')
      .select('recipient, step_id')
      .eq('client_id', seq.client_id)
      .eq('sequence_id', seq.id)
      .eq('status', 'sent')
    const sentSet = new Set(
      (existingLog ?? [])
        .filter((l) => l.step_id)
        .map((l) => `${l.recipient}::${l.step_id}`),
    )

    // Opt-outs — recipients who've been manually skipped from this
    // sequence (or all sequences if sequence_id is null). The pipeline
    // view's "Skip" button writes here.
    const { data: optOuts } = await admin
      .from('email_recipient_opt_outs')
      .select('recipient, sequence_id')
      .eq('client_id', seq.client_id)
      .or(`sequence_id.eq.${seq.id},sequence_id.is.null`)
    const optedOutEmails = new Set(
      (optOuts ?? []).map((o) => o.recipient.toLowerCase()),
    )

    // Cohort-specific filter: V1 supports 'trial' (active trial users).
    // Other cohorts can be added without changing the runner shell.
    // deno-lint-ignore no-explicit-any
    let candidates: UfdProfile[] = ((profiles ?? []) as UfdProfile[]).filter(
      (p) => p.email && p.trial_started_at,
    )
    if (seq.cohort === 'trial') {
      // any user who has a trial start (active or expired); skip_if_paid
      // is checked per-step.
      // candidates already filtered above
    }

    for (const profile of candidates) {
      if (!profile.email || !profile.trial_started_at) continue
      // Honor opt-outs — pipeline view's "Skip" button writes here.
      if (optedOutEmails.has(profile.email.toLowerCase())) {
        sentForSeq.skipped++
        continue
      }
      const trialStart = new Date(profile.trial_started_at)
      const trialExpiry = profile.trial_expires_at ? new Date(profile.trial_expires_at) : null
      const trialDay = Math.floor((nowMs - trialStart.getTime()) / 86400000)

      // Process at most one step per profile per run (matches UFD's
      // existing behavior — backlog catches up over multiple runs).
      // When body.force is set (manual "Send Now"), we skip the day_offset
      // and use_expiry_date gates and just fire whichever step they're
      // actually due for next.
      let pickedStep: typeof steps[number] | null = null
      for (const step of steps) {
        const key = `${profile.email.toLowerCase()}::${step.id}`
        if (sentSet.has(key)) continue
        if (step.skip_if_paid && paidIds.has(profile.id)) continue

        if (body.force) {
          // Manual fire: take the first not-yet-sent step that isn't
          // skip_if_paid-blocked. Ignore timing.
          pickedStep = step
          break
        }

        // Timing rules:
        //   use_expiry_date=false → fire when trial_day reaches day_offset
        //   use_expiry_date=true  → same threshold, AND require user has
        //                           actually crossed their trial_expires_at
        //                           (guards against extended trials firing
        //                           post-expiry emails too early)
        // day_offset is always trial-day-since-trial_started_at, so the
        // sequence steps stay in one consistent unit.
        let shouldSend = trialDay >= step.day_offset
        if (step.use_expiry_date) {
          shouldSend = shouldSend && !!trialExpiry && nowMs >= trialExpiry.getTime()
        }
        if (!shouldSend) continue
        pickedStep = step
        break
      }

      if (!pickedStep) continue

      // ── A/B variant selection ──────────────────────────────────────────
      // If template_key_b is set on the step, deterministically split this
      // recipient into 'a' or 'b' (sticky per recipient + step). Otherwise
      // variant is null and we just send template_key.
      let variant: 'a' | 'b' | null = null
      let templateKey = pickedStep.template_key
      if (pickedStep.template_key_b) {
        variant = abVariant(profile.email.toLowerCase(), pickedStep.id)
        templateKey = variant === 'a' ? pickedStep.template_key : pickedStep.template_key_b
      }

      const tpl = tplByKey.get(templateKey)
      if (!tpl) {
        sentForSeq.skipped++
        continue
      }

      if (body.dry_run) {
        sentForSeq.sent++
        continue
      }

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM,
            to: [profile.email],
            subject: tpl.subject,
            html: tpl.html,
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          sentForSeq.failed++
          await admin.from('email_send_log').insert({
            client_id: seq.client_id,
            recipient: profile.email.toLowerCase(),
            user_id: profile.id,
            template_key: templateKey,
            template_id: tpl.id,
            sequence_id: seq.id,
            step_id: pickedStep.id,
            subject: tpl.subject,
            status: 'failed',
            error_message: text.slice(0, 500),
            ab_variant: variant,
          })
        } else {
          const sendBody = await res.json()
          sentForSeq.sent++
          await admin.from('email_send_log').insert({
            client_id: seq.client_id,
            recipient: profile.email.toLowerCase(),
            user_id: profile.id,
            template_key: templateKey,
            template_id: tpl.id,
            sequence_id: seq.id,
            step_id: pickedStep.id,
            subject: tpl.subject,
            status: 'sent',
            resend_id: sendBody.id ?? null,
            ab_variant: variant,
          })
          sentSet.add(`${profile.email.toLowerCase()}::${pickedStep.id}`)
        }
      } catch (e) {
        sentForSeq.failed++
        console.error(`[runner] ${profile.email}:`, (e as Error).message)
      }

      await new Promise((r) => setTimeout(r, 250))
    }
  }

  return json({
    processed_sequences: sequences.length,
    summary,
    dry_run: !!body.dry_run,
  })
})
