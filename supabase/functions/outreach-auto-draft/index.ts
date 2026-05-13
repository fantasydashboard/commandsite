// CommandSite outreach-auto-draft Edge Function
// ---------------------------------------------------------------------------
// Cron-callable wrapper that finds scored cs_leads without drafts and
// hands them to draft-cold-email so they end up in the Approval Queue
// without anyone clicking. Paired with the pg_cron schedule in
// migration 0040.
//
// Trigger:  GET (no auth — invoked by pg_cron via pg_net.http_get)
// Body:     none
// Returns:  { picked: number, drafted: number, failed: number, errors? }
//
// Selection rules (must hold to be a candidate):
//   1. icp_score >= cs_settings.outreach_auto_draft_min_score
//   2. draft_cold_email_subject IS NULL  AND  draft_cold_email_body IS NULL
//   3. draft_state IS NULL OR draft_state = 'drafting' aged > 30 minutes
//      (orphaned in-flight markers get retried)
//   4. contact_email IS NOT NULL
//   5. status NOT IN ('replied', 'disqualified')
//
// Batch cap: 5 per run (keeps the LLM bill predictable and the chain
// in flight, since pg_cron fires every 5 minutes).

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BATCH_CAP = 5
const ORPHAN_DRAFTING_MS = 30 * 60 * 1000  // 30 min

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Read threshold from cs_settings (fall back to 65)
  const { data: settings } = await admin
    .from('cs_settings')
    .select('outreach_auto_draft_min_score')
    .eq('id', 1)
    .maybeSingle()
  const minScore = (settings as { outreach_auto_draft_min_score?: number } | null)
    ?.outreach_auto_draft_min_score ?? 65

  // ── Find candidates
  const orphanCutoff = new Date(Date.now() - ORPHAN_DRAFTING_MS).toISOString()

  // First pass: clean orphaned 'drafting' markers older than the cutoff.
  // These happen when a prior run timed out mid-flight. Reset them to
  // null so they pick up again.
  await admin
    .from('cs_leads')
    .update({ draft_state: null })
    .eq('draft_state', 'drafting')
    .lt('updated_at', orphanCutoff)

  const { data: candidates, error: fetchErr } = await admin
    .from('cs_leads')
    .select('id, company_name, icp_score, contact_email, status, draft_state')
    .gte('icp_score', minScore)
    .is('draft_cold_email_subject', null)
    .is('draft_cold_email_body', null)
    .is('draft_state', null)
    .not('contact_email', 'is', null)
    .not('status', 'in', '(replied,disqualified)')
    .order('icp_score', { ascending: false, nullsFirst: false })
    .limit(BATCH_CAP)

  if (fetchErr) {
    return json({ error: `Candidate query failed: ${fetchErr.message}` }, 500)
  }

  const picked = (candidates ?? []) as { id: string; company_name: string }[]
  if (picked.length === 0) {
    return json({ picked: 0, drafted: 0, failed: 0, message: 'No candidates this tick' })
  }

  const leadIds = picked.map((l) => l.id)

  // Mark them drafting so a concurrent run doesn't double-pick
  await admin
    .from('cs_leads')
    .update({ draft_state: 'drafting' })
    .in('id', leadIds)

  // ── Hand off to draft-cold-email (it writes the draft + flips
  // draft_state to 'ready_for_review' on its own).
  const draftUrl = `${SUPABASE_URL}/functions/v1/draft-cold-email`
  let drafted = 0
  let failed = 0
  const errors: string[] = []

  try {
    const resp = await fetch(draftUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ lead_ids: leadIds }),
    })

    if (!resp.ok) {
      throw new Error(`draft-cold-email returned ${resp.status}: ${await resp.text()}`)
    }

    const body = await resp.json() as { counts?: { drafted?: number; failed?: number }; errors?: string[] }
    drafted = body.counts?.drafted ?? 0
    failed = body.counts?.failed ?? 0
    if (body.errors?.length) errors.push(...body.errors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    failed = picked.length
    // Roll back the drafting markers so they retry next tick
    await admin
      .from('cs_leads')
      .update({ draft_state: null })
      .in('id', leadIds)
  }

  return json({
    picked: picked.length,
    drafted,
    failed,
    min_score: minScore,
    errors: errors.length > 0 ? errors : undefined,
  })
})
