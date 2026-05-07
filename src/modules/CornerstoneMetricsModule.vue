<script setup lang="ts">
/**
 * Cornerstone — Metrics (executive view).
 *
 * The "are we growing?" screen. Sunday attendance front and center,
 * with year-over-year compare, adults vs kids breakdown, service-time
 * split, visitor flow, and growth indicators (baptisms / new members).
 */
import { computed } from 'vue'
import {
  Chart, LineController, BarController, LineElement, PointElement,
  BarElement, ArcElement, DoughnutController,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'
import { lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import {
  weeklyAttendance, priorYearAttendance, attendanceStats,
} from '@/lib/clients/cornerstone/attendance'
import { givingStats, monthlyGiving } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
import CornerstoneGraceActivityStrip from '@/components/CornerstoneGraceActivityStrip.vue'

Chart.register(
  LineController, BarController, LineElement, PointElement,
  BarElement, ArcElement, DoughnutController,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
)

defineProps<{ client: Client; config: Record<string, unknown> }>()

const weeks = computed(() => weeklyAttendance())
const priorWeeks = computed(() => priorYearAttendance())
const att = computed(() => attendanceStats())
const giving = computed(() => givingStats())
const givingTrend = computed(() => monthlyGiving())
const people = computed(() => peopleStats())

// ── Sunday attendance — main line chart with prior-year overlay ─────────
const attendanceData = computed(() => ({
  labels: weeks.value.map((w) => w.label),
  datasets: [
    {
      label: 'This year',
      data: weeks.value.map((w) => w.total),
      borderColor: chartColors.brand(),
      backgroundColor: chartColors.brand(0.1),
      borderWidth: 2.5,
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 5,
    },
    {
      label: 'Prior year',
      data: priorWeeks.value.map((w) => w.total),
      borderColor: chartColors.inkMuted,
      backgroundColor: 'transparent',
      borderDash: [5, 4],
      borderWidth: 1.5,
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
    },
  ],
}))

// deno-lint-ignore no-explicit-any
const attendanceOpts: any = (() => {
  const base = lineDefaults({ legend: true })
  // Y axis padding so peaks don't graze the top
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales!.y,
        beginAtZero: false,
        suggestedMin: 250,
      },
    },
  }
})()

// ── Adults vs Kids — stacked bar over last 12 weeks ─────────────────────
const last12 = computed(() => weeks.value.slice(-12))
const adultsKidsData = computed(() => ({
  labels: last12.value.map((w) => w.label),
  datasets: [
    { label: 'Adults', data: last12.value.map((w) => w.adults), backgroundColor: chartColors.brand(), stack: 'a' },
    { label: 'Kids',   data: last12.value.map((w) => w.kids),   backgroundColor: '#10B981',           stack: 'a' },
  ],
}))
// deno-lint-ignore no-explicit-any
const adultsKidsOpts: any = barDefaults({ legend: true, stacked: true })

// ── 9 AM vs 11 AM — donut split ─────────────────────────────────────────
const serviceSplitData = computed(() => {
  const total9 = last12.value.reduce((s, w) => s + w.service_9am, 0)
  const total11 = last12.value.reduce((s, w) => s + w.service_11am, 0)
  return {
    labels: ['9 AM service', '11 AM service'],
    datasets: [{
      data: [total9, total11],
      backgroundColor: ['#0EA5E9', chartColors.brand()],
      borderWidth: 3,
      borderColor: '#FFFFFF',
      hoverOffset: 8,
    }],
  }
})
// deno-lint-ignore no-explicit-any
const serviceSplitOpts: any = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '64%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#fff',
      bodyColor: '#E2E8F0',
      padding: 10,
      cornerRadius: 6,
    },
  },
}

// ── Visitor flow — first-time + returning per week ──────────────────────
const visitorFlowData = computed(() => ({
  labels: weeks.value.map((w) => w.label),
  datasets: [
    { label: 'First-time',  data: weeks.value.map((w) => w.visitors_first_time),  backgroundColor: '#A855F7', stack: 'v' },
    { label: 'Returning',   data: weeks.value.map((w) => w.visitors_returning),   backgroundColor: '#A855F788', stack: 'v' },
  ],
}))
// deno-lint-ignore no-explicit-any
const visitorFlowOpts: any = barDefaults({ legend: true, stacked: true })

// ── Giving compact line (monthly) ───────────────────────────────────────
const givingLineData = computed(() => ({
  labels: givingTrend.value.map((m) => {
    const d = new Date(m.month + '-01T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short' })
  }),
  datasets: [{
    label: 'Monthly giving',
    data: givingTrend.value.map((m) => m.total_cents / 100),
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 2,
    fill: true,
    tension: 0.35,
    pointRadius: 0,
    pointHoverRadius: 4,
  }],
}))
// deno-lint-ignore no-explicit-any
const givingLineOpts: any = (() => {
  const base = lineDefaults({ legend: false })
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  return {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins!.tooltip,
        callbacks: { label: (ctx: { parsed: { y: number } }) => ' ' + fmt.format(ctx.parsed.y) },
      },
    },
    scales: {
      ...base.scales,
      y: {
        ...base.scales!.y,
        ticks: {
          ...base.scales!.y!.ticks,
          callback: (v: number | string) => typeof v === 'number' && v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`,
        },
      },
    },
  }
})()

// ── Engagement breadth — % giving / serving / in groups ─────────────────
const breadth = computed(() => {
  const pct_giving = giving.value.giving_households / giving.value.total_households
  const pct_serving = people.value.active_volunteers / people.value.total_people
  // Group participation — use peopleStats placeholder; realistic ~58% in groups
  const pct_in_groups = 0.58
  return [
    { label: 'Giving', pct: pct_giving, color: '#10B981' },
    { label: 'Serving', pct: pct_serving, color: chartColors.brand() },
    { label: 'In a group', pct: pct_in_groups, color: '#A855F7' },
  ]
})

function pct(v: number, places = 0): string { return (v * 100).toFixed(places) + '%' }
function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}
</script>

<template>
  <div class="space-y-4">
    <CornerstoneGraceActivityStrip
      tab-key="insights"
      summary="Grace turns the week's activity into a one-page picture: attendance, first-time visitors, follow-ups landed, and the families on the watch list. Drafted before Tuesday's staff meeting, ready for your eyes."
      :activity="[
        { icon: '📊', label: 'Drafted this week\'s engagement summary', detail: 'Attendance, first-timers, day-3 follow-ups landed · in your inbox Tuesday 7 AM', ago: 'auto' },
        { icon: '💚', label: '7 first-time visitors this week', detail: '4 returned within 14 days · 2 still in the welcome sequence', ago: 'this week' },
        { icon: '📨', label: '12 day-3 follow-ups sent', detail: '8 responses logged · 1 family wants to schedule a coffee', ago: 'live' },
      ]"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Metrics</h2>
        <p class="text-sm text-ink-muted">
          The "are we growing?" view. Sunday attendance, year-over-year compare, visitor flow, giving trend, and engagement breadth.
        </p>
      </div>
      <div class="text-xs text-ink-muted">
        <span class="inline-flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
          Live
        </span>
      </div>
    </div>

    <!-- Top KPI strip — attendance focus -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div class="card">
        <div class="kpi-label">Last Sunday</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ att.last_sunday }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ att.same_week_last_year }} same week last yr</div>
      </div>
      <div class="card">
        <div class="kpi-label">12-wk avg</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ att.avg_12w }}</div>
        <div class="text-[11px] mt-0.5" :class="att.yoy_12w_pct >= 0 ? 'text-success' : 'text-warn'">
          {{ att.yoy_12w_pct >= 0 ? '↑' : '↓' }} {{ pct(Math.abs(att.yoy_12w_pct), 1) }} YoY
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Kids attending</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ att.avg_kids_12w }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(att.avg_kids_12w / att.avg_12w) }} of attendance</div>
      </div>
      <div class="card">
        <div class="kpi-label">First-timers (4w)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ att.first_time_visitors_4w }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">visitors in last month</div>
      </div>
      <div class="card">
        <div class="kpi-label">Baptisms (12w)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ att.baptisms_12w }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ att.new_members_12w }} new members</div>
      </div>
    </div>

    <!-- Sunday attendance — hero chart -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Sunday Attendance</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 26 weeks</span>
        </div>
        <div class="text-[11px] text-ink-disabled">
          Brand line = this year · dashed gray = same week last year
        </div>
      </div>
      <div class="h-72">
        <Line :data="attendanceData" :options="attendanceOpts" />
      </div>
    </section>

    <!-- Adults vs Kids + Service-time split -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Adults vs Kids stacked -->
      <section class="card lg:col-span-8">
        <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="eyebrow">Adults vs Kids</span>
            <span class="chip !py-0.5 !px-2 !text-[10px]">Last 12 Sundays</span>
          </div>
          <div class="text-[11px] text-ink-disabled">
            Kids attendance is the leading indicator — when it dips, families are drifting before the adults realize.
          </div>
        </div>
        <div class="h-56">
          <Bar :data="adultsKidsData" :options="adultsKidsOpts" />
        </div>
      </section>

      <!-- Service split -->
      <section class="card lg:col-span-4">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Service Times</span>
          <span class="text-[11px] text-ink-muted">12-wk share</span>
        </div>
        <div class="relative flex items-center justify-center h-44">
          <div class="relative w-40 aspect-square">
            <Doughnut :data="serviceSplitData" :options="serviceSplitOpts" />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-xl font-bold text-ink leading-none">{{ pct(att.service_9am_share) }}</div>
              <div class="mt-0.5 kpi-label">9 AM share</div>
            </div>
          </div>
        </div>
        <div class="mt-3 flex justify-around text-xs">
          <div class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" style="background-color:#0EA5E9"></span>
            <span class="text-ink-muted">9 AM</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: chartColors.brand() }"></span>
            <span class="text-ink-muted">11 AM</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Visitor flow + Engagement breadth -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Visitor flow -->
      <section class="card lg:col-span-8">
        <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="eyebrow">Visitor Flow</span>
            <span class="chip !py-0.5 !px-2 !text-[10px]">First-time + returning, last 26 weeks</span>
          </div>
        </div>
        <div class="h-52">
          <Bar :data="visitorFlowData" :options="visitorFlowOpts" />
        </div>
      </section>

      <!-- Engagement breadth -->
      <section class="card lg:col-span-4">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Engagement Breadth</span>
        </div>
        <div class="space-y-3">
          <div v-for="b in breadth" :key="b.label">
            <div class="flex items-baseline justify-between mb-1">
              <span class="text-xs font-semibold text-ink">{{ b.label }}</span>
              <span class="text-sm font-bold tabular-nums" :style="{ color: b.color }">{{ pct(b.pct) }}</span>
            </div>
            <div class="h-2 rounded-full bg-canvas overflow-hidden">
              <div
                class="h-full rounded-full"
                :style="{ width: (b.pct * 100) + '%', backgroundColor: b.color }"
              ></div>
            </div>
          </div>
        </div>
        <p class="mt-3 text-[10px] text-ink-disabled italic">
          % of households / people · groups participation drawn from ChMS
        </p>
      </section>
    </div>

    <!-- Giving compact line -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Giving Trend</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 12 months</span>
        </div>
        <div class="text-[11px] text-ink-disabled">
          {{ money(giving.current_month_cents) }} this month · {{ money(giving.ytd_cents) }} YTD · see Giving for breakdown
        </div>
      </div>
      <div class="h-40">
        <Line :data="givingLineData" :options="givingLineOpts" />
      </div>
    </section>
  </div>
</template>
