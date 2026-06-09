// CommandSite warm-followup-cron Edge Function
// ---------------------------------------------------------------------------
// Runs every 30 minutes via pg_cron. Finds cs_leads where
// warm_followup_state='queued' AND warm_followup_due_at <= now(), then
// calls draft-warm-followup for each so the warm-followup draft lands
// in the approval queue.
//
// Batch cap per tick: 5. Keeps the LLM bill predictable + avoids
// hitting Anthropic rate limits when a backlog appears.
//
// Trigger:  GET (no auth needed, invoked by pg_cron via pg_net.http_get)
// Returns:  { picked, drafted, failed, errors? }

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Find leads with overdue warm follow-ups
  const nowIso = new Date().toISOString()
  const { data: candidates, error: fetchErr } = await admin
    .from('cs_leads')
    .select('id, company_name')
    .eq('warm_followup_state', 'queued')
    .lte('warm_followup_due_at', nowIso)
    .eq('outreach_paused', false)
    .not('status', 'in', '(disqualified,archived)')
    .order('warm_followup_due_at', { ascending: true, nullsFirst: false })
    .limit(BATCH_CAP)

  if (fetchErr) {
    return json({ error: `Candidate query failed: ${fetchErr.message}` }, 500)
  }

  type Candidate = { id: string; company_name: string }
  const picked = (candidates ?? []) as Candidate[]
  if (picked.length === 0) {
    return json({ picked: 0, drafted: 0, failed: 0, message: 'No overdue warm follow-ups this tick' })
  }

  let drafted = 0
  let failed = 0
  const errors: string[] = []

  // Call the drafter sequentially per lead. Keeps the rate-limit footprint
  // predictable + lets us surface per-lead errors clearly.
  for (const lead of picked) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/draft-warm-followup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ lead_id: lead.id }),
      })

      if (!resp.ok) {
        const txt = await resp.text()
        failed++
        errors.push(`${lead.company_name}: ${resp.status} ${txt.slice(0, 200)}`)
        continue
      }
      drafted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failed++
      errors.push(`${lead.company_name}: ${msg}`)
    }
  }

  return json({
    picked: picked.length,
    drafted,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
})
