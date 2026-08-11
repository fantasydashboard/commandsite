<script setup lang="ts">
/**
 * Focal Point - "Guest pulse" (Front Desk & Guests).
 *
 * FLOW, not cohort. Two monthly series from the live Starting Point workflow:
 * how many people first visited in a month, and how many completed Starting
 * Point in a month.
 *
 * ── Three rules this component exists to enforce ───────────────────────────
 *
 * 1. The two numbers are NEVER divided into each other. Someone who completed
 *    Starting Point in July almost certainly first visited months earlier, so
 *    "39 first visits, 5 completions" is two unrelated populations sharing a
 *    calendar label, not a 13% conversion rate. They are drawn as separate
 *    tiles with their own sparklines, never side by side in one chart, and
 *    nothing on screen invites the division.
 *
 * 2. Monthly, never weekly. At this church's volume Starting Point completions
 *    run about 1.2 a week, so a weekly series is 0, 1 or 2 and a change badge
 *    reads "+200%" off a base of one. Monthly is the smallest honest bucket.
 *
 * 3. No month-over-month delta badge. Church attendance swings hard on Easter,
 *    Christmas, the summer dip and back-to-school, so "down 30% vs last month"
 *    usually just means it is July. The trend line carries the shape; the
 *    honest single comparison is same-month-last-year, which needs 24 months of
 *    history (see migration 0104) and is not claimed until it is there.
 *
 * The current month is part-elapsed and is dimmed + labelled, never dropped:
 * an unmarked short final bar reads as a collapse in volume.
 */
import { computed } from 'vue'
import { guestPipelineData } from '@/lib/clients/church/careDataLoader'
import { useCongregationLens } from '@/stores/congregationLens'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

/**
 * Mirrors GuestMonthPoint in the edge transform
 * (supabase/functions/_shared/pco-transforms/guestPipeline.ts).
 *
 * Declared HERE, not in lib/clients/focal-point/guestPipeline.ts, on purpose:
 * that file is skip-worktree (real congregant names live on disk only, never in
 * git), so anything added to it is invisible to CI and to Vercel. Importing a
 * type from it would compile locally and fail the production build.
 *
 * Only the LIVE payload carries `monthly`; the baked snapshot has no such key,
 * which is why this component self-hides until live data lands.
 */
interface GuestMonthPoint {
  month: string
  firstVisits: number
  completedSP: number
  partial: boolean
}

const lens = useCongregationLens()
const props = defineProps<{ clientName: string }>()

// Cap at 13 so the axis is "this month plus the twelve before it".
const MAX_MONTHS = 13

const series = computed<GuestMonthPoint[]>(() => {
  const all = (guestPipelineData() as { monthly?: Record<string, GuestMonthPoint[]> }).monthly
  return (all?.[lens.scope] ?? []).slice(-MAX_MONTHS)
})

const hasData = computed(() => series.value.length >= 2)

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function label(month: string): string {
  const [, m] = month.split('-').map(Number)
  return MONTH_LABEL[m - 1] ?? month
}
// The axis ends need the year. A 13-month span starts and ends in the same
// calendar month, so a bare "Aug ... Aug" reads as a rendering bug.
function labelWithYear(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_LABEL[m - 1] ?? month} '${String(y).slice(2)}`
}

interface Metric {
  key: 'firstVisits' | 'completedSP'
  title: string
  sub: string
}
const METRICS: Metric[] = [
  { key: 'firstVisits', title: 'First visits', sub: 'people who signed in for the first time' },
  { key: 'completedSP', title: 'Completed Starting Point', sub: 'finished the intro next-steps' },
]

const tiles = computed(() =>
  METRICS.map((mt) => {
    const pts = series.value
    const values = pts.map((p) => p[mt.key])
    const max = Math.max(1, ...values)
    // "Latest complete month" is the headline, not the partial one, so the big
    // number is never a half-month figure presented as a month.
    const lastComplete = [...pts].reverse().find((p) => !p.partial) ?? pts[pts.length - 1]
    const current = pts[pts.length - 1]
    return {
      ...mt,
      max,
      bars: pts.map((p) => ({
        month: p.month,
        label: label(p.month),
        value: p[mt.key],
        partial: p.partial,
        pctOfMax: Math.round((p[mt.key] / max) * 100),
      })),
      axisStart: pts.length ? labelWithYear(pts[0].month) : '',
      axisEnd: pts.length ? labelWithYear(pts[pts.length - 1].month) : '',
      headline: lastComplete ? lastComplete[mt.key] : 0,
      headlineMonth: lastComplete ? label(lastComplete.month) : '',
      partialValue: current?.partial ? current[mt.key] : null,
      partialMonth: current?.partial ? label(current.month) : '',
    }
  }),
)

// Aggregate only: month + two counts, no names. Exports exactly the scope on
// screen, so a file pulled under the Brazilian lens is that congregation's.
function onExport() {
  exportCsv(
    series.value,
    [
      { header: 'Month', value: (r) => r.month },
      { header: 'First visits', value: (r) => r.firstVisits },
      { header: 'Completed Starting Point', value: (r) => r.completedSP },
      { header: 'Month complete', value: (r) => (r.partial ? 'no, in progress' : 'yes') },
    ],
    { client: props.clientName, dataset: 'guest-pulse-monthly', scope: lens.scope },
  )
}
</script>

<template>
  <section v-if="hasData" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Guest pulse</span>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
          Live from Planning Center · by month
        </span>
        <ExportButton :count="series.length" @export="onExport" />
      </div>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">How each month is running</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Two separate counts. These are different groups of people, not a rate:
      someone who completed Starting Point this month almost certainly first
      visited months ago.
    </p>

    <div class="mt-5 grid gap-5 md:grid-cols-2">
      <div v-for="t in tiles" :key="t.key" class="rounded-lg border border-divider bg-surface p-4">
        <div class="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-muted">{{ t.title }}</div>

        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-ink tabular-nums">{{ t.headline }}</span>
          <span class="text-xs text-ink-muted">in {{ t.headlineMonth }}</span>
        </div>
        <div v-if="t.partialValue !== null" class="text-[11px] text-ink-disabled">
          {{ t.partialValue }} so far in {{ t.partialMonth }}, still in progress
        </div>

        <!-- Column sparkline. Bars rather than a line: these are counts per
             discrete month, and a line implies a continuous value between them. -->
        <div class="mt-3 flex h-16 items-end gap-1">
          <div
            v-for="b in t.bars"
            :key="b.month"
            class="flex-1 rounded-t-[3px]"
            :class="b.partial ? 'bg-brand/30' : 'bg-brand'"
            :style="{ height: Math.max(3, b.pctOfMax) + '%' }"
            :title="`${b.label}: ${b.value}${b.partial ? ' (month in progress)' : ''}`"
          ></div>
        </div>
        <div class="mt-1 flex justify-between text-[10px] text-ink-disabled">
          <span>{{ t.axisStart }}</span>
          <span>{{ t.axisEnd }}</span>
        </div>

        <div class="mt-2 text-[11px] text-ink-disabled">{{ t.sub }}</div>
      </div>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-ink-disabled">
      The lighter final bar is the current month, which is still filling. Month-to-month
      moves in a church swing with the calendar (Easter, Christmas, summer, back-to-school),
      so read the shape over several months rather than any single step up or down.
    </p>
  </section>
</template>
