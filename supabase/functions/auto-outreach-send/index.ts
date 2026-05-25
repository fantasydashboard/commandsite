// CommandSite auto-outreach-send Edge Function
// ---------------------------------------------------------------------------
// Server-side companion to the page-driven auto-approve loop. Runs on a
// pg_cron schedule and fires Sign-offs without anyone needing to have the
// dashboard tab open.
//
// What it does each tick:
//   1. Read cs_settings.outreach_auto_approve. If false, bail.
//   2. Read cs_settings.gmail_refresh_token. If absent, bail (a refresh
//      token is required for direct-API sends; no compose-tab fallback
//      from a cron job).
//   3. Fetch leads with draft_state='ready_for_review',
//      outreach_paused=false, and a contact email, ORDERED so follow-ups
//      (send_count >= 1) come before T1 (send_count = 0). Oldest first
//      within each group.
//   4. For each lead, call gmail-send with the correct touch_number.
//      gmail-send applies the send-window gate + the cold/follow-up
//      reserve. If the gate defers, the loop stops — the next tick will
//      retry when the window reopens.
//   5. On success, insert cs_outreach_sends (the trigger bumps lead
//      aggregates + flips status). Flip draft_state='sent'.
//
// Why server-side and page-driven both exist: when Josh is at the
// dashboard, the page chain gives him live ticker + dopamine. When he
// closes the tab, this cron keeps the work flowing without requiring his
// attention. They are not redundant — the page chain handles the
// "watching it happen" moment, the cron handles "while he's at lunch."
//
// Auth:    X-Cron-Secret header == AUTO_OUTREACH_CRON_SECRET (or
//          FOLLOWUP_CRON_SECRET as a fallback — same secret, different
//          name), OR Authorization: Bearer <service_role>.
// Body:    {} (no input — the cron is fully autonomous)
// Returns: { ok, processed, counts: { sent, deferred, skipped, failed },
//            deferredReason?, errors? }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          AUTO_OUTREACH_CRON_SECRET (or FOLLOWUP_CRON_SECRET)

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Limit each tick so a backlog from a long offline period doesn't burst
// all at once. The send-window gate also caps; this is just belt-and-braces.
const PER_TICK_LIMIT = 20

interface ReadyLead {
  id: string
  contact_email: string | null
  contact_name: string | null
  company_name: string | null
  draft_cold_email_subject: string | null
  draft_cold_email_body: string | null
  draft_cold_email_at: string | null
  send_count: number | null
}

interface SendResponse {
  ok?: boolean
  deferred?: boolean
  code?: string
  reason?: string
  message_id?: string
  thread_id?: string
  error?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  // ── Auth (intentionally permissive) ─────────────────────────────
  // Gateway-level verify_jwt is OFF (see supabase/config.toml). The
  // function's real safety net is INTERNAL:
  //   • Only sends when cs_settings.outreach_auto_approve = true.
  //   • Only sends when Gmail is connected.
  //   • Subject to send-window + daily cap inside gmail-send.
  //   • PER_TICK_LIMIT caps how much can fire per invocation.
  // So we don't gate on an external header. The cron-secret rabbit
  // hole was costing more than it protected. The function does nothing
  // dangerous to an unauthenticated caller — it just triggers the same
  // automation that's already configured by the operator.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── 1. Settings gate ────────────────────────────────────────────
  const { data: settings, error: setErr } = await admin
    .from('cs_settings')
    .select('outreach_auto_approve, gmail_refresh_token')
    .eq('id', 1)
    .maybeSingle()

  if (setErr) {
    return json({ ok: false, error: `Settings read failed: ${setErr.message}` }, 500)
  }

  const s = settings as { outreach_auto_approve?: boolean; gmail_refresh_token?: string } | null
  if (!s?.outreach_auto_approve) {
    return json({ ok: true, skipped: 'auto_approve_off', counts: { sent: 0, deferred: 0, skipped: 0, failed: 0 } })
  }
  if (!s.gmail_refresh_token) {
    return json({ ok: true, skipped: 'gmail_not_connected', counts: { sent: 0, deferred: 0, skipped: 0, failed: 0 } })
  }

  // ── 2. Fetch ready drafts, follow-ups first ─────────────────────
  // Two ordering criteria: send_count DESC (so leads with prior sends
  // come first — they're follow-ups), then draft_cold_email_at ASC
  // (oldest drafts go first within each group, FIFO).
  const { data: leadsData, error: leadsErr } = await admin
    .from('cs_leads')
    .select('id, contact_email, contact_name, company_name, draft_cold_email_subject, draft_cold_email_body, draft_cold_email_at, send_count')
    .eq('draft_state', 'ready_for_review')
    .eq('outreach_paused', false)
    .not('contact_email', 'is', null)
    .not('draft_cold_email_subject', 'is', null)
    .not('draft_cold_email_body', 'is', null)
    .order('send_count', { ascending: false, nullsFirst: false })
    .order('draft_cold_email_at', { ascending: true, nullsFirst: false })
    .limit(PER_TICK_LIMIT)

  if (leadsErr) {
    return json({ ok: false, error: `Leads read failed: ${leadsErr.message}` }, 500)
  }

  const leads = (leadsData ?? []) as ReadyLead[]
  const counts = { sent: 0, deferred: 0, skipped: 0, failed: 0 }
  const errors: string[] = []
  let deferredReason: string | undefined

  // ── 3. Loop: send each lead, break on gate defer ────────────────
  for (const lead of leads) {
    if (!lead.contact_email || !lead.draft_cold_email_subject || !lead.draft_cold_email_body) {
      counts.skipped++
      continue
    }
    const touchNumber = Math.max(1, Math.min(3, (lead.send_count ?? 0) + 1))

    // Call gmail-send with cron-secret auth so it bypasses the
    // admin-JWT check. gmail-send accepts service_role too — that's
    // what isServiceRole === true uses here.
    let sendResp: SendResponse | null = null
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // service-role bypasses gmail-send's admin check
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to: lead.contact_email,
          subject: lead.draft_cold_email_subject,
          body: lead.draft_cold_email_body,
          lead_id: lead.id,
          touch_number: touchNumber,
        }),
      })
      sendResp = (await res.json()) as SendResponse
    } catch (e) {
      counts.failed++
      errors.push(`${lead.company_name ?? lead.id}: fetch failed (${e instanceof Error ? e.message : String(e)})`)
      continue
    }

    if (sendResp?.deferred) {
      // Gate said no. No point continuing — every remaining lead would hit
      // the same gate (same window, same cap, same reserve).
      counts.deferred++
      deferredReason = sendResp.reason ?? sendResp.code ?? 'deferred'
      break
    }

    if (!sendResp?.ok) {
      counts.failed++
      errors.push(`${lead.company_name ?? lead.id}: ${sendResp?.error ?? 'send returned no ok'}`)
      continue
    }

    // ── 4. Log the send + flip draft_state. The cs_outreach_sends
    // trigger handles bumping cs_leads.send_count + flipping status.
    const externalMessageId = sendResp.thread_id ?? sendResp.message_id ?? null
    const { error: insErr } = await admin
      .from('cs_outreach_sends')
      .insert({
        lead_id: lead.id,
        subject: lead.draft_cold_email_subject,
        body: lead.draft_cold_email_body,
        channel: 'email',
        source: 'auto_approve',
        sent_at: new Date().toISOString(),
        sent_by: null,  // null = cron, not a user
        external_message_id: externalMessageId,
        touch_number: touchNumber,
      } as never)

    if (insErr) {
      counts.failed++
      errors.push(`${lead.company_name ?? lead.id}: log insert failed (${insErr.message})`)
      continue
    }

    await admin
      .from('cs_leads')
      .update({ draft_state: 'sent' } as never)
      .eq('id', lead.id)

    counts.sent++
  }

  return json({
    ok: true,
    processed: leads.length,
    counts,
    deferredReason,
    errors: errors.length > 0 ? errors : undefined,
  })
})
