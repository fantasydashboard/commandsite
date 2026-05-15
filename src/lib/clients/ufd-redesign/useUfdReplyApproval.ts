/**
 * UFD Reply Approval composable.
 *
 * Parallel to CommandSite's useReplyApproval but reads from
 * ufd_replies and sends responses via gmail-send with tenant='ufd'
 * (so replies come from support@ultimatefantasydashboard.com,
 * threaded into the same conversation).
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { UfdReply, UfdReplyClassification } from '@/types/database'

export interface UfdReplyQueueItem {
  reply: UfdReply
}

export const UFD_CLASSIFICATION_META: Record<UfdReplyClassification, {
  label: string
  pillClass: string
  description: string
}> = {
  feedback:     { label: 'Feedback',     pillClass: 'bg-brand/15 text-brand',         description: 'Product feedback' },
  question:     { label: 'Question',     pillClass: 'bg-accent/15 text-accent',       description: 'They asked something' },
  support:      { label: 'Support',      pillClass: 'bg-warn/15 text-warn',           description: 'Stuck — needs help' },
  cancel:       { label: 'Cancel',       pillClass: 'bg-danger/15 text-danger',       description: 'Wants to cancel' },
  praise:       { label: 'Praise',       pillClass: 'bg-success/15 text-success',     description: 'Compliment' },
  oof:          { label: 'OOF',          pillClass: 'bg-ink-muted/10 text-ink-muted', description: 'Auto-reply' },
  unsubscribe:  { label: 'Unsubscribe',  pillClass: 'bg-danger/10 text-danger',       description: 'Asked to be removed' },
  unclassified: { label: 'Unclassified', pillClass: 'bg-ink-muted/10 text-ink-muted', description: 'Bones is still drafting' },
}

export function useUfdReplyApproval() {
  const replies = ref<UfdReply[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const busy = ref(false)
  const lastSentId = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('ufd_replies')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(200)
    if (e) { error.value = e.message; loading.value = false; return }
    replies.value = (data ?? []) as UfdReply[]
    loading.value = false
  }

  /** Queue items: needs_review, not auto-handled, not already sent. */
  const queueItems = computed<UfdReplyQueueItem[]>(() => {
    return replies.value
      .filter((r) => {
        if (r.draft_sent_at) return false
        if (r.auto_handled) return false
        if (r.classification === 'oof') return false
        if (r.classification === 'unsubscribe') return false
        if (r.reviewed_at) return false
        return r.needs_review
      })
      .map((reply) => ({ reply }))
  })

  /** Approve + send the drafted reply, threaded via gmail-send tenant='ufd'. */
  async function approve(reply: UfdReply, overrides?: { subject?: string; body?: string }): Promise<{ ok: boolean; error?: string }> {
    if (busy.value) return { ok: false, error: 'Another approve in flight' }
    busy.value = true

    const subject = overrides?.subject
      ?? (reply.subject?.startsWith('Re:') ? reply.subject : `Re: ${reply.subject ?? ''}`.trim())
    const body = overrides?.body ?? reply.drafted_response ?? ''
    if (!body) { busy.value = false; return { ok: false, error: 'No drafted response' } }

    const { data, error: fnErr } = await supabase.functions.invoke('gmail-send', {
      body: {
        to: reply.from_email,
        subject,
        body,
        thread_id: reply.gmail_thread_id ?? undefined,
        in_reply_to_message_id: reply.gmail_message_id ?? undefined,
        tenant: 'ufd',
      },
    })
    if (fnErr) { busy.value = false; return { ok: false, error: `Gmail send: ${fnErr.message}` } }
    const result = data as { ok?: boolean; error?: string } | null
    if (!result?.ok) { busy.value = false; return { ok: false, error: result?.error ?? 'gmail-send returned no ok' } }

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('ufd_replies')
      .update({
        draft_sent_at: now,
        draft_approved: true,
        draft_approved_at: now,
        needs_review: false,
        reviewed_at: now,
        drafted_response: body,
      } as never)
      .eq('id', reply.id)
    if (updErr) { busy.value = false; return { ok: false, error: `DB write: ${updErr.message}` } }

    lastSentId.value = reply.id
    setTimeout(() => { if (lastSentId.value === reply.id) lastSentId.value = null }, 1500)
    busy.value = false
    await load()
    return { ok: true }
  }

  async function skip(reply: UfdReply): Promise<{ ok: boolean; error?: string }> {
    const now = new Date().toISOString()
    const { error: e } = await supabase
      .from('ufd_replies')
      .update({ needs_review: false, reviewed_at: now } as never)
      .eq('id', reply.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  async function saveEdit(reply: UfdReply, body: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('ufd_replies')
      .update({ drafted_response: body } as never)
      .eq('id', reply.id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  async function retryDraft(reply: UfdReply): Promise<{ ok: boolean; error?: string }> {
    const { data, error: fnErr } = await supabase.functions.invoke('draft-ufd-reply', {
      body: { reply_id: reply.id },
    })
    if (fnErr) return { ok: false, error: fnErr.message }
    const result = data as { ok?: boolean; error?: string } | null
    if (!result?.ok) return { ok: false, error: result?.error ?? 'draft-ufd-reply returned no ok' }
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
  }
}
