/**
 * CommandSite Replies data layer.
 *
 * Wraps cs_replies — the inbound-reply log fed by the smartlead-reply
 * edge function. Every reply is already classified by Claude with a
 * confidence score; rows above the auto-threshold are auto-handled
 * (oof, unsubscribe, clear negative). The rest land in needs_review
 * for the Outreach inbox.
 *
 * Falls back to fixture data when the table doesn't exist or is empty
 * so the UI is functional pre-deploy.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsReply, CsReplyClassification } from '@/types/database'

const FIXTURE_REPLIES: CsReply[] = [
  {
    id: 'fix-r1', lead_id: 'fix-2', deal_id: 'fix-deal-1',
    smartlead_campaign_id: 'cmp-001', smartlead_sequence_id: 'seq-002',
    smartlead_message_id: 'msg-fixture-001', smartlead_thread_id: 'thr-001',
    from_email: 'maria@sunshineplumbing.co', from_name: 'Maria Castillo',
    subject: 'Re: quick question about Sunshine Plumbing',
    body: "Hey Josh — interested. We've been chasing missed calls for months. Got a 15-min slot this week?",
    received_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    classification: 'positive', classification_confidence: 0.96,
    classification_reason: 'Explicit ask to book a meeting + acknowledges pain point',
    classification_model: 'claude-sonnet-4-6',
    classified_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    auto_handled: false, auto_handled_action: 'Promoted to pipeline + drafted Calendly intro for your one-click approval.', auto_handled_at: new Date(Date.now() - 1000 * 60 * 13).toISOString(),
    needs_review: true, reviewed_by: null, reviewed_at: null, raw_payload: null,
    drafted_response: "Maria — appreciate you replying. Chasing missed calls month after month is exactly the loop Ada was built to break. 15 min works on my end. Grab whatever's open: https://calendly.com/commandsite/discovery-walkthrough — I'll show you what she'd handle for Sunshine specifically.",
    drafted_at: new Date(Date.now() - 1000 * 60 * 13).toISOString(),
    draft_approved: false, draft_approved_at: null, draft_sent_at: null,
    gmail_message_id: null, gmail_thread_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 13).toISOString(),
  },
  {
    id: 'fix-r2', lead_id: 'fix-4', deal_id: null,
    smartlead_campaign_id: 'cmp-001', smartlead_sequence_id: 'seq-001',
    smartlead_message_id: 'msg-fixture-002', smartlead_thread_id: 'thr-002',
    from_email: 'wesley@blueridge-roof.com', from_name: 'Wesley Tate',
    subject: 'Re: BlueRidge — quick win',
    body: "Probably too pricey for us right now. We're a 6-person shop, doing fine with paper.",
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    classification: 'objection', classification_confidence: 0.84,
    classification_reason: 'Price concern + size objection — winnable with right framing',
    classification_model: 'claude-sonnet-4-6',
    classified_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    auto_handled: false, auto_handled_action: null, auto_handled_at: null,
    needs_review: true, reviewed_by: null, reviewed_at: null, raw_payload: null,
    drafted_response: null, drafted_at: null,
    draft_approved: false, draft_approved_at: null, draft_sent_at: null,
    gmail_message_id: null, gmail_thread_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'fix-r3', lead_id: null, deal_id: null,
    smartlead_campaign_id: 'cmp-001', smartlead_sequence_id: 'seq-001',
    smartlead_message_id: 'msg-fixture-003', smartlead_thread_id: 'thr-003',
    from_email: 'derrick@bignationalplumbing.com', from_name: 'Derrick Powell',
    subject: 'Out of office',
    body: "I'm out of office until May 12th with limited email access. For urgent matters, contact ops@bignationalplumbing.com.",
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    classification: 'oof', classification_confidence: 0.99,
    classification_reason: 'Standard out-of-office auto-reply with return date',
    classification_model: 'claude-sonnet-4-6',
    classified_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    auto_handled: true,
    auto_handled_action: 'Logged as out-of-office. Did not advance sequence.',
    auto_handled_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    needs_review: false, reviewed_by: null, reviewed_at: null, raw_payload: null,
    drafted_response: null, drafted_at: null,
    draft_approved: false, draft_approved_at: null, draft_sent_at: null,
    gmail_message_id: null, gmail_thread_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: 'fix-r4', lead_id: null, deal_id: null,
    smartlead_campaign_id: 'cmp-001', smartlead_sequence_id: 'seq-002',
    smartlead_message_id: 'msg-fixture-004', smartlead_thread_id: 'thr-004',
    from_email: 'anonymous@example.com', from_name: 'Lisa Park',
    subject: 'Re: take me off',
    body: 'Please remove me from your list. Not interested.',
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    classification: 'unsubscribe', classification_confidence: 0.97,
    classification_reason: 'Explicit removal request',
    classification_model: 'claude-sonnet-4-6',
    classified_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    auto_handled: true,
    auto_handled_action: 'Marked lead as disqualified + suppressed from future sends.',
    auto_handled_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    needs_review: false, reviewed_by: null, reviewed_at: null, raw_payload: null,
    drafted_response: null, drafted_at: null,
    draft_approved: false, draft_approved_at: null, draft_sent_at: null,
    gmail_message_id: null, gmail_thread_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
]

export const CLASSIFICATION_META: Record<CsReplyClassification, {
  label: string
  pillClass: string
  description: string
}> = {
  positive:     { label: 'Positive',     pillClass: 'bg-success/15 text-success', description: 'Wants to move forward' },
  objection:    { label: 'Objection',    pillClass: 'bg-warn/15 text-warn',       description: 'Pushback you can handle' },
  interested:   { label: 'Interested',   pillClass: 'bg-accent/15 text-accent',   description: 'Curious — needs nudge' },
  oof:          { label: 'Out of office',pillClass: 'bg-ink-muted/10 text-ink-muted', description: 'Auto-reply' },
  unsubscribe:  { label: 'Unsubscribe',  pillClass: 'bg-danger/10 text-danger',   description: 'Asked to be removed' },
  negative:     { label: 'Negative',     pillClass: 'bg-danger/15 text-danger',   description: 'Hard no' },
  unclassified: { label: 'Unclassified', pillClass: 'bg-ink-muted/10 text-ink-muted', description: 'Classifier failed' },
}

export function useReplies() {
  const replies = ref<CsReply[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const usingFixture = ref(false)

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
      replies.value = FIXTURE_REPLIES
      usingFixture.value = true
    } else if (!data || data.length === 0) {
      replies.value = FIXTURE_REPLIES
      usingFixture.value = true
    } else {
      replies.value = data as CsReply[]
      usingFixture.value = false
    }
    loading.value = false
  }

  async function markReviewed(id: string) {
    const idx = replies.value.findIndex((r) => r.id === id)
    if (idx >= 0) replies.value[idx] = { ...replies.value[idx], needs_review: false, reviewed_at: new Date().toISOString() }
    if (usingFixture.value) return
    const { error: e } = await supabase
      .from('cs_replies')
      .update({ needs_review: false, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (e) error.value = e.message
  }

  /** Approve the AI-drafted reply and mark it as ready to send. Phase 5
   *  flow — once approved, a follow-on job (or manual click) sends via
   *  Smartlead's reply API. For demo, we just flip the flag. */
  async function approveDraft(id: string) {
    const now = new Date().toISOString()
    const idx = replies.value.findIndex((r) => r.id === id)
    if (idx >= 0) replies.value[idx] = {
      ...replies.value[idx],
      draft_approved: true,
      draft_approved_at: now,
      needs_review: false,
      reviewed_at: now,
    }
    if (usingFixture.value) return
    const { error: e } = await supabase
      .from('cs_replies')
      .update({ draft_approved: true, draft_approved_at: now, needs_review: false, reviewed_at: now })
      .eq('id', id)
    if (e) error.value = e.message
  }

  // Derived views the Outreach module reads
  const needsReview = computed(() => replies.value.filter((r) => r.needs_review))
  const autoHandled = computed(() => replies.value.filter((r) => r.auto_handled))
  /** Phase 5: positive replies that have a drafted Calendly intro waiting */
  const draftsAwaitingApproval = computed(() => replies.value.filter(
    (r) => r.drafted_response && !r.draft_approved && !r.draft_sent_at,
  ))

  // KPI numbers
  const stats = computed(() => {
    const all = replies.value
    const last24h = all.filter((r) => Date.now() - new Date(r.received_at).getTime() < 24 * 60 * 60 * 1000)
    const positive = all.filter((r) => r.classification === 'positive')
    return {
      total: all.length,
      needs_review: needsReview.value.length,
      auto_handled: autoHandled.value.length,
      drafts_pending: draftsAwaitingApproval.value.length,
      positive: positive.length,
      last_24h: last24h.length,
      auto_handled_pct: all.length > 0 ? autoHandled.value.length / all.length : 0,
    }
  })

  onMounted(load)

  return {
    replies, loading, error, usingFixture, load,
    markReviewed, approveDraft,
    needsReview, autoHandled, draftsAwaitingApproval, stats,
  }
}
