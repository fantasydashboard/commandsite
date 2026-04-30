// CommandSite email-log-import Edge Function
// ---------------------------------------------------------------------------
// One-shot migration: copies UFD's existing trial_email_log entries into
// CommandSite's email_send_log so the sequence-runner can dedupe correctly
// when it takes over from UFD's Vercel cron.
//
// Idempotent — the unique index on (client_id, recipient, template_key)
// where sequence_id IS NOT NULL prevents duplicates. Safe to run multiple
// times; re-runs upsert no-ops.
//
// Auth:   Authorization: Bearer <supabase-user-jwt> (admin or UFD client)
//
// Pulls from:
//   UFD Supabase: trial_email_log + profiles (for email lookup)
// Writes to:
//   CommandSite Supabase: email_send_log

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

  const ufdUrl = Deno.env.get('UFD_SUPABASE_URL')
  const ufdKey = Deno.env.get('UFD_SERVICE_ROLE_KEY')
  if (!ufdUrl || !ufdKey) return json({ error: 'UFD credentials not configured' }, 500)
  const ufd = createClient(ufdUrl, ufdKey, { auth: { persistSession: false } })

  // ── 1. Pull UFD's trial_email_log ──────────────────────────────────────
  const { data: ufdLog, error: logErr } = await ufd
    .from('trial_email_log')
    .select('user_id, email_id, sent_at')
  if (logErr) return json({ error: `UFD log read: ${logErr.message}` }, 500)
  if (!ufdLog || ufdLog.length === 0) {
    return json({ message: 'UFD log is empty', imported: 0, skipped: 0 })
  }

  // ── 2. Resolve user_id → email via UFD profiles ────────────────────────
  const userIds = Array.from(new Set(ufdLog.map((l) => l.user_id).filter(Boolean)))
  const { data: profiles } = await ufd
    .from('profiles')
    .select('id, email')
    .in('id', userIds)
  const emailById = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.email) emailById.set(p.id, p.email.toLowerCase())
  }

  // ── 3. Look up CommandSite-side IDs for the join ───────────────────────
  // We tag every imported row with the trial_drip sequence_id so the
  // idempotency unique index protects against re-imports.
  const { data: seq } = await admin
    .from('email_sequences')
    .select('id')
    .eq('client_id', ufdClient.id)
    .eq('key', 'trial_drip')
    .maybeSingle()
  if (!seq) {
    return json(
      { error: 'trial_drip sequence not found. Run "Import UFD templates" first.' },
      400,
    )
  }

  // Look up template_id per template_key for the FK column.
  const templateKeys = Array.from(new Set(ufdLog.map((l) => l.email_id)))
  const { data: tpls } = await admin
    .from('email_templates')
    .select('id, key, subject')
    .eq('client_id', ufdClient.id)
    .in('key', templateKeys)
  // deno-lint-ignore no-explicit-any
  const tplByKey = new Map<string, { id: string; subject: string | null }>()
  for (const t of tpls ?? []) tplByKey.set(t.key, { id: t.id, subject: t.subject })

  // Look up step_id per template_key.
  const { data: steps } = await admin
    .from('email_sequence_steps')
    .select('id, template_key')
    .eq('sequence_id', seq.id)
  const stepByKey = new Map<string, string>()
  for (const s of steps ?? []) stepByKey.set(s.template_key, s.id)

  // ── 4. Pre-fetch existing log rows to dedupe in-app ────────────────────
  // The unique constraint on email_send_log is a PARTIAL index (only when
  // sequence_id is not null), which PostgREST can't infer for upsert. We
  // dedupe in JS instead — query existing (recipient, template_key) keys
  // for this sequence, then insert only the new rows.
  const { data: existingRows } = await admin
    .from('email_send_log')
    .select('recipient, template_key')
    .eq('client_id', ufdClient.id)
    .eq('sequence_id', seq.id)
  const existingKeys = new Set<string>(
    (existingRows ?? []).map((r) => `${r.recipient}::${r.template_key}`),
  )

  // ── 5. Build rows + insert new only ────────────────────────────────────
  const rows: Record<string, unknown>[] = []
  let missingEmail = 0
  let alreadyImported = 0
  for (const l of ufdLog) {
    const email = emailById.get(l.user_id)
    if (!email) {
      missingEmail++
      continue
    }
    if (existingKeys.has(`${email}::${l.email_id}`)) {
      alreadyImported++
      continue
    }
    const tpl = tplByKey.get(l.email_id)
    rows.push({
      client_id: ufdClient.id,
      recipient: email,
      user_id: l.user_id,
      template_key: l.email_id,
      template_id: tpl?.id ?? null,
      sequence_id: seq.id,
      step_id: stepByKey.get(l.email_id) ?? null,
      subject: tpl?.subject ?? null,
      status: 'sent',
      sent_at: l.sent_at,
    })
  }

  if (rows.length === 0) {
    return json({
      scanned: ufdLog.length,
      imported: 0,
      skipped: alreadyImported + missingEmail,
      already_imported: alreadyImported,
      missing_email: missingEmail,
      message: 'Nothing new to import.',
    })
  }

  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { data, error } = await admin
      .from('email_send_log')
      .insert(slice)
      .select('id')
    if (error) return json({ error: `Insert: ${error.message}`, inserted }, 500)
    inserted += data?.length ?? 0
  }

  return json({
    scanned: ufdLog.length,
    imported: inserted,
    skipped: alreadyImported + missingEmail,
    already_imported: alreadyImported,
    missing_email: missingEmail,
    message:
      'After this, the sequence-runner will see UFD\'s historical sends and skip them — no double-sends on cutover.',
  })
})
