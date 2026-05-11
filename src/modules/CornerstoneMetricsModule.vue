<script setup lang="ts">
/**
 * Cornerstone — Metrics (executive view).
 *
 * The "are we growing?" screen. Sunday attendance front and center,
 * with year-over-year compare, adults vs kids breakdown, service-time
 * split, visitor flow, and growth indicators (baptisms / new members).
 */
import { computed, ref } from 'vue'
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
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

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

// ── Insights queue: patterns Grace noticed + proposed action ──────────
// This is the most distinctive use of the queue — Grace as an analyst.
// Each item is a finding she surfaced + a one-click "yes, do it" action.
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'ins-attendance-dip',
    icon: '📉',
    badge: 'Attendance signal',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Attendance dipped 6% from 4-wk avg',
    recipient: 'Last 2 Sundays trended below baseline · spring break could explain part',
    preview: 'Want me to draft a "we missed you this Sunday" SMS to the 14 first-timers from 4 weeks ago who haven\'t come back? Their day-3 nudges all landed but no second visit. Worth a soft re-engage before they cool fully.',
    approved_response: 'Drafting now. Each one is personalized using their connect-card answer about what brought them. They\'ll be in your queue on Front Desk & Guests for review in ~30 sec.',
    ticker_after_approval: '14 re-engagement drafts queued — first-timers from 4 weeks back',
  },
  {
    id: 'ins-building-fund',
    icon: '🏗️',
    badge: 'Giving signal',
    badgeClass: 'bg-success/15 text-success',
    title: 'Building Fund just crossed 60% of goal',
    recipient: '14 days ahead of pace · 38 contributing households YTD',
    preview: 'Want me to draft a thank-you / progress update to the building-fund contributors? It\'s been ~5 weeks since the last update and momentum is real. I\'d frame it warmly without the next ask attached — let people feel the win first.',
    approved_response: 'Drafting. Personalized open ("Hey [first_name] — quick update for you specifically since you\'ve been part of this") — those have a 71% open rate vs 41% for generic broadcasts. In your Sundays + Comms queue shortly.',
    ticker_after_approval: 'Building Fund thank-you drafted for 38 contributors',
  },
  {
    id: 'ins-newsletter-ab',
    icon: '🔬',
    badge: 'Communications signal',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Newsletter open rate dropped 4 pts',
    recipient: 'Last 3 Sundays: 38% → 36% → 34% open · subject lines all started with "This Sunday at Cornerstone"',
    preview: 'Want me to A/B test 2 subject-line variants for next Sunday\'s newsletter? Hypothesis: leading with the personal-name token vs the church name will lift opens 5-8 pts. I\'d split the list 50/50, send same time, and surface results Wednesday.',
    approved_response: 'Test set up. List split, both variants written, scheduled for Wed 6 AM. I\'ll surface the comparison Wednesday afternoon when statistical significance lands (~12k impressions in).',
    ticker_after_approval: 'A/B test scheduled for Wed newsletter — subject-line variants',
  },
  {
    id: 'ins-baptism-pipeline',
    icon: '🌊',
    badge: 'Pastoral signal',
    badgeClass: 'bg-success/15 text-success',
    title: 'Baptism pipeline: 6 candidates from DC',
    recipient: '6 from this Discover Cornerstone cohort indicated baptism interest · none scheduled',
    preview: 'Want me to draft individual outreach to each one to walk them through the next step? I\'d use the question they asked on the DC form as the opener so it doesn\'t feel like a mailing-list ask. Goal: get 4-5 of them on the baptism Sunday calendar within 2 weeks.',
    approved_response: 'Drafting 6 individualized notes — each grounded in what they specifically said on the DC form. Will be in your Front Desk & Guests queue for review.',
    ticker_after_approval: '6 baptism-step outreach notes drafting (1 per DC candidate)',
  },
  {
    id: 'ins-volunteer-burnout',
    icon: '⚠',
    badge: 'Volunteer signal',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Volunteer burnout flag: 3 serving 4+ Sundays in a row',
    recipient: 'Mia Pham, Casey Holmes, Jess Lehrer all on the schedule 4+ consecutive Sundays',
    preview: 'Want me to draft a personal "thank you, here\'s your Sunday off" note to each + auto-block them from the next 2 schedules? You can re-add them whenever, but the breather signal lands stronger as a Pastor-Mark personal text than a Planning Center auto-message.',
    approved_response: 'Drafting all 3. Each one mentions the specific weeks they covered. I\'ll soft-block them in Planning Center too — you can override anytime. Notes in your queue shortly.',
    ticker_after_approval: '3 burnout-prevention notes drafting (Mia, Casey, Jess)',
  },
]

const tickerSeed = [
  { icon: '📊', text: 'Sunday attendance synced from Planning Center', ageSec: 18 * 60 },
  { icon: '💚', text: '7th first-time visitor this week — Connect form just submitted', ageSec: 41 * 60 },
  { icon: '🌊', text: 'Baptism interest captured from DC form — Marcus L.', ageSec: 2 * 3600 },
  { icon: '📉', text: 'Attendance trend recalculated — 6% below 4-wk avg', ageSec: 3 * 3600 },
]

const tickerPool = [
  { icon: '📊', text: 'Engagement summary draft auto-generated for Tuesday meeting' },
  { icon: '💰', text: 'Giving trend recalculated — Building Fund at 61%' },
  { icon: '🔄', text: 'First-time visitor → returning conversion: 57% (4-wk rolling)' },
  { icon: '👀', text: 'Newsletter open: 36% (down 2pt week-over-week)' },
  { icon: '✅', text: 'Day-3 follow-up landing rate: 89%' },
  { icon: '📈', text: 'Year-over-year attendance: +12.4%' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Engagement signals — auto-updates from Planning Center + your stack"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="2"
      heading="Patterns Grace noticed this week"
      subtitle="She's not just reporting numbers — she's spotting trends + proposing action. Approve to draft."
      @approved="onApproved"
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
