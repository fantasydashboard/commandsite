// CommandSite discovery-brief-auto-gen Edge Function
// ---------------------------------------------------------------------------
// Cron-triggered: scans cs_deals for upcoming discovery calls that
// don't yet have a brief, and queues generate-discovery-brief for each.
// Runs hourly, looking ~24h ahead so Josh always has the brief in
// hand when he sits down for prep the night before or the morning of.
//
// Selection rules:
//   • scheduled_at BETWEEN now + 18h AND now + 30h
//     (the 12-hour window catches anything booked 24h ± 6h ahead;
//      hourly cron means any new booking in that window gets caught
//      within an hour of falling into it)
//   • discovery_brief IS NULL  (don't regenerate)
//   • scheduled_at IS NOT NULL (only real booked demos)
//
// Trigger: GET (pg_cron via pg_net.http_get, no auth header)
// Cap:     3 per run — keeps the LLM bill predictable and the cron
//          quick. Anything beyond that catches up next hour.

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BATCH_CAP = 3
const WINDOW_START_HOURS = 18
const WINDOW_END_HOURS = 30

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const now = new Date()
  const windowStart = new Date(now.getTime() + WINDOW_START_HOURS * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + WINDOW_END_HOURS * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: fetchErr } = await admin
    .from('cs_deals')
    .select('id, company_name, scheduled_at, discovery_brief')
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .is('discovery_brief', null)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_CAP)

  if (fetchErr) {
    return json({ error: `Candidate query failed: ${fetchErr.message}` }, 500)
  }

  const picked = (candidates ?? []) as Array<{ id: string; company_name: string; scheduled_at: string }>

  if (picked.length === 0) {
    return json({
      processed: 0,
      generated: 0,
      window: { start: windowStart, end: windowEnd },
      message: 'No deals in the 18-30h window need a brief',
    })
  }

  // Hand off to generate-discovery-brief (one call per deal)
  const briefUrl = `${SUPABASE_URL}/functions/v1/generate-discovery-brief`
  let generated = 0
  let failed = 0
  const errors: string[] = []

  for (const deal of picked) {
    try {
      const resp = await fetch(briefUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ deal_id: deal.id }),
      })
      if (!resp.ok) {
        failed++
        errors.push(`${deal.company_name}: brief returned ${resp.status} — ${await resp.text()}`)
        continue
      }
      generated++
    } catch (err) {
      failed++
      errors.push(`${deal.company_name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return json({
    processed: picked.length,
    generated,
    failed,
    window: { start: windowStart, end: windowEnd },
    errors: errors.length > 0 ? errors : undefined,
  })
})
