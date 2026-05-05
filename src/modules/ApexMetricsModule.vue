<script setup lang="ts">
/**
 * Apex Performance Metrics — service-business analytics: revenue trend,
 * lead-source ROI, tech leaderboard, service mix, conversion funnel.
 */
import { computed } from 'vue'
import {
  Chart,
  LineController, LineElement, PointElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
} from 'chart.js'
import { Line, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'

import {
  revenueTrend,
  leadSources,
  techPerf,
  serviceMix,
  conversionFunnel,
  metricsHeadline,
} from '@/lib/clients/apex/metrics'
import { brandAreaDataset, lineDefaults, chartColors } from '@/lib/chartTheme'

Chart.register(
  LineController, LineElement, PointElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
)

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

// ── Helpers ────────────────────────────────────────────────────────────
function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && cents >= 100_000) return '$' + (cents / 100_000).toFixed(1) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}
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
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Performance</h2>
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
                class="h-full rounded-md transition-all"
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
  </div>
</template>
