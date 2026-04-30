<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import UfdUserDetailDrawer from '@/components/UfdUserDetailDrawer.vue'
import type { Client } from '@/types/database'

Chart.register(
  LineController,
  LineElement,
  PointElement,
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
    {
      label: 'Net Revenue',
      data: labels.value.map(
        (k) => (stats.value?.series.daily_revenue_cents[k] ?? 0) / 100,
      ),
      borderColor: '#059669',
      backgroundColor: 'rgba(5,150,105,0.15)',
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    },
  ],
}))

const lineOpts = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number } }) =>
          `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#64748B', maxRotation: 0, autoSkipPadding: 20 } },
    y: {
      beginAtZero: true,
      grid: { color: '#E2E8F0' },
      ticks: {
        color: '#64748B',
        callback: (value: number | string) =>
          typeof value === 'number' && value >= 1000
            ? `$${(value / 1000).toFixed(1)}k`
            : `$${value}`,
      },
    },
  },
}))

// ── Card defs ──────────────────────────────────────────────────────────
const primaryCards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      key: 'mrr',
      label: 'MRR',
      value: money(s.cards.mrr_cents, { decimals: 0 }),
      sub: `${s.cards.active_subscriptions} active subs`,
      accent: 'border-t-success',
      tone: 'text-success',
    },
    {
      key: 'arr',
      label: 'ARR',
      value: money(s.cards.arr_cents, { decimals: 0 }),
      sub: 'MRR × 12',
      accent: 'border-t-[#059669]',
      tone: 'text-[#059669]',
    },
    {
      key: 'arpu',
      label: 'ARPU',
      value: money(s.cards.arpu_cents),
      sub: 'Avg revenue / user',
      accent: 'border-t-[#2E9FE0]',
      tone: 'text-[#2E9FE0]',
    },
    {
      key: 'active',
      label: 'Active Subs',
      value: String(s.cards.active_subscriptions),
      sub: 'Active + trialing + past due',
      accent: 'border-t-[#7C3AED]',
      tone: 'text-[#7C3AED]',
    },
  ]
})

const windowCards = computed(() => {
  const s = stats.value
  if (!s) return []
  const netNewTone = s.cards.net_new_mrr_cents >= 0 ? 'text-success' : 'text-danger'
  const netNewAccent = s.cards.net_new_mrr_cents >= 0 ? 'border-t-success' : 'border-t-danger'
  return [
    {
      key: 'net_revenue',
      label: 'Net Revenue',
      value: money(s.cards.net_revenue_cents, { decimals: 0 }),
      sub: `Gross ${money(s.cards.gross_revenue_cents, { decimals: 0 })} · Refunded ${money(s.cards.refunded_cents, { decimals: 0 })}`,
      accent: 'border-t-success',
      tone: 'text-success',
    },
    {
      key: 'new_mrr',
      label: 'New MRR',
      value: money(s.cards.new_mrr_cents, { decimals: 0 }),
      sub: `${s.cards.new_subs_in_window} new subs`,
      accent: 'border-t-[#4CCCE8]',
      tone: 'text-[#4CCCE8]',
    },
    {
      key: 'churned_mrr',
      label: 'Churned MRR',
      value: money(s.cards.churned_mrr_cents, { decimals: 0 }),
      sub: `${s.cards.canceled_in_window} cancellations`,
      accent: 'border-t-warning',
      tone: 'text-warning',
    },
    {
      key: 'net_new_mrr',
      label: 'Net New MRR',
      value: (s.cards.net_new_mrr_cents >= 0 ? '+' : '') + money(s.cards.net_new_mrr_cents, { decimals: 0 }),
      sub: 'New − Churned',
      accent: netNewAccent,
      tone: netNewTone,
    },
    {
      key: 'failed',
      label: 'Failed Payments',
      value: String(s.cards.failed_payments_in_window),
      sub: s.cards.failed_payments_in_window > 0 ? 'Needs review' : 'All clear',
      accent: s.cards.failed_payments_in_window > 0 ? 'border-t-danger' : 'border-t-divider',
      tone: s.cards.failed_payments_in_window > 0 ? 'text-danger' : 'text-ink',
    },
  ]
})

// Plan mix % of MRR
function planPct(p: PlanMix): string {
  const total = stats.value?.cards.mrr_cents ?? 0
  if (!total) return '—'
  return `${((p.mrr_cents / total) * 100).toFixed(1)}%`
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

    <!-- Primary metrics (always-current, window-independent) -->
    <section>
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Current State</span>
        <span class="text-xs text-ink-muted ml-1">Live across all time</span>
      </div>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <template v-if="stats">
          <div
            v-for="c in primaryCards"
            :key="c.key"
            :class="['card-flat border-t-4 shadow-card', c.accent]"
          >
            <div :class="['text-3xl font-semibold', c.tone]">{{ c.value }}</div>
            <div class="mt-1 text-sm font-medium text-ink">{{ c.label }}</div>
            <div class="mt-0.5 text-xs text-ink-muted">{{ c.sub }}</div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="n in 4"
            :key="`pskel-${n}`"
            class="card-flat h-28 animate-pulse bg-surface-elevated"
          />
        </template>
      </div>
    </section>

    <!-- Window metrics -->
    <section>
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Movement</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
      </div>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <template v-if="stats">
          <div
            v-for="c in windowCards"
            :key="c.key"
            :class="['card-flat border-t-4 shadow-card', c.accent]"
          >
            <div :class="['text-2xl font-semibold', c.tone]">{{ c.value }}</div>
            <div class="mt-1 text-xs font-medium text-ink">{{ c.label }}</div>
            <div class="mt-0.5 text-[11px] text-ink-muted">{{ c.sub }}</div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="n in 5"
            :key="`wskel-${n}`"
            class="card-flat h-24 animate-pulse bg-surface-elevated"
          />
        </template>
      </div>
    </section>

    <!-- Revenue trend + Plan mix side by side -->
    <section>
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Trends & Mix</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="card lg:col-span-2">
          <h3 class="mb-3 text-sm font-semibold text-ink">Daily Net Revenue</h3>
          <div class="h-64">
            <Line v-if="stats" :data="revenueChartData" :options="lineOpts" />
            <div v-else class="h-full animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
        <div class="card">
          <h3 class="mb-3 text-sm font-semibold text-ink">Plan Mix</h3>
          <div v-if="!stats" class="h-40 animate-pulse rounded bg-surface-elevated" />
          <div v-else-if="stats.plan_mix.length === 0" class="text-sm text-ink-muted">
            No active plans.
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="py-2 font-medium">Plan</th>
                <th class="py-2 text-right font-medium">Subs</th>
                <th class="py-2 text-right font-medium">MRR</th>
                <th class="py-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in stats.plan_mix"
                :key="p.label"
                class="border-b border-divider/60 last:border-b-0"
              >
                <td class="py-2 text-ink">{{ p.label }}</td>
                <td class="py-2 text-right text-ink">{{ p.count }}</td>
                <td class="py-2 text-right text-ink">{{ money(p.mrr_cents, { decimals: 0 }) }}</td>
                <td class="py-2 text-right text-ink-muted">{{ planPct(p) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
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
