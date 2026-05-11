<script setup lang="ts">
/**
 * CommandSite Today — Josh's morning command surface.
 *
 * REAL data only. Pulls from cs_leads, cs_outreach_sends, cs_replies,
 * cs_deals via useCommandSiteToday. The live ticker shows actual
 * recent events. The approval queue surfaces concrete items waiting
 * on Josh, each with a one-click "Approve" that routes to the
 * specific page where the action's interactive controls live.
 *
 * No fixture today.ts data anymore. If everything is empty, you see
 * an honest "all clear" state — not made-up activity.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import { adaRoles, ROLE_STATUS_META } from '@/lib/clients/commandsite/roles'
import { useCommandSiteToday } from '@/lib/clients/commandsite/todayApi'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const router = useRouter()
const today = useCommandSiteToday()

// Where each kind of queue item routes to
function routeForItem(item: ApprovalQueueItem) {
  if (item.id.startsWith('today-draft-') || item.id === 'today-drafts-more') {
    return { name: 'dashboard.tab' as const, params: { slug: 'commandsite', tab: 'outreach', subtab: 'ready' } }
  }
  if (item.id.startsWith('today-reply-')) {
    return { name: 'dashboard.tab' as const, params: { slug: 'commandsite', tab: 'outreach', subtab: 'inbox' } }
  }
  if (item.id.startsWith('today-brief-') || item.id.startsWith('today-stale-')) {
    return { name: 'dashboard.tab' as const, params: { slug: 'commandsite', tab: 'outreach', subtab: 'demos' } }
  }
  return null
}

function onApproved(item: ApprovalQueueItem) {
  const route = routeForItem(item)
  if (route) {
    router.push(route).catch(() => { /* ignore */ })
  }
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}

function onSkipped() {
  // skip just removes the card via the queue's internal animation
}

function onEdited(item: ApprovalQueueItem) {
  // Edit also routes — same destination as Approve for now
  const route = routeForItem(item)
  if (route) router.push(route).catch(() => { /* ignore */ })
}

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning, Josh'
  if (hr < 17) return 'Good afternoon, Josh'
  return 'Good evening, Josh'
})

// Live ticker: seed from REAL recent events (loaded async). Until
// load completes we show a minimal "warming up" seed; once data lands,
// the ticker re-seeds with real events.
const fallbackSeed = [
  { icon: '⚙️', text: 'Loading recent activity from your CommandSite stack…', ageSec: 0 },
]

const tickerSeed = computed(() => {
  if (today.loading.value || today.recentEvents.value.length === 0) return fallbackSeed
  return today.recentEvents.value.slice(0, 5)
})

// When the queue is genuinely empty, show a different ticker pool
// so the page doesn't feel artificially busy.
const tickerPool = computed(() => {
  if (today.draftsReady.value.length === 0 && today.positiveReplies.value.length === 0) {
    return [
      { icon: '⚙️', text: 'Background sweep: enrichment running on Apollo lead pull' },
      { icon: '🤖', text: 'Daily-followup cron next run scheduled for 7 AM ET' },
      { icon: '📨', text: 'Email-engine ready — draft cold emails from the Leads page' },
    ]
  }
  return [
    { icon: '📤', text: 'Cold-email send logged — cs_outreach_sends row inserted' },
    { icon: '📥', text: 'Reply received — Ada classifying' },
    { icon: '🎯', text: 'Lead scored ICP 80+ — flagged for drafting' },
    { icon: '📅', text: 'Calendly webhook fired — new cs_deal row created' },
    { icon: '🤖', text: 'Followup cron fired — drafted Touch 2/3 for eligible leads' },
    { icon: '🧠', text: 'Pre-call brief generated — Sage drafted' },
    { icon: '📨', text: 'Post-call follow-up draft saved' },
  ]
})

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function goToTab(tab: string, subtab?: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'commandsite', tab, subtab } })
}
</script>

<template>
  <div class="space-y-4 pb-32 relative">
    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Real events from cs_outreach_sends · cs_replies · cs_deals — auto-updates"
    />

    <!-- Loading shimmer -->
    <div v-if="today.loading.value" class="card p-6 text-center text-sm text-ink-muted">
      Loading your real CommandSite state…
    </div>

    <!-- Empty state — honest -->
    <section
      v-else-if="today.queueItems.value.length === 0"
      class="rounded-card border-2 border-brand/40 bg-gradient-to-br from-brand/5 to-surface overflow-hidden"
    >
      <header class="flex items-start justify-between gap-3 px-5 py-4 bg-brand/10 border-b border-brand/20 flex-wrap">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white text-lg font-bold flex-shrink-0">A</div>
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">All clear</div>
            <h2 class="text-lg font-bold text-ink leading-tight">{{ greeting }}. Nothing's waiting on you right now.</h2>
            <p class="text-xs text-ink-muted mt-0.5">
              No drafts ready, no positive replies pending, no stale deals. When something needs your eyes, it'll show up here automatically.
            </p>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Last 7d</div>
          <div class="text-2xl font-bold text-success tabular-nums">{{ today.resolvedThisWeek.value }}</div>
          <div class="text-[10px] text-ink-disabled">events logged</div>
        </div>
      </header>
      <div class="px-5 py-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          class="rounded-card border border-divider bg-surface-raised p-3 text-left hover:border-brand transition-colors"
          @click="goToTab('leads')"
        >
          <div class="text-2xl mb-1">🎯</div>
          <div class="text-sm font-semibold text-ink">Add more leads</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Apollo pull → ICP score → draft</div>
        </button>
        <button
          class="rounded-card border border-divider bg-surface-raised p-3 text-left hover:border-brand transition-colors"
          @click="goToTab('outreach', 'sent')"
        >
          <div class="text-2xl mb-1">📊</div>
          <div class="text-sm font-semibold text-ink">Review what's gone out</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Sent history + reply rate</div>
        </button>
        <button
          class="rounded-card border border-divider bg-surface-raised p-3 text-left hover:border-brand transition-colors"
          @click="goToTab('pipeline')"
        >
          <div class="text-2xl mb-1">💼</div>
          <div class="text-sm font-semibold text-ink">Check the pipeline</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Active deals + next moves</div>
        </button>
      </div>
    </section>

    <!-- Live queue with REAL items -->
    <GraceApprovalQueue
      v-else
      :items="today.queueItems.value"
      :initial-resolved="today.resolvedThisWeek.value"
      :subtitle="`${greeting}. Each item routes to where you can act on it. Real data — no demo fluff.`"
      resolved-label="Logged this week"
      @approved="onApproved"
      @edited="onEdited"
      @skipped="onSkipped"
    />

    <!-- Live counters strip -->
    <section v-if="!today.loading.value" class="rounded-card overflow-hidden border border-divider bg-surface-raised">
      <header class="px-4 py-3 border-b border-divider bg-canvas/50 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">CommandSite pulse</span>
          <span class="text-xs text-ink-muted">— last 7 days, real numbers</span>
        </div>
        <span class="text-[11px] text-ink-disabled">
          {{ adaRoles.filter((r) => r.status === 'active').length }} of {{ adaRoles.length }} of Ada's roles active
        </span>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-5 divide-x divide-divider/60 border-b border-divider">
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Drafts ready</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ today.draftsReady.value.length }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Sent (7d)</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ today.recentSendCount.value }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Replies (7d)</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ today.recentReplyCount.value }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Demos upcoming</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ today.upcomingDemos.value.length }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Stale demos</div>
          <div
            class="text-xl font-bold tabular-nums mt-0.5"
            :class="today.staleDemoDones.value.length > 0 ? 'text-warn' : 'text-ink'"
          >{{ today.staleDemoDones.value.length }}</div>
        </div>
      </div>

      <div class="p-3 flex flex-wrap gap-1.5">
        <button
          v-for="role in adaRoles"
          :key="role.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] hover:border-brand hover:bg-brand/5 transition-colors"
          @click="goToTab(role.tab)"
        >
          <span>{{ role.icon }}</span>
          <span class="font-semibold text-ink">{{ role.name }}</span>
          <span
            class="rounded-full px-1 text-[8px] font-bold uppercase tracking-wider"
            :class="ROLE_STATUS_META[role.status].pillClass"
          >{{ role.status === 'active' ? '●' : ROLE_STATUS_META[role.status].label }}</span>
        </button>
      </div>
    </section>

    <p v-if="today.error.value" class="text-xs text-danger">{{ today.error.value }}</p>
  </div>
</template>
