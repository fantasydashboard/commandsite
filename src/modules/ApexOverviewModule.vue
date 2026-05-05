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
import { computed } from 'vue'
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

import { calls, callStats } from '@/lib/clients/apex/calls'
import { quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import { recentActivity } from '@/lib/clients/apex/recentActivity'
import { revenueRecovered } from '@/lib/clients/apex/revenueRecovered'
import { automations, automationStats, KIND_META as AUTO_KIND_META, STATUS_META as AUTO_STATUS_META } from '@/lib/clients/apex/automations'

import { brandAreaDataset, lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
)

defineProps<{ client: Client; config: Record<string, unknown> }>()

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

// ── Automations panel — what's running on autopilot right now ────────
// Replaces the old static "Setup Summary." Pulls live counts from the
// automation registry so the owner sees the system is working without
// having to look at every tab.
const autoStats = computed(() => automationStats())
const liveAutomations = computed(() => automations.filter((a) => a.status !== 'paused').slice(0, 6))
</script>

<template>
  <div class="space-y-4">
    <!-- Demo mode banner -->
    <div class="rounded-card bg-accent/10 border border-accent/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <div class="text-sm text-ink">
        <span class="font-semibold">Demo mode:</span>
        Sample data for Apex Heating & Air — illustrating what CommandSite looks like for a home-services business.
      </div>
      <a href="#" class="text-xs text-brand font-semibold hover:underline">Book a real walkthrough →</a>
    </div>

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

    <!-- Running on autopilot — replaces the static Setup Summary -->
    <section class="card border border-success/20 bg-success/[0.03]">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow text-success">🤖 Running on autopilot</span>
          <span class="chip !py-0.5 !px-2 !text-[10px] !bg-success/15 !text-success">{{ autoStats.active_count }} active</span>
        </div>
        <div class="text-xs text-ink-muted">
          <span class="text-success font-bold tabular-nums">{{ autoStats.auto_handled_7d }}</span> auto-handled · <span class="text-warn font-semibold tabular-nums">{{ autoStats.needed_review_7d }}</span> needed your eyes · <span class="text-ink font-semibold tabular-nums">~{{ autoStats.hours_saved_7d }}h</span> saved (last 7 days)
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <article
          v-for="a in liveAutomations"
          :key="a.id"
          class="rounded-md border border-divider bg-surface p-3"
        >
          <div class="flex items-start gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-base flex-shrink-0">
              {{ AUTO_KIND_META[a.kind].icon }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-sm font-semibold text-ink truncate">{{ a.name }}</span>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                  :class="a.status === 'active' ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'"
                >{{ AUTO_STATUS_META[a.status].label }}</span>
              </div>
              <p class="text-[11px] text-ink-muted leading-snug mt-0.5">{{ a.description }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-disabled">
                <span class="text-success font-semibold">{{ a.auto_handled_7d }} auto</span>
                <span v-if="a.needed_review_7d > 0">· <span class="text-warn font-semibold">{{ a.needed_review_7d }} needed eyes</span></span>
                <span v-if="a.confidence_threshold">· threshold ≥ {{ Math.round(a.confidence_threshold * 100) }}%</span>
                <span v-if="a.schedule_label">· {{ a.schedule_label }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- This Week digest -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What CommandSite Did This Week</span>
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
