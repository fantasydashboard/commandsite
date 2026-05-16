<script setup lang="ts">
/**
 * Josh Personal — Trends tab.
 *
 * Time-series surfaces with Sage's narrative on top, experiment
 * overlays on the relevant charts, an adherence-rate grid, and
 * bloodwork trends with reference bands.
 *
 * The flat shape (Today's snapshot strip) lives elsewhere; this is the
 * page Josh comes to for the weekly/monthly review.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { ref } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import JoshPersonalSageChatPanel from '@/components/JoshPersonalSageChatPanel.vue'
import JoshPersonalTrendChart from '@/components/JoshPersonalTrendChart.vue'
import JoshPersonalAdherenceTrends from '@/components/JoshPersonalAdherenceTrends.vue'
import JoshPersonalBloodworkTrends from '@/components/JoshPersonalBloodworkTrends.vue'
import { STEPS_DAILY_TARGET } from '@/lib/clients/josh-personal/health'
import { useHealthData } from '@/lib/clients/josh-personal/healthData'
import { useTrendsSummary } from '@/lib/clients/josh-personal/trendsSummaryApi'
import { useExperiments } from '@/lib/clients/josh-personal/experimentsApi'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Live trends from Apple Health
const { trends, stepsSummary, dailyWeight, dailySteps, dailySleepAsleep, dailyHrvAvg } = useHealthData()
const { state: summary, refreshing: summaryRefreshing, refresh: refreshSummary, refreshedAgo: summaryRefreshedAgo } = useTrendsSummary()
const { experiments } = useExperiments()

// Map experiments to span objects per primary_metric the chart understands
type Span = {
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'abandoned'
  verdict: 'confirmed' | 'partial' | 'refuted' | 'inconclusive' | 'pending' | null
  title: string
}
function spansForMetric(metric: string): Span[] {
  return experiments.value
    .filter((e) => e.primary_metric === metric)
    .map((e) => ({
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
      verdict: e.verdict ?? null,
      title: e.title,
    }))
}

const weightExperiments = computed(() => spansForMetric('weight_body_mass'))
const sleepExperiments  = computed(() => spansForMetric('sleep_7d_avg'))
const hrvExperiments    = computed(() => spansForMetric('hrv_14d_avg'))
const stepsExperiments  = computed<Span[]>(() => [])

// Highlight tones for the Sage summary chips (parallel to History tab)
const HIGHLIGHT_KIND_TONE: Record<string, string> = {
  weight:     'bg-brand/10 text-brand',
  sleep:      'bg-brand/10 text-brand',
  hrv:        'bg-brand/10 text-brand',
  adherence:  'bg-success/10 text-success',
  experiment: 'bg-success/15 text-success',
  bloodwork:  'bg-warn/10 text-warn',
  workout:    'bg-brand/10 text-brand',
}

// ── Ask Sage floating chat ──────────────────────────────────────────
const chatOpen = ref(false)
const chatSeedPrompt = ref<string | null>(null)
function onChatClose() {
  chatOpen.value = false
  chatSeedPrompt.value = null
}
function onChatDataChanged(payload: { tools: string[] }) { void payload }
</script>

<template>
  <div class="space-y-5">
    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div>
      <h2 class="text-xl font-semibold text-ink">Trends</h2>
      <p class="text-xs text-ink-muted mt-0.5">
        Last 8 weeks across Apple Health, adherence, and bloodwork. Use this for your weekly review.
      </p>
    </div>

    <!-- ── Sage's 8-week recap ────────────────────────────────────── -->
    <section class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden">
      <header class="px-5 py-3 border-b border-brand/20 bg-brand/10 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <AssistantMark class="h-5 w-5 text-brand" />
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Sage's 8-week recap
            <span v-if="summary" class="text-ink-muted font-normal normal-case ml-1">· refreshed {{ summaryRefreshedAgo }}</span>
          </span>
        </div>
        <button
          type="button"
          class="text-[11px] text-brand font-semibold hover:underline disabled:opacity-50"
          :disabled="summaryRefreshing"
          @click="refreshSummary"
        >
          <span v-if="summaryRefreshing">Sage is summarizing…</span>
          <span v-else>Refresh</span>
        </button>
      </header>
      <div v-if="!summary" class="px-5 py-4">
        <p class="text-sm text-ink-muted">
          No 8-week recap yet. Tap refresh and Sage will pull weight, sleep, HRV, adherence, experiment outcomes, and bloodwork delta into one paragraph.
        </p>
      </div>
      <div v-else class="px-5 py-4">
        <p class="text-sm text-ink leading-relaxed">{{ summary.body }}</p>
        <div v-if="summary.highlights.length > 0" class="flex flex-wrap gap-2 mt-3">
          <span
            v-for="(h, i) in summary.highlights"
            :key="i"
            class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            :class="HIGHLIGHT_KIND_TONE[h.kind] ?? 'bg-canvas text-ink-muted'"
          >{{ h.label }}</span>
        </div>
      </div>
    </section>

    <!-- ── Adherence weekly grid ─────────────────────────────────── -->
    <JoshPersonalAdherenceTrends />

    <!-- ── Weight (with experiment overlay) ───────────────────────── -->
    <section class="card p-4">
      <div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Weight</div>
          <div class="text-base font-semibold text-ink mt-0.5">{{ trends.weight.label }}</div>
          <p class="text-xs text-ink-muted mt-0.5">{{ trends.weight.summary }}</p>
        </div>
      </div>
      <JoshPersonalTrendChart
        :series="dailyWeight"
        :unit="'lbs'"
        :experiments="weightExperiments"
        ariaLabel="Weight last 8 weeks"
      />
      <p v-if="weightExperiments.length > 0" class="text-[11px] text-ink-muted mt-2">
        Shaded bands = experiments tracking weight as the primary metric.
      </p>
    </section>

    <!-- ── Steps ────────────────────────────────────────────────── -->
    <section class="card p-4">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Steps</div>
          <div class="text-base font-semibold text-ink mt-0.5">{{ trends.steps.label }}</div>
          <p class="text-xs text-ink-muted mt-0.5">{{ trends.steps.summary }}</p>
        </div>
      </div>
      <JoshPersonalTrendChart
        :series="dailySteps"
        :target-line="STEPS_DAILY_TARGET"
        target-label="10k goal"
        :experiments="stepsExperiments"
        ariaLabel="Steps last 8 weeks"
      />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">7d avg</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.weekAvg.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Hit goal</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.daysHitGoal }}/{{ stepsSummary.daysInWeek }} days</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Longest streak</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.longestStreak }} d</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Today so far</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.todayProgress.toLocaleString() }}</div>
        </div>
      </div>
    </section>

    <!-- ── Sleep + HRV stacked -->
    <div class="grid gap-4 md:grid-cols-2">
      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Sleep</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.sleep.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.sleep.summary }}</p>
        <div class="mt-3">
          <JoshPersonalTrendChart
            :series="dailySleepAsleep"
            :unit="'h'"
            :experiments="sleepExperiments"
            ariaLabel="Sleep last 8 weeks"
          />
        </div>
      </section>

      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">HRV</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.hrv.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.hrv.summary }}</p>
        <div class="mt-3">
          <JoshPersonalTrendChart
            :series="dailyHrvAvg"
            :unit="'ms'"
            :experiments="hrvExperiments"
            ariaLabel="HRV last 8 weeks"
          />
        </div>
      </section>
    </div>

    <!-- ── Workouts/week — bar chart -->
    <section class="card p-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Workouts/week</div>
      <div class="text-base font-semibold text-ink mt-0.5">{{ trends.workouts.label }}</div>
      <p class="text-xs text-ink-muted mt-0.5">{{ trends.workouts.summary }}</p>
      <div class="flex items-end gap-2 h-24 mt-4">
        <div
          v-for="(c, i) in trends.workouts.weeklyCounts"
          :key="i"
          class="flex-1 bg-brand rounded-sm flex flex-col items-center justify-end relative group"
          :style="{ height: `${(c / 5) * 100}%` }"
          :title="`Week ${i + 1}: ${c} workouts`"
        >
          <span class="absolute -top-5 text-[10px] tabular-nums text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">{{ c }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 text-[10px] text-ink-muted mt-2">
        <span>← 8w ago</span>
        <span class="flex-1 border-b border-dashed border-divider"></span>
        <span>this wk →</span>
      </div>
    </section>

    <!-- ── Bloodwork ────────────────────────────────────────────── -->
    <JoshPersonalBloodworkTrends />

    <!-- ── Ask Sage floating chat ──────────────────────────────────── -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-brand text-white px-4 py-2.5 shadow-lg hover:opacity-90 transition-all hover:scale-105"
      title="Ask Sage about these trends"
      @click="chatOpen = !chatOpen"
    >
      <AssistantMark class="h-4 w-4 text-white" />
      Ask Sage
    </button>
    <JoshPersonalSageChatPanel
      :open="chatOpen"
      :seed-prompt="chatSeedPrompt"
      @close="onChatClose"
      @data-changed="onChatDataChanged"
    />
  </div>
</template>
