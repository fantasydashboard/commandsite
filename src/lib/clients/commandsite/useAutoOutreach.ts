/**
 * Auto-Outreach pipeline — the chain that takes a scored lead from
 * "needs a draft" to "sitting in the Approval Queue" with zero clicks.
 *
 * What it does, in order:
 *   1. Scan cs_leads for rows where icp_score >= min_score AND
 *      draft_cold_email_subject is null AND draft_state is null.
 *      These are scored leads with no draft yet.
 *   2. For each one, invoke `draft-cold-email` (batched up to 5/run).
 *      Set draft_state = 'drafting' while in flight; on success, set
 *      draft_state = 'ready_for_review'. Emit a ticker event.
 *   3. The Approval Queue derives from cs_leads where
 *      draft_state = 'ready_for_review'. Josh sees a queued card with
 *      the draft preview.
 *   4. Approve action: opens Gmail compose, logs cs_outreach_sends
 *      (which trips the trigger that bumps cs_leads.send_count +
 *      flips status to 'contacted'), and sets draft_state = 'sent'.
 *      Emits a ticker event + ticks the "sent today" counter.
 *   5. If cs_settings.outreach_auto_approve is true, step 4 fires
 *      automatically as soon as a draft lands in ready_for_review.
 *
 * Why page-driven instead of pg_cron: Josh imports leads in batches
 * and watches the dopamine. The chain runs while he's there. A
 * pg_cron backup can come later for off-hours runs.
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsLead, CsOutreachSendInsert } from '@/types/database'
import { useSettings } from './settingsApi'

export interface TickerEvent {
  id: number
  icon: string
  text: string
  ageSec: number
}

export interface QueueItem {
  lead: CsLead
  scoreColor: 'amber' | 'lime' | 'emerald' | 'violet'
}

let tickerIdCounter = 0
function nextTickerId() {
  return ++tickerIdCounter
}

/** Map an ICP score to a chip color band — eyeable at a glance. */
function bandForScore(score: number | null): QueueItem['scoreColor'] {
  if (score === null) return 'amber'
  if (score >= 85) return 'violet'
  if (score >= 70) return 'emerald'
  if (score >= 55) return 'lime'
  return 'amber'
}

export interface AutoOutreachOptions {
  /** Forward each chain event to a visible ticker the parent owns.
   *  When set, the composable's own ticker state is still maintained
   *  for direct inspection but the parent decides what to render. */
  onEvent?: (icon: string, text: string) => void
}

export function useAutoOutreach(opts: AutoOutreachOptions = {}) {
  const { settings, save: saveSettings } = useSettings()

  const leads = ref<CsLead[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  // Ticker — the dopamine feed
  const ticker = ref<TickerEvent[]>([
    { id: nextTickerId(), icon: '👀', text: 'Watching for leads ready to draft…', ageSec: 0 },
  ])

  // Counters
  const sentTodayCount = ref(0)
  const draftedTodayCount = ref(0)

  // In-flight drafting tracker so we don't double-fire
  const draftingNow = ref<Set<string>>(new Set())

  // Animation hint — the most recently-approved lead id, used for
  // a brief pulse / highlight before the card transitions out.
  const lastApprovedId = ref<string | null>(null)

  let agingInterval: ReturnType<typeof setInterval> | null = null
  let chainInterval: ReturnType<typeof setInterval> | null = null

  function pushTicker(icon: string, text: string) {
    ticker.value.unshift({ id: nextTickerId(), icon, text, ageSec: 0 })
    if (ticker.value.length > 8) ticker.value.pop()
    opts.onEvent?.(icon, text)
  }

  // ── Load + reload ──────────────────────────────────────────────────
  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_leads')
      .select('*')
      .order('icp_score', { ascending: false, nullsFirst: false })
      .limit(500)
    if (e) {
      error.value = e.message
      loading.value = false
      return
    }
    leads.value = (data ?? []) as unknown as CsLead[]

    // Compute today's counters from existing data so we don't reset
    // on every page reload.
    const todayIso = new Date()
    todayIso.setHours(0, 0, 0, 0)
    const cutoff = todayIso.toISOString()
    sentTodayCount.value = leads.value.filter(
      (l) => l.last_contacted_at && l.last_contacted_at >= cutoff,
    ).length
    draftedTodayCount.value = leads.value.filter(
      (l) => l.draft_cold_email_at && l.draft_cold_email_at >= cutoff,
    ).length

    loading.value = false
  }

  // ── Derived queues ─────────────────────────────────────────────────
  /** Leads that are scored well + don't have a draft yet. Candidates
   *  for the draft chain to pick up. */
  const draftCandidates = computed<CsLead[]>(() => {
    const min = settings.value.outreach_auto_draft_min_score ?? 65
    return leads.value.filter(
      (l) =>
        (l.icp_score ?? 0) >= min &&
        !l.draft_cold_email_subject &&
        !l.draft_cold_email_body &&
        l.draft_state !== 'rejected' &&
        l.draft_state !== 'drafting' &&
        !!l.contact_email,
    )
  })

  /** Leads sitting in the queue, awaiting Josh's eyes.
   *
   *  Sort order is intentional: follow-ups (send_count >= 1) come BEFORE
   *  fresh T1 drafts (send_count = 0), then oldest draft first within each
   *  group. Reason: when the daily send cap is tight, follow-ups deserve
   *  priority. A Touch 2 sent late breaks cadence integrity and wastes the
   *  earlier Touch 1 spend; a Touch 1 sent a day later is essentially
   *  equivalent in value. The reserve in outreach_send_window backs this
   *  up at the server gate — UI ordering just makes the priority visible. */
  const queueItems = computed<QueueItem[]>(() => {
    return leads.value
      .filter(
        (l) =>
          l.draft_state === 'ready_for_review' &&
          !!l.draft_cold_email_subject &&
          !!l.draft_cold_email_body &&
          !!l.contact_email,
      )
      .map((lead) => ({ lead, scoreColor: bandForScore(lead.icp_score) }))
      .sort((a, b) => {
        const aFollowup = (a.lead.send_count ?? 0) >= 1 ? 0 : 1
        const bFollowup = (b.lead.send_count ?? 0) >= 1 ? 0 : 1
        if (aFollowup !== bFollowup) return aFollowup - bFollowup
        // Tie-break: oldest draft first (FIFO within each group).
        const aDate = a.lead.draft_cold_email_at ?? ''
        const bDate = b.lead.draft_cold_email_at ?? ''
        return aDate.localeCompare(bDate)
      })
  })

  // ── The chain step: draft for any pending candidates ───────────────
  async function runDraftStep() {
    const candidates = draftCandidates.value
      .filter((l) => !draftingNow.value.has(l.id))
      .slice(0, 3) // batch cap — 3 at a time so the ticker can keep up

    if (candidates.length === 0) return

    pushTicker('✍️', `Drafting ${candidates.length} ${candidates.length === 1 ? 'email' : 'emails'}…`)

    // Mark them drafting so we don't double-call
    for (const lead of candidates) {
      draftingNow.value.add(lead.id)
      await supabase
        .from('cs_leads')
        .update({ draft_state: 'drafting' } as never)
        .eq('id', lead.id)
    }

    // Call the edge function with the batch
    const leadIds = candidates.map((l) => l.id)
    try {
      const { error: fnErr } = await supabase.functions.invoke('draft-cold-email', {
        body: { lead_ids: leadIds },
      })
      if (fnErr) throw new Error(fnErr.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'draft-cold-email failed'
      pushTicker('⚠️', `Draft step failed: ${msg}`)
      // Roll back draft_state so they retry next tick
      for (const id of leadIds) {
        draftingNow.value.delete(id)
        await supabase.from('cs_leads').update({ draft_state: null } as never).eq('id', id)
      }
      return
    }

    // Reload to pick up the saved drafts + flip state to ready_for_review
    await load()
    for (const id of leadIds) {
      draftingNow.value.delete(id)
      const fresh = leads.value.find((l) => l.id === id)
      if (fresh?.draft_cold_email_subject && fresh.draft_cold_email_body) {
        await supabase
          .from('cs_leads')
          .update({ draft_state: 'ready_for_review' } as never)
          .eq('id', id)
        draftedTodayCount.value++
        const who = fresh.contact_name || fresh.company_name || 'lead'
        const score = fresh.icp_score ? ` · ${fresh.icp_score}` : ''
        pushTicker('✍️', `Drafted to ${who}${score}`)
      }
    }
    await load()

    // Auto-approve path — fire approves for newly-queued items if enabled
    if (settings.value.outreach_auto_approve) {
      const justQueued = queueItems.value.filter((q) => leadIds.includes(q.lead.id))
      for (const q of justQueued) {
        await approve(q.lead, { silent: false })
      }
    }
  }

  // ── Actions on a queue item ────────────────────────────────────────
  /** Approve a draft.
   *
   *  Three paths, picked at runtime:
   *    1. Gmail connected (refresh token present) → call gmail-send
   *       edge function. Delivers via API, no tab opened, returns
   *       Google's message id. Used by both manual approve clicks
   *       and auto-approve mode.
   *    2. Gmail NOT connected, manual approve → open Gmail compose
   *       in a new tab (legacy behavior). Josh hits Send there.
   *    3. Gmail NOT connected, auto-approve (`silent: true`) → log
   *       the send but skip the compose tab. The toast/ticker still
   *       narrates so the chain feels live; in practice Josh should
   *       connect Gmail before flipping auto-approve on.
   *
   *  All three paths write a cs_outreach_sends row, which trips the
   *  trigger that flips cs_leads.status and bumps send_count. */
  async function approve(lead: CsLead, opts: { silent?: boolean } = {}): Promise<{ ok: boolean; error?: string; deferred?: boolean; code?: string }> {
    if (!lead.contact_email) return { ok: false, error: 'No contact email' }
    const subject = lead.draft_cold_email_subject ?? ''
    const body = lead.draft_cold_email_body ?? ''
    const gmailConnected = !!settings.value.gmail_refresh_token

    // Touch number for the reserve gate + audit row. send_count reflects
    // sends ALREADY logged for this lead, so the NEXT send is send_count + 1.
    // Clamped to [1, 3] because the followup cron stops drafting after Touch 3.
    const touchNumber = Math.max(1, Math.min(3, (lead.send_count ?? 0) + 1))

    let source: CsOutreachSendInsert['source'] = 'manual_gmail'
    let externalMessageId: string | null = null

    if (gmailConnected) {
      // Path 1: API direct send
      const { data: sendResp, error: fnErr } = await supabase.functions.invoke('gmail-send', {
        body: { to: lead.contact_email, subject, body, lead_id: lead.id, touch_number: touchNumber },
      })
      if (fnErr) {
        // Supabase wraps non-2xx as `fnErr`. Pull the actual payload (429 deferral, etc.)
        // out of fnErr.context if present so the operator sees the real reason.
        type FnErrWithContext = { message: string; context?: { body?: unknown } }
        const ctx = (fnErr as FnErrWithContext).context
        const ctxBody = ctx?.body as { deferred?: boolean; code?: string; reason?: string } | null | undefined
        if (ctxBody?.deferred) {
          return {
            ok: false,
            deferred: true,
            code: ctxBody.code,
            error: ctxBody.reason ?? 'Send deferred — outside the send window.',
          }
        }
        return { ok: false, error: `Gmail send failed: ${fnErr.message}` }
      }
      const result = sendResp as {
        ok?: boolean
        deferred?: boolean
        code?: string
        reason?: string
        message_id?: string
        thread_id?: string
        error?: string
      } | null
      if (result?.deferred) {
        return {
          ok: false,
          deferred: true,
          code: result.code,
          error: result.reason ?? 'Send deferred — outside the send window.',
        }
      }
      if (!result?.ok) {
        return { ok: false, error: result?.error ?? 'Gmail send returned no ok' }
      }
      // Store the THREAD ID, not the message id. Reply matching in
      // gmail-inbox-poll keys off threadId because Gmail auto-threads
      // replies into the original send's thread. Gmail's internal
      // message id (result.message_id) is different from the RFC 822
      // Message-ID header that appears in reply In-Reply-To, so we'd
      // never match if we stored it.
      externalMessageId = result.thread_id ?? result.message_id ?? null
      source = opts.silent ? 'auto_approve' : 'manual_gmail'
    } else if (!opts.silent) {
      // Path 2: legacy compose-tab fallback
      const url = gmailComposeUrl(lead.contact_email, subject, body)
      window.open(url, '_blank', 'noopener')
      source = 'manual_gmail'
    } else {
      // Path 3: auto-approve with no Gmail connection — log only.
      // (UI surface should already be nudging Josh to connect.)
      source = 'auto_approve'
    }

    // Log the send (trigger will bump cs_leads aggregates + flip status)
    const { data: userData } = await supabase.auth.getUser()
    const payload: CsOutreachSendInsert = {
      lead_id: lead.id,
      subject,
      body,
      channel: 'email',
      source,
      sent_at: new Date().toISOString(),
      sent_by: userData.user?.id ?? null,
      external_message_id: externalMessageId,
      touch_number: touchNumber,
    }
    const { error: sendErr } = await supabase
      .from('cs_outreach_sends')
      .insert(payload as never)
    if (sendErr) return { ok: false, error: sendErr.message }

    // Flip draft_state to 'sent'
    await supabase
      .from('cs_leads')
      .update({ draft_state: 'sent' } as never)
      .eq('id', lead.id)

    // Dopamine: ticker + counter + highlight
    sentTodayCount.value++
    lastApprovedId.value = lead.id
    setTimeout(() => {
      if (lastApprovedId.value === lead.id) lastApprovedId.value = null
    }, 1200)
    const who = lead.contact_name || lead.company_name || 'lead'
    pushTicker(opts.silent ? '🤖' : '✓', `Sent to ${who}`)

    await load()
    return { ok: true }
  }

  /** Skip a draft — flips draft_state = 'rejected'. Doesn't delete the
   *  email itself in case Josh wants to revisit. */
  async function skip(lead: CsLead): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('cs_leads')
      .update({ draft_state: 'rejected' } as never)
      .eq('id', lead.id)
    if (e) return { ok: false, error: e.message }
    pushTicker('⏭️', `Skipped ${lead.company_name || 'lead'}`)
    await load()
    return { ok: true }
  }

  /** Save an edited draft (subject + body changed before send). */
  async function saveEdit(
    leadId: string,
    subject: string,
    body: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('cs_leads')
      .update({
        draft_cold_email_subject: subject,
        draft_cold_email_body: body,
      } as never)
      .eq('id', leadId)
    if (e) return { ok: false, error: e.message }
    pushTicker('✏️', 'Edits saved')
    await load()
    return { ok: true }
  }

  /** Approve every queued item — the "I'm caught up, just send it" pass. */
  async function approveAll(): Promise<{ sent: number; failed: number; deferred: number; deferredReason?: string }> {
    const items = [...queueItems.value]
    let sent = 0
    let failed = 0
    let deferred = 0
    let deferredReason: string | undefined
    for (const q of items) {
      const r = await approve(q.lead)
      if (r.ok) sent++
      else if (r.deferred) {
        deferred++
        deferredReason = r.error
        // If the gate just defers everything, no point looping further — every
        // remaining lead would hit the same wall. Bail and let the operator
        // either tune the window or wait for it to open.
        break
      }
      else failed++
      // Tiny stagger so multi-window-open doesn't get blocked
      await new Promise((r) => setTimeout(r, 250))
    }
    return { sent, failed, deferred, deferredReason }
  }

  /** Manually trigger draft-followup-emails (Touch 2/3 cron).
   *  Useful when Vercel cron isn't firing reliably or for ad-hoc
   *  testing. Uses the current admin session's JWT so no service
   *  role key needs to be exposed to the client. */
  async function runFollowupCron(): Promise<{ ok: boolean; counts?: { drafted: number; failed: number; touch2: number; touch3: number }; error?: string }> {
    pushTicker('🔄', 'Running followup cron…')
    const { data, error: fnErr } = await supabase.functions.invoke('draft-followup-emails', {
      body: {},
    })
    if (fnErr) {
      pushTicker('⚠️', `Followup cron failed: ${fnErr.message}`)
      return { ok: false, error: fnErr.message }
    }
    const result = data as { counts?: { drafted: number; failed: number; touch2: number; touch3: number }; error?: string } | null
    if (result?.error) {
      pushTicker('⚠️', `Followup cron error: ${result.error}`)
      return { ok: false, error: result.error }
    }
    const counts = result?.counts ?? { drafted: 0, failed: 0, touch2: 0, touch3: 0 }
    pushTicker('✍️', `Followup cron: ${counts.touch2} Touch 2 · ${counts.touch3} Touch 3 drafted`)
    await load()
    return { ok: true, counts }
  }

  /** Flip the auto-approve master switch. Stored in cs_settings so it
   *  persists across reloads. */
  async function setAutoApprove(value: boolean) {
    await saveSettings({ outreach_auto_approve: value } as never)
    pushTicker(value ? '🤖' : '👀', value
      ? 'Auto-approve ON — drafts will send without you'
      : 'Auto-approve OFF — drafts will queue for review')
  }

  // ── Lifecycle ──────────────────────────────────────────────────────
  onMounted(() => {
    void load()
    agingInterval = setInterval(() => {
      for (const t of ticker.value) t.ageSec += 1
    }, 1000)
    // Run the draft step every 25s so new leads turn into drafts
    // without page reload. Cheap operation when there's nothing to do.
    chainInterval = setInterval(() => {
      void runDraftStep()
    }, 25_000)
  })

  onBeforeUnmount(() => {
    if (agingInterval) clearInterval(agingInterval)
    if (chainInterval) clearInterval(chainInterval)
  })

  return {
    // Data
    leads,
    loading,
    error,
    queueItems,
    draftCandidates,

    // Ticker + counters
    ticker,
    sentTodayCount,
    draftedTodayCount,
    lastApprovedId,

    // Settings passthrough
    autoApprove: computed(() => !!settings.value.outreach_auto_approve),
    minScore: computed(() => settings.value.outreach_auto_draft_min_score ?? 65),
    gmailConnected: computed(() => !!settings.value.gmail_refresh_token),
    gmailEmail: computed(() => settings.value.gmail_account_email ?? null),
    setAutoApprove,

    // Actions
    load,
    runDraftStep,
    runFollowupCron,
    approve,
    approveAll,
    skip,
    saveEdit,
  }
}

/** Compose a Gmail "compose new" URL with subject/body pre-filled. */
function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: subject,
    body,
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}
