/**
 * useConversations — the data hook for the Conversations page.
 *
 * Surfaces a per-lead conversation summary built from cs_outreach_sends +
 * cs_replies + cs_leads. Each row is one lead's full thread, sorted by
 * last activity. The right pane drills into one lead and reuses the
 * existing CommandSiteLeadTimeline for the chronological view.
 *
 * Reusability path (intentional — see PRODUCT.md re: future Ada/Grace clients):
 *   • `tenant` argument is the only thing that switches data sources.
 *     Defaults to 'commandsite' which hits cs_* tables. When we add
 *     Ada/Grace clients with their own outreach, we'll either route to
 *     tenant-scoped tables or add a `tenant_key` column on cs_* and
 *     filter here. Either way, callers don't change.
 *   • The shape returned (ConversationRow) is intentionally generic
 *     — no fields tied to "Ada" or "CommandSite." That naming lives in
 *     the UI layer (persona-name prop on the view component).
 *
 * Performance: this fetches up to LIMIT leads with activity, then for
 * each lead grabs the LAST send + LAST reply in two batch queries (no
 * N+1). For CommandSite at <500 active conversations this is cheap.
 * When a tenant crosses ~1k active threads we'll need a materialized
 * view; not now.
 */
import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsLead } from '@/types/database'

/** How many leads to scan per refresh. The hot path is "leads with any
 *  outreach activity" — leads that have never been contacted don't show
 *  up here. */
const LIMIT = 500

export type ConversationStatus =
  | 'needs_you'   // inbound reply landed; no outbound response yet
  | 'active'      // sequence in progress, no reply yet
  | 'paused'      // operator-paused or system-paused
  | 'done'        // sequence completed or manually closed

export interface ConversationRow {
  leadId: string
  companyName: string
  contactName: string | null
  contactEmail: string | null
  // Whichever event was last — drives sort + the snippet
  lastActivityAt: string
  lastActivityKind: 'send' | 'reply' | 'none'
  lastSubject: string | null
  lastSnippet: string | null
  // Send count from cs_leads.send_count — tells us how far through the
  // sequence we are
  sendCount: number
  // Did the most recent activity by either side leave the ball in our court?
  hasUnreadReply: boolean
  // The status the operator cares about (drives the filter chips)
  status: ConversationStatus
  // For the reply composer — the Gmail thread to thread into
  lastReplyThreadId: string | null
  // For the right-pane header — show ICP score, paused reason, etc.
  lead: CsLead
}

interface UseConversationsOptions {
  /** Multi-tenant hook (defaults to 'commandsite' — see file header). */
  tenant?: string
}

export function useConversations(opts: UseConversationsOptions = {}) {
  const tenant = opts.tenant ?? 'commandsite'
  // Today only commandsite is wired. The string is preserved on the
  // hook surface so callers can wire to it pre-emptively.
  if (tenant !== 'commandsite') {
    // eslint-disable-next-line no-console
    console.warn(`useConversations: tenant '${tenant}' not yet wired. Defaulting to commandsite tables.`)
  }

  const rows = ref<ConversationRow[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const selectedLeadId = ref<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────
  async function load() {
    loading.value = true
    error.value = null

    // 1. Pull leads that have ANY outreach activity. send_count > 0 OR
    //    a reply landed (we approximate that as status='replied' or
    //    outreach_paused=true with reason 'Reply received').
    //    Simpler heuristic: send_count > 0. Anyone we sent to is a row.
    const { data: leadsData, error: leadsErr } = await supabase
      .from('cs_leads')
      .select('*')
      .gt('send_count', 0)
      .order('updated_at', { ascending: false })
      .limit(LIMIT)

    if (leadsErr) {
      error.value = leadsErr.message
      loading.value = false
      return
    }

    const leads = (leadsData ?? []) as unknown as CsLead[]
    if (leads.length === 0) {
      rows.value = []
      loading.value = false
      return
    }

    const leadIds = leads.map((l) => l.id)

    // 2. Last send per lead — single batch query, then group client-side.
    //    Order desc + group by lead_id gets us the latest per lead.
    const { data: sendsData } = await supabase
      .from('cs_outreach_sends')
      .select('lead_id, subject, body, sent_at, touch_number')
      .in('lead_id', leadIds)
      .order('sent_at', { ascending: false })

    interface SendBucket {
      lead_id: string
      subject: string | null
      body: string | null
      sent_at: string
      touch_number: number | null
    }
    const lastSendByLead = new Map<string, SendBucket>()
    for (const row of (sendsData ?? []) as SendBucket[]) {
      // First row wins (sort is sent_at DESC, so first = latest)
      if (!lastSendByLead.has(row.lead_id)) lastSendByLead.set(row.lead_id, row)
    }

    // 3. Last reply per lead — same pattern.
    const { data: repliesData } = await supabase
      .from('cs_replies')
      .select('lead_id, subject, body, received_at, gmail_thread_id, from_name, from_email')
      .in('lead_id', leadIds)
      .order('received_at', { ascending: false })

    interface ReplyBucket {
      lead_id: string | null
      subject: string | null
      body: string
      received_at: string
      gmail_thread_id: string | null
      from_name: string | null
      from_email: string
    }
    const lastReplyByLead = new Map<string, ReplyBucket>()
    for (const row of (repliesData ?? []) as ReplyBucket[]) {
      if (!row.lead_id) continue
      if (!lastReplyByLead.has(row.lead_id)) lastReplyByLead.set(row.lead_id, row)
    }

    // 4. Compose per-lead conversation rows.
    const out: ConversationRow[] = []
    for (const lead of leads) {
      const lastSend = lastSendByLead.get(lead.id) ?? null
      const lastReply = lastReplyByLead.get(lead.id) ?? null

      // Pick the most recent event of either kind to drive sort + snippet
      const sendAt = lastSend ? new Date(lastSend.sent_at).getTime() : 0
      const replyAt = lastReply ? new Date(lastReply.received_at).getTime() : 0
      const replyIsLatest = replyAt > sendAt

      let kind: ConversationRow['lastActivityKind'] = 'none'
      let lastSubject: string | null = null
      let lastSnippet: string | null = null
      let lastActivityAt: string
      if (lastSend && !lastReply) {
        kind = 'send'
        lastSubject = lastSend.subject
        lastSnippet = lastSend.body
        lastActivityAt = lastSend.sent_at
      } else if (lastReply && !lastSend) {
        kind = 'reply'
        lastSubject = lastReply.subject
        lastSnippet = lastReply.body
        lastActivityAt = lastReply.received_at
      } else if (replyIsLatest && lastReply) {
        kind = 'reply'
        lastSubject = lastReply.subject
        lastSnippet = lastReply.body
        lastActivityAt = lastReply.received_at
      } else if (lastSend) {
        kind = 'send'
        lastSubject = lastSend.subject
        lastSnippet = lastSend.body
        lastActivityAt = lastSend.sent_at
      } else {
        // No activity — use updated_at as fallback. The lead wouldn't be
        // in this list (we filtered send_count > 0) but defensive.
        lastActivityAt = lead.updated_at
      }

      // Status derivation (order matters):
      //   - lead disqualified / archived → 'done' regardless of reply state.
      //     The operator formally closed the loop; the conversation must
      //     leave the Needs you queue even if a reply went unanswered.
      //   - paused → 'paused' (with 'needs_you' bump if there's an
      //     unanswered reply on a paused thread)
      //   - has reply, no send AFTER the reply → 'needs_you'
      //   - status = 'replied' but the reply has been handled → 'done'
      //   - otherwise sequence in progress → 'active'
      let status: ConversationStatus
      const needsResponse = lastReply && (!lastSend || replyAt > sendAt)
      if (lead.status === 'disqualified' || lead.status === 'archived') {
        status = 'done'
      } else if (lead.outreach_paused) {
        status = needsResponse ? 'needs_you' : 'paused'
      } else if (needsResponse) {
        status = 'needs_you'
      } else if (lead.status === 'replied') {
        status = 'done'
      } else {
        status = 'active'
      }

      out.push({
        leadId: lead.id,
        companyName: lead.company_name ?? '(unknown)',
        contactName: lead.contact_name ?? null,
        contactEmail: lead.contact_email ?? null,
        lastActivityAt,
        lastActivityKind: kind,
        lastSubject,
        lastSnippet,
        sendCount: lead.send_count ?? 0,
        hasUnreadReply: Boolean(needsResponse),
        status,
        lastReplyThreadId: lastReply?.gmail_thread_id ?? null,
        lead,
      })
    }

    // Final sort: most recent activity first.
    out.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    rows.value = out
    loading.value = false
  }

  onMounted(load)

  // ── Filtering + selection ─────────────────────────────────────────
  const filterChip = ref<'all' | ConversationStatus>('all')
  const searchQuery = ref('')

  const filtered: ComputedRef<ConversationRow[]> = computed(() => {
    let result = rows.value
    if (filterChip.value !== 'all') {
      result = result.filter((r) => r.status === filterChip.value)
    }
    const q = searchQuery.value.trim().toLowerCase()
    if (q) {
      result = result.filter((r) => {
        const hay = `${r.companyName} ${r.contactName ?? ''} ${r.contactEmail ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
    }
    return result
  })

  // Counts by status (for the filter chip badges)
  const counts = computed(() => {
    const c = { all: 0, needs_you: 0, active: 0, paused: 0, done: 0 }
    for (const r of rows.value) {
      c.all++
      c[r.status]++
    }
    return c
  })

  const selectedRow = computed<ConversationRow | null>(() => {
    if (!selectedLeadId.value) return null
    return rows.value.find((r) => r.leadId === selectedLeadId.value) ?? null
  })

  function select(leadId: string | null) {
    selectedLeadId.value = leadId
  }

  return {
    rows: rows as Ref<ConversationRow[]>,
    filtered,
    counts,
    loading,
    error,
    filterChip,
    searchQuery,
    selectedLeadId,
    selectedRow,
    select,
    refresh: load,
  }
}
