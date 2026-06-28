<script setup lang="ts">
/**
 * /admin/health — diagnostic dashboard for system observability.
 *
 * Shows in one place:
 *  - Cron freshness (last activity timestamp per scheduled job, inferred
 *    from related tables)
 *  - Queue depths (drafts ready for review, stuck in 'drafting' state,
 *    warm follow-ups overdue, outreach paused)
 *  - Recent activity (sends today, replies today, drafts today)
 *  - Data quality (bounced, invalid email format, no-contact)
 *
 * Each section colors a traffic-light status indicator (green / amber /
 * red) so anomalies surface immediately without reading numbers.
 *
 * Auto-refresh every 30s. Manual refresh button. Admin-only route.
 *
 * Built deliberately as a single page that fires several parallel
 * queries on mount. Each query is read-only + indexed-friendly. Doesn't
 * add load to the system it's monitoring.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'

// ── Reactive state for each metric we display
const loading = ref(true)
const error = ref<string | null>(null)
const lastRefreshedAt = ref<Date | null>(null)

// Cron freshness: most recent timestamp from the relevant table
const lastDraftAt = ref<string | null>(null)        // outreach-auto-draft cron
const lastFollowupDraftAt = ref<string | null>(null) // draft-followup-emails
const lastSendAt = ref<string | null>(null)         // auto-outreach-send
const lastReplyAt = ref<string | null>(null)        // gmail-inbox-poll
const lastWarmDraftAt = ref<string | null>(null)    // warm-followup-cron

// Queue depths
const draftsReadyCount = ref(0)
const stuckDraftingCount = ref(0)
const warmOverdueCount = ref(0)
const outreachPausedCount = ref(0)
// Warm follow-ups scheduled in the next 7 days — shows what's coming
// so the operator isn't surprised by the next batch of warm drafts.
const warmScheduled7dCount = ref(0)

// Recent activity (today)
const sendsTodayCount = ref(0)
const repliesTodayCount = ref(0)
const draftsTodayCount = ref(0)

// Data quality flags
const bouncedCount = ref(0)
const invalidFormatCount = ref(0)
const repliedTotalCount = ref(0)

// ── Cold-email campaign metrics (rolling 30 days)
// Volume + reply quality + queue-by-personalization. Lets you see at a
// glance whether the campaign is converting, where in the funnel it
// leaks, and how much of the queue is personalization_none (which is
// now blocked from auto-send in auto-outreach-send).
const sendsTouch1_30d = ref(0)
const sendsTouch2_30d = ref(0)
const sendsTouch3_30d = ref(0)
const repliesPositive_30d = ref(0)
const repliesInterested_30d = ref(0)
const repliesObjection_30d = ref(0)
const repliesNegative_30d = ref(0)
const repliesNoise_30d = ref(0)        // oof + unsubscribe combined
const draftsHighCount = ref(0)
const draftsMediumCount = ref(0)
const draftsLowCount = ref(0)
const draftsNoneCount = ref(0)

// ── Auto-refresh timer
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function refreshAll() {
  loading.value = true
  error.value = null
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const nowIso = new Date().toISOString()
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fire all queries in parallel. Each one is small and indexed.
    const [
      lastDraft,
      lastFollowupDraft,
      lastSend,
      lastReply,
      lastWarmDraft,
      draftsReady,
      stuckDrafting,
      warmOverdue,
      warmScheduled7d,
      outreachPaused,
      sendsToday,
      repliesToday,
      draftsToday,
      bounced,
      invalidFormat,
      repliedTotal,
      // ── Cold-email campaign (30d): volume, replies, queue quality
      t1_30d,
      t2_30d,
      t3_30d,
      positive30d,
      interested30d,
      objection30d,
      negative30d,
      noise30d,
      draftsHigh,
      draftsMedium,
      draftsLow,
      draftsNone,
    ] = await Promise.all([
      supabase.from('cs_leads').select('draft_cold_email_at').not('draft_cold_email_at', 'is', null).order('draft_cold_email_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cs_leads').select('draft_cold_email_at').contains('tags', ['followup_drafted_touch_2']).order('draft_cold_email_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cs_outreach_sends').select('sent_at').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cs_replies').select('received_at').order('received_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cs_leads').select('draft_cold_email_at').contains('tags', ['warm_followup_drafted']).order('draft_cold_email_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'ready_for_review'),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'drafting').lt('updated_at', stuckCutoff),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('warm_followup_state', 'queued').lte('warm_followup_due_at', nowIso),
      // Warm follow-ups scheduled in the next 7 days but not yet due.
      // Lets the operator see what's coming so the next batch of warm
      // drafts isn't a surprise.
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('warm_followup_state', 'queued').gt('warm_followup_due_at', nowIso).lte('warm_followup_due_at', sevenDaysFromNow),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('outreach_paused', true),
      supabase.from('cs_outreach_sends').select('*', { count: 'exact', head: true }).gte('sent_at', todayIso),
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).gte('received_at', todayIso),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).gte('draft_cold_email_at', todayIso),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).not('bounced_at', 'is', null),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).contains('tags', ['invalid_email_format']),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('status', 'replied'),
      // ── Cold-email 30d volume by touch number
      supabase.from('cs_outreach_sends').select('*', { count: 'exact', head: true }).eq('touch_number', 1).gte('sent_at', thirtyDaysAgoIso),
      supabase.from('cs_outreach_sends').select('*', { count: 'exact', head: true }).eq('touch_number', 2).gte('sent_at', thirtyDaysAgoIso),
      supabase.from('cs_outreach_sends').select('*', { count: 'exact', head: true }).eq('touch_number', 3).gte('sent_at', thirtyDaysAgoIso),
      // ── Cold-email 30d replies by classification
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).eq('classification', 'positive').gte('received_at', thirtyDaysAgoIso),
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).eq('classification', 'interested').gte('received_at', thirtyDaysAgoIso),
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).eq('classification', 'objection').gte('received_at', thirtyDaysAgoIso),
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).eq('classification', 'negative').gte('received_at', thirtyDaysAgoIso),
      supabase.from('cs_replies').select('*', { count: 'exact', head: true }).in('classification', ['oof', 'unsubscribe']).gte('received_at', thirtyDaysAgoIso),
      // ── Draft queue right now, by personalization quality tag
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'ready_for_review').contains('tags', ['personalization_high']),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'ready_for_review').contains('tags', ['personalization_medium']),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'ready_for_review').contains('tags', ['personalization_low']),
      supabase.from('cs_leads').select('*', { count: 'exact', head: true }).eq('draft_state', 'ready_for_review').contains('tags', ['personalization_none']),
    ])

    type TimestampRow = { draft_cold_email_at?: string | null; sent_at?: string | null; received_at?: string | null }
    lastDraftAt.value = (lastDraft.data as TimestampRow | null)?.draft_cold_email_at ?? null
    lastFollowupDraftAt.value = (lastFollowupDraft.data as TimestampRow | null)?.draft_cold_email_at ?? null
    lastSendAt.value = (lastSend.data as TimestampRow | null)?.sent_at ?? null
    lastReplyAt.value = (lastReply.data as TimestampRow | null)?.received_at ?? null
    lastWarmDraftAt.value = (lastWarmDraft.data as TimestampRow | null)?.draft_cold_email_at ?? null

    draftsReadyCount.value = draftsReady.count ?? 0
    stuckDraftingCount.value = stuckDrafting.count ?? 0
    warmOverdueCount.value = warmOverdue.count ?? 0
    warmScheduled7dCount.value = warmScheduled7d.count ?? 0
    outreachPausedCount.value = outreachPaused.count ?? 0

    sendsTodayCount.value = sendsToday.count ?? 0
    repliesTodayCount.value = repliesToday.count ?? 0
    draftsTodayCount.value = draftsToday.count ?? 0

    bouncedCount.value = bounced.count ?? 0
    invalidFormatCount.value = invalidFormat.count ?? 0
    repliedTotalCount.value = repliedTotal.count ?? 0

    sendsTouch1_30d.value = t1_30d.count ?? 0
    sendsTouch2_30d.value = t2_30d.count ?? 0
    sendsTouch3_30d.value = t3_30d.count ?? 0
    repliesPositive_30d.value = positive30d.count ?? 0
    repliesInterested_30d.value = interested30d.count ?? 0
    repliesObjection_30d.value = objection30d.count ?? 0
    repliesNegative_30d.value = negative30d.count ?? 0
    repliesNoise_30d.value = noise30d.count ?? 0
    draftsHighCount.value = draftsHigh.count ?? 0
    draftsMediumCount.value = draftsMedium.count ?? 0
    draftsLowCount.value = draftsLow.count ?? 0
    draftsNoneCount.value = draftsNone.count ?? 0

    lastRefreshedAt.value = new Date()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load health metrics'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshAll()
  refreshTimer = setInterval(refreshAll, 30 * 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// ── Display helpers
function fmtAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

// Traffic-light status for cron freshness: green if recent, amber if
// stale, red if very stale. Thresholds differ per cron based on
// expected cadence.
function freshnessStatus(iso: string | null, amberMin: number, redMin: number): 'green' | 'amber' | 'red' | 'unknown' {
  if (!iso) return 'unknown'
  const ms = Date.now() - new Date(iso).getTime()
  const min = ms / 60000
  if (min < amberMin) return 'green'
  if (min < redMin) return 'amber'
  return 'red'
}

const draftCronStatus = computed(() => freshnessStatus(lastDraftAt.value, 60, 240))
const followupCronStatus = computed(() => freshnessStatus(lastFollowupDraftAt.value, 240, 1440))
const sendCronStatus = computed(() => freshnessStatus(lastSendAt.value, 240, 1440))
const inboxPollStatus = computed(() => freshnessStatus(lastReplyAt.value, 1440, 7 * 1440))
const warmCronStatus = computed(() => freshnessStatus(lastWarmDraftAt.value, 7 * 1440, 30 * 1440))

// Queue depth status: green if low, amber/red if high
function queueStatus(count: number, amberAt: number, redAt: number): 'green' | 'amber' | 'red' {
  if (count >= redAt) return 'red'
  if (count >= amberAt) return 'amber'
  return 'green'
}

const stuckDraftingStatus = computed(() => queueStatus(stuckDraftingCount.value, 1, 5))
const warmOverdueStatus = computed(() => queueStatus(warmOverdueCount.value, 1, 5))

function statusBg(s: 'green' | 'amber' | 'red' | 'unknown'): string {
  if (s === 'green') return 'bg-success/15 text-success border-success/30'
  if (s === 'amber') return 'bg-warn/15 text-warn border-warn/30'
  if (s === 'red') return 'bg-danger/15 text-danger border-danger/30'
  return 'bg-surface-elevated text-ink-muted border-divider'
}

// Reply + positive rate computed from the 30d snapshot. Reply rate is
// per-send (any reply / sends_t1+t2+t3) since cold-email industry
// reports it that way. Positive rate is per unique recipient (positive
// + interested / Touch 1 sends) since each lead gets exactly one T1
// and that's the buyer-set we're really pitching.
const replyRate30d = computed<number | null>(() => {
  const totalSent = sendsTouch1_30d.value + sendsTouch2_30d.value + sendsTouch3_30d.value
  if (totalSent === 0) return null
  const totalReplies = repliesPositive_30d.value + repliesInterested_30d.value + repliesObjection_30d.value + repliesNegative_30d.value
  return (totalReplies / totalSent) * 100
})
const positiveRate30d = computed<number | null>(() => {
  if (sendsTouch1_30d.value === 0) return null
  const positive = repliesPositive_30d.value + repliesInterested_30d.value
  return (positive / sendsTouch1_30d.value) * 100
})

const overallStatus = computed<'green' | 'amber' | 'red'>(() => {
  const statuses = [
    draftCronStatus.value,
    followupCronStatus.value,
    sendCronStatus.value,
    stuckDraftingStatus.value,
    warmOverdueStatus.value,
  ]
  if (statuses.includes('red')) return 'red'
  if (statuses.includes('amber')) return 'amber'
  return 'green'
})

const overallLabel = computed(() => {
  if (overallStatus.value === 'green') return 'Healthy'
  if (overallStatus.value === 'amber') return 'Watch'
  return 'Attention needed'
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 space-y-6">
    <!-- ── Header + overall status ─────────────────────────────────── -->
    <header class="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-ink tracking-tight">System health</h1>
        <p class="text-sm text-ink-muted mt-0.5">
          Cron freshness, queue depths, recent activity. Auto-refreshes every 30s.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold border"
          :class="statusBg(overallStatus)"
        >
          {{ overallLabel }}
        </span>
        <span class="text-xs text-ink-muted">
          Last refreshed: {{ lastRefreshedAt ? fmtAgo(lastRefreshedAt.toISOString()) : 'never' }}
        </span>
        <button
          type="button"
          class="text-xs text-brand hover:underline disabled:opacity-50"
          :disabled="loading"
          @click="refreshAll"
        >
          {{ loading ? 'Refreshing…' : 'Refresh now' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
      {{ error }}
    </p>

    <!-- ── Cron freshness ─────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Cron freshness</span>
        <p class="text-xs text-ink-muted">Inferred from the most recent row each cron writes to.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(draftCronStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">outreach-auto-draft</div>
          <div class="text-sm font-semibold mt-0.5">Last draft: {{ fmtAgo(lastDraftAt) }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">Expected: every 5 min</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(followupCronStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">draft-followup-emails</div>
          <div class="text-sm font-semibold mt-0.5">Last Touch 2/3: {{ fmtAgo(lastFollowupDraftAt) }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">Expected: every 30 min</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(sendCronStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">auto-outreach-send</div>
          <div class="text-sm font-semibold mt-0.5">Last send: {{ fmtAgo(lastSendAt) }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">Expected: every 5 min when drafts approved</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(inboxPollStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">gmail-inbox-poll</div>
          <div class="text-sm font-semibold mt-0.5">Last reply: {{ fmtAgo(lastReplyAt) }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">Expected: replies arrive irregularly</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(warmCronStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">warm-followup-cron</div>
          <div class="text-sm font-semibold mt-0.5">Last warm draft: {{ fmtAgo(lastWarmDraftAt) }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">Expected: only when scheduled</div>
        </div>
      </div>
    </section>

    <!-- ── Queue depths ───────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Queue depths</span>
        <p class="text-xs text-ink-muted">In-flight + waiting work across the pipeline.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Drafts ready for review</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ draftsReadyCount }}</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(stuckDraftingStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">Stuck drafting (10m+)</div>
          <div class="text-2xl font-bold tabular-nums mt-0.5">{{ stuckDraftingCount }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">orphan recovery happens every cron tick</div>
        </div>
        <div class="rounded-card border px-3 py-2.5" :class="statusBg(warmOverdueStatus)">
          <div class="text-[10px] uppercase font-semibold tracking-wide opacity-80">Warm followups overdue</div>
          <div class="text-2xl font-bold tabular-nums mt-0.5">{{ warmOverdueCount }}</div>
          <div class="text-[11px] opacity-70 mt-0.5">cron picks these up every 30 min</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Warm followups · next 7d</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ warmScheduled7dCount }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">scheduled WT1/WT2/WT3 coming up</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Outreach paused</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ outreachPausedCount }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">manually paused leads</div>
        </div>
      </div>
    </section>

    <!-- ── Today's activity ───────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Today's activity</span>
        <p class="text-xs text-ink-muted">Resets at local midnight.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Sends today</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ sendsTodayCount }}</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Replies today</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ repliesTodayCount }}</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Drafts created today</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ draftsTodayCount }}</div>
        </div>
      </div>
    </section>

    <!-- ── Cold email campaign · 30d ─────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Cold email campaign · last 30 days</span>
        <p class="text-xs text-ink-muted">
          Send volume by touch, reply quality by classification, draft queue by personalization. Industry baseline: 1-3% reply rate, 0.3-0.9% positive rate.
        </p>
      </div>
      <!-- Volume + rate row -->
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Touch 1 sent</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ sendsTouch1_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">unique recipients</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Touch 2 sent</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ sendsTouch2_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">~3 days after T1</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Touch 3 sent</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ sendsTouch3_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">~7 days after T1</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Reply rate</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">
            {{ replyRate30d === null ? '—' : `${replyRate30d.toFixed(1)}%` }}
          </div>
          <div class="text-[11px] text-ink-disabled mt-0.5">any reply / all sends</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Positive rate</div>
          <div class="text-2xl font-bold text-success tabular-nums mt-0.5">
            {{ positiveRate30d === null ? '—' : `${positiveRate30d.toFixed(2)}%` }}
          </div>
          <div class="text-[11px] text-ink-disabled mt-0.5">positive+interested / T1</div>
        </div>
      </div>
      <!-- Reply classification breakdown -->
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Positive</div>
          <div class="text-2xl font-bold text-success tabular-nums mt-0.5">{{ repliesPositive_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">"book a call"</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Interested</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ repliesInterested_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">"tell me more"</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Objection</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ repliesObjection_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">winnable</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Negative</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ repliesNegative_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">"no thanks"</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Noise</div>
          <div class="text-2xl font-bold text-ink-muted tabular-nums mt-0.5">{{ repliesNoise_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">oof + unsubscribe</div>
        </div>
      </div>
      <!-- Draft queue by personalization quality -->
      <div class="border-t border-divider pt-4">
        <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted mb-2">
          Drafts ready for review, by personalization quality
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
            <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">High</div>
            <div class="text-2xl font-bold text-success tabular-nums mt-0.5">{{ draftsHighCount }}</div>
            <div class="text-[11px] text-ink-disabled mt-0.5">verbatim quote or named owner</div>
          </div>
          <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
            <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Medium</div>
            <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ draftsMediumCount }}</div>
            <div class="text-[11px] text-ink-disabled mt-0.5">specific signal, no quote</div>
          </div>
          <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
            <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Low</div>
            <div class="text-2xl font-bold text-warn tabular-nums mt-0.5">{{ draftsLowCount }}</div>
            <div class="text-[11px] text-ink-disabled mt-0.5">generic industry framing</div>
          </div>
          <div class="rounded-card border border-danger/30 bg-danger/5 px-3 py-2.5">
            <div class="text-[10px] uppercase font-semibold tracking-wide text-danger">None</div>
            <div class="text-2xl font-bold text-danger tabular-nums mt-0.5">{{ draftsNoneCount }}</div>
            <div class="text-[11px] text-danger/70 mt-0.5 font-medium">blocked from auto-send</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Data quality ───────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Data quality</span>
        <p class="text-xs text-ink-muted">Diagnostic counters from across the lead pipeline.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Bounced (all-time)</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ bouncedCount }}</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Invalid email format</div>
          <div class="text-2xl font-bold text-ink tabular-nums mt-0.5">{{ invalidFormatCount }}</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated/40 px-3 py-2.5">
          <div class="text-[10px] uppercase font-semibold tracking-wide text-ink-muted">Replied (all-time)</div>
          <div class="text-2xl font-bold text-success tabular-nums mt-0.5">{{ repliedTotalCount }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
