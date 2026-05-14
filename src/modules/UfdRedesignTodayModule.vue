<script setup lang="ts">
/**
 * UFD Redesign — Today (Bones command bridge).
 *
 * Live operational surface for a B2C digital product: real-time
 * activity ticker (signups, viral shares, MRR moves, churns) +
 * approval queue of Bones-drafted growth actions (tweet for a
 * viral spike, churn-save email, dunning rescue, season-event
 * campaign) + tight command bridge with the pulse + role chips.
 */
import { ref, computed, watch } from 'vue'
import type { Client } from '@/types/database'
import { todayStats } from '@/lib/clients/ufd-redesign/today'
import { useUfdTodayData } from '@/lib/clients/ufd-redesign/useUfdTodayData'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Live pulse + ticker seed pulled from ufd-stats (UFD's real Supabase).
// Approval queue items stay fixture-driven for now — those are
// Bones-drafted growth actions; the auto-draft loop that would
// generate them from live data is a separate build (Phase 3).
const live = useUfdTodayData()
const pulse = live.pulse
const stats = computed(() => todayStats())

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Morning, Josh'
  if (hr < 17) return 'Afternoon, Josh'
  return 'Evening, Josh'
})

function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}

// ── Approval queue — Bones-drafted growth actions ─────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'today-viral-mahomes',
    icon: '🔥',
    badge: 'Viral spike',
    badgeClass: 'bg-danger/15 text-danger',
    title: 'Hot Hand Heroes (Mahomes OT) — 1,840 shares in 6 hrs',
    recipient: '41% click-back to signup · biggest viral moment in 3 weeks',
    preview: 'Tweet thread drafted: "Mahomes\' overtime card just got shared 1,840 times. Here\'s why fantasy users won\'t shut up about it: 🧵 (1/6) RZ rate is up 18% over last 4 weeks. (2/6) His chemistry with Worthy is..." — full thread + Reddit comment for r/fantasyfootball queued. Click Approve to ship both.',
    approved_response: 'Posted to X + Reddit. Tracking the second wave — usually peaks 2 hours after a re-share into a community. If r/fantasyfootball karma >50 by tonight, I\'ll draft a Threads cross-post too.',
    ticker_after_approval: 'Mahomes wave content shipped — X + Reddit live',
  },
  {
    id: 'today-trial-payment-friction',
    icon: '💳',
    badge: 'Funnel signal',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Payment screen card-decline rate up 4pts',
    recipient: 'Trial → paid conversion dropped from 27% to 22% this month',
    preview: 'Most declines are pre-authorized cards getting flagged. Want me to A/B test a "try card #1 free, no card needed" variant on the trial signup flow? I\'ve drafted the variant copy + the success-state for it. Estimated lift: 3-5 paid conversions per week based on the drop-off pattern.',
    approved_response: 'A/B test scheduled. 50/50 split on new trials. I\'ll surface the result Wed when statistical significance lands (~400 trials in).',
    ticker_after_approval: 'A/B test live — "try card #1 free" variant on trial flow',
  },
  {
    id: 'today-churn-drew',
    icon: '⚠️',
    badge: 'Churn save',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Power user @drewsmith23 went quiet — 21 days no login',
    recipient: 'Paid for 18 months · was a top 5% sharer · matters',
    preview: '"Hey Drew — Josh from UFD. I noticed you haven\'t logged in for a few weeks and you used to be one of our most active sharers. Anything broken? Anything you want and we don\'t have? Hit reply, I read everything. — Josh"',
    approved_response: 'Sent. Drew\'s in the "respond if asked personally" tier — I\'ll surface his reply the moment it lands. If no reply by Friday, I\'ll soft-flag him for cancel-prevention email next week.',
    ticker_after_approval: 'Churn-save sent to @drewsmith23 (power user)',
  },
  {
    id: 'today-card-week12',
    icon: '🎴',
    badge: 'Card draft',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Sunday card drafted — "Cooper Kupp is back"',
    recipient: 'Ships to 5,847 subscribers Sunday 8 AM',
    preview: '"Cooper Kupp\'s RZ rate is back to 2021 levels (24% over last 3 weeks). The defenses he\'s about to face: Carolina (28th vs WR), Atlanta (24th), Saints (22nd). If you have him, start him. If you can buy low, do it now." Full card with chart + CTA "share to your league" auto-included.',
    approved_response: 'Approved. Scheduled to send Sunday 8 AM to all-active list. I\'ll surface open + share metrics Sunday afternoon — if it cracks 500 shares I\'ll auto-draft a Reddit cross-post.',
    ticker_after_approval: 'Cooper Kupp card scheduled for Sunday 8 AM blast',
  },
  {
    id: 'today-dunning-failed',
    icon: '💸',
    badge: 'Dunning',
    badgeClass: 'bg-danger/15 text-danger',
    title: '8 failed payments yesterday — $312 MRR at risk',
    recipient: 'Mix of expired cards + insufficient funds',
    preview: 'Drafted personalized "your card didn\'t process" emails for each — first attempt offers Apple Pay as a faster path, second attempt (in 3 days if no fix) offers a pause-not-cancel option. Recovery rate on this template is ~60% historically.',
    approved_response: 'Batch sent. Apple Pay link tracks click-through; pause-not-cancel option only shows on second attempt. I\'ll surface recoveries as they land.',
    ticker_after_approval: '8 dunning emails sent — $312 MRR in recovery',
  },
]

// ── Live ticker — real-time UFD events ────────────────────────────────
const tickerSeed = [
  { icon: '🔥', text: 'Hot Hand Heroes card just got shared in r/fantasyfootball', ageSec: 4 * 60 },
  { icon: '💚', text: 'New trial signup — referred by power user @amyjohnson', ageSec: 11 * 60 },
  { icon: '💰', text: 'Paid conversion — Drew_24 upgraded to annual ($120)', ageSec: 38 * 60 },
  { icon: '📈', text: 'Tuesday waiver email open rate: 28% (3,294 of 11,765)', ageSec: 2 * 3600 },
]

const tickerPool = [
  { icon: '🔥', text: 'Card share spike detected — Bones drafting content' },
  { icon: '💚', text: 'New trial signup — organic search' },
  { icon: '💰', text: 'Paid conversion logged — MRR ticking up' },
  { icon: '📤', text: 'Sunday card shipped to 5,847 subscribers' },
  { icon: '🎯', text: 'Reddit comment posted — r/fantasyfootball' },
  { icon: '✅', text: 'Failed payment recovered — $14.99 MRR saved' },
  { icon: '👋', text: 'Welcome sequence email-1 delivered — 47 new trials' },
  { icon: '🏆', text: 'Top sharer of the week: @amyjohnson with 23 shares' },
  { icon: '⚠️', text: 'Churn risk flag — power user inactive 14d' },
  { icon: '🎴', text: 'New card draft generated — Bones queued for review' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}

// ── Count-up animations on the pulse tiles ────────────────────────
// Same pattern as CommandSite's Approval Queue tiles — when a number
// changes the displayed value eases in over ~450ms with ease-out-quart
// for the "lands soft" feel.
const displayedTrials = ref(pulse.value.trials_today)
const displayedConversions = ref(pulse.value.conversions_today)
const displayedMrrCents = ref(pulse.value.mrr_change_cents)

function animateCount(target: number, current: { value: number }) {
  const start = current.value
  const delta = target - start
  if (delta === 0) return
  const duration = 450
  const startTs = performance.now()
  function tick(now: number) {
    const t = Math.min(1, (now - startTs) / duration)
    const eased = 1 - Math.pow(1 - t, 4)
    current.value = Math.round(start + delta * eased)
    if (t < 1) requestAnimationFrame(tick)
    else current.value = target
  }
  requestAnimationFrame(tick)
}

watch(() => pulse.value.trials_today, (n) => animateCount(n, displayedTrials))
watch(() => pulse.value.conversions_today, (n) => animateCount(n, displayedConversions))
watch(() => pulse.value.mrr_change_cents, (n) => animateCount(n, displayedMrrCents))

// When real ticker seed events arrive, push them onto the ticker.
// The ticker component reads its `seed` prop at mount, so seed
// updates after first paint need to be pushed manually.
watch(
  () => live.tickerSeed.value,
  (newEvents, oldEvents) => {
    const oldKeys = new Set((oldEvents ?? []).map((e) => e.text))
    for (const ev of newEvents) {
      if (!oldKeys.has(ev.text)) {
        tickerRef.value?.pushEvent({ icon: ev.icon, text: ev.text })
      }
    }
  },
)

function fmtAge(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}
</script>

<template>
  <div class="space-y-4 pb-32 relative">
    <GraceLiveTicker
      ref="tickerRef"
      :seed="live.tickerSeed.value.length > 0 ? live.tickerSeed.value : tickerSeed"
      :pool="tickerPool"
      :subtitle="`UFD activity stream — ${live.loading.value ? 'loading…' : 'live (polls every 60s, last refresh ' + fmtAge(live.lastFetchAt.value) + ')'}`"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="6"
      heading="Waiting for your eyes"
      :subtitle="`${greeting}. Bones drafted these from this week's signals. Approve to ship.`"
      @approved="onApproved"
    />

    <!-- Command bridge: pulse + KPIs ────────────────────────────── -->
    <section class="rounded-card overflow-hidden border border-divider bg-surface-raised">
      <header class="px-4 py-3 border-b border-divider bg-canvas/50 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">UFD pulse</span>
          <span class="text-xs text-ink-muted">— today, real from ufd-stats</span>
        </div>
        <span
          class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          :class="live.error.value
            ? 'bg-danger/15 text-danger'
            : live.loading.value
              ? 'bg-warn/15 text-warn'
              : 'bg-success/15 text-success'"
        >
          <span class="h-1.5 w-1.5 rounded-full"
            :class="live.error.value
              ? 'bg-danger'
              : live.loading.value
                ? 'bg-warn animate-pulse'
                : 'bg-success'"></span>
          {{ live.error.value
            ? 'Data error'
            : live.loading.value
              ? 'Refreshing…'
              : `Live · refreshed ${fmtAge(live.lastFetchAt.value)}` }}
        </span>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-5 divide-x divide-divider/60">
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">New trials</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ displayedTrials }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Paid conv</div>
          <div class="text-xl font-bold tabular-nums text-success mt-0.5">{{ displayedConversions }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">MRR change</div>
          <div class="text-xl font-bold tabular-nums mt-0.5" :class="displayedMrrCents >= 0 ? 'text-success' : 'text-danger'">{{ money(displayedMrrCents) }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Viral refs
            <span v-if="pulse.viral_referrals_24h === null" class="ml-1 text-[9px] text-ink-disabled normal-case" title="UFD doesn't track referral attribution yet">·</span>
          </div>
          <div class="text-xl font-bold tabular-nums text-brand mt-0.5">{{ pulse.viral_referrals_24h ?? '—' }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Churns
            <span v-if="pulse.churns_today === null" class="ml-1 text-[9px] text-ink-disabled normal-case" title="ufd-stats doesn't expose churn yet">·</span>
          </div>
          <div class="text-xl font-bold tabular-nums mt-0.5" :class="(pulse.churns_today ?? 0) > 0 ? 'text-warn' : 'text-ink'">{{ pulse.churns_today ?? '—' }}</div>
        </div>
      </div>

      <div class="p-3 flex flex-wrap gap-1.5 border-t border-divider/60">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>🎴</span><span class="font-semibold text-ink">Cards</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>📧</span><span class="font-semibold text-ink">Email</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>🐦</span><span class="font-semibold text-ink">Social</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>👥</span><span class="font-semibold text-ink">Users</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>📊</span><span class="font-semibold text-ink">Funnel</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px]">
          <span>💰</span><span class="font-semibold text-ink">Revenue</span>
          <span class="rounded-full bg-success/15 text-success px-1 text-[8px] font-bold uppercase tracking-wider">●</span>
        </span>
      </div>
    </section>

    <!-- Stats summary -->
    <section class="rounded-card border border-divider overflow-hidden bg-surface-raised">
      <header class="flex items-center justify-between px-4 py-3 border-b border-divider/60 bg-canvas/40">
        <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">This week's signals</div>
        <span class="text-[11px] text-ink-disabled">{{ stats.high_count }} high · {{ stats.medium_count }} medium</span>
      </header>
      <div class="grid grid-cols-1 sm:grid-cols-3 divide-x divide-divider/60">
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">MRR at risk</div>
          <div
            class="text-xl font-bold tabular-nums mt-0.5"
            :class="stats.pipeline_at_risk_cents > 0 ? 'text-warn' : 'text-ink'"
          >{{ money(stats.pipeline_at_risk_cents) }}</div>
          <div class="text-[11px] text-ink-disabled">failed payments + churn risk</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Viral signups (24h)</div>
          <div class="text-xl font-bold text-success tabular-nums mt-0.5">{{ stats.viral_signups_today }}</div>
          <div class="text-[11px] text-ink-disabled">attributed to power-user shares</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Top viral card</div>
          <div class="text-sm font-bold text-ink mt-0.5">Hot Hand Heroes</div>
          <div class="text-[11px] text-ink-disabled">1,840 shares · 41% click-back</div>
        </div>
      </div>
    </section>
  </div>
</template>
