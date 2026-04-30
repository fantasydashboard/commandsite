// CommandSite email-templates-import Edge Function
// ---------------------------------------------------------------------------
// One-shot importer for UFD's lifecycle emails. Copies 11 templates (the 7
// trial-period emails imported from UFD's send-trial-emails.js, plus 4
// new at-risk emails authored in CommandSite) into public.email_templates
// and creates the 'trial_drip' sequence + steps so the lifecycle runner
// can take over from UFD's existing cron.
//
// Idempotent — safe to run multiple times. Templates upsert on
// (client_id, key); sequence + steps upsert by their natural keys.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { TRIAL_EMAILS, TRIAL_SEQUENCE } from './ufd-trial-templates.ts'

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

  // Locate UFD client.
  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await admin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  const allowed = caller.role === 'admin' || caller.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  // ── Import templates ───────────────────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  const templateRows = Object.entries(TRIAL_EMAILS as Record<string, any>).map(
    ([key, t]) => ({
      client_id: ufdClient.id,
      key,
      name: humanizeKey(key),
      description: 'Imported from UFD admin',
      subject: t.subject,
      preview_text: t.preview ?? null,
      html: t.html,
      content: { imported: true, source: 'ufd_admin', subject: t.subject, preview_text: t.preview ?? null },
      status: 'ready',
      created_by: caller.id,
    }),
  )

  const { error: tplErr } = await admin
    .from('email_templates')
    .upsert(templateRows, { onConflict: 'client_id,key' })
  if (tplErr) return json({ error: `Template upsert: ${tplErr.message}` }, 500)

  // ── Sequence ───────────────────────────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  const { data: existingSeq } = await admin
    .from('email_sequences')
    .select('id')
    .eq('client_id', ufdClient.id)
    .eq('key', 'trial_drip')
    .maybeSingle()

  let sequenceId: string
  if (existingSeq) {
    sequenceId = existingSeq.id
    await admin
      .from('email_sequences')
      .update({
        name: 'Trial + at-risk drip',
        description: '11-email lifecycle: 6 trial-period (daily) + 5 at-risk (weekly, anchored on expiry). trial_expired runs an A/B test (cards-focused vs feature recap).',
        cohort: 'trial',
        anchor_field: 'trial_started_at',
      })
      .eq('id', sequenceId)
  } else {
    const { data: created, error: seqErr } = await admin
      .from('email_sequences')
      .insert({
        client_id: ufdClient.id,
        key: 'trial_drip',
        name: 'Trial + at-risk drip',
        description: '11-email lifecycle: 6 trial-period (daily) + 5 at-risk (weekly, anchored on expiry). trial_expired runs an A/B test (cards-focused vs feature recap).',
        cohort: 'trial',
        anchor_field: 'trial_started_at',
        // Imported as DISABLED — flip on once you've decommissioned UFD's runner.
        enabled: false,
      })
      .select('id')
      .single()
    if (seqErr) return json({ error: `Sequence insert: ${seqErr.message}` }, 500)
    sequenceId = created.id
  }

  // Replace steps wholesale (idempotent).
  await admin.from('email_sequence_steps').delete().eq('sequence_id', sequenceId)

  // deno-lint-ignore no-explicit-any
  const stepRows = (TRIAL_SEQUENCE as any[]).map((s, i) => ({
    sequence_id: sequenceId,
    template_key: s.id,
    template_key_b: s.idB ?? null,
    day_offset: s.day,
    skip_if_paid: !!s.skipIfPaid,
    use_expiry_date: !!s.useExpiryDate,
    step_order: i,
  }))
  const { error: stepErr } = await admin.from('email_sequence_steps').insert(stepRows)
  if (stepErr) return json({ error: `Step insert: ${stepErr.message}` }, 500)

  return json({
    imported_templates: templateRows.length,
    sequence_id: sequenceId,
    steps: stepRows.length,
    sequence_enabled: false,
    note: 'Sequence created in disabled state. Flip enabled=true on the sequence once UFD\'s send-trial-emails.js cron is decommissioned.',
  })
})

function humanizeKey(key: string): string {
  return key
    .replace(/^trial_/, 'Trial · ')
    .replace(/^expired_/, 'At-risk · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
