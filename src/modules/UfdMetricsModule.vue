<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import UfdUserDetailDrawer from '@/components/UfdUserDetailDrawer.vue'
import Kpi from '@/components/Kpi.vue'
import { brandAreaDataset, lineDefaults, seriesPalette } from '@/lib/chartTheme'
import type { Client } from '@/types/database'

Chart.register(
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
  Legend,
  Filler,
)

const moduleProps = defineProps<{ client: Client; config: Record<string, unknown> }>()

type Window = 'today' | '7d' | '15d' | '30d' | '90d' | '1y' | 'all'

type Cohort =
  | 'total_users'
  | 'free_trial'
  | 'total_passes'
  | 'individual_monthly'
  | 'individual_annual'
  | 'league_passes'
  | 'at_risk'
  | 'expired'

interface CardValue {
  value: number
  new_in_window: number
}

interface StatsResponse {
  window: Window
  range: { since: string | null; now: string }
  cards: Record<Cohort, CardValue>
  series: {
    new_users: Record<string, number>
    new_passes: {
      individual_monthly: Record<string, number>
      individual_annual: Record<string, number>
      league_passes: Record<string, number>
    }
  }
}

interface UsersResponse {
  cohort: Cohort
  rows: Record<string, unknown>[]
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
const stats = ref<StatsResponse | null>(null)
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
  const { data, error: err } = await supabase.functions.invoke<StatsResponse>('ufd-stats', {
    body: { window: active.value },
  })
  loading.value = false
  if (err) {
    error.value = await surfaceError(err, 'Failed to load stats')
    return
  }
  stats.value = data
}

watch(active, load)
onMounted(load)

// ── Chart data ──────────────────────────────────────────────────────────
// Build a contiguous list of YYYY-MM-DD labels covering the window, then
// map each series' bucket map onto it (zero-filling missing days).

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

function pickDay(map: Record<string, number>, key: string): number {
  return map[key] ?? 0
}

const usersChartData = computed(() => ({
  labels: displayLabels.value,
  datasets: [
    brandAreaDataset(
      'New Users',
      labels.value.map((k) => pickDay(stats.value?.series.new_users ?? {}, k)),
    ),
  ],
}))

const passesChartData = computed(() => {
  const s = stats.value?.series.new_passes
  const palette = seriesPalette()
  return {
    labels: displayLabels.value,
    datasets: [
      {
        label: 'Individual Monthly',
        data: labels.value.map((k) => pickDay(s?.individual_monthly ?? {}, k)),
        backgroundColor: palette[3],  // sky
        borderRadius: 4,
      },
      {
        label: 'Individual Annual',
        data: labels.value.map((k) => pickDay(s?.individual_annual ?? {}, k)),
        backgroundColor: palette[2],  // violet
        borderRadius: 4,
      },
      {
        label: 'League Passes',
        data: labels.value.map((k) => pickDay(s?.league_passes ?? {}, k)),
        backgroundColor: palette[1],  // accent (amber)
        borderRadius: 4,
      },
    ],
  }
})

const lineOpts = lineDefaults()

const barOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#64748B', boxWidth: 10, boxHeight: 10, padding: 12 } },
  },
  scales: {
    x: {
      stacked: false,
      grid: { display: false },
      ticks: { color: '#64748B', maxRotation: 0, autoSkipPadding: 20 },
    },
    y: {
      beginAtZero: true,
      grid: { color: '#E2E8F0' },
      ticks: { color: '#64748B', precision: 0 },
    },
  },
}

// Card metadata keyed by the shape returned from the Edge Function.
// Each card uses the shared <Kpi> component — accent is one of the
// named tokens from Kpi (sky/violet/cyan/etc.).
type KpiAccent =
  | 'brand' | 'accent' | 'success' | 'warn' | 'danger'
  | 'sky' | 'cyan' | 'violet' | 'orange' | 'rose' | 'emerald' | 'ink'

// ── Donut data ──────────────────────────────────────────────────────────
// The four mutually-exclusive cohorts that make up the user base. Anything
// not in one of these states is intentionally NOT counted — the donut
// total = sum of these four buckets.
const DONUT_COHORTS: { key: Cohort; label: string; color: string; accent: KpiAccent }[] = [
  { key: 'free_trial',   label: 'Free Trial',    color: 'rgb(14 165 233)', accent: 'accent' },  // sky
  { key: 'total_passes', label: 'Total Passes',  color: 'rgb(30 64 175)',  accent: 'brand'  },  // deep blue
  { key: 'at_risk',      label: 'At Risk',       color: '#D97706',          accent: 'warn'   },  // amber
  { key: 'expired',      label: 'Expired',       color: '#DC2626',          accent: 'danger' },  // red
]

// Sub-rows shown indented under "Total Passes" — paid tier breakdown.
const PAID_SUBROWS: { key: Cohort; label: string }[] = [
  { key: 'individual_monthly', label: 'Individual — Monthly' },
  { key: 'individual_annual',  label: 'Individual — Annual' },
  { key: 'league_passes',      label: 'League Passes' },
]

const totalCounted = computed(() => {
  if (!stats.value) return 0
  return DONUT_COHORTS.reduce((sum, c) => sum + (stats.value!.cards[c.key].value ?? 0), 0)
})
const totalNewCounted = computed(() => {
  if (!stats.value) return 0
  return DONUT_COHORTS.reduce((sum, c) => sum + (stats.value!.cards[c.key].new_in_window ?? 0), 0)
})

const donutData = computed(() => {
  if (!stats.value) return null
  return {
    labels: DONUT_COHORTS.map((c) => c.label),
    datasets: [
      {
        data: DONUT_COHORTS.map((c) => stats.value!.cards[c.key].value),
        backgroundColor: DONUT_COHORTS.map((c) => c.color),
        borderWidth: 3,
        borderColor: '#FFFFFF',
        hoverOffset: 8,
        hoverBorderWidth: 3,
      },
    ],
  }
})

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
        label: (ctx: { dataIndex: number; parsed: number }) => {
          const cohort = DONUT_COHORTS[ctx.dataIndex]
          const newCount = stats.value?.cards[cohort.key].new_in_window ?? 0
          return ` ${ctx.parsed} users · +${newCount} new`
        },
      },
    },
  },
  onClick: (_evt: unknown, elements: { index: number }[]) => {
    if (elements && elements.length > 0) {
      const cohort = DONUT_COHORTS[elements[0].index]
      if (cohort) openCard(cohort.key)
    }
  },
}

const cardDefs: {
  key: Cohort
  label: string
  sub: string
  accent: KpiAccent
}[] = [
  // Disciplined palette: brand (deep blue) for top-of-funnel + headline
  // metrics, accent (sky) for paid-tier breakdowns, warn for at-risk
  // states, danger for failed/expired states. Five colors max across the
  // strip — same colors used on charts + everywhere else.
  { key: 'total_users',         label: 'Total Users',         sub: 'All profiles',                       accent: 'brand' },
  { key: 'free_trial',          label: 'Free Trial',          sub: 'Active trial · no paid plan',        accent: 'accent' },
  { key: 'total_passes',        label: 'Total Passes',        sub: 'All paid plans combined',            accent: 'brand' },
  { key: 'individual_monthly',  label: 'Individual — Monthly', sub: 'Active subscriptions',               accent: 'accent' },
  { key: 'individual_annual',   label: 'Individual — Annual',  sub: 'Active subscriptions',               accent: 'brand' },
  { key: 'league_passes',       label: 'League Passes',        sub: 'Active league passes',               accent: 'accent' },
  { key: 'at_risk',             label: 'At Risk',              sub: 'Trial ended · still in drip (≤21d)', accent: 'warn' },
  { key: 'expired',             label: 'Expired',              sub: 'Past drip · no paid plan',           accent: 'danger' },
]

const activeLabel = computed(
  () => windows.find((w) => w.key === active.value)?.label ?? '',
)

// ── Drill-down modal ───────────────────────────────────────────────────
// Clicking a card opens a modal with the full cohort as a table + CSV export.

const openCohort = ref<Cohort | null>(null)
const cohortRows = ref<Record<string, unknown>[]>([])
const cohortLoading = ref(false)
const cohortError = ref<string | null>(null)

// Engagement columns appended to every cohort. Populated by ufd-users
// joining ufd_email_events on recipient email.
const engagementColumns = [
  { key: 'emails_sent', label: 'Emails sent' },
  { key: 'last_received', label: 'Last received' },
  { key: 'last_opened', label: 'Last opened' },
  { key: 'open_rate', label: 'Open rate' },
]

// Columns shown per cohort, in order. Missing values render as '—'.
const cohortColumns: Record<Cohort, { key: string; label: string }[]> = {
  total_users: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'trial_expires_at', label: 'Trial ends' },
    ...engagementColumns,
  ],
  free_trial: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'trial_started_at', label: 'Trial start' },
    { key: 'trial_expires_at', label: 'Trial ends' },
    ...engagementColumns,
  ],
  at_risk: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'trial_expires_at', label: 'Trial ended' },
    ...engagementColumns,
  ],
  expired: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'trial_expires_at', label: 'Trial ended' },
    ...engagementColumns,
  ],
  individual_monthly: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'plan_started_at', label: 'Plan start' },
    { key: 'current_period_end', label: 'Renews' },
    ...engagementColumns,
  ],
  individual_annual: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'plan_started_at', label: 'Plan start' },
    { key: 'current_period_end', label: 'Renews' },
    ...engagementColumns,
  ],
  league_passes: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'signup_date', label: 'Signed up' },
    { key: 'pass_started_at', label: 'Purchased' },
    { key: 'expires_at', label: 'Expires' },
    ...engagementColumns,
  ],
  total_passes: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'plan_type', label: 'Plan' },
    { key: 'plan_started_at', label: 'Purchased' },
    { key: 'period_end', label: 'Period end' },
    ...engagementColumns,
  ],
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

// Columns whose values are fractional rates (0..1) and should render as %.
const RATE_COLUMNS = new Set(['open_rate', 'click_rate', 'delivery_rate', 'bounce_rate'])

function fmt(value: unknown, columnKey?: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (columnKey && RATE_COLUMNS.has(columnKey) && typeof value === 'number') {
    return `${(value * 100).toFixed(0)}%`
  }
  if (typeof value === 'string' && ISO_RE.test(value)) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    }
  }
  return String(value)
}

async function openCard(c: Cohort) {
  openCohort.value = c
  cohortRows.value = []
  cohortError.value = null
  cohortLoading.value = true
  const { data, error: err } = await supabase.functions.invoke<UsersResponse>('ufd-users', {
    body: { cohort: c },
  })
  cohortLoading.value = false
  if (err) {
    cohortError.value = await surfaceError(err, 'Failed to load users')
    return
  }
  cohortRows.value = data?.rows ?? []
}

function closeModal() {
  openCohort.value = null
  cohortRows.value = []
  cohortError.value = null
}

const openCohortLabel = computed(
  () => cardDefs.find((c) => c.key === openCohort.value)?.label ?? '',
)

const openCohortColumns = computed(() =>
  openCohort.value ? cohortColumns[openCohort.value] : [],
)

// ── User detail drawer ────────────────────────────────────────────────
// Clicking a row in the cohort modal opens the unified drawer with the
// user's full profile + payment history + email timeline + notes.
const detailEmail = ref<string | null>(null)
function openDetail(email: string | null | undefined) {
  if (!email) return
  detailEmail.value = email
}
function closeDetail() {
  detailEmail.value = null
}

// Escape a value for CSV: wrap in quotes if it contains a comma, quote, or
// newline, and double any embedded quotes.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv() {
  if (!openCohort.value) return
  const cols = openCohortColumns.value
  const header = cols.map((c) => csvCell(c.label)).join(',')
  const lines = cohortRows.value.map((row) =>
    cols.map((c) => csvCell(row[c.key])).join(','),
  )
  const csv = [header, ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `ufd-${openCohort.value}-${date}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header: title + window filter -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">UFD · Admin Metrics</h2>
        <p class="text-sm text-ink-muted">
          ultimatefantasydashboard.com · internal tools
        </p>
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

    <!-- Error state -->
    <div v-if="error" class="card border border-danger/30 bg-danger/5 text-sm text-danger">
      Couldn't load UFD stats: {{ error }}
    </div>

    <!-- Key Metrics section: donut + breakdown legend -->
    <section class="card">
      <div class="mb-4 flex items-center gap-2">
        <span class="eyebrow">Key Metrics</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
        <span class="text-xs text-ink-muted ml-1">Click a segment or row to view users</span>
      </div>

      <div v-if="loading && !stats" class="h-64 rounded-card bg-surface-elevated animate-pulse" />

      <div v-else-if="stats" class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Left: Donut + center label -->
        <div class="lg:col-span-5 relative flex items-center justify-center min-h-[260px]">
          <div class="relative w-full max-w-[280px] aspect-square">
            <Doughnut :data="donutData!" :options="donutOptions" />
            <!-- Centered label inside the donut hole -->
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-[44px] font-bold text-ink leading-none tracking-tight">
                {{ totalCounted }}
              </div>
              <div class="mt-1.5 kpi-label">Total Users</div>
              <div
                v-if="totalNewCounted > 0"
                class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success"
              >
                ↑ +{{ totalNewCounted }} new
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Breakdown legend (clickable rows) -->
        <div class="lg:col-span-7 space-y-1.5">
          <template v-for="row in DONUT_COHORTS" :key="row.key">
            <button
              type="button"
              class="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/60 focus:outline-none focus:ring-2 focus:ring-brand/30"
              @click="openCard(row.key)"
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
                  {{ stats.cards[row.key].value }}
                </span>
                <span
                  v-if="stats.cards[row.key].new_in_window > 0"
                  class="text-xs font-semibold text-success"
                >
                  ↑+{{ stats.cards[row.key].new_in_window }}
                </span>
                <span
                  v-else
                  class="text-xs text-ink-disabled"
                >
                  +0
                </span>
              </div>
            </button>

            <!-- Indented paid-tier rows under Total Passes -->
            <template v-if="row.key === 'total_passes'">
              <button
                v-for="sub in PAID_SUBROWS"
                :key="sub.key"
                type="button"
                class="w-full flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-left transition-colors hover:bg-surface-elevated/40 focus:outline-none focus:ring-2 focus:ring-brand/20"
                @click="openCard(sub.key)"
              >
                <span class="text-[10px] text-ink-disabled font-mono">└</span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-ink-muted truncate">{{ sub.label }}</div>
                </div>
                <div class="flex items-baseline gap-2 whitespace-nowrap">
                  <span class="text-sm font-semibold text-ink tabular-nums">
                    {{ stats.cards[sub.key].value }}
                  </span>
                  <span
                    v-if="stats.cards[sub.key].new_in_window > 0"
                    class="text-[11px] font-semibold text-success"
                  >
                    ↑+{{ stats.cards[sub.key].new_in_window }}
                  </span>
                  <span v-else class="text-[11px] text-ink-disabled">+0</span>
                </div>
              </button>
            </template>
          </template>
        </div>
      </div>
    </section>

    <!-- Trends section -->
    <section>
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Trends</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="card">
          <h3 class="mb-3 text-sm font-semibold text-ink">New Users</h3>
          <div class="h-64">
            <Line
              v-if="stats"
              :data="usersChartData"
              :options="lineOpts"
            />
            <div v-else class="h-full animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>

        <div class="card">
          <h3 class="mb-3 text-sm font-semibold text-ink">New Passes</h3>
          <div class="h-64">
            <Bar
              v-if="stats"
              :data="passesChartData"
              :options="barOpts"
            />
            <div v-else class="h-full animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      </div>
    </section>

    <!-- User list modal -->
    <div
      v-if="openCohort"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8"
      @click.self="closeModal"
    >
      <div class="w-full max-w-5xl rounded-xl bg-surface-raised shadow-xl">
        <div class="flex items-center justify-between border-b border-divider px-6 py-4">
          <div>
            <h3 class="text-base font-semibold text-ink">{{ openCohortLabel }}</h3>
            <p class="text-xs text-ink-muted">
              {{ cohortRows.length }} {{ cohortRows.length === 1 ? 'user' : 'users' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-secondary text-xs"
              :disabled="cohortLoading || cohortRows.length === 0"
              @click="downloadCsv"
            >
              Download CSV
            </button>
            <button
              type="button"
              class="btn-ghost text-xs"
              @click="closeModal"
            >
              Close
            </button>
          </div>
        </div>

        <div class="px-6 py-4">
          <div v-if="cohortLoading" class="py-8 text-center text-sm text-ink-muted">
            Loading…
          </div>
          <div
            v-else-if="cohortError"
            class="card border border-danger/30 bg-danger/5 text-sm text-danger"
          >
            {{ cohortError }}
          </div>
          <div
            v-else-if="cohortRows.length === 0"
            class="py-8 text-center text-sm text-ink-muted"
          >
            No users in this cohort.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-divider text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th
                    v-for="col in openCohortColumns"
                    :key="col.key"
                    class="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {{ col.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in cohortRows"
                  :key="String(row.user_id ?? i)"
                  class="cursor-pointer border-b border-divider/60 hover:bg-surface-elevated/50"
                  @click="openDetail(row.email as string | undefined)"
                >
                  <td
                    v-for="col in openCohortColumns"
                    :key="col.key"
                    class="whitespace-nowrap px-3 py-2 text-ink"
                  >
                    {{ fmt(row[col.key], col.key) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Unified user detail drawer -->
    <UfdUserDetailDrawer
      :open="detailEmail !== null"
      :email="detailEmail"
      :client="moduleProps.client"
      @close="closeDetail"
    />
  </div>
</template>
