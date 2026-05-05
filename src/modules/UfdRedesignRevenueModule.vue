<script setup lang="ts">
/**
 * UFD Redesign — Revenue / MRR / churn dashboard with the NFL-season
 * cycle as a first-class visual element. Off-season churn is expected
 * and shouldn't be confused with product issues — the season-band
 * annotations on the MRR chart make that explicit.
 */
import { computed } from 'vue'
import {
  Chart,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'

import {
  mrrTrend,
  planMix,
  cohortRetention,
  failedPayments,
  revenueHeadline,
  seasonNotes,
} from '@/lib/clients/ufd-redesign/revenue'
import { barDefaults, chartColors } from '@/lib/chartTheme'

Chart.register(
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Legend,
)

defineProps<{ client: Client; config: Record<string, unknown> }>()

const headline = computed(() => revenueHeadline())
const trend = computed(() => mrrTrend())

// MRR Movement stacked bar
const mrrBarData = computed(() => ({
  labels: trend.value.map((m) => {
    const d = new Date(m.month + '-01T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short' })
  }),
  datasets: [
    { label: 'New',         data: trend.value.map((m) => m.new_mrr_cents / 100),         backgroundColor: chartColors.brand(),  stack: 'mrr' },
    { label: 'Expansion',   data: trend.value.map((m) => m.expansion_mrr_cents / 100),   backgroundColor: '#10B981',            stack: 'mrr' },
    { label: 'Contraction', data: trend.value.map((m) => -m.contraction_mrr_cents / 100),backgroundColor: '#F59E0B',            stack: 'mrr' },
    { label: 'Churn',       data: trend.value.map((m) => -m.churned_mrr_cents / 100),    backgroundColor: '#EF4444',            stack: 'mrr' },
  ],
}))

const mrrBarOpts = (() => {
  // deno-lint-ignore no-explicit-any
  const base: any = barDefaults({ legend: true, stacked: true })
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  base.plugins.tooltip = {
    ...base.plugins.tooltip,
    callbacks: {
      label: (ctx: { parsed: { y: number }; dataset: { label: string } }) =>
        ' ' + ctx.dataset.label + ': ' + fmt.format(Math.abs(ctx.parsed.y)),
    },
  }
  base.scales.y.ticks = {
    ...base.scales.y.ticks,
    callback: (v: number | string) => typeof v === 'number'
      ? (v >= 0 ? '$' + Math.round(v / 100) + 'h' : '-$' + Math.round(Math.abs(v) / 100) + 'h')
      : v,
  }
  return base
})()

// Plan mix donut
const planDonutData = computed(() => ({
  labels: planMix.map((p) => p.plan),
  datasets: [{
    data: planMix.map((p) => p.mrr_cents / 100),
    backgroundColor: planMix.map((p) => p.color),
    borderWidth: 3, borderColor: '#FFFFFF', hoverOffset: 8,
  }],
}))
// deno-lint-ignore no-explicit-any
const planDonutOpts: any = {
  responsive: true, maintainAspectRatio: false, cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#fff', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 6,
      callbacks: {
        label: (ctx: { parsed: number; label: string }) =>
          ' ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
            .format(ctx.parsed) + ' MRR',
      },
    },
  },
}

const totalMrr = computed(() => planMix.reduce((s, p) => s + p.mrr_cents, 0))
const totalCustomers = computed(() => planMix.reduce((s, p) => s + p.customers, 0))

// Cohort heatmap helpers
function retentionColor(v: number): string {
  if (v >= 0.85) return '#10B981'
  if (v >= 0.70) return '#22C55E'
  if (v >= 0.55) return 'rgb(var(--color-brand))'
  if (v >= 0.40) return '#F59E0B'
  if (v > 0)     return '#EF4444'
  return '#94A3B8'
}
function pct(v: number, opts: { signed?: boolean } = {}): string {
  const value = (v * 100).toFixed(0)
  if (opts.signed) return (v >= 0 ? '+' : '') + value + '%'
  return value + '%'
}
function nrrColor(v: number): string {
  if (v >= 1.05) return '#10B981'
  if (v >= 0.95) return 'rgb(var(--color-brand))'
  if (v >= 0.85) return '#F59E0B'
  return '#EF4444'
}
function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}
function fmtCohortMonth(s: string): string {
  const d = new Date(s + '-01T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function fmtUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr <= 0) return 'now'
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.floor(hr / 24)}d`
}

const maxCohortAge = computed(() =>
  cohortRetention.reduce((m, c) => Math.max(m, c.retention.length), 0),
)

function seasonNoteColor(tone: string): string {
  if (tone === 'celebration') return '#10B981'
  if (tone === 'good') return 'rgb(var(--color-brand))'
  return '#F59E0B'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Revenue</h2>
        <p class="text-sm text-ink-muted">
          MRR, churn, plan mix, cohort retention. UFD revenue is heavily NFL-seasonal — read the chart with that in mind.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in ['30 Days', '90 Days', 'YTD', 'All Time']"
          :key="w"
          type="button"
          :class="['chip', w === 'All Time' ? 'chip-active' : '']"
        >{{ w }}</button>
      </div>
    </div>

    <!-- Headline KPIs -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">MRR</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.current_mrr_cents) }}</div>
        <div class="text-[11px] mt-0.5" :class="headline.growth_rate >= 0 ? 'text-success' : 'text-danger'">
          {{ headline.growth_rate >= 0 ? '↑' : '↓' }} {{ pct(headline.growth_rate, { signed: true }) }} MoM
          <span class="text-ink-disabled ml-1">(off-season)</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">ARR run-rate</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.arr_cents, { compact: true }) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ money(headline.arr_cents) }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Annual share</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="headline.annual_share >= 0.30 ? 'text-success' : 'text-warn'">
          {{ pct(headline.annual_share) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">% of customers on annual</div>
      </div>
      <div class="card">
        <div class="kpi-label">Net Revenue Retention</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :style="{ color: nrrColor(headline.net_revenue_retention) }">
          {{ pct(headline.net_revenue_retention) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">
          {{ pct(headline.gross_churn_rate) }} gross churn (off-season high)
        </div>
      </div>
    </div>

    <!-- MRR Movement chart with season annotations -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">MRR Movement</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 12 months</span>
        </div>
        <div class="text-[11px] text-ink-disabled">
          New + expansion above the line · contraction + churn below
        </div>
      </div>
      <div class="h-72">
        <Bar :data="mrrBarData" :options="mrrBarOpts" />
      </div>

      <!-- Season annotations strip -->
      <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <article
          v-for="n in seasonNotes"
          :key="n.label"
          class="rounded-md border border-divider p-2.5"
          :style="{ borderLeftWidth: '4px', borderLeftColor: seasonNoteColor(n.tone) }"
        >
          <div class="text-xs font-semibold text-ink">{{ n.label }}</div>
          <div class="text-[11px] text-ink-muted leading-snug">{{ n.detail }}</div>
        </article>
      </div>
    </section>

    <!-- Plan Mix + Unit Econ + Failed Payments -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Plan Mix</span>
          <span class="text-xs text-ink-muted">{{ totalCustomers }} paying</span>
        </div>
        <div class="grid grid-cols-1 gap-4">
          <div class="relative flex items-center justify-center min-h-[200px]">
            <div class="relative w-full max-w-[220px] aspect-square">
              <Doughnut :data="planDonutData" :options="planDonutOpts" />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div class="text-xl font-bold text-ink leading-none tracking-tight">{{ money(totalMrr, { compact: true }) }}</div>
                <div class="mt-1 kpi-label">Total MRR</div>
              </div>
            </div>
          </div>
          <ul class="space-y-1.5">
            <li
              v-for="p in planMix"
              :key="p.plan"
              class="flex items-center gap-2 text-xs"
            >
              <span class="h-2.5 w-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: p.color }"></span>
              <span class="text-ink truncate flex-1">{{ p.plan }}</span>
              <span class="text-ink-disabled tabular-nums w-10 text-right">{{ p.customers }}</span>
              <span class="text-ink-muted tabular-nums w-16 text-right">{{ money(p.mrr_cents, { compact: true }) }}</span>
              <span class="text-ink-disabled tabular-nums w-10 text-right">{{ pct(p.mrr_cents / totalMrr) }}</span>
            </li>
          </ul>
          <div class="text-[11px] text-ink-disabled italic border-t border-divider pt-2">
            Annual customers retain ~3× longer than monthly. Push annual harder during the August preseason ramp.
          </div>
        </div>
      </section>

      <div class="lg:col-span-7 space-y-4">
        <!-- LTV : CAC -->
        <section class="card">
          <div class="mb-3 flex items-center gap-2">
            <span class="eyebrow">Unit Economics</span>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <div class="kpi-label">LTV</div>
              <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.ltv_cents) }}</div>
              <div class="text-[11px] text-ink-disabled mt-0.5">avg lifetime value</div>
            </div>
            <div>
              <div class="kpi-label">CAC</div>
              <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(headline.cac_cents) }}</div>
              <div class="text-[11px] text-ink-disabled mt-0.5">paid acq · mostly Reddit + X ads</div>
            </div>
            <div>
              <div class="kpi-label">LTV : CAC</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="headline.ltv_cac_ratio >= 3 ? 'text-success' : 'text-warn'">
                {{ headline.ltv_cac_ratio.toFixed(1) }}×
              </div>
              <div class="text-[11px] text-ink-disabled mt-0.5">target: 3× or higher</div>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-divider text-[11px] text-ink-muted">
            <span class="font-semibold text-ink-muted">Note:</span>
            B2C LTV is volatile because of seasonal cancel/return cycles. Recompute LTV at the end of every NFL season (Feb).
          </div>
        </section>

        <!-- Failed payments -->
        <section class="card">
          <div class="mb-3 flex items-center gap-2">
            <span class="eyebrow">Failed Payments</span>
            <span
              class="chip !py-0.5 !px-2 !text-[10px]"
              :class="failedPayments.length > 0 ? '!bg-warn/15 !text-warn' : ''"
            >{{ failedPayments.length }} retrying</span>
          </div>
          <div v-if="failedPayments.length > 0" class="space-y-2">
            <div
              v-for="f in failedPayments"
              :key="f.id"
              class="flex items-start gap-3 rounded-md border border-divider p-3"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-semibold text-ink">{{ f.user_name }}</span>
                  <span class="text-[11px] text-ink-muted">· {{ f.user_email }}</span>
                </div>
                <div class="text-xs text-ink-muted mt-0.5">
                  <span class="font-mono text-ink">{{ f.reason }}</span> · attempt {{ f.attempts + 1 }} retrying {{ fmtUntil(f.retry_at) }}
                </div>
                <div class="text-[10px] text-ink-disabled mt-0.5">First failed {{ fmtAgo(f.failed_at) }}</div>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-sm font-semibold text-ink tabular-nums">{{ money(f.amount_cents) }}</div>
                <button
                  type="button"
                  class="mt-1 text-[10px] text-brand font-semibold hover:underline"
                >Send dunning email</button>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-4 text-sm text-ink-muted italic">
            All payments collecting cleanly.
          </div>
        </section>
      </div>
    </div>

    <!-- Cohort Retention Heatmap -->
    <section class="card overflow-hidden">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Cohort Retention</span>
        <span class="text-xs text-ink-muted">Notice: Aug–Jan signups retain dramatically better than off-season cohorts</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th class="px-2 py-1 text-left text-[10px] uppercase tracking-wide font-medium text-ink-muted">Cohort</th>
              <th class="px-2 py-1 text-right text-[10px] uppercase tracking-wide font-medium text-ink-muted">Signed</th>
              <th
                v-for="age in maxCohortAge"
                :key="age"
                class="px-1 py-1 text-center text-[10px] font-medium text-ink-disabled tabular-nums w-12"
              >M{{ age - 1 }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in cohortRetention" :key="c.cohort">
              <td class="px-2 py-1 text-xs font-medium text-ink whitespace-nowrap">{{ fmtCohortMonth(c.cohort) }}</td>
              <td class="px-2 py-1 text-right text-xs text-ink-muted tabular-nums">{{ c.customers_signed }}</td>
              <td
                v-for="age in maxCohortAge"
                :key="age"
                class="px-0 py-0 text-center text-[10px] font-bold tabular-nums w-12 h-7 rounded text-white"
                :style="age - 1 < c.retention.length
                  ? { backgroundColor: retentionColor(c.retention[age - 1]) }
                  : { backgroundColor: 'transparent', color: 'transparent' }"
              >
                {{ age - 1 < c.retention.length ? pct(c.retention[age - 1]) : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-disabled">
        <span class="font-semibold text-ink-muted">Read:</span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-4 rounded" style="background-color:#10B981"></span> 85%+ retained
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-4 rounded" style="background-color: rgb(var(--color-brand))"></span> 55–70%
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-4 rounded" style="background-color:#F59E0B"></span> 40–55%
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="h-2.5 w-4 rounded" style="background-color:#EF4444"></span> &lt; 40%
        </span>
        <span class="opacity-70 ml-2">B2C retention is bimodal — in-season cohorts are healthy, off-season cohorts churn fast.</span>
      </div>
    </section>
  </div>
</template>
