<script setup lang="ts">
/**
 * Apex Performance Metrics — service-business analytics: revenue trend,
 * lead-source ROI, tech leaderboard, service mix, conversion funnel.
 */
import { computed } from 'vue'
import {
  Chart,
  LineController, LineElement, PointElement,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'

import {
  revenueTrend,
  leadSources,
  techPerf,
  serviceMix,
  conversionFunnel,
  metricsHeadline,
} from '@/lib/clients/apex/metrics'
import { callStats } from '@/lib/clients/apex/calls'
import { quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import { revenueRecovered } from '@/lib/clients/apex/revenueRecovered'
import { rolesOnTab, getRole } from '@/lib/clients/apex/roles'
import { brandAreaDataset, lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import RolesOnPage from '@/components/ada/RolesOnPage.vue'
import { useLiveActivity, seedEvent, type PoolEvent } from '@/composables/useLiveActivity'

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
)
import { money } from '@/lib/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const headline = computed(() => metricsHeadline())
const trend = computed(() => revenueTrend())

const trendData = computed(() => ({
  labels: trend.value.map((d) => d.date.slice(5)),
  datasets: [brandAreaDataset('Revenue', trend.value.map((d) => d.cents / 100), { color: chartColors.brand() })],
}))

const trendOpts = (() => {
  // deno-lint-ignore no-explicit-any
  const base: any = lineDefaults()
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  base.plugins.tooltip = {
    ...base.plugins.tooltip,
    callbacks: { label: (ctx: { parsed: { y: number } }) => ' ' + fmt.format(ctx.parsed.y) },
  }
  base.scales.y.ticks = {
    ...base.scales.y.ticks,
    callback: (v: number | string) => typeof v === 'number' && v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`,
  }
  return base
})()

// ── Service mix donut ──────────────────────────────────────────────────
const serviceMixData = computed(() => ({
  labels: serviceMix.map((s) => s.label),
  datasets: [{
    data: serviceMix.map((s) => s.revenue_cents / 100),
    backgroundColor: serviceMix.map((s) => s.color),
    borderWidth: 3,
    borderColor: '#FFFFFF',
    hoverOffset: 8,
  }],
}))
// deno-lint-ignore no-explicit-any
const serviceMixOpts: any = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#fff', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 6,
      callbacks: {
        label: (ctx: { parsed: number; label: string }) =>
          ' ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
            .format(ctx.parsed) + ' — ' + ctx.label,
      },
    },
  },
}

const totalServiceRevenue = computed(() =>
  serviceMix.reduce((s, x) => s + x.revenue_cents, 0),
)

// ── Volume + Recovery (moved from Today page) ──────────────────────────
const callsStats = computed(() => callStats())
const followups = computed(() => quoteFollowupCounts())
const recoveredRev = computed(() => revenueRecovered())

const CALLS_DONUT_SEGMENTS = computed(() => [
  { key: 'ai_handled' as const,           label: 'AI-Handled',           color: chartColors.brand()  },
  { key: 'booked' as const,               label: 'Booked Jobs',          color: chartColors.accent() },
  { key: 'after_hours' as const,          label: 'After-Hours',          color: '#A0D8F8'            },
  { key: 'emergency_dispatched' as const, label: 'Emergency Dispatched', color: '#EF4444'            },
])

const callsDonutData = computed(() => ({
  labels: CALLS_DONUT_SEGMENTS.value.map((s) => s.label),
  datasets: [{
    data: CALLS_DONUT_SEGMENTS.value.map((s) => callsStats.value[s.key]),
    backgroundColor: CALLS_DONUT_SEGMENTS.value.map((s) => s.color),
    borderWidth: 3,
    borderColor: '#FFFFFF',
    hoverOffset: 8,
  }],
}))
// deno-lint-ignore no-explicit-any
const callsDonutOpts: any = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#fff', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 6,
      callbacks: {
        label: (ctx: { parsed: number; label: string }) =>
          ` ${ctx.parsed} ${ctx.label.toLowerCase()}`,
      },
    },
  },
}

const callsLineData = computed(() => ({
  labels: callsStats.value.daily.map((d) => d.date.slice(5)),
  datasets: [brandAreaDataset('Calls', callsStats.value.daily.map((d) => d.calls))],
}))
const callsLineOpts = lineDefaults()

const followupBarData = computed(() => ({
  labels: followups.value.map((d) => d.day),
  datasets: [{
    label: 'Sent',
    data: followups.value.map((d) => d.sent),
    backgroundColor: chartColors.brand(),
  }],
}))
const followupBarOpts = barDefaults()

const recoveredLineData = computed(() => ({
  labels: recoveredRev.value.daily.map((d) => d.date.slice(5)),
  datasets: [
    brandAreaDataset(
      'Recovered',
      recoveredRev.value.daily.map((d) => d.cents / 100),
      { color: chartColors.accent() },
    ),
  ],
}))
const recoveredLineOpts = (() => {
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
function pct(v: number, opts: { signed?: boolean } = {}): string {
  const value = (v * 100).toFixed(0)
  if (opts.signed) return (v >= 0 ? '+' : '') + value + '%'
  return value + '%'
}

// Lead source helpers
function srcConv(s: typeof leadSources[number]): number {
  return s.leads > 0 ? s.booked / s.leads : 0
}
function srcRoi(s: typeof leadSources[number]): number | null {
  if (s.cost_cents === 0) return null
  return s.revenue_cents / s.cost_cents
}
function srcCpa(s: typeof leadSources[number]): number | null {
  if (s.cost_cents === 0 || s.booked === 0) return null
  return Math.round(s.cost_cents / s.booked)
}
const sortedSources = computed(() =>
  [...leadSources].sort((a, b) => b.revenue_cents - a.revenue_cents),
)

// ── Insights queue: patterns Ada noticed + proposed action ───────────
// Same format as Cornerstone Insights — Ada as analyst, not just clerk.
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'ins-yelp-conversion',
    role: 'performance_reporting',
    icon: 'zap',
    badge: 'Conversion signal',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Yelp lead conversion dropped 9 pts',
    recipient: 'Was 38% last month · now 29% · 5 lost deals to investigate',
    preview: 'Want me to pull the 5 Yelp-sourced leads we lost in the last 30d, find what they had in common, and draft a hypothesis? My early read: 3 of 5 were quoted on day-of-call which felt rushed — they may have wanted a real visit first.',
    approved_response: "Pulling the 5 lost-deal records now. I'll surface the analysis with 2-3 candidate explanations + recommended A/B test for next month's Yelp leads. Done in ~10 min.",
    ticker_after_approval: 'Investigating Yelp conversion drop — 5 lost deals',
  },
  {
    id: 'ins-saturday-cap',
    role: 'performance_reporting',
    icon: 'trending-up',
    badge: 'Demand signal',
    badgeClass: 'bg-success/15 text-success',
    title: 'Saturday bookings up 22% — capacity check?',
    recipient: 'Last 4 Saturdays trending up · turning down ~2 calls/week now',
    preview: 'Want me to draft a "Saturday-availability ask" to Tony and Marcus to gauge interest in alternating Saturdays at premium pay? Math: even at 1.5× pay, 1 extra Saturday ticket/week pencils to ~$28k/yr revenue lift.',
    approved_response: "Drafting the ask to Tony + Marcus. Framing it as opt-in (not mandatory) with the math attached so they can decide. I'll surface their answers individually so you can talk to each one personally.",
    ticker_after_approval: 'Saturday capacity ask drafted for Tony + Marcus',
  },
  {
    id: 'ins-reactivation-batch2',
    role: 'performance_reporting',
    icon: 'reactivation',
    badge: 'Reactivation signal',
    badgeClass: 'bg-success/15 text-success',
    title: 'Reactivation revenue trending up — invest in Batch 2?',
    recipient: 'Batch 1: 24 contacted, 5 booked, $6,840 revenue (28× ROI on time)',
    preview: 'Want me to expand the next batch from 23 to 50? I can score the dormant pool more aggressively (pull in 12-18 month dormant, not just 18+ month). My estimate: 8-12 additional bookings worth $10-15k.',
    approved_response: "Expanding to 50. New tier is dormant 12-24mo with 2+ prior services. Pacing the sends so any positive reply gets a fast human response. Batch will surface as Customer Care queue items tomorrow.",
    ticker_after_approval: 'Reactivation Batch 2 expanded to 50 customers',
  },
  {
    id: 'ins-after-hours',
    role: 'performance_reporting',
    icon: 'clock',
    badge: 'Coverage signal',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'After-hours call volume rising — coverage gap?',
    recipient: 'Up 30% over 90d · Marcus + Tony alternating but rotation getting tight',
    preview: 'Want me to pull a 90-day after-hours pattern (which nights, which job types, conversion rates) so you can decide whether to add a 3rd on-call or stay the course? I\'ll have the analysis in 5 min.',
    approved_response: "Pulling now. I'll structure it as: nights with peak volume, job-type breakdown, conversion vs daytime, and what a 3rd on-call would cost vs revenue at risk. Decision-ready, not just data-dump.",
    ticker_after_approval: 'After-hours analysis running — 90-day pattern',
  },
  {
    id: 'ins-pricing-test',
    role: 'performance_reporting',
    icon: 'flask',
    badge: 'Revenue signal',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Diagnostic fee test — willing to A/B?',
    recipient: 'Currently $89 · competitor avg $109 · close rate sensitive',
    preview: 'Want me to A/B test $89 vs $109 diagnostic fee for next month\'s residential calls? Hypothesis: $109 holds if framed as "applied to repair" — but I\'d only test on Yelp + cold-Google leads, not on repeat customers.',
    approved_response: "Setting up the test. I'll randomize at the call-source level so it's clean. Holding for your final OK before flipping the variant on — confirm and I'll go live tomorrow morning.",
    ticker_after_approval: 'Diagnostic fee A/B test queued — pending Brett OK',
  },
]

// ── Live activity (scoped to Performance Reporting) ───────────────────
const liveSeed = [
  seedEvent(18 * 60,  'performance_reporting', 'Performance dashboard recomputed — $135k MTD',  'performance_reporting'),
  seedEvent(47 * 60,  'deal_won_handoff', 'Lead-source ROI refreshed — Google LSA at 6.7×', 'performance_reporting'),
  seedEvent(3 * 3600, 'zap', 'Yelp conversion alert triggered — 9pt drop',     'performance_reporting'),
  seedEvent(6 * 3600, 'trending-up', 'Saturday demand pattern flagged — +22% MoM',     'performance_reporting'),
]
const livePool: PoolEvent[] = [
  { icon: 'performance_reporting', text: 'Daily metrics rolled up — KPIs synced',                          role: 'performance_reporting' },
  { icon: 'dollar-sign', text: 'Revenue attributed — Yelp lead → booked job, $1,840',             role: 'performance_reporting' },
  { icon: 'deal_won_handoff', text: 'Lead source ROI: Google LSA 6.7× · Yelp 4.2× · Repeat 8.1×',     role: 'performance_reporting' },
  { icon: 'zap', text: 'Conversion alert: change >10% from baseline detected',           role: 'performance_reporting' },
  { icon: 'trending-up', text: 'Capacity utilization: 87% (target 80-90%)',                       role: 'performance_reporting' },
  { icon: 'flask', text: 'A/B test result trickling in — significance pending',             role: 'performance_reporting' },
]

const { events: liveEvents, fmtAgo: fmtLiveAgo, pushEvent } = useLiveActivity({
  seed: liveSeed,
  pool: livePool,
})

function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'performance_reporting'
  pushEvent({ icon: item.icon, text: item.ticker_after_approval, role })
}

const pageRoles = rolesOnTab('insights')
</script>

<template>
  <div class="space-y-4">
    <RolesOnPage :roles="pageRoles" />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="3"
      assistant-name="Ada"
      :push-approved-to-chat="false"
      heading="Patterns Ada noticed this week"
      subtitle="She's not just reporting numbers, she's spotting trends and proposing action. Co-sign to dig in or run the test."
      @approved="onApproved"
    />

    <!-- Header -->
    <div id="performance_reporting" class="card flex flex-wrap items-center justify-between gap-3 scroll-mt-24">
      <div>
        <h2 class="text-lg font-semibold text-ink">Performance Reporting</h2>
        <p class="text-sm text-ink-muted">
          Where the money is coming from, who's closing it, and what's working.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in ['7 Days', '30 Days', '90 Days', 'YTD']"
          :key="w"
          type="button"
          :class="['chip', w === '30 Days' ? 'chip-active' : '']"
        >{{ w }}</button>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">MTD Revenue</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.mtd_revenue_cents) }}</div>
        <div class="text-[11px] mt-0.5" :class="headline.mom_change >= 0 ? 'text-success' : 'text-danger'">
          {{ headline.mom_change >= 0 ? '↑' : '↓' }} {{ pct(headline.mom_change, { signed: true }) }} vs last month
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg Ticket</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.avg_ticket_cents) }}</div>
        <div class="text-[11px] text-ink-muted mt-0.5">across all booked jobs</div>
      </div>
      <div class="card">
        <div class="kpi-label">Lead → Booked</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ pct(headline.conversion_rate) }}</div>
        <div class="text-[11px] text-ink-muted mt-0.5">conversion across all sources</div>
      </div>
      <div class="card">
        <div class="kpi-label">Callback Rate</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="headline.callback_rate < 0.05 ? 'text-success' : 'text-warn'">
          {{ pct(headline.callback_rate) }}
        </div>
        <div class="text-[11px] text-ink-muted mt-0.5">jobs needing return visit</div>
      </div>
    </div>

    <!-- ── Volume + Recovery (moved from Today page) ─────────────── -->

    <!-- Calls Handled — donut + breakdown -->
    <section class="card">
      <div class="mb-4 flex items-center gap-2">
        <span class="eyebrow">Calls Handled · Breakdown</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        <span class="text-xs text-ink-muted ml-1">Click a segment to drill in</span>
      </div>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div class="lg:col-span-5 relative flex items-center justify-center min-h-[260px]">
          <div class="relative w-full max-w-[280px] aspect-square">
            <Doughnut :data="callsDonutData" :options="callsDonutOpts" />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-[44px] font-bold text-ink leading-none tracking-tight">{{ callsStats.total }}</div>
              <div class="mt-1.5 kpi-label">Calls Handled</div>
              <div class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">↑ +89 new</div>
            </div>
          </div>
        </div>
        <div class="lg:col-span-7 space-y-1.5">
          <div
            v-for="row in CALLS_DONUT_SEGMENTS"
            :key="row.key"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5"
          >
            <span class="h-3 w-3 rounded-full flex-shrink-0" :style="{ backgroundColor: row.color }"></span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-ink truncate">{{ row.label }}</div>
            </div>
            <div class="flex items-baseline gap-2 whitespace-nowrap">
              <span class="text-xl font-bold text-ink tabular-nums">{{ callsStats[row.key] }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Calls captured + quote follow-ups (row) -->
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

    <!-- Revenue Recovered -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Revenue Recovered</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">This Month</span>
        <span class="text-xs text-ink-muted ml-1">From after-hours, follow-up, and reactivation</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-4 flex flex-col justify-center">
          <div class="text-[44px] font-bold text-brand leading-none tracking-tight">
            {{ money(recoveredRev.this_month_cents) }}
          </div>
          <div class="mt-1.5 kpi-label">Recovered this month</div>
          <div class="mt-3 grid grid-cols-2 gap-3 border-t border-divider pt-3">
            <div>
              <div class="kpi-label">Avg Ticket</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">{{ money(recoveredRev.avg_ticket_cents) }}</div>
            </div>
            <div>
              <div class="kpi-label">Projected Annual</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">{{ money(recoveredRev.projected_annual_cents) }}</div>
            </div>
          </div>
        </div>
        <div class="lg:col-span-8">
          <div class="h-48">
            <Line :data="recoveredLineData" :options="recoveredLineOpts" />
          </div>
        </div>
      </div>
    </section>

    <!-- Revenue trend (full width) -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Revenue Trend</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        </div>
        <div class="text-xs text-ink-muted">
          Big spikes are install days · regular weekday baseline ~$3-4k
        </div>
      </div>
      <div class="h-64">
        <Line :data="trendData" :options="trendOpts" />
      </div>
    </section>

    <!-- Lead Source ROI + Service Mix -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Lead source ROI table -->
      <section class="card lg:col-span-7 overflow-hidden">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Lead Source ROI</span>
          <span class="text-xs text-ink-muted">Sorted by revenue</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-3 py-2 font-medium">Source</th>
                <th class="px-3 py-2 font-medium text-right">Leads</th>
                <th class="px-3 py-2 font-medium text-right">Booked</th>
                <th class="px-3 py-2 font-medium text-right">Conv</th>
                <th class="px-3 py-2 font-medium text-right">Revenue</th>
                <th class="px-3 py-2 font-medium text-right">CPA</th>
                <th class="px-3 py-2 font-medium text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in sortedSources"
                :key="s.source"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
              >
                <td class="px-3 py-2.5 text-sm text-ink font-medium">{{ s.source }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ s.leads }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ s.booked }}</td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="srcConv(s) >= 0.4 ? 'text-success' : 'text-ink-muted'">
                  {{ pct(srcConv(s)) }}
                </td>
                <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ money(s.revenue_cents, { compact: true }) }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">
                  <span v-if="srcCpa(s) !== null">{{ money(srcCpa(s)!) }}</span>
                  <span v-else class="text-ink-disabled">—</span>
                </td>
                <td class="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">
                  <span v-if="srcRoi(s) !== null" class="text-success">{{ srcRoi(s)!.toFixed(1) }}×</span>
                  <span v-else class="text-ink-disabled">free</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Service mix donut -->
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Service Mix</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">90 Days</span>
        </div>
        <div class="grid grid-cols-1 gap-4">
          <div class="relative flex items-center justify-center min-h-[200px]">
            <div class="relative w-full max-w-[220px] aspect-square">
              <Doughnut :data="serviceMixData" :options="serviceMixOpts" />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div class="text-2xl font-bold text-ink leading-none tracking-tight">
                  {{ money(totalServiceRevenue, { compact: true }) }}
                </div>
                <div class="mt-1 kpi-label">Total revenue</div>
              </div>
            </div>
          </div>
          <ul class="space-y-1.5">
            <li
              v-for="s in serviceMix"
              :key="s.label"
              class="flex items-center gap-2 text-xs"
            >
              <span class="h-2.5 w-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: s.color }"></span>
              <span class="text-ink truncate flex-1">{{ s.label }}</span>
              <span class="text-ink-muted tabular-nums">{{ money(s.revenue_cents, { compact: true }) }}</span>
              <span class="text-ink-disabled tabular-nums w-10 text-right">{{ pct(s.revenue_cents / totalServiceRevenue) }}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <!-- Tech Leaderboard + Conversion Funnel -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Tech leaderboard -->
      <section class="card lg:col-span-7 overflow-hidden">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Tech Leaderboard</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">This Month</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-3 py-2 font-medium">Tech</th>
                <th class="px-3 py-2 font-medium text-right">Jobs</th>
                <th class="px-3 py-2 font-medium text-right">Revenue</th>
                <th class="px-3 py-2 font-medium text-right">Avg ticket</th>
                <th class="px-3 py-2 font-medium text-right">★</th>
                <th class="px-3 py-2 font-medium text-right">Callback</th>
                <th class="px-3 py-2 font-medium text-right">Util</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in techPerf"
                :key="t.id"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
              >
                <td class="px-3 py-2.5 text-sm text-ink font-medium">{{ t.name }}</td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums">{{ t.jobs }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ money(t.revenue_cents, { compact: true }) }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ money(t.avg_ticket_cents) }}</td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums">
                  <span class="text-amber-400">★</span> {{ t.avg_rating.toFixed(1) }}
                </td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="t.callback_rate < 0.05 ? 'text-success' : 'text-warn'">
                  {{ pct(t.callback_rate) }}
                </td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="t.utilization >= 0.85 ? 'text-success' : 'text-ink-muted'">
                  {{ pct(t.utilization) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Conversion funnel -->
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Conversion Funnel</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">90 Days</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="(step, i) in conversionFunnel"
            :key="step.stage"
          >
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <span class="text-xs font-semibold text-ink">{{ step.stage }}</span>
              <span class="text-xs text-ink-muted tabular-nums">
                {{ step.count.toLocaleString() }}
                <span class="text-ink-disabled">· {{ pct(step.pct_of_top) }}</span>
              </span>
            </div>
            <div class="h-7 rounded-md bg-surface-elevated/60 overflow-hidden">
              <div
                class="h-full rounded-md transition-[width] duration-700 ease-out-quart"
                :style="{
                  width: (step.pct_of_top * 100) + '%',
                  backgroundColor: i === 0 ? 'rgb(var(--color-brand))'
                    : i === 1 ? 'rgb(var(--color-accent))'
                    : i === 2 ? '#10B981'
                    : i === 3 ? '#F59E0B'
                    : '#A855F7',
                }"
              ></div>
            </div>
            <div
              v-if="i < conversionFunnel.length - 1"
              class="text-[10px] text-ink-disabled mt-0.5 text-right"
            >
              ↓ {{ pct(conversionFunnel[i + 1].count / step.count) }} continue
            </div>
          </div>
        </div>
      </section>
    </div>

    <LiveActivityFeed
      :events="liveEvents"
      :fmt-ago="fmtLiveAgo"
      :get-role="getRole"
      title="Performance signals"
      subtitle="Daily metric rollups, ROI shifts, conversion alerts · auto-updates"
    />
  </div>
</template>
