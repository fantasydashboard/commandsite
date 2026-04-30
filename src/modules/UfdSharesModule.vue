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
  Filler,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import UfdUserDetailDrawer from '@/components/UfdUserDetailDrawer.vue'
import type { Client } from '@/types/database'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler)

const moduleProps = defineProps<{ client: Client; config: Record<string, unknown> }>()

interface UserShareRow {
  user_id: string
  email: string
  full_name: string | null
  share_count: number
  is_paid: boolean
  in_trial: boolean
  trial_started_at: string | null
}
interface SharesResponse {
  window_days: number
  total_shares: number
  unique_sharers: number
  top_dashboards: { dashboard_type: string; count: number }[]
  top_users: UserShareRow[]
  conversion: {
    threshold: number
    high_sharers: { total: number; paid: number }
    low_sharers: { total: number; paid: number }
    high_paid_rate: number | null
    low_paid_rate: number | null
  }
  timeseries: { date: string; shares: number }[]
}

const data = ref<SharesResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const windowDays = ref<7 | 30 | 60 | 90>(30)
const detailEmail = ref<string | null>(null)
const filter = ref<'all' | 'in_trial' | 'paid'>('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    const { data: resp, error: err } = await supabase.functions.invoke<SharesResponse>(
      'ufd-shares',
      { body: { window_days: windowDays.value } },
    )
    if (err) {
      if (err instanceof FunctionsHttpError) {
        try {
          const body = await err.context.json()
          error.value = body?.error ?? err.message
        } catch {
          error.value = err.message
        }
      } else {
        error.value = err.message
      }
      return
    }
    data.value = resp ?? null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(windowDays, load)

const filteredUsers = computed(() => {
  if (!data.value) return []
  const all = data.value.top_users
  if (filter.value === 'all') return all
  if (filter.value === 'paid') return all.filter((u) => u.is_paid)
  if (filter.value === 'in_trial') return all.filter((u) => u.in_trial)
  return all
})

const chartData = computed(() => {
  if (!data.value) return null
  return {
    labels: data.value.timeseries.map((d) => d.date.slice(5)),
    datasets: [
      {
        label: 'Shares',
        data: data.value.timeseries.map((d) => d.shares),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items: { label: string }[]) => items[0]?.label ?? '',
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, font: { size: 10 } } },
    y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
  },
}

function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`
}

// Lift in conversion rate from sharing 3+ — the headline number for the
// "cards-as-product" thesis. Positive means high-sharers convert more.
const conversionLift = computed<number | null>(() => {
  const c = data.value?.conversion
  if (!c || c.high_paid_rate === null || c.low_paid_rate === null || c.low_paid_rate === 0) {
    return null
  }
  return (c.high_paid_rate - c.low_paid_rate) / c.low_paid_rate
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Card Shares</h2>
        <p class="text-sm text-ink-muted">
          Every Share/Download click in UFD lands here. The cards-as-product thesis quantified — does sharing predict paid conversion?
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-ghost text-xs" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <select
          v-model.number="windowDays"
          class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
        >
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="60">Last 60 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>

    <div v-if="loading && !data" class="card text-center text-sm text-ink-muted py-6">
      Loading shares…
    </div>

    <template v-if="data">
      <!-- KPI strip -->
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="card">
          <div class="text-xs text-ink-muted uppercase tracking-wide">Total shares</div>
          <div class="text-2xl font-semibold text-ink mt-1">{{ data.total_shares }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">across all users in window</div>
        </div>
        <div class="card">
          <div class="text-xs text-ink-muted uppercase tracking-wide">Unique sharers</div>
          <div class="text-2xl font-semibold text-ink mt-1">{{ data.unique_sharers }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">distinct users who clicked Share at least once</div>
        </div>
        <div class="card">
          <div class="text-xs text-ink-muted uppercase tracking-wide">Avg shares / sharer</div>
          <div class="text-2xl font-semibold text-ink mt-1">
            {{ data.unique_sharers > 0 ? (data.total_shares / data.unique_sharers).toFixed(1) : '—' }}
          </div>
          <div class="text-[11px] text-ink-disabled mt-1">heavy users vs one-and-done</div>
        </div>
      </div>

      <!-- Conversion correlation — headline -->
      <section class="card space-y-3">
        <div>
          <span class="eyebrow">Cards-as-product thesis</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">Does sharing predict paid conversion?</h3>
          <p class="text-xs text-ink-muted">
            Trial users who started inside the {{ data.window_days }}-day window, split by whether they shared {{ data.conversion.threshold }}+ cards.
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded border border-success/30 bg-success/5 p-3">
            <div class="text-[11px] font-semibold uppercase tracking-wide text-success">{{ data.conversion.threshold }}+ shares</div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-2xl font-semibold text-ink">{{ fmtPct(data.conversion.high_paid_rate) }}</span>
              <span class="text-xs text-ink-muted">paid</span>
            </div>
            <div class="text-[11px] text-ink-disabled mt-1">
              {{ data.conversion.high_sharers.paid }} of {{ data.conversion.high_sharers.total }} users
            </div>
          </div>
          <div class="rounded border border-divider bg-surface-elevated/40 p-3">
            <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">0–{{ data.conversion.threshold - 1 }} shares</div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-2xl font-semibold text-ink">{{ fmtPct(data.conversion.low_paid_rate) }}</span>
              <span class="text-xs text-ink-muted">paid</span>
            </div>
            <div class="text-[11px] text-ink-disabled mt-1">
              {{ data.conversion.low_sharers.paid }} of {{ data.conversion.low_sharers.total }} users
            </div>
          </div>
        </div>
        <div
          v-if="conversionLift !== null"
          class="rounded border border-divider bg-surface-elevated/40 px-3 py-2 text-xs"
        >
          <span class="font-semibold text-ink">Lift:</span>
          <span class="ml-1 text-ink-muted">
            High-sharers convert
            <span :class="conversionLift > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'">
              {{ conversionLift > 0 ? '+' : '' }}{{ (conversionLift * 100).toFixed(0) }}%
            </span>
            relative to low-sharers.
            <span v-if="data.conversion.high_sharers.total < 10" class="text-ink-disabled italic">
              (small sample — {{ data.conversion.high_sharers.total }} high-sharers; treat as directional)
            </span>
          </span>
        </div>
      </section>

      <!-- Top dashboards + time series -->
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="card space-y-3">
          <h3 class="text-sm font-semibold text-ink">Top-shared dashboards</h3>
          <div v-if="data.top_dashboards.length === 0" class="text-xs text-ink-muted italic">
            No shares in this window yet.
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="row in data.top_dashboards.slice(0, 12)"
              :key="row.dashboard_type"
              class="flex items-center gap-2 text-xs"
            >
              <div class="flex-1 truncate font-mono text-ink">{{ row.dashboard_type }}</div>
              <div class="w-32 h-1.5 rounded bg-surface-elevated/60 overflow-hidden">
                <div
                  class="h-full bg-primary/50 rounded"
                  :style="{ width: ((row.count / data.top_dashboards[0].count) * 100) + '%' }"
                ></div>
              </div>
              <div class="w-10 text-right font-mono text-ink">{{ row.count }}</div>
            </div>
            <div
              v-if="data.top_dashboards.length > 12"
              class="text-[10px] text-ink-disabled italic pt-1"
            >
              +{{ data.top_dashboards.length - 12 }} more dashboard types
            </div>
          </div>
        </section>

        <section class="card space-y-3">
          <h3 class="text-sm font-semibold text-ink">Daily share volume</h3>
          <div class="h-48">
            <Line v-if="chartData" :data="chartData" :options="chartOptions" />
          </div>
        </section>
      </div>

      <!-- Per-user table -->
      <section class="card space-y-3">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-semibold text-ink">Top sharers</h3>
          <div class="flex rounded-md border border-divider overflow-hidden text-xs">
            <button
              type="button"
              :class="['px-3 py-1', filter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
              @click="filter = 'all'"
            >All</button>
            <button
              type="button"
              :class="['px-3 py-1', filter === 'in_trial' ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
              @click="filter = 'in_trial'"
            >In trial</button>
            <button
              type="button"
              :class="['px-3 py-1', filter === 'paid' ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
              @click="filter = 'paid'"
            >Paid</button>
          </div>
        </div>
        <div v-if="filteredUsers.length === 0" class="text-xs text-ink-muted italic">
          No users in this filter.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-2 py-2 font-medium">User</th>
                <th class="px-2 py-2 font-medium text-right">Shares</th>
                <th class="px-2 py-2 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in filteredUsers.slice(0, 50)"
                :key="u.user_id"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 cursor-pointer"
                @click="detailEmail = u.email"
              >
                <td class="px-2 py-1.5">
                  <div class="text-xs font-medium text-ink truncate">{{ u.full_name || u.email }}</div>
                  <div v-if="u.full_name" class="text-[10px] text-ink-muted truncate">{{ u.email }}</div>
                </td>
                <td class="px-2 py-1.5 text-right font-mono text-xs text-ink">{{ u.share_count }}</td>
                <td class="px-2 py-1.5 text-center">
                  <span
                    v-if="u.is_paid"
                    class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
                  >Paid</span>
                  <span
                    v-else-if="u.in_trial"
                    class="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn"
                  >Trial</span>
                  <span v-else class="text-[10px] text-ink-disabled">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div
            v-if="filteredUsers.length > 50"
            class="pt-2 text-[10px] text-ink-disabled italic"
          >
            Showing top 50 of {{ filteredUsers.length }} sharers.
          </div>
        </div>
      </section>
    </template>

    <UfdUserDetailDrawer
      :open="detailEmail !== null"
      :email="detailEmail"
      :client="moduleProps.client"
      @close="detailEmail = null"
    />
  </div>
</template>
