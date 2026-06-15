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
// Reset 'drafting' rows older than this on each cron tick. 30 min was too
// generous — any activity on the lead (Score with Ada, manual edit, etc.)
// bumps updated_at and resets the clock, so orphans never aged out. The
// drafter itself can't take longer than the function's wall-clock budget
// (~50s), so 10 min is a comfortable safety margin without leaving leads
// stuck for days waiting for the next "no activity" window.
const ORPHAN_DRAFTING_MS = 10 * 60 * 1000  // 10 min

/** Email-format guard. Catches genuinely broken contact_email values
 *  (e.g., "domain.com" with no @, "foo@bar" with no TLD) BEFORE we
 *  spend an Anthropic call drafting to a guaranteed-bounce address.
 *  Not RFC 5322 strict — that regex is huge and over-rejects valid
 *  edge-cases. This is the 95% guard: requires non-empty local part,
 *  exactly one @, non-empty domain with at least one dot, and TLD ≥ 2
 *  chars. No whitespace anywhere. */
function isValidEmailFormat(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim()
  if (trimmed.length === 0) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)
}

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

  // CRITICAL: filter to send_count = 0. Without this, leads that
  // already received Touch 1 (and had their drafts refreshed for a
  // Touch 2/3 re-draft) get picked back up by THIS cron and drafted
  // as if they were fresh Touch 1 candidates. The Touch 2/3 work
  // belongs to draft-followup-emails, not here. send_count >= 1 means
  // Touch 1 already went out, so this cron must skip the row.
  //
  // Fetch a wider window (BATCH_CAP * 4) so that after the email-
  // format guard archives invalid ones we still have BATCH_CAP good
  // candidates left to draft. Without the wider window, a single
  // broken-email lead at the top of the queue would shrink that tick.
  // ── NeverBounce gate. CRITICAL for sender reputation. Drafting +
  // sending to email_verification_status = 'unverified' / 'catchall' /
  // 'unknown' / NULL was the root cause of a 12% bounce rate on 2026-
  // 06-15. We now require 'valid' (NeverBounce-confirmed) before any
  // Anthropic draft cost is incurred OR any send goes out. Without
  // this, a single bad-data import poisons sender reputation for
  // weeks. The Find Emails action (enrich-lead-emails) writes the
  // status, so the only sends that ever reach Gmail are addresses
  // NeverBounce has explicitly blessed.
  const { data: candidates, error: fetchErr } = await admin
    .from('cs_leads')
    .select('id, company_name, icp_score, contact_email, status, draft_state, tags')
    .gte('icp_score', minScore)
    .is('draft_cold_email_subject', null)
    .is('draft_cold_email_body', null)
    .is('draft_state', null)
    .not('contact_email', 'is', null)
    .eq('email_verification_status', 'valid')
    .not('status', 'in', '(replied,disqualified)')
    .eq('send_count', 0)
    .order('icp_score', { ascending: false, nullsFirst: false })
    .limit(BATCH_CAP * 4)

  if (fetchErr) {
    return json({ error: `Candidate query failed: ${fetchErr.message}` }, 500)
  }

  type Candidate = { id: string; company_name: string; contact_email: string | null; tags: string[] | null }
  const allFetched = (candidates ?? []) as Candidate[]

  // ── Email-format guard: archive leads with broken contact_email
  // (e.g., "domain.com" missing @) so we never spend an Anthropic
  // call drafting to a guaranteed-bounce address. Also stops the
  // outreach pipeline from sending obvious garbage.
  const invalidFormat = allFetched.filter((l) => !isValidEmailFormat(l.contact_email))
  if (invalidFormat.length > 0) {
    const invalidIds = invalidFormat.map((l) => l.id)
    await admin
      .from('cs_leads')
      .update({
        status: 'archived',
        outreach_paused: true,
        outreach_paused_reason: 'contact_email is not a valid email format (missing @, no TLD, or malformed)',
      })
      .in('id', invalidIds)
    // Append the diagnostic tag in a separate pass since Postgres array
    // concatenation through supabase-js needs the existing array.
    for (const lead of invalidFormat) {
      const newTags = Array.from(
        new Set([...(lead.tags ?? []), 'invalid_email_format']),
      )
      await admin.from('cs_leads').update({ tags: newTags }).eq('id', lead.id)
    }
  }

  // ── Self-heal stale email_not_found tags. Tag gets set during one
  // enrichment pass and never cleared when contact_email is populated
  // by a different source (e.g., the Google Maps listing itself).
  // When the cron sees a valid-format email AND the stale tag, strip
  // the tag so downstream filters + reports stop being misleading.
  const validPicks = allFetched.filter((l) => isValidEmailFormat(l.contact_email))
  for (const lead of validPicks) {
    if ((lead.tags ?? []).includes('email_not_found')) {
      const cleanedTags = (lead.tags ?? []).filter((t) => t !== 'email_not_found')
      await admin.from('cs_leads').update({ tags: cleanedTags }).eq('id', lead.id)
      lead.tags = cleanedTags  // keep in-memory copy in sync for downstream split
    }
  }

  const picked = validPicks.slice(0, BATCH_CAP)
  if (picked.length === 0) {
    return json({
      picked: 0,
      drafted: 0,
      failed: 0,
      archived_invalid_format: invalidFormat.length,
      message: invalidFormat.length > 0
        ? `No valid candidates this tick — archived ${invalidFormat.length} with invalid email format.`
        : 'No candidates this tick',
    })
  }

  const leadIds = picked.map((l) => l.id)

  // Mark them drafting so a concurrent run doesn't double-pick
  await admin
    .from('cs_leads')
    .update({ draft_state: 'drafting' })
    .in('id', leadIds)

  // ── Split candidates by persona tag. persona_grace → grace drafter,
  // anything else (persona_ada or untagged legacy leads) → ada drafter.
  // Both drafters share the same I/O contract: { lead_ids } → counts +
  // errors. They write to cs_leads themselves and flip draft_state to
  // 'ready_for_review' independently.
  const graceIds = picked.filter((l) => (l.tags ?? []).includes('persona_grace')).map((l) => l.id)
  const adaIds = picked.filter((l) => !(l.tags ?? []).includes('persona_grace')).map((l) => l.id)

  let drafted = 0
  let failed = 0
  const errors: string[] = []

  async function callDrafter(url: string, ids: string[], label: string): Promise<void> {
    if (ids.length === 0) return
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ lead_ids: ids }),
      })

      if (!resp.ok) {
        throw new Error(`${label} returned ${resp.status}: ${await resp.text()}`)
      }

      const body = await resp.json() as { counts?: { drafted?: number; failed?: number }; errors?: string[] }
      drafted += body.counts?.drafted ?? 0
      failed += body.counts?.failed ?? 0
      if (body.errors?.length) errors.push(...body.errors.map((e) => `[${label}] ${e}`))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`[${label}] ${msg}`)
      failed += ids.length
      // Roll back drafting markers for just this drafter's slice so they retry next tick
      await admin
        .from('cs_leads')
        .update({ draft_state: null })
        .in('id', ids)
    }
  }

  // Run sequentially so a draft burst on one persona doesn't bunch up the
  // other one against the Anthropic rate limit.
  await callDrafter(`${SUPABASE_URL}/functions/v1/draft-cold-email`, adaIds, 'draft-cold-email')
  await callDrafter(`${SUPABASE_URL}/functions/v1/draft-cold-email-grace`, graceIds, 'draft-cold-email-grace')

  return json({
    picked: picked.length,
    drafted,
    failed,
    archived_invalid_format: invalidFormat.length,
    min_score: minScore,
    by_persona: { ada: adaIds.length, grace: graceIds.length },
    errors: errors.length > 0 ? errors : undefined,
  })
})
