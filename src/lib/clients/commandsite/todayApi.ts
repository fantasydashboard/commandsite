/**
 * CommandSite Today — REAL data aggregator.
 *
 * Pulls live state across cs_leads, cs_outreach_sends, cs_replies,
 * cs_deals to produce the queue items + ticker events the Today
 * module renders.
 *
 * Each queue item maps to a real concrete action; "Approve" navigates
 * the user to the page where the action's interactive controls live
 * (Outreach Ready-to-send, Inbox, Pipeline, etc.). The counter is
 * real — sends + replies + advances logged this week.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

export interface TodayTickerEvent {
  icon: string
  text: string
  ageSec: number
}

interface DraftLead {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  draft_cold_email_subject: string | null
  draft_cold_email_body: string | null
  draft_cold_email_at: string | null
  icp_score: number | null
  tags: string[] | null
}

interface PositiveReply {
  id: string
  lead_id: string
  body: string
  classification: string | null
  drafted_response: string | null
  draft_sent_at: string | null
  received_at: string
  cs_leads: { company_name: string | null; contact_name: string | null } | null
}

interface UpcomingDeal {
  id: string
  company_name: string
  contact_name: string | null
  scheduled_at: string | null
  discovery_brief: string | null
  stage: string
  stage_entered_at: string | null
  post_call_followup_draft: string | null
  post_call_followup_sent_at: string | null
}

export function useCommandSiteToday() {
  const draftsReady = ref<DraftLead[]>([])
  const positiveReplies = ref<PositiveReply[]>([])
  const upcomingDemos = ref<UpcomingDeal[]>([])
  const staleDemoDones = ref<UpcomingDeal[]>([])
  const recentSendCount = ref(0)
  const recentReplyCount = ref(0)
  const recentDealAdvances = ref(0)
  const recentEvents = ref<TodayTickerEvent[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      // 7 days ago for "recent" filters
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

      // 1. Drafts ready to send (have a draft, not yet contacted)
      const { data: drafts } = await supabase
        .from('cs_leads')
        .select('id, company_name, contact_name, contact_email, draft_cold_email_subject, draft_cold_email_body, draft_cold_email_at, icp_score, tags')
        .not('draft_cold_email_subject', 'is', null)
        .is('contacted_at', null)
        .order('icp_score', { ascending: false, nullsFirst: false })
        .limit(20)
      draftsReady.value = (drafts ?? []) as unknown as DraftLead[]

      // 2. Positive replies awaiting Josh's response
      const { data: replies } = await supabase
        .from('cs_replies')
        .select('id, lead_id, body, classification, drafted_response, draft_sent_at, received_at, cs_leads(company_name, contact_name)')
        .in('classification', ['positive', 'interested', 'objection'])
        .is('draft_sent_at', null)
        .order('received_at', { ascending: false })
        .limit(10)
      positiveReplies.value = (replies ?? []) as unknown as PositiveReply[]

      // 3. Upcoming demos (next 7 days, no brief yet)
      const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data: demos } = await supabase
        .from('cs_deals')
        .select('id, company_name, contact_name, scheduled_at, discovery_brief, stage, stage_entered_at, post_call_followup_draft, post_call_followup_sent_at')
        .gte('scheduled_at', todayStart.toISOString())
        .lte('scheduled_at', sevenDaysOut)
        .neq('stage', 'closed_lost')
        .order('scheduled_at', { ascending: true })
        .limit(10)
      upcomingDemos.value = (demos ?? []) as unknown as UpcomingDeal[]

      // 4. Stale demo_done deals (3+ days no follow-up sent)
      const { data: staleDeals } = await supabase
        .from('cs_deals')
        .select('id, company_name, contact_name, scheduled_at, discovery_brief, stage, stage_entered_at, post_call_followup_draft, post_call_followup_sent_at')
        .eq('stage', 'demo_done')
        .lt('stage_entered_at', threeDaysAgo)
        .is('post_call_followup_sent_at', null)
        .order('stage_entered_at', { ascending: true })
        .limit(10)
      staleDemoDones.value = (staleDeals ?? []) as unknown as UpcomingDeal[]

      // 5. Counters: sends, replies, deal advances last 7 days
      const { count: sendCount } = await supabase
        .from('cs_outreach_sends')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', sevenDaysAgo)
      recentSendCount.value = sendCount ?? 0

      const { count: replyCount } = await supabase
        .from('cs_replies')
        .select('id', { count: 'exact', head: true })
        .gte('received_at', sevenDaysAgo)
      recentReplyCount.value = replyCount ?? 0

      const { count: dealCount } = await supabase
        .from('cs_deals')
        .select('id', { count: 'exact', head: true })
        .gte('stage_entered_at', sevenDaysAgo)
      recentDealAdvances.value = dealCount ?? 0

      // 6. Recent events for the live ticker
      const { data: recentSends } = await supabase
        .from('cs_outreach_sends')
        .select('subject, sent_at, cs_leads(company_name)')
        .order('sent_at', { ascending: false })
        .limit(8)

      const { data: recentReplies } = await supabase
        .from('cs_replies')
        .select('classification, received_at, cs_leads(company_name)')
        .order('received_at', { ascending: false })
        .limit(8)

      const { data: recentDealEvents } = await supabase
        .from('cs_deals')
        .select('company_name, stage, stage_entered_at')
        .order('stage_entered_at', { ascending: false })
        .limit(6)

      type WithCo = { cs_leads: { company_name: string | null } | null }
      type SendRow = { subject: string | null; sent_at: string } & WithCo
      type ReplyRow = { classification: string | null; received_at: string } & WithCo
      type DealRow = { company_name: string; stage: string; stage_entered_at: string | null }

      const events: TodayTickerEvent[] = []
      const now = Date.now()

      for (const s of (recentSends ?? []) as unknown as SendRow[]) {
        const ageSec = Math.floor((now - new Date(s.sent_at).getTime()) / 1000)
        const co = s.cs_leads?.company_name ?? 'lead'
        events.push({ icon: '📤', text: `Sent to ${co}: "${(s.subject ?? '').slice(0, 50)}"`, ageSec })
      }
      for (const r of (recentReplies ?? []) as unknown as ReplyRow[]) {
        const ageSec = Math.floor((now - new Date(r.received_at).getTime()) / 1000)
        const co = r.cs_leads?.company_name ?? 'lead'
        const tone = r.classification === 'positive' ? '✅' : r.classification === 'objection' ? '🤔' : '💬'
        events.push({ icon: tone, text: `Reply from ${co} — ${r.classification ?? 'pending'}`, ageSec })
      }
      for (const d of (recentDealEvents ?? []) as DealRow[]) {
        if (!d.stage_entered_at) continue
        const ageSec = Math.floor((now - new Date(d.stage_entered_at).getTime()) / 1000)
        const stageMap: Record<string, string> = {
          demo_booked: '📅 Demo booked',
          demo_done: '🎤 Demo complete',
          proposal_sent: '📨 Proposal sent',
          closed_won: '🎉 Closed won',
          closed_lost: '❌ Closed lost',
        }
        const label = stageMap[d.stage] ?? `Deal → ${d.stage}`
        events.push({ icon: label.split(' ')[0], text: `${d.company_name} — ${label.split(' ').slice(1).join(' ')}`, ageSec })
      }

      // Sort newest first, cap at 8
      recentEvents.value = events.sort((a, b) => a.ageSec - b.ageSec).slice(0, 8)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** Build approval-queue items from the loaded data. */
  const queueItems = computed<ApprovalQueueItem[]>(() => {
    const items: ApprovalQueueItem[] = []

    // 1. Top draft ready (one item per draft, capped at 3)
    const topDrafts = draftsReady.value.slice(0, 3)
    for (const d of topDrafts) {
      items.push({
        id: `today-draft-${d.id}`,
        icon: '📨',
        badge: 'Cold email',
        badgeClass: 'bg-brand/15 text-brand',
        title: `Send to ${d.company_name}`,
        recipient: `${d.contact_name ?? d.contact_email ?? 'Lead'} · ICP ${d.icp_score ?? '—'}${(d.tags ?? []).includes('followup_drafted_touch_2') ? ' · TOUCH 2' : (d.tags ?? []).includes('followup_drafted_touch_3') ? ' · TOUCH 3' : ''}`,
        preview: `Subject: ${d.draft_cold_email_subject ?? ''}\n\n${(d.draft_cold_email_body ?? '').slice(0, 220)}${(d.draft_cold_email_body ?? '').length > 220 ? '…' : ''}`,
        approved_response: `Routing to Outreach → Ready to send. Click "Open Gmail + mark sent" on the ${d.company_name} row to fire the actual send.`,
        ticker_after_approval: `Routed to Outreach for ${d.company_name}`,
      })
    }
    if (draftsReady.value.length > 3) {
      items.push({
        id: 'today-drafts-more',
        icon: '📋',
        badge: 'Outreach · batch',
        badgeClass: 'bg-accent/15 text-accent',
        title: `+${draftsReady.value.length - 3} more drafts ready to send`,
        recipient: 'All sitting in Outreach → Ready to send',
        preview: `Top picks: ${draftsReady.value.slice(3, 8).map((d) => d.company_name).join(', ')}${draftsReady.value.length > 8 ? '…' : ''}`,
        approved_response: 'All drafts queued — work through them at your pace from Outreach. Each one has the Open-Gmail + mark-sent shortcut.',
        ticker_after_approval: `${draftsReady.value.length - 3} additional drafts surfaced`,
      })
    }

    // 2. Positive replies awaiting response
    for (const r of positiveReplies.value.slice(0, 3)) {
      const co = r.cs_leads?.company_name ?? 'lead'
      const contact = r.cs_leads?.contact_name ?? ''
      const cls = r.classification ?? 'reply'
      const preview = (r.body ?? '').slice(0, 200)
      items.push({
        id: `today-reply-${r.id}`,
        icon: cls === 'positive' ? '✅' : cls === 'objection' ? '🤔' : '💬',
        badge: cls === 'positive' ? 'Positive reply' : cls === 'objection' ? 'Objection' : 'Reply',
        badgeClass: cls === 'positive' ? 'bg-success/15 text-success' : cls === 'objection' ? 'bg-warn/15 text-warn' : 'bg-brand/15 text-brand',
        title: `${co} replied — ${cls}`,
        recipient: `${contact} · received ${fmtAgo(r.received_at)}`,
        preview: r.drafted_response
          ? `Their reply: "${preview}${(r.body ?? '').length > 200 ? '…' : ''}"\n\nAda's drafted response is ready in Outreach → Inbox. Approve to review + send.`
          : `Their reply: "${preview}${(r.body ?? '').length > 200 ? '…' : ''}"\n\nNo Ada draft yet — open inbox to classify + draft response.`,
        approved_response: `Routing to Outreach → Inbox. Ada's drafted response is editable there before send.`,
        ticker_after_approval: `Routed to inbox for ${co} reply`,
      })
    }

    // 3. Upcoming demos missing a brief
    for (const d of upcomingDemos.value.filter((x) => !x.discovery_brief).slice(0, 2)) {
      const when = d.scheduled_at ? new Date(d.scheduled_at) : null
      const whenStr = when
        ? when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' at ' + when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'soon'
      items.push({
        id: `today-brief-${d.id}`,
        icon: '🧠',
        badge: 'Pre-call brief',
        badgeClass: 'bg-brand/15 text-brand',
        title: `Brief for ${d.company_name} demo`,
        recipient: `${d.contact_name ?? ''} · ${whenStr}`,
        preview: `Pre-call brief not generated yet. Sage drafts a 90-second read covering: who they are, the pain you saw, 3 questions to ask, the hook to lead with, and risks to watch for.`,
        approved_response: `Routing to Outreach → Demos. Click "Generate brief" on the ${d.company_name} card to fire it.`,
        ticker_after_approval: `Routed to demos for ${d.company_name} brief`,
      })
    }

    // 4. Stale demo_done deals
    for (const d of staleDemoDones.value.slice(0, 2)) {
      const days = d.stage_entered_at
        ? Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / (24 * 60 * 60 * 1000))
        : 0
      items.push({
        id: `today-stale-${d.id}`,
        icon: '⏰',
        badge: 'Stale deal',
        badgeClass: 'bg-warn/15 text-warn',
        title: `${d.company_name} — demo done ${days}d ago, no follow-up sent`,
        recipient: `${d.contact_name ?? ''} · proposal cycle stalling`,
        preview: d.post_call_followup_draft
          ? `Ada drafted a post-call follow-up after the demo — still in your queue. Open Outreach → Demos to review and send.`
          : `No follow-up drafted yet. Open Outreach → Demos and use the post-call form to give Ada the recap inputs; she'll draft the follow-up email.`,
        approved_response: `Routing to Outreach → Demos. Either approve the existing draft or fill in the post-call form for ${d.company_name}.`,
        ticker_after_approval: `Routed to demos for ${d.company_name} follow-up`,
      })
    }

    return items
  })

  const resolvedThisWeek = computed(() =>
    recentSendCount.value + recentReplyCount.value + recentDealAdvances.value,
  )

  const isQuietWeek = computed(() =>
    queueItems.value.length === 0 && recentEvents.value.length === 0,
  )

  onMounted(load)

  return {
    draftsReady,
    positiveReplies,
    upcomingDemos,
    staleDemoDones,
    recentSendCount,
    recentReplyCount,
    recentDealAdvances,
    recentEvents,
    queueItems,
    resolvedThisWeek,
    isQuietWeek,
    loading,
    error,
    load,
  }
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
