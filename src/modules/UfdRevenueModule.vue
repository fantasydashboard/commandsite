<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Doughnut } from 'vue-chartjs'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import UfdUserDetailDrawer from '@/components/UfdUserDetailDrawer.vue'
import Kpi from '@/components/Kpi.vue'
import { brandAreaDataset, lineDefaults } from '@/lib/chartTheme'
import type { Client } from '@/types/database'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
)

const moduleProps = defineProps<{ client: Client; config: Record<string, unknown> }>()

type Window = 'today' | '7d' | '15d' | '30d' | '90d' | '1y' | 'all'

interface PlanMix {
  label: string
  count: number
  mrr_cents: number
}

interface CustomerRef {
  id: string | null
  email: string | null
  name: string | null
}

interface FailedCharge {
  id: string
  amount: number
  currency: string
  created: number
  description: string | null
  customer: CustomerRef
  failure_message: string | null
}

interface Cancellation {
  id: string
  customer: CustomerRef
  canceled_at: number | null
  mrr_cents: number
}

interface StripeResponse {
  window: Window
  range: { since: string | null; now: string }
  cards: {
    mrr_cents: number
    arr_cents: number
    active_subscriptions: number
    new_mrr_cents: number
    churned_mrr_cents: number
    net_new_mrr_cents: number
    arpu_cents: number
    new_subs_in_window: number
    canceled_in_window: number
    paid_starts_in_window: number
    net_revenue_cents: number
    gross_revenue_cents: number
    refunded_cents: number
    failed_payments_in_window: number
  }
  plan_mix: PlanMix[]
  series: { daily_revenue_cents: Record<string, number> }
  recent_failed: FailedCharge[]
  recent_cancellations: Cancellation[]
}

const windows: { key: Window; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '15d', label: '15 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '1y', label: '1 Year' },
  { key: 'all', label: 'All Time' },
]

const active = ref<Window>('30d')
const stats = ref<StripeResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function surfaceError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json()
      return body?.error
        ? `${body.error} (HTTP ${err.context.status})`
        : `${err.message} (HTTP ${err.context.status})`
    } catch {
      return `${err.message} (HTTP ${err.context.status})`
    }
  }
  return (err as Error)?.message ?? fallback
}

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase.functions.invoke<StripeResponse>('ufd-stripe', {
    body: { window: active.value },
  })
  loading.value = false
  if (err) {
    error.value = await surfaceError(err, 'Failed to load revenue')
    return
  }
  stats.value = data
}

watch(active, load)
onMounted(load)

const activeLabel = computed(
  () => windows.find((w) => w.key === active.value)?.label ?? '',
)

// ── Format helpers ──────────────────────────────────────────────────────
function money(cents: number, opts: { decimals?: number } = {}): string {
  const dollars = (cents ?? 0) / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.decimals ?? (Math.abs(dollars) < 100 ? 2 : 0),
    maximumFractionDigits: opts.decimals ?? 2,
  })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtUnix(unix: number | null): string {
  if (!unix) return '—'
  const d = new Date(unix * 1000)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Chart data ──────────────────────────────────────────────────────────
function dayLabels(range: { since: string | null; now: string }): string[] {
  const end = new Date(range.now)
  const start = range.since
    ? new Date(range.since)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days: string[] = []
  const cursor = new Date(start)
  cursor.setUTCHours(0, 0, 0, 0)
  const endKey = end.toISOString().slice(0, 10)
  while (cursor.toISOString().slice(0, 10) <= endKey) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const labels = computed<string[]>(() => {
  if (!stats.value) return []
  return dayLabels(stats.value.range)
})

const displayLabels = computed<string[]>(() => labels.value.map(formatDayLabel))

const revenueChartData = computed(() => ({
  labels: displayLabels.value,
  datasets: [
    brandAreaDataset(
      'Net Revenue',
      labels.value.map((k) => (stats.value?.series.daily_revenue_cents[k] ?? 0) / 100),
      { color: 'rgb(var(--color-brand))' },
    ),
  ],
}))

// Currency-aware extension over the shared lineDefaults. Mutates a single
// base options object once (instead of a computed) — vue-chartjs renders
// reliably with a stable options reference; deep-spreading a new computed
// object on every tick caused the chart to silently fail to render.
// deno-lint-ignore no-explicit-any
function buildLineOpts(): any {
  const base: any = lineDefaults()
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

  base.plugins ??= {}
  base.plugins.tooltip = {
    ...(base.plugins.tooltip ?? {}),
    callbacks: { label: (ctx: any) => fmt.format(ctx.parsed.y) },
  }

  base.scales ??= {}
  base.scales.y ??= {}
  base.scales.y.ticks = {
    ...(base.scales.y.ticks ?? {}),
    callback: (value: number | string) =>
      typeof value === 'number' && value >= 1000
        ? `$${(value / 1000).toFixed(1)}k`
        : `$${value}`,
  }

  return base
}
const lineOpts = buildLineOpts()

// ── Card defs ──────────────────────────────────────────────────────────
type KpiAccent =
  | 'brand' | 'accent' | 'success' | 'warn' | 'danger'
  | 'sky' | 'cyan' | 'violet' | 'orange' | 'rose' | 'emerald' | 'ink'

const primaryCards = computed<{ key: string; label: string; value: string; sub: string; accent: KpiAccent }[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    // Headline state: brand alternated with accent. No status colors here
    // — these cards are informational, not warnings.
    {
      key: 'mrr',
      label: 'MRR',
      value: money(s.cards.mrr_cents, { decimals: 0 }),
      sub: `${s.cards.active_subscriptions} active subs`,
      accent: 'brand',
    },
    {
      key: 'arr',
      label: 'ARR',
      value: money(s.cards.arr_cents, { decimals: 0 }),
      sub: 'MRR × 12',
      accent: 'accent',
    },
    {
      key: 'arpu',
      label: 'ARPU',
      value: money(s.cards.arpu_cents),
      sub: 'Avg revenue / user',
      accent: 'brand',
    },
    {
      key: 'active',
      label: 'Active Subs',
      value: String(s.cards.active_subscriptions),
      sub: 'Active + trialing + past due',
      accent: 'accent',
    },
  ]
})

const windowCards = computed<{ key: string; label: string; value: string; sub: string; accent: KpiAccent }[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    // Movement: brand for revenue (positive flow), accent for new subs,
    // status colors only on actually-status things (churn = warn,
    // net-new direction = success/danger, failed = danger or muted).
    {
      key: 'net_revenue',
      label: 'Net Revenue',
      value: money(s.cards.net_revenue_cents, { decimals: 0 }),
      sub: `Gross ${money(s.cards.gross_revenue_cents, { decimals: 0 })} · Refunded ${money(s.cards.refunded_cents, { decimals: 0 })}`,
      accent: 'brand',
    },
    {
      key: 'new_mrr',
      label: 'New MRR',
      value: money(s.cards.new_mrr_cents, { decimals: 0 }),
      sub: `${s.cards.new_subs_in_window} new subs`,
      accent: 'accent',
    },
    {
      key: 'churned_mrr',
      label: 'Churned MRR',
      value: money(s.cards.churned_mrr_cents, { decimals: 0 }),
      sub: `${s.cards.canceled_in_window} cancellations`,
      accent: 'warn',
    },
    {
      key: 'net_new_mrr',
      label: 'Net New MRR',
      value: (s.cards.net_new_mrr_cents >= 0 ? '+' : '') + money(s.cards.net_new_mrr_cents, { decimals: 0 }),
      sub: 'New − Churned',
      accent: s.cards.net_new_mrr_cents >= 0 ? 'success' : 'danger',
    },
    {
      key: 'failed',
      label: 'Failed Payments',
      value: String(s.cards.failed_payments_in_window),
      sub: s.cards.failed_payments_in_window > 0 ? 'Needs review' : 'All clear',
      accent: s.cards.failed_payments_in_window > 0 ? 'danger' : 'ink',
    },
  ]
})

// Plan mix % of MRR
function planPct(p: PlanMix): string {
  const total = stats.value?.cards.mrr_cents ?? 0
  if (!total) return '—'
  return `${((p.mrr_cents / total) * 100).toFixed(1)}%`
}

// ── Plan-mix donut (replaces the old MRR/ARR/ARPU/Active Subs strip) ─────
// Disciplined palette: brand → accent → muted brand → muted accent.
const planMixColors = [
  'rgb(30 64 175)',     // brand (deep blue)
  'rgb(14 165 233)',    // accent (sky)
  'rgb(30 64 175 / 0.55)',
  'rgb(14 165 233 / 0.55)',
  '#94A3B8',
  '#475569',
]

const planMixDonut = computed(() => {
  if (!stats.value || stats.value.plan_mix.length === 0) return null
  const mix = stats.value.plan_mix
  return {
    labels: mix.map((p) => p.label),
    datasets: [
      {
        data: mix.map((p) => p.mrr_cents / 100),
        backgroundColor: mix.map((_, i) => planMixColors[i % planMixColors.length]),
        borderWidth: 3,
        borderColor: '#FFFFFF',
        hoverOffset: 8,
      },
    ],
  }
})

// deno-lint-ignore no-explicit-any
const planMixDonutOptions: any = {
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
        label: (ctx: { dataIndex: number; parsed: number }) => {
          const p = stats.value?.plan_mix[ctx.dataIndex]
          if (!p) return ''
          return ` ${money(p.mrr_cents, { decimals: 0 })} MRR · ${p.count} subs · ${planPct(p)}`
        },
      },
    },
  },
}

// Prefer name → email → raw id → em dash for a clean customer display.
function customerDisplay(c: CustomerRef): { primary: string; secondary: string | null } {
  if (c.name) return { primary: c.name, secondary: c.email }
  if (c.email) return { primary: c.email, secondary: null }
  if (c.id) return { primary: c.id, secondary: null }
  return { primary: '—', secondary: null }
}

// Drawer state — opens when a customer cell is clicked.
const detailEmail = ref<string | null>(null)
function openDetail(c: CustomerRef) {
  if (c.email) detailEmail.value = c.email
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">UFD · Revenue</h2>
        <p class="text-sm text-ink-muted">Stripe · live billing data</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in windows"
          :key="w.key"
          type="button"
          :class="['chip', active === w.key && 'chip-active']"
          @click="active = w.key"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="card border border-danger/30 bg-danger/5 text-sm text-danger">
      Couldn't load revenue: {{ error }}
    </div>

    <!-- Headline state: Plan-mix donut + daily revenue trend -->
    <section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Plan-mix donut card (mirrors Key Metrics layout) -->
      <div class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Current State</span>
          <span class="text-xs text-ink-muted ml-1">Live across all time</span>
        </div>

        <div v-if="!stats" class="h-64 rounded-card bg-surface-elevated animate-pulse" />

        <div v-else class="space-y-4">
          <!-- Donut on top, full-width centered -->
          <div class="relative flex items-center justify-center min-h-[220px]">
            <div v-if="stats.plan_mix.length === 0" class="text-sm text-ink-muted italic py-8">
              No active plans yet.
            </div>
            <div v-else class="relative w-[220px] h-[220px]">
              <Doughnut :data="planMixDonut!" :options="planMixDonutOptions" />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div class="text-3xl font-bold text-ink leading-none tracking-tight">
                  {{ money(stats.cards.mrr_cents, { decimals: 0 }) }}
                </div>
                <div class="mt-1 kpi-label">MRR</div>
              </div>
            </div>
          </div>

          <!-- Per-plan legend underneath -->
          <div class="space-y-0.5">
            <div
              v-for="(p, i) in stats.plan_mix"
              :key="p.label"
              class="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span
                class="h-3 w-3 rounded-full flex-shrink-0"
                :style="{ backgroundColor: planMixColors[i % planMixColors.length] }"
              ></span>
              <div class="flex-1 min-w-0 truncate text-ink">{{ p.label }}</div>
              <div class="flex items-baseline gap-2 whitespace-nowrap">
                <span class="text-sm font-semibold text-ink tabular-nums">
                  {{ money(p.mrr_cents, { decimals: 0 }) }}
                </span>
                <span class="text-[11px] text-ink-muted">{{ p.count }} sub<span v-if="p.count !== 1">s</span> · {{ planPct(p) }}</span>
              </div>
            </div>
          </div>

          <!-- Secondary state row (ARR · ARPU · Active Subs) -->
          <div class="grid grid-cols-3 gap-3 border-t border-divider pt-3">
            <div>
              <div class="kpi-label">ARR</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(stats.cards.arr_cents, { decimals: 0 }) }}
              </div>
            </div>
            <div>
              <div class="kpi-label">ARPU</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(stats.cards.arpu_cents) }}
              </div>
            </div>
            <div>
              <div class="kpi-label">Active Subs</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ stats.cards.active_subscriptions }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Revenue chart card -->
      <div class="card lg:col-span-7">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ink">Daily Net Revenue</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
        </div>
        <div class="h-72">
          <Line v-if="stats" :data="revenueChartData" :options="lineOpts" />
          <div v-else class="h-full animate-pulse rounded bg-surface-elevated" />
        </div>
      </div>
    </section>

    <!-- Movement chip strip — narrative one-liner replacing the 5-card grid -->
    <section v-if="stats" class="card flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span class="eyebrow shrink-0">Movement · {{ activeLabel }}</span>
      <span class="flex items-baseline gap-1.5">
        <span
          :class="[
            'font-semibold',
            stats.cards.net_new_mrr_cents > 0 ? 'text-success'
            : stats.cards.net_new_mrr_cents < 0 ? 'text-danger'
            : 'text-ink',
          ]"
        >
          <span v-if="stats.cards.net_new_mrr_cents > 0">↑</span>
          <span v-else-if="stats.cards.net_new_mrr_cents < 0">↓</span>
          {{ stats.cards.net_new_mrr_cents >= 0 ? '+' : '' }}{{ money(stats.cards.net_new_mrr_cents, { decimals: 0 }) }}
        </span>
        <span class="text-ink-muted text-xs">net new MRR</span>
      </span>
      <span class="text-ink-disabled">·</span>
      <span class="flex items-baseline gap-1.5">
        <span class="font-semibold text-brand">+{{ money(stats.cards.new_mrr_cents, { decimals: 0 }) }}</span>
        <span class="text-ink-muted text-xs">{{ stats.cards.new_subs_in_window }} new sub<span v-if="stats.cards.new_subs_in_window !== 1">s</span></span>
      </span>
      <span class="text-ink-disabled">·</span>
      <span class="flex items-baseline gap-1.5">
        <span class="font-semibold text-warn">−{{ money(stats.cards.churned_mrr_cents, { decimals: 0 }) }}</span>
        <span class="text-ink-muted text-xs">{{ stats.cards.canceled_in_window }} cancellation<span v-if="stats.cards.canceled_in_window !== 1">s</span></span>
      </span>
      <span class="text-ink-disabled">·</span>
      <span class="flex items-baseline gap-1.5">
        <span
          :class="[
            'font-semibold',
            stats.cards.failed_payments_in_window > 0 ? 'text-danger' : 'text-success',
          ]"
        >
          {{ stats.cards.failed_payments_in_window > 0 ? stats.cards.failed_payments_in_window : 'all clear' }}
        </span>
        <span class="text-ink-muted text-xs">on payments</span>
      </span>
      <span class="text-ink-disabled">·</span>
      <span class="flex items-baseline gap-1.5">
        <span class="font-semibold text-ink">{{ money(stats.cards.net_revenue_cents, { decimals: 0 }) }}</span>
        <span class="text-ink-muted text-xs">net revenue</span>
      </span>
    </section>

    <!-- Recent cancellations + failed payments side by side -->
    <section>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="card">
          <h3 class="mb-3 text-sm font-semibold text-ink">
            Recent Cancellations
            <span class="ml-1 text-xs font-normal text-ink-muted">({{ activeLabel }})</span>
          </h3>
          <div v-if="!stats" class="h-24 animate-pulse rounded bg-surface-elevated" />
          <div
            v-else-if="stats.recent_cancellations.length === 0"
            class="py-4 text-center text-sm text-ink-muted"
          >
            No cancellations in window.
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="py-2 font-medium">Canceled</th>
                <th class="py-2 font-medium">Customer</th>
                <th class="py-2 text-right font-medium">MRR lost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in stats.recent_cancellations"
                :key="c.id"
                :class="[
                  'border-b border-divider/60 last:border-b-0',
                  c.customer.email && 'cursor-pointer hover:bg-surface-elevated/50',
                ]"
                @click="openDetail(c.customer)"
              >
                <td class="py-2 text-ink-muted">{{ fmtUnix(c.canceled_at) }}</td>
                <td class="py-2 text-ink">
                  <div>{{ customerDisplay(c.customer).primary }}</div>
                  <div v-if="customerDisplay(c.customer).secondary" class="text-[11px] text-ink-muted">
                    {{ customerDisplay(c.customer).secondary }}
                  </div>
                </td>
                <td class="py-2 text-right text-ink">{{ money(c.mrr_cents, { decimals: 0 }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3 class="mb-3 text-sm font-semibold text-ink">
            Failed Payments
            <span class="ml-1 text-xs font-normal text-ink-muted">({{ activeLabel }})</span>
          </h3>
          <div v-if="!stats" class="h-24 animate-pulse rounded bg-surface-elevated" />
          <div
            v-else-if="stats.recent_failed.length === 0"
            class="py-4 text-center text-sm text-ink-muted"
          >
            No failed payments.
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="py-2 font-medium">When</th>
                <th class="py-2 font-medium">Customer</th>
                <th class="py-2 font-medium">Reason</th>
                <th class="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in stats.recent_failed"
                :key="c.id"
                :class="[
                  'border-b border-divider/60 last:border-b-0',
                  c.customer.email && 'cursor-pointer hover:bg-surface-elevated/50',
                ]"
                @click="openDetail(c.customer)"
              >
                <td class="py-2 text-ink-muted">{{ fmtUnix(c.created) }}</td>
                <td class="py-2 text-ink">
                  <div>{{ customerDisplay(c.customer).primary }}</div>
                  <div v-if="customerDisplay(c.customer).secondary" class="text-[11px] text-ink-muted">
                    {{ customerDisplay(c.customer).secondary }}
                  </div>
                </td>
                <td class="py-2 text-xs text-danger">{{ c.failure_message ?? '—' }}</td>
                <td class="py-2 text-right text-ink">{{ money(c.amount, { decimals: 0 }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <UfdUserDetailDrawer
      :open="detailEmail !== null"
      :email="detailEmail"
      :client="moduleProps.client"
      @close="detailEmail = null"
    />
  </div>
</template>
