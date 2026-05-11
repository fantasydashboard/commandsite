<script setup lang="ts">
/**
 * Apex Heating & Air — Overview module.
 *
 * Mirrors the visual language of the UFD Admin Metrics + Revenue
 * modules (donut + breakdown + sub-stats + trend chart + recent feed)
 * but reads from /lib/clients/apex/ dummy data. Same Kpi component,
 * same chartTheme, same card/typography stack — feels like a sibling
 * to the UFD modules rather than a separate app.
 *
 * Phase 1 scope: this Overview only. Calls / Quotes / Reviews etc. are
 * separate modules built in subsequent phases.
 */
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'
import { adaRoles, ROLE_STATUS_META } from '@/lib/clients/apex/roles'

import { calls, callStats } from '@/lib/clients/apex/calls'
import { quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import { recentActivity } from '@/lib/clients/apex/recentActivity'
import { revenueRecovered } from '@/lib/clients/apex/revenueRecovered'

import { brandAreaDataset, lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
)

defineProps<{ client: Client; config: Record<string, unknown> }>()

const router = useRouter()
const route = useRoute()

// Hide the inner "Demo mode: Sample data for Apex" banner when the
// outer DashboardLayout is already rendering a custom-prospect
// banner (i.e. ?demo_company=... is in the URL). Two demo banners
// stacked is noisy; the outer one wins.
const isCustomDemo = computed(() => typeof route.query.demo_company === 'string')
function goToRole(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'apex-heating-and-air', tab } })
}

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return `Good morning, Brett`
  if (hr < 17) return `Good afternoon, Brett`
  return `Good evening, Brett`
})

// ── Approval queue: Ada's drafts waiting on Brett ─────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'ovw-riverpoint',
    icon: '💬',
    badge: 'Quote follow-up',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Stale quote nudge — Riverpoint Condos ($14,800)',
    recipient: 'Commercial RTU replace · sent 11 days ago · opened twice',
    preview: '"Hey Tom — circling back on the proposal we sent for the rooftop unit. Saw it got opened a couple times so I figured I\'d check in. Happy to walk through the line items, swap parts for budget options, or just answer questions. No pressure — just want to make sure it didn\'t get lost in the inbox. — Brett, Apex Heating & Air"',
    approved_response: "Sent. Tom usually replies within a day on a soft nudge. If he doesn't bite by Wed, I'll surface the deal as cooled and we can decide whether to drop the price or close it out.",
    ticker_after_approval: 'Riverpoint nudge sent — $14,800 RTU opportunity',
  },
  {
    id: 'ovw-castellanos-apology',
    icon: '⭐',
    badge: 'Review reply',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Apology reply — Jim Castellanos 3★ review',
    recipient: 'Tech was 40 min late + didn\'t call ahead · before this goes live',
    preview: '"Jim — Brett here, owner at Apex. You\'re right — we missed on the heads-up call and that\'s on us. I\'ve talked with the tech and we\'re tightening up the dispatch routing so this doesn\'t happen again. I\'d like to credit your next service call to make it right if you\'ll give us another shot. Either way, thanks for the honest feedback. — Brett"',
    approved_response: 'Posted to Google. Reviews with owner replies (especially humble ones on negative reviews) get 3.4× more positive engagement than ones without. Watching for a follow-up reply from Jim.',
    ticker_after_approval: 'Apology reply posted to Castellanos 3★ review',
  },
  {
    id: 'ovw-hendersons-tuneup',
    icon: '🔁',
    badge: 'Reactivation',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Tune-up reminder — The Hendersons',
    recipient: 'Recurring AC tune-up overdue 6 wks · normally schedule Mar',
    preview: '"Hi Henderson Family — Ada here from Apex. Noticed your spring AC tune-up usually lands in March and we hadn\'t heard from you yet — wanted to flag it before the heat really hits. Want me to grab you a slot this week? I have Tue and Thu morning open. — Ada (for Brett at Apex)"',
    approved_response: 'Sent. The Hendersons are in the "easy yes" tier — they\'ve booked every spring + fall tune-up for 4 years. If they don\'t respond by Friday I\'ll surface them again as soft re-engage.',
    ticker_after_approval: 'Tune-up reminder sent to the Hendersons',
  },
  {
    id: 'ovw-coronado',
    icon: '🏢',
    badge: 'Replace opportunity',
    badgeClass: 'bg-success/15 text-success',
    title: 'Replace-job outreach — Coronado Property Mgmt',
    recipient: '3 service calls in 60d · last tech notes: "system at end of life"',
    preview: '"Hey Marcus — Brett at Apex. Saw the recent service tickets on the building 2 unit and Tony\'s notes flagged it as nearing end of life. Before another emergency call eats your weekend, want to grab 30 min and walk through replacement options? No obligation — just want to give you the budget picture for next year. — Brett"',
    approved_response: "Sent. Property managers usually bite on the budget framing — saves them a board explanation. I'll surface his reply within the hour and route to your calendar if he wants the walkthrough.",
    ticker_after_approval: 'Replace-job outreach sent to Coronado Property',
  },
  {
    id: 'ovw-marie-review',
    icon: '⭐',
    badge: 'Review request',
    badgeClass: 'bg-success/15 text-success',
    title: 'Review request — Maria Chen (yesterday\'s job)',
    recipient: 'New thermostat install · Tony was the tech · Maria mentioned thank-you in passing',
    preview: '"Hi Maria — thanks for letting Tony come out yesterday. He mentioned how patient you were while he walked through the thermostat options, which I really appreciate. If you\'re happy with how it\'s running, would you mind dropping a quick Google review? Two clicks: [link]. No pressure either way. — Brett, Apex"',
    approved_response: "Sent. Day-after timing has the highest review-conversion rate (~38% for residential). Tony's a tech customers consistently call out by name — I'd expect a 5★.",
    ticker_after_approval: 'Review request sent to Maria Chen',
  },
]

// Live ticker
const tickerSeed = [
  { icon: '📞', text: 'Caught a call — AC not cooling, escalated to Marcus', ageSec: 6 * 60 },
  { icon: '📅', text: 'Service appt booked — Patterson, Tue 10 AM', ageSec: 14 * 60 },
  { icon: '⭐', text: 'New 5★ review — Maria Chen, Tony called out by name', ageSec: 38 * 60 },
  { icon: '💬', text: 'Quote follow-up reply — Rodriguez wants to schedule', ageSec: 73 * 60 },
]
const tickerPool = [
  { icon: '📞', text: 'Caught a call — service times question, info text sent' },
  { icon: '📅', text: 'Service slot auto-confirmed — tomorrow PM' },
  { icon: '🚐', text: 'Tech dispatched — Marcus en-route to Coronado' },
  { icon: '⭐', text: 'Review request opened — clicked through to Google' },
  { icon: '💬', text: 'Quote sent — residential AC replace, $4,200' },
  { icon: '🔁', text: 'Reactivation reply — dormant customer wants tune-up' },
  { icon: '✅', text: 'Job complete — invoice auto-sent + review request queued' },
  { icon: '⏰', text: 'After-hours emergency caught — overflow line, escalated' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}

// ── Data ────────────────────────────────────────────────────────────────
const stats = computed(() => callStats())
const followups = computed(() => quoteFollowupCounts())
const revenue = computed(() => revenueRecovered())
const activity = computed(() => recentActivity)

// Suppress unused-import warning while we keep `calls` available for
// future Phase 2 modules importing from this file's data layer.
void calls

// ── Donut: Calls Handled breakdown ─────────────────────────────────────
// Brand + accent come from CSS vars so per-client theme cascades; the
// other two stay fixed because they carry semantic meaning (after-hours
// = soft cool, emergency = red regardless of client palette).
const DONUT_SEGMENTS = computed(() => [
  { key: 'ai_handled' as const,           label: 'AI-Handled',           color: chartColors.brand()  },
  { key: 'booked' as const,               label: 'Booked Jobs',          color: chartColors.accent() },
  { key: 'after_hours' as const,          label: 'After-Hours',          color: '#A0D8F8'            },
  { key: 'emergency_dispatched' as const, label: 'Emergency Dispatched', color: '#EF4444'            },
])

const donutData = computed(() => ({
  labels: DONUT_SEGMENTS.value.map((s) => s.label),
  datasets: [
    {
      data: DONUT_SEGMENTS.value.map((s) => stats.value[s.key]),
      backgroundColor: DONUT_SEGMENTS.value.map((s) => s.color),
      borderWidth: 3,
      borderColor: '#FFFFFF',
      hoverOffset: 8,
    },
  ],
}))

// deno-lint-ignore no-explicit-any
const donutOptions: any = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#fff',
      bodyColor: '#E2E8F0',
      padding: 10,
      cornerRadius: 6,
      callbacks: {
        label: (ctx: { parsed: number; label: string }) => ` ${ctx.parsed} ${ctx.label.toLowerCase()}`,
      },
    },
  },
}

// ── Calls captured trend (line) ────────────────────────────────────────
const callsLineData = computed(() => ({
  labels: stats.value.daily.map((d) => d.date.slice(5)),
  datasets: [brandAreaDataset('Calls', stats.value.daily.map((d) => d.calls))],
}))
const callsLineOpts = lineDefaults()

// ── Quote follow-ups by sequence step (bar) ────────────────────────────
const followupBarData = computed(() => ({
  labels: followups.value.map((d) => d.day),
  datasets: [
    {
      label: 'Sent',
      data: followups.value.map((d) => d.sent),
      backgroundColor: chartColors.brand(),
    },
  ],
}))
const followupBarOpts = barDefaults()

// ── Revenue recovered chart ────────────────────────────────────────────
const revenueLineData = computed(() => ({
  labels: revenue.value.daily.map((d) => d.date.slice(5)),
  datasets: [
    brandAreaDataset(
      'Recovered',
      revenue.value.daily.map((d) => d.cents / 100),
      { color: chartColors.accent() },
    ),
  ],
}))
const revenueLineOpts = (() => {
  // deno-lint-ignore no-explicit-any
  const base: any = lineDefaults()
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  base.plugins.tooltip = {
    ...base.plugins.tooltip,
    callbacks: { label: (ctx: { parsed: { y: number } }) => ' ' + fmt.format(ctx.parsed.y) },
  }
  base.scales.y.ticks = {
    ...base.scales.y.ticks,
    callback: (v: number | string) =>
      typeof v === 'number' && v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`,
  }
  return base
})()

// ── Helpers ────────────────────────────────────────────────────────────
function money(cents: number, opts: { decimals?: number } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function activityIcon(kind: string): string {
  if (kind === 'call') return '📞'
  if (kind === 'quote') return '💬'
  if (kind === 'review') return '⭐'
  if (kind === 'reactivation') return '🔁'
  if (kind === 'dispatch') return '🚐'
  return '·'
}

// ── Today pulse strip ───────────────────────────────────────────────────
// Live snapshot of just-today numbers. Designed to be the first thing
// the owner reads in the morning — "what's already happened today?"
const today = {
  calls: 11,
  booked: 3,
  revenue_cents: 124_700,
  on_call_tech: 'Marcus Reyes',
  on_call_status: 'available',
} as const

// ── This Week digest ────────────────────────────────────────────────────
// Last 7 days of automation outcomes — the "what did CommandSite do
// for me this week" answer in 5 lines.
const thisWeek = [
  { metric: '89 calls answered', detail: '12 after-hours · 4 weekend' },
  { metric: '27 jobs booked', detail: '$14,200 estimated revenue' },
  { metric: '43 quote follow-ups sent', detail: '11 replies · 6 booked' },
  { metric: '9 review requests', detail: '7 received · 4.9★ average' },
  { metric: '3 dormant customers reactivated', detail: '$820 revenue from won-back' },
] as const

</script>

<template>
  <div class="space-y-4">
    <!-- Demo mode banner — hidden when DashboardLayout's custom
         per-prospect banner is already showing -->
    <div
      v-if="!isCustomDemo"
      class="rounded-card bg-accent/10 border border-accent/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="text-sm text-ink">
        <span class="font-semibold">Demo mode:</span>
        Sample data for Apex Heating & Air — illustrating what CommandSite looks like for a home-services business.
      </div>
      <a href="#" class="text-xs text-brand font-semibold hover:underline">Book a real walkthrough →</a>
    </div>

    <!-- ── Live ticker ─────────────────────────────────────────────── -->
    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Ada's activity stream — calls, dispatches, replies. Auto-updates."
    />

    <!-- ── Approval queue (THE hero) ───────────────────────────────── -->
    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="11"
      :subtitle="`${greeting}. Approve to send, edit to revise, skip to resurface tomorrow.`"
      @approved="onApproved"
    />

    <!-- ── Command bridge: roles compressed into chips ─────────────── -->
    <section class="rounded-card overflow-hidden border border-divider bg-surface-raised">
      <header class="px-4 py-3 border-b border-divider bg-canvas/50 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Ada's roles</span>
          <span class="text-xs text-ink-muted">— click any to drill in</span>
        </div>
        <span class="text-[11px] text-ink-disabled">
          {{ adaRoles.filter((r) => r.status === 'active').length }} of {{ adaRoles.length }} active
        </span>
      </header>
      <div class="p-3 flex flex-wrap gap-1.5">
        <button
          v-for="role in adaRoles"
          :key="role.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] hover:border-brand hover:bg-brand/5 transition-colors"
          @click="goToRole(role.tab)"
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

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Apex Heating & Air · Dashboard</h2>
        <p class="text-sm text-ink-muted">
          What CommandSite is doing for the business — captured calls, quote follow-ups, reviews, reactivation, recovered revenue.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in ['Today', '7 Days', '15 Days', '30 Days', '90 Days', '1 Year', 'All Time']"
          :key="w"
          type="button"
          :class="['chip', w === '30 Days' ? 'chip-active' : '']"
        >
          {{ w }}
        </button>
      </div>
    </div>

    <!-- Today pulse strip — what's already happened today -->
    <div class="rounded-card bg-brand text-ink-inverse px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold opacity-90">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        Today
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ today.calls }}</span>
        <span class="text-xs opacity-80">calls</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ today.booked }}</span>
        <span class="text-xs opacity-80">booked</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ money(today.revenue_cents) }}</span>
        <span class="text-xs opacity-80">captured</span>
      </div>
      <div class="ml-auto flex items-center gap-2 text-xs">
        <span class="opacity-80">On-call:</span>
        <span class="font-semibold">{{ today.on_call_tech }}</span>
        <span class="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
          {{ today.on_call_status }}
        </span>
      </div>
    </div>

    <!-- Calls Handled — donut + breakdown -->
    <section class="card">
      <div class="mb-4 flex items-center gap-2">
        <span class="eyebrow">Key Metrics</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        <span class="text-xs text-ink-muted ml-1">Click a segment to drill in</span>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Donut + center label -->
        <div class="lg:col-span-5 relative flex items-center justify-center min-h-[260px]">
          <div class="relative w-full max-w-[280px] aspect-square">
            <Doughnut :data="donutData" :options="donutOptions" />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-[44px] font-bold text-ink leading-none tracking-tight">
                {{ stats.total }}
              </div>
              <div class="mt-1.5 kpi-label">Calls Handled</div>
              <div class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
                ↑ +89 new
              </div>
            </div>
          </div>
        </div>

        <!-- Breakdown legend -->
        <div class="lg:col-span-7 space-y-1.5">
          <div
            v-for="row in DONUT_SEGMENTS"
            :key="row.key"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5"
          >
            <span
              class="h-3 w-3 rounded-full flex-shrink-0"
              :style="{ backgroundColor: row.color }"
            ></span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-ink truncate">{{ row.label }}</div>
            </div>
            <div class="flex items-baseline gap-2 whitespace-nowrap">
              <span class="text-xl font-bold text-ink tabular-nums">
                {{ stats[row.key] }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trends row: Calls captured + Quote follow-ups -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ink">Calls Captured</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        </div>
        <div class="h-56">
          <Line :data="callsLineData" :options="callsLineOpts" />
        </div>
      </section>

      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ink">Quote Follow-Ups Sent</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        </div>
        <div class="h-56">
          <Bar :data="followupBarData" :options="followupBarOpts" />
        </div>
      </section>
    </div>

    <!-- Revenue Recovered + Recent Activity -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Revenue card mirrors UFD Revenue's structure -->
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Revenue Recovered</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">This Month</span>
        </div>

        <div class="space-y-4">
          <div class="text-center py-2">
            <div class="text-[44px] font-bold text-brand leading-none tracking-tight">
              {{ money(revenue.this_month_cents) }}
            </div>
            <div class="mt-1.5 kpi-label">Recovered this month</div>
            <div class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
              ↑ from after-hours, follow-up, and reactivation
            </div>
          </div>

          <div class="h-32">
            <Line :data="revenueLineData" :options="revenueLineOpts" />
          </div>

          <div class="grid grid-cols-2 gap-3 border-t border-divider pt-3">
            <div>
              <div class="kpi-label">Avg Ticket</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(revenue.avg_ticket_cents) }}
              </div>
            </div>
            <div>
              <div class="kpi-label">Projected Annual</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(revenue.projected_annual_cents) }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Recent Activity feed -->
      <section class="card lg:col-span-7">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Recent Activity</span>
          <span class="text-xs text-ink-muted ml-1">Live across last 24h</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="ev in activity"
            :key="ev.id"
            class="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors"
          >
            <div class="text-base flex-shrink-0 leading-tight pt-0.5">{{ activityIcon(ev.kind) }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-ink leading-snug">{{ ev.text }}</div>
              <div class="text-[11px] text-ink-disabled mt-0.5">{{ fmtAgo(ev.at) }}</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- This Week digest — renamed from "What CommandSite did" to match Ada framing -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What Ada Did This Week</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">Last 7 Days</span>
      </div>
      <ul class="divide-y divide-divider">
        <li
          v-for="row in thisWeek"
          :key="row.metric"
          class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div class="text-sm font-semibold text-ink">{{ row.metric }}</div>
          <div class="text-xs text-ink-muted text-right">{{ row.detail }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>
