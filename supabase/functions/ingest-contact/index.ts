// CommandSite ingest-contact Edge Function
// ---------------------------------------------------------------------------
// Accepts POST requests from external systems (e.g. a Supabase auth.users
// webhook on a client's own project) and creates a contact in CommandSite
// scoped to the client that owns the API key used.
//
// Auth:   Authorization: Bearer cs_live_xxxxxxxx...
// Body:   Supabase webhook payload (has a `record` field) OR a plain JSON
//         object with at least `email` or `phone`. Supported keys:
//         first_name, last_name, email, phone, company, title, source.
//
// Notes:
// - Uses the service role key server-side (env var) to bypass RLS. The API
//   key in the bearer header is what scopes the insert to a specific client.
// - Rejects requests with no email AND no phone (prevents junk contacts).
// - Duplicate email (per-client unique) returns 200 + duplicate: true so
//   idempotent retries don't error.
// - Auto-places new contacts into a stage named like "trial" if present,
//   else the first stage in the client's default pipeline.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const PREFIX_LEN = 16

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
function pickString(...candidates: any[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return null
}

// deno-lint-ignore no-explicit-any
function splitName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null }
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // 1. Extract bearer token
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return json({ error: 'Missing bearer token' }, 401)

  const apiKey = match[1].trim()
  if (apiKey.length < PREFIX_LEN + 8) return json({ error: 'Invalid key format' }, 401)

  const prefix = apiKey.slice(0, PREFIX_LEN)
  const hash = await sha256Hex(apiKey)

  // 2. Look up key using service-role client (bypasses RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: key, error: keyErr } = await supabase
    .from('client_api_keys')
    .select('id, client_id, key_hash, revoked_at')
    .eq('key_prefix', prefix)
    .maybeSingle()

  if (keyErr) return json({ error: keyErr.message }, 500)
  if (!key) return json({ error: 'Invalid key' }, 401)
  if (key.revoked_at) return json({ error: 'Key revoked' }, 401)
  if (key.key_hash !== hash) return json({ error: 'Invalid key' }, 401)

  // 3. Parse payload. Accept both supabase webhook format (body.record)
  //    and a direct JSON object.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const record =
    body.record && typeof body.record === 'object'
      ? (body.record as Record<string, unknown>)
      : body

  const meta =
    record.raw_user_meta_data && typeof record.raw_user_meta_data === 'object'
      ? (record.raw_user_meta_data as Record<string, unknown>)
      : {}

  const email = pickString(record.email, meta.email)
  const phone = pickString(record.phone, meta.phone)
  const fullNameFromMeta = pickString(meta.full_name, meta.name)
  const { first: splitFirst, last: splitLast } = splitName(fullNameFromMeta)
  const first_name = pickString(record.first_name, meta.first_name, splitFirst)
  const last_name = pickString(record.last_name, meta.last_name, splitLast)
  const company = pickString(record.company, meta.company)
  const title = pickString(record.title, meta.title)
  const source = pickString(record.source, meta.source) ?? 'website_signup'

  if (!email && !phone) {
    return json({ error: 'email or phone required' }, 400)
  }

  // 4. Pick a default stage. Prefer one whose name contains "trial";
  //    otherwise the first stage in the default pipeline.
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('client_id', key.client_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let stageId: string | null = null
  let pipelineId: string | null = pipeline?.id ?? null
  if (pipelineId) {
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, position')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })

    const trialStage = (stages ?? []).find((s: { name: string }) =>
      s.name.toLowerCase().includes('trial'),
    )
    stageId = trialStage?.id ?? stages?.[0]?.id ?? null
  }

  // 5. Insert contact (unique constraint handles duplicate email per-client)
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .insert({
      client_id: key.client_id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      first_name,
      last_name,
      email,
      phone,
      company,
      title,
      source,
    })
    .select()
    .single()

  if (contactErr) {
    // Postgres unique_violation = 23505. Retries / replayed webhooks should
    // not error — treat as idempotent.
    if (contactErr.code === '23505') {
      return json({ ok: true, duplicate: true })
    }
    return json({ error: contactErr.message }, 500)
  }

  // 6. Log event (non-critical; fire-and-forget)
  await supabase.from('contact_events').insert({
    client_id: key.client_id,
    contact_id: contact.id,
    event_type: 'contact_created',
    actor_type: 'automation',
    payload: { source, via: 'ingest-contact' },
  })

  // 7. Update last_used_at on the key
  await supabase
    .from('client_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)

  return json({ ok: true, contact_id: contact.id }, 201)
})
