/**
 * Reply approval composable — the actions side of the Reply Approval
 * Queue. Reads cs_replies for inbound messages that need a response,
 * exposes the queue items + approve / edit / skip handlers.
 *
 * Approve flow:
 *   1. Send the drafted_response via gmail-send, threaded into the
 *      original reply's gmail_thread_id (so the recipient sees it as
 *      a normal email-thread reply).
 *   2. Mark cs_replies.draft_sent_at + needs_review=false so the card
 *      slides out of the queue.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/withTimeout'
import type { CsReply, CsLead, CsReplyClassification } from '@/types/database'
import type { ReplyQueueItem } from '@/components/CommandSiteReplyApprovalQueue.vue'

export function useReplyApproval() {
  const replies = ref<CsReply[]>([])
  const leadsCache = ref<Map<string, { company: string | null; contact: string | null }>>(new Map())
  const loading = ref(true)
  const error = ref<string | null>(null)
  const busy = ref(false)
  const lastSentId = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_replies')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(200)
    if (e) {
      error.value = e.message
      loading.value = false
      return
    }
    const rows = (data ?? []) as CsReply[]
    replies.value = rows

    // Pull lead names for any reply with a lead_id we haven't cached
    const missingLeadIds = [...new Set(
      rows
        .map((r) => r.lead_id)
        .filter((id): id is string => !!id && !leadsCache.value.has(id))
    )]
    if (missingLeadIds.length > 0) {
      const { data: leadRows } = await supabase
        .from('cs_leads')
        .select('id, company_name, contact_name')
        .in('id', missingLeadIds)
      for (const l of (leadRows ?? []) as Pick<CsLead, 'id' | 'company_name' | 'contact_name'>[]) {
        leadsCache.value.set(l.id, {
          company: l.company_name,
          contact: l.contact_name,
        })
      }
    }

    loading.value = false
  }

  /** Replies that need a response — exclude auto-handled, sent, or
   *  reviewed. Show even if drafted_response is null (so Josh can see
   *  Sage is still working on the draft and isn't surprised). */
  const queueItems = computed<ReplyQueueItem[]>(() => {
    return replies.value
      .filter((r) => {
        if (r.draft_sent_at) return false           // already sent
        if (r.auto_handled) return false             // OOF / unsub auto-handled
        if (r.classification === 'oof') return false
        if (r.classification === 'unsubscribe') return false
        if (r.reviewed_at) return false              // human marked done
        return r.needs_review
      })
      .map((reply) => {
        const lead = reply.lead_id ? leadsCache.value.get(reply.lead_id) : null
        return {
          reply,
          lead_company: lead?.company ?? null,
          lead_contact: lead?.contact ?? null,
        }
      })
  })

  /** Approve a drafted reply → send via gmail-send (in-thread) → mark
   *  cs_replies.draft_sent_at + needs_review=false. */
  async function approve(reply: CsReply, overrides?: { subject?: string; body?: string }): Promise<{ ok: boolean; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another approve in flight' }
    busy.value = true

    const subject = overrides?.subject
      ?? (reply.subject?.startsWith('Re:') ? reply.subject : `Re: ${reply.subject ?? ''}`.trim())
    const body = overrides?.body ?? reply.drafted_response ?? ''
    if (!body) {
      busy.value = false
      return { ok: false, error: 'No drafted response to send' }
    }
    if (!reply.from_email) {
      busy.value = false
      return { ok: false, error: 'Reply has no from_email' }
    }

    // Call gmail-send with threading params. Wrap in withTimeout so a
    // hung Gmail token or hung function never leaves the operator
    // staring at "Sending..." forever. 30s is generous for a healthy
    // gmail-send (typically <2s); anything longer means something is
    // genuinely wrong and we surface it as an error.
    let data: unknown
    let fnErr: { message: string } | null = null
    try {
      const res = await withTimeout(
        supabase.functions.invoke('gmail-send', {
          body: {
            to: reply.from_email,
            subject,
            body,
            thread_id: reply.gmail_thread_id ?? undefined,
            in_reply_to_message_id: reply.gmail_message_id ?? undefined,
            lead_id: reply.lead_id ?? undefined,
          },
        }),
        30_000,
        'Gmail send',
      )
      data = res.data
      fnErr = res.error
    } catch (err) {
      busy.value = false
      return { ok: false, error: err instanceof Error ? err.message : `Gmail send failed: ${String(err)}` }
    }
    if (fnErr) {
      busy.value = false
      return { ok: false, error: `Gmail send failed: ${fnErr.message}` }
    }
    const result = data as { ok?: boolean; message_id?: string; error?: string } | null
    if (!result?.ok) {
      busy.value = false
      return { ok: false, error: result?.error ?? 'gmail-send returned no ok' }
    }

    // Mark sent + reviewed
    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('cs_replies')
      .update({
        draft_sent_at: now,
        draft_approved: true,
        draft_approved_at: now,
        needs_review: false,
        reviewed_at: now,
        // Optionally store the edit so it's visible after-the-fact
        drafted_response: body,
      } as never)
      .eq('id', reply.id)
    if (updErr) {
      busy.value = false
      return { ok: false, error: `DB write: ${updErr.message}` }
    }

    // ── Auto-schedule warm follow-up for warm-classified replies ──────
    // Research: warm leads decay 50% per 5 days of silence. After Josh
    // sends a reply to an engaged prospect, the highest-leverage move
    // is a 5-day check-back if they don't respond. The warm-followup
    // cron picks up the schedule and drafts a WT1 5 days from now.
    //
    // Classifications that trigger auto-schedule:
    //   - positive: explicit interest
    //   - interested: signal of interest without commitment
    //   - objection: engaged but skeptical (still warm — pushback is engagement)
    //
    // Classifications that SKIP auto-schedule:
    //   - negative: not interested
    //   - unsubscribe / oof: out of office or opted out
    //   - unclassified: don't auto-act on ambiguous signal
    //
    // Operator can still manually cancel or reschedule via the Lead
    // Detail UI. Skip if:
    //   - warm_followup_state is already queued/drafted/sent (don't overwrite in-flight)
    //   - warm_followup_state = 'canceled' (operator explicitly opted out)
    //
    // Best-effort: failure here doesn't break the send.
    if (reply.lead_id) {
      const warmClassifications: CsReplyClassification[] = ['positive', 'interested', 'objection']
      const isWarm = reply.classification != null && warmClassifications.includes(reply.classification)
      if (isWarm) {
        try {
          const { data: leadRow } = await supabase
            .from('cs_leads')
            .select('warm_followup_state')
            .eq('id', reply.lead_id)
            .maybeSingle()
          const currentState = (leadRow as { warm_followup_state?: string | null } | null)?.warm_followup_state ?? null
          const isAdjustable = currentState == null || currentState === 'completed'
          if (isAdjustable) {
            const dueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
            await supabase
              .from('cs_leads')
              .update({
                warm_followup_due_at: dueAt,
                warm_followup_state: 'queued',
                warm_followup_touch: 1,
              } as never)
              .eq('id', reply.lead_id)
          }
        } catch (err) {
          // Don't break the send if the auto-schedule fails.
          console.warn(
            'Auto-schedule warm follow-up failed:',
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    }

    lastSentId.value = reply.id
    setTimeout(() => {
      if (lastSentId.value === reply.id) lastSentId.value = null
    }, 1500)
    busy.value = false
    await load()
    return { ok: true }
  }

  /** Mark a reply as a bounce — the "reply" is actually a delivery
   *  failure notification that the inbox poll's heuristics missed.
   *  Disqualifies the lead, sets bounced_at + bounce_reason.
   *
   *  IMPORTANT: we UPDATE the cs_replies row to auto_handled=true
   *  rather than deleting it. The row's gmail_message_id is what the
   *  unique index uses to dedup against future inbox poll runs — if
   *  we delete it, the same bounce email gets re-inserted as a fresh
   *  reply on the next 10-min poll. Keeping the row + flagging it as
   *  handled gives us both: filtered out of the queue AND immune to
   *  re-insertion. */
  async function markAsBounce(reply: CsReply): Promise<{ ok: boolean; error?: string }> {
    if (!reply.lead_id) return { ok: false, error: 'Reply has no lead_id — can\'t mark its lead as bounced' }
    const now = new Date().toISOString()
    const reason = reply.subject?.startsWith('Re:')
      ? `Manually flagged from reply: ${reply.subject}`
      : `Manually flagged: ${reply.subject ?? reply.from_email}`
    const { error: leadErr } = await supabase
      .from('cs_leads')
      .update({
        bounced_at: now,
        bounce_reason: reason.slice(0, 200),
        status: 'disqualified',
      } as never)
      .eq('id', reply.lead_id)
    if (leadErr) return { ok: false, error: `Lead update: ${leadErr.message}` }
    const { error: updErr } = await supabase
      .from('cs_replies')
      .update({
        auto_handled: true,
        auto_handled_action: 'Manually flagged as bounce — lead disqualified',
        auto_handled_at: now,
        needs_review: false,
        reviewed_at: now,
      } as never)
      .eq('id', reply.id)
    if (updErr) return { ok: false, error: `Reply update: ${updErr.message}` }
    await load()
    return { ok: true }
  }

  /** Skip a reply — mark it reviewed without sending. Useful when
   *  Josh wants to respond personally outside the queue or when no
   *  response is needed. */
  async function skip(reply: CsReply): Promise<{ ok: boolean; error?: string }> {
    const now = new Date().toISOString()
    const { error: e } = await supabase
      .from('cs_replies')
      .update({
        needs_review: false,
        reviewed_at: now,
      } as never)
      .eq('id', reply.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  /** Re-trigger draft-reply for a reply whose drafted_response is null
   *  (Sage failed first time around). Calls the same edge function
   *  the inbox poll uses, with the existing reply_id so it UPDATES
   *  the row in place. */
  async function retryDraft(reply: CsReply): Promise<{ ok: boolean; error?: string }> {
    if (!reply.lead_id) return { ok: false, error: 'Reply has no lead_id — Sage needs lead context to draft' }
    const { data, error: fnErr } = await supabase.functions.invoke('draft-reply', {
      body: {
        reply_id: reply.id,
        lead_id: reply.lead_id,
        from_email: reply.from_email,
        from_name: reply.from_name ?? undefined,
        subject: reply.subject ?? undefined,
        body: reply.body,
      },
    })
    if (fnErr) return { ok: false, error: fnErr.message }
    const result = data as { drafted_response?: string; error?: string } | null
    if (result?.error) return { ok: false, error: result.error }
    await load()
    return { ok: true }
  }

  /** Save an edited draft without sending. Used by the edit modal's
   *  "Save edits, don't send yet" option. */
  async function saveEdit(reply: CsReply, body: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('cs_replies')
      .update({ drafted_response: body } as never)
      .eq('id', reply.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  onMounted(load)

  return {
    replies,
    queueItems,
    loading,
    error,
    busy,
    lastSentId,
    load,
    approve,
    skip,
    saveEdit,
    retryDraft,
    markAsBounce,
  }
}
