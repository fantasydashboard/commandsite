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
import type { CsReply, CsLead } from '@/types/database'
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

    // Call gmail-send with threading params
    const { data, error: fnErr } = await supabase.functions.invoke('gmail-send', {
      body: {
        to: reply.from_email,
        subject,
        body,
        thread_id: reply.gmail_thread_id ?? undefined,
        in_reply_to_message_id: reply.gmail_message_id ?? undefined,
        lead_id: reply.lead_id ?? undefined,
      },
    })
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

    lastSentId.value = reply.id
    setTimeout(() => {
      if (lastSentId.value === reply.id) lastSentId.value = null
    }, 1500)
    busy.value = false
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
  }
}
