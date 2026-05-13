/**
 * Outreach realtime ticker feeder.
 *
 * Watches the Supabase tables that back the Outreach page and pushes
 * each new arrival onto the live ticker. Replaces the demo-pool that
 * used to cycle hardcoded "Send logged…" / "Reply received…" strings.
 *
 * Streams watched:
 *   • cs_outreach_sends   → 📤 send events
 *   • cs_replies          → 💬 / ✅ / 🤔 reply events (icon by classification)
 *   • cs_leads (drafts)   → ✍️ draft events (when draft_state flips to
 *                           ready_for_review out-of-session, e.g. cron)
 *   • cs_deals (bookings) → 📅 booking events
 *
 * We poll every 20 seconds. The first run sets a "last seen" cursor;
 * subsequent runs only emit events newer than the cursor so we don't
 * spam the ticker on every poll.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'

export interface TickerPusher {
  pushEvent(ev: { icon: string; text: string }): void
}

interface ReplyRow {
  id: string
  lead_id: string
  classification: string | null
  received_at: string
}

interface SendRow {
  id: string
  lead_id: string
  subject: string | null
  sent_at: string
  source: string | null
}

interface DraftedLeadRow {
  id: string
  company_name: string
  contact_name: string | null
  draft_cold_email_at: string
  draft_state: string | null
}

interface DealRow {
  id: string
  company_name: string
  contact_name: string | null
  created_at: string
}

interface LeadLookupRow {
  id: string
  company_name: string
  contact_name: string | null
}

const POLL_INTERVAL_MS = 20_000

function tonefForClassification(c: string | null): string {
  switch (c) {
    case 'positive':   return '✅'
    case 'objection':  return '🤔'
    case 'oof':        return '🌴'
    case 'unsubscribe':return '🚫'
    case 'wrong_person':return '↪️'
    case 'negative':   return '👎'
    default:           return '💬'
  }
}

function classLabel(c: string | null): string {
  if (!c) return 'pending classification'
  return c.replace(/_/g, ' ')
}

export function useOutreachRealtime(getTicker: () => TickerPusher | null) {
  // Cursors — never emit older than these on a poll
  let cursorSends   = new Date().toISOString()
  let cursorReplies = new Date().toISOString()
  let cursorDrafts  = new Date().toISOString()
  let cursorDeals   = new Date().toISOString()
  // Track session-id of sends made from THIS tab so we don't re-emit
  // ticker events for our own approve clicks (the chain already pushes
  // them in real time).
  const seenSendIds = new Set<string>()

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let leadNameCache = new Map<string, string>()

  async function loadLeadNames(ids: string[]): Promise<Map<string, string>> {
    const missing = ids.filter((id) => !leadNameCache.has(id))
    if (missing.length === 0) return leadNameCache
    const { data } = await supabase
      .from('cs_leads')
      .select('id, company_name, contact_name')
      .in('id', missing)
    for (const row of (data ?? []) as LeadLookupRow[]) {
      leadNameCache.set(row.id, row.contact_name || row.company_name || 'lead')
    }
    return leadNameCache
  }

  async function tick() {
    const ticker = getTicker()
    if (!ticker) return

    // Pull a small window from each stream that's newer than cursor.
    const [sendsRes, repliesRes, draftsRes, dealsRes] = await Promise.all([
      supabase
        .from('cs_outreach_sends')
        .select('id, lead_id, subject, sent_at, source')
        .gt('sent_at', cursorSends)
        .order('sent_at', { ascending: true })
        .limit(10),
      supabase
        .from('cs_replies')
        .select('id, lead_id, classification, received_at')
        .gt('received_at', cursorReplies)
        .order('received_at', { ascending: true })
        .limit(10),
      supabase
        .from('cs_leads')
        .select('id, company_name, contact_name, draft_cold_email_at, draft_state')
        .eq('draft_state', 'ready_for_review')
        .gt('draft_cold_email_at', cursorDrafts)
        .order('draft_cold_email_at', { ascending: true })
        .limit(10),
      supabase
        .from('cs_deals')
        .select('id, company_name, contact_name, created_at')
        .gt('created_at', cursorDeals)
        .order('created_at', { ascending: true })
        .limit(10),
    ])

    // ── Sends
    const sends = (sendsRes.data ?? []) as SendRow[]
    if (sends.length > 0) {
      await loadLeadNames(sends.map((s) => s.lead_id))
      for (const s of sends) {
        if (seenSendIds.has(s.id)) continue
        const who = leadNameCache.get(s.lead_id) ?? 'lead'
        const verb = s.source === 'auto_approve' ? 'Auto-sent' : 'Sent'
        ticker.pushEvent({ icon: '📤', text: `${verb} to ${who}` })
        cursorSends = s.sent_at
      }
    }

    // ── Replies
    const replies = (repliesRes.data ?? []) as ReplyRow[]
    if (replies.length > 0) {
      await loadLeadNames(replies.map((r) => r.lead_id))
      for (const r of replies) {
        const who = leadNameCache.get(r.lead_id) ?? 'lead'
        ticker.pushEvent({
          icon: tonefForClassification(r.classification),
          text: `Reply from ${who} — ${classLabel(r.classification)}`,
        })
        cursorReplies = r.received_at
      }
    }

    // ── Drafts (out-of-session, e.g. cron run)
    const drafts = (draftsRes.data ?? []) as DraftedLeadRow[]
    for (const d of drafts) {
      const who = d.contact_name || d.company_name || 'lead'
      ticker.pushEvent({ icon: '✍️', text: `Drafted to ${who}` })
      cursorDrafts = d.draft_cold_email_at
    }

    // ── New deals (Calendly bookings)
    const deals = (dealsRes.data ?? []) as DealRow[]
    for (const d of deals) {
      const who = d.contact_name || d.company_name || 'prospect'
      ticker.pushEvent({ icon: '📅', text: `${who} booked a demo` })
      cursorDeals = d.created_at
    }
  }

  /** Mark a send as already-rendered in the ticker so polling doesn't
   *  re-emit it. Use this from approve() so each click only narrates
   *  once even if the poll catches up before the user moves on. */
  function markSendSeen(sendId: string) {
    seenSendIds.add(sendId)
  }

  /** Seed the cursors so the first poll only catches truly-new events.
   *  Without this, the first poll would emit every existing row.
   *  Call this once at mount with the most-recent timestamps you know. */
  function seedCursors(seed: {
    lastSendAt?: string | null
    lastReplyAt?: string | null
    lastDraftAt?: string | null
    lastDealAt?: string | null
  }) {
    if (seed.lastSendAt) cursorSends = seed.lastSendAt
    if (seed.lastReplyAt) cursorReplies = seed.lastReplyAt
    if (seed.lastDraftAt) cursorDrafts = seed.lastDraftAt
    if (seed.lastDealAt) cursorDeals = seed.lastDealAt
  }

  onMounted(() => {
    pollTimer = setInterval(() => { void tick() }, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  return { seedCursors, markSendSeen, tick }
}
