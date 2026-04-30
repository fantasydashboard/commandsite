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

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
)

const moduleProps = defineProps<{ client: Client; config: Record<string, unknown> }>()

interface FunnelStages {
  signed_up: number
  connected_league: number
  completed_trial_week: number
  paid: number
  renewed: number
}
interface UserLite {
  user_id: string
  email: string
  full_name: string | null
}
interface FunnelResponse {
  window_days: number
  snapshot: FunnelStages
  cohort: FunnelStages
  prev_cohort: FunnelStages
  cohort_users: Record<keyof FunnelStages, UserLite[]>
  timeseries: { date: string; signups: number }[]
}

type StageKey = keyof FunnelStages
const STAGES: { key: StageKey; label: string; help: string }[] = [
  { key: 'signed_up', label: 'Signed up', help: 'Created a UFD account' },
  { key: 'connected_league', label: 'Connected league', help: 'Linked at least one Yahoo, ESPN, or Sleeper league' },
  { key: 'completed_trial_week', label: 'Completed trial week', help: 'At least 7 days since trial_started_at' },
  { key: 'paid', label: 'Paid', help: 'Active individual subscription or active League Pass' },
  { key: 'renewed', label: 'Renewed', help: 'Subscription extended into a renewal period (>~25d past start)' },
]

const data = ref<FunnelResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const view = ref<'cohort' | 'snapshot'>('cohort')
const windowDays = ref<30 | 60 | 90>(30)
// When set, opens UfdUserDetailDrawer for that recipient.
const detailEmail = ref<string | null>(null)
// Stage row that's currently expanded for drill-in (null = none).
const expandedStage = ref<keyof FunnelStages | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const { data: resp, error: err } = await supabase.functions.invoke<FunnelResponse>(
      'ufd-funnel',
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

const activeStages = computed<FunnelStages | null>(() => {
  if (!data.value) return null
  return view.value === 'snapshot' ? data.value.snapshot : data.value.cohort
})

// % conversion from one stage to the next + max bar width + delta vs prev cohort.
const rows = computed(() => {
  const s = activeStages.value
  if (!s) return []
  const top = s.signed_up || 1
  const prev = view.value === 'cohort' ? data.value?.prev_cohort : null
  return STAGES.map((stage, i) => {
    const count = s[stage.key]
    const prevCount = i === 0 ? count : s[STAGES[i - 1].key]
    const dropPct = i === 0 || prevCount === 0
      ? null
      : ((prevCount - count) / prevCount) * 100
    const conversionPct = i === 0 || prevCount === 0
      ? null
      : (count / prevCount) * 100
    const widthPct = top === 0 ? 0 : Math.max(2, (count / top) * 100)
    // Delta vs previous window (only meaningful in cohort view).
    const prevWindowCount = prev ? prev[stage.key] : null
    const delta = prevWindowCount !== null && prevWindowCount !== undefined
      ? count - prevWindowCount
      : null
    const deltaPct = prevWindowCount && prevWindowCount > 0
      ? ((count - prevWindowCount) / prevWindowCount) * 100
      : null
    return {
      ...stage,
      count,
      dropPct,
      conversionPct,
      widthPct,
      delta,
      deltaPct,
    }
  })
})

// "Stuck" users for stage X: in cohort_users[X] but NOT in cohort_users[X+1].
// Only meaningful in cohort view (snapshot doesn't return user lists).
function stuckUsersAt(stage: keyof FunnelStages): UserLite[] {
  if (!data.value || view.value !== 'cohort') return []
  const idx = STAGES.findIndex((s) => s.key === stage)
  const here = data.value.cohort_users[stage] ?? []
  if (idx === STAGES.length - 1) return here
  const nextKey = STAGES[idx + 1].key
  const nextSet = new Set(
    (data.value.cohort_users[nextKey] ?? []).map((u) => u.user_id),
  )
  return here.filter((u) => !nextSet.has(u.user_id))
}

function toggleStage(stage: keyof FunnelStages) {
  expandedStage.value = expandedStage.value === stage ? null : stage
}

const chartData = computed(() => {
  if (!data.value) return null
  return {
    labels: data.value.timeseries.map((d) => d.date.slice(5)),
    datasets: [
      {
        label: 'Signups',
        data: data.value.timeseries.map((d) => d.signups),
        borderColor: '#7C3AED',
        backgroundColor: 'rgba(124,58,237,0.12)',
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
    x: {
      grid: { display: false },
      ticks: { autoSkip: true, maxTicksLimit: 10, font: { size: 10 } },
    },
    y: {
      beginAtZero: true,
      ticks: { precision: 0, font: { size: 10 } },
      grid: { color: 'rgba(0,0,0,0.06)' },
    },
  },
}

function fmtPct(p: number | null): string {
  if (p === null) return ''
  if (p < 0.05 && p > -0.05) return '0%'
  return `${p.toFixed(p < 10 ? 1 : 0)}%`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Funnel</h2>
        <p class="text-sm text-ink-muted">
          Where users drop off between signup and paid. Cohort = users who signed up in the window; snapshot = all-time totals.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-md border border-divider overflow-hidden text-xs">
          <button
            type="button"
            :class="['px-3 py-1', view === 'cohort' ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
            @click="view = 'cohort'"
          >Cohort</button>
          <button
            type="button"
            :class="['px-3 py-1', view === 'snapshot' ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
            @click="view = 'snapshot'"
          >All-time</button>
        </div>
        <select
          v-model.number="windowDays"
          class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
        >
          <option :value="30">Last 30 days</option>
          <option :value="60">Last 60 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>

    <div v-if="loading && !data" class="card text-center text-sm text-ink-muted py-6">
      Loading funnel…
    </div>

    <!-- Funnel + chart row -->
    <div v-if="data" class="grid gap-4 lg:grid-cols-3">
      <!-- Stage bars -->
      <section class="card lg:col-span-2 space-y-3">
        <div class="flex items-baseline justify-between">
          <h3 class="text-sm font-semibold text-ink">
            {{ view === 'cohort' ? `Cohort (last ${data.window_days}d)` : 'All-time totals' }}
          </h3>
          <span class="text-[11px] text-ink-muted font-mono">
            {{ rows[0]?.count ?? 0 }} → {{ rows[rows.length - 1]?.count ?? 0 }}
          </span>
        </div>

        <div class="space-y-2">
          <template v-for="(row, i) in rows" :key="row.key">
            <div class="space-y-1">
              <button
                type="button"
                class="w-full flex items-baseline justify-between gap-2 text-left"
                :disabled="view !== 'cohort'"
                @click="toggleStage(row.key)"
              >
                <div class="flex items-baseline gap-2 min-w-0">
                  <span
                    v-if="view === 'cohort'"
                    class="text-[10px] text-ink-disabled w-3"
                  >
                    {{ expandedStage === row.key ? '▾' : '▸' }}
                  </span>
                  <span class="text-sm font-medium text-ink truncate">{{ row.label }}</span>
                  <span class="text-[11px] text-ink-disabled truncate">{{ row.help }}</span>
                </div>
                <div class="flex items-baseline gap-2 whitespace-nowrap">
                  <span
                    v-if="row.delta !== null && row.delta !== 0"
                    :class="[
                      'text-[11px] font-mono',
                      row.delta > 0 ? 'text-success' : 'text-danger',
                    ]"
                  >
                    {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                    <span v-if="row.deltaPct !== null" class="text-ink-disabled">
                      ({{ row.deltaPct > 0 ? '+' : '' }}{{ fmtPct(row.deltaPct) }})
                    </span>
                  </span>
                  <span class="text-sm font-mono font-semibold text-ink">{{ row.count }}</span>
                </div>
              </button>
              <div class="relative h-7 rounded bg-surface-elevated/40 overflow-hidden">
                <div
                  class="h-full rounded"
                  :class="i === STAGES.length - 1 ? 'bg-success/35' : 'bg-primary/35'"
                  :style="{ width: row.widthPct + '%' }"
                ></div>
                <div
                  v-if="row.conversionPct !== null"
                  class="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-mono text-ink-muted"
                >
                  <span :class="row.dropPct !== null && row.dropPct > 50 ? 'text-danger font-semibold' : ''">
                    {{ fmtPct(row.conversionPct) }} kept
                    <span v-if="row.dropPct !== null && row.dropPct > 0" class="text-ink-disabled">
                      · {{ fmtPct(row.dropPct) }} dropped
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Drill-in panel: who's stuck at this stage (cohort only) -->
            <div
              v-if="expandedStage === row.key && view === 'cohort'"
              class="ml-3 rounded border-l-2 border-divider pl-3 py-1 space-y-1.5"
            >
              <div class="flex items-baseline justify-between text-[11px] text-ink-muted">
                <span>
                  <strong class="text-ink">{{ stuckUsersAt(row.key).length }}</strong>
                  {{ i === STAGES.length - 1 ? 'reached this stage' : 'reached "' + row.label + '" but not "' + STAGES[i + 1].label + '"' }}
                </span>
                <button
                  type="button"
                  class="text-[10px] text-ink-disabled hover:text-ink"
                  @click="expandedStage = null"
                >
                  Close
                </button>
              </div>
              <div
                v-if="stuckUsersAt(row.key).length === 0"
                class="text-[11px] text-ink-disabled italic px-1"
              >
                Nobody — full conversion to next stage.
              </div>
              <div v-else class="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  v-for="u in stuckUsersAt(row.key).slice(0, 30)"
                  :key="u.user_id"
                  type="button"
                  class="rounded bg-surface px-2 py-1.5 text-left text-xs hover:bg-surface-elevated transition-colors"
                  @click="detailEmail = u.email"
                >
                  <div class="truncate font-medium text-ink">{{ u.full_name || u.email }}</div>
                  <div v-if="u.full_name" class="truncate text-[10px] text-ink-muted">{{ u.email }}</div>
                </button>
              </div>
              <div
                v-if="stuckUsersAt(row.key).length > 30"
                class="text-[10px] text-ink-disabled italic px-1"
              >
                +{{ stuckUsersAt(row.key).length - 30 }} more (showing first 30)
              </div>
            </div>
          </template>
        </div>
        <div v-if="view === 'snapshot'" class="text-[10px] text-ink-disabled italic">
          Drill-in is only available in the Cohort view.
        </div>

        <!-- Headline: trial → paid drop -->
        <div
          v-if="rows[2] && rows[3] && rows[2].count > 0"
          class="rounded border border-divider bg-surface-elevated/40 px-3 py-2 text-xs"
        >
          <span class="font-semibold text-ink">Trial → Paid:</span>
          <span class="ml-1 text-ink-muted">
            {{ rows[3].count }} of {{ rows[2].count }}
            ({{ fmtPct((rows[3].count / rows[2].count) * 100) }})
            converted within the {{ view === 'cohort' ? `${data.window_days}-day` : 'all-time' }} window.
          </span>
        </div>
      </section>

      <!-- Signups time series -->
      <section class="card space-y-3">
        <h3 class="text-sm font-semibold text-ink">Daily signups</h3>
        <div class="h-48">
          <Line v-if="chartData" :data="chartData" :options="chartOptions" />
        </div>
        <div class="text-[11px] text-ink-muted">
          Last {{ data.window_days }} days · {{ data.cohort.signed_up }} total signups
          <span v-if="data.prev_cohort.signed_up !== data.cohort.signed_up" class="ml-1">
            <span
              :class="data.cohort.signed_up >= data.prev_cohort.signed_up ? 'text-success' : 'text-danger'"
            >
              ({{ data.cohort.signed_up >= data.prev_cohort.signed_up ? '+' : '' }}{{ data.cohort.signed_up - data.prev_cohort.signed_up }} vs prev)
            </span>
          </span>
        </div>
      </section>
    </div>

    <!-- Drill-in user detail drawer -->
    <UfdUserDetailDrawer
      :open="detailEmail !== null"
      :email="detailEmail"
      :client="moduleProps.client"
      @close="detailEmail = null"
    />
  </div>
</template>
