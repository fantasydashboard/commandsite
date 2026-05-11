<script setup lang="ts">
/**
 * Cornerstone — Giving (intentionally simple, role-gated).
 *
 * Aggregate trends + designated breakdown + the "stopped giving"
 * household flag. No individual snooping. The pastoral value is
 * spotting drift, not surveillance.
 */
import { computed, ref } from 'vue'
import {
  Chart, BarController, BarElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'
import {
  monthlyGiving,
  stoppedGivingHouseholds,
  designatedFunds,
  givingStats,
  STOP_REASON_LABEL,
} from '@/lib/clients/cornerstone/giving'
import { barDefaults, chartColors } from '@/lib/chartTheme'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

Chart.register(BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip)

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => givingStats())
const trend = computed(() => monthlyGiving())

// Monthly giving stacked bar — general / missions / building
const trendData = computed(() => ({
  labels: trend.value.map((m) => {
    const d = new Date(m.month + '-01T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short' })
  }),
  datasets: [
    { label: 'General fund',  data: trend.value.map((m) => m.general_cents / 100),       backgroundColor: chartColors.brand(),  stack: 'g' },
    { label: 'Missions',      data: trend.value.map((m) => m.missions_cents / 100),      backgroundColor: '#10B981',            stack: 'g' },
    { label: 'Building fund', data: trend.value.map((m) => m.building_fund_cents / 100), backgroundColor: '#A855F7',            stack: 'g' },
  ],
}))

const trendOpts = (() => {
  // deno-lint-ignore no-explicit-any
  const base: any = barDefaults({ legend: true, stacked: true })
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  base.plugins.tooltip = {
    ...base.plugins.tooltip,
    callbacks: {
      label: (ctx: { parsed: { y: number }; dataset: { label: string } }) =>
        ' ' + ctx.dataset.label + ': ' + fmt.format(ctx.parsed.y),
    },
  }
  base.scales.y.ticks = {
    ...base.scales.y.ticks,
    callback: (v: number | string) => typeof v === 'number' && v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`,
  }
  return base
})()

// Designated funds donut
const fundsDonutData = computed(() => ({
  labels: designatedFunds.map((f) => f.label),
  datasets: [{
    data: designatedFunds.map((f) => f.ytd_cents / 100),
    backgroundColor: ['#1E40AF', '#10B981', '#A855F7', '#F59E0B'],
    borderWidth: 3, borderColor: '#FFFFFF', hoverOffset: 8,
  }],
}))
// deno-lint-ignore no-explicit-any
const fundsDonutOpts: any = {
  responsive: true, maintainAspectRatio: false, cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)', titleColor: '#fff', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 6,
      callbacks: {
        label: (ctx: { parsed: number; label: string }) =>
          ' ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
            .format(ctx.parsed) + ' YTD',
      },
    },
  },
}

const totalYtd = computed(() => designatedFunds.reduce((s, f) => s + f.ytd_cents, 0))

// ── Per-giver metrics (the honest health numbers, not just the topline $) ──
const perGiverMetrics = computed(() => {
  const t = trend.value
  const cur = t[t.length - 1]
  const prior = t[t.length - 2]
  const cur_avg = cur.giving_households > 0 ? cur.total_cents / cur.giving_households : 0
  const prior_avg = prior.giving_households > 0 ? prior.total_cents / prior.giving_households : 0
  const avg_change = prior_avg > 0 ? (cur_avg - prior_avg) / prior_avg : 0
  const givers_delta = cur.giving_households - prior.giving_households
  return {
    cur_givers: cur.giving_households,
    prior_givers: prior.giving_households,
    givers_delta,
    pct_of_households: stats.value.total_households > 0 ? cur.giving_households / stats.value.total_households : 0,
    avg_per_household_cents: cur_avg,
    avg_change,
    recurring_pct: stats.value.recurring_pct,
    one_time_pct: 1 - stats.value.recurring_pct,
  }
})

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function pct(v: number, opts: { signed?: boolean } = {}): string {
  const value = (v * 100).toFixed(0)
  if (opts.signed) return (v >= 0 ? '+' : '') + value + '%'
  return value + '%'
}

function fmtDays(days: number): string {
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

const sortedStopped = computed(() =>
  [...stoppedGivingHouseholds].sort((a, b) => {
    const aPriority = (a.also_kids_flag ? 1 : 0) + (a.also_serving_flag ? 1 : 0)
    const bPriority = (b.also_kids_flag ? 1 : 0) + (b.also_serving_flag ? 1 : 0)
    if (aPriority !== bPriority) return bPriority - aPriority
    return b.days_silent - a.days_silent
  }),
)

// ── Approval queue: card-update reminders + thank-yous + reactivation ─
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'gv-hawthorne',
    icon: '💳',
    badge: 'Card update',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Card-update reminder — Hawthorne Family',
    recipient: 'Recurring gift card expired 22d ago · 3-yr giving streak',
    preview: '"The Hawthorne Family — your monthly gift didn\'t process this month because the card on file expired. Whenever you have a moment, here\'s the link to update it. Zero pressure, just wanted to flag it before another cycle slips. Thank you for your faithfulness. — Grace, for Cornerstone"',
    approved_response: 'Sent. I\'ll watch for the card update for 5 days. If they update, I\'ll quietly retry the gift. If not, I\'ll surface it again next Monday.',
    ticker_after_approval: 'Card-update reminder sent to the Hawthornes',
  },
  {
    id: 'gv-bigift-thanks',
    icon: '🙏',
    badge: 'Big-gift thanks',
    badgeClass: 'bg-success/15 text-success',
    title: 'Thank-you note — anonymous $5,000 Building Fund gift',
    recipient: 'Cleared yesterday · gift attached to a household but anonymized in display',
    preview: '"Friend — wanted to send a quiet thank-you for the gift toward the building fund this week. Generosity at that scale moves things forward in ways that ripple out for years. Pastor Mark and the elders are deeply grateful. We\'ll honor it well. — Pastor Mark"',
    approved_response: 'Sent — addressed by their preferred name from the household record (kept off display per privacy settings). They\'ve made one prior anonymous gift; matching tone with that one.',
    ticker_after_approval: 'Big-gift thank-you sent — $5k Building Fund contributor',
  },
  {
    id: 'gv-stopped-1',
    icon: '🏡',
    badge: 'Reactivation',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Reactivation outreach — multi-flag stopped giver',
    recipient: 'Gave consistently for 4 yrs · stopped 60d ago · also 1 People-page flag',
    preview: '"Hey — we noticed you haven\'t been giving recently and just wanted to check in. No pressure to share what\'s going on, and absolutely no agenda about getting you back into a giving rhythm. We just wanted you to know we noticed and we care. Pastor Mark is here whenever. — Grace"',
    approved_response: 'Sent. The frame is intentionally pastoral, not financial. If they reply about a hardship, I\'ll route directly to Pastor Mark and not touch giving.',
    ticker_after_approval: 'Reactivation outreach sent — long-time giver who paused',
  },
  {
    id: 'gv-bf-update',
    icon: '🏗️',
    badge: 'Stewardship comms',
    badgeClass: 'bg-success/15 text-success',
    title: 'Building Fund 60% milestone — contributor update',
    recipient: '38 contributing households YTD · 14 days ahead of pace',
    preview: '"Friends — quick update for you specifically since you\'ve been part of this. We just crossed 60% of the building fund goal. Your gifts got us here — every one of them. There\'s real momentum and we\'re feeling it. Thank you. (No ask in this note, just wanted to share the win.) — Pastor Mark"',
    approved_response: 'Drafting individualized version per household. The personal-name token + "you specifically" framing tests at 71% open vs 41% for generic. Will land in your queue at Sundays + Comms shortly.',
    ticker_after_approval: 'Building Fund update drafting for 38 contributors',
  },
]

const tickerSeed = [
  { icon: '💚', text: '$240 anonymous gift just cleared — General Fund', ageSec: 6 * 60 },
  { icon: '🏗️', text: 'Building Fund pace check: 14 days ahead of plan', ageSec: 28 * 60 },
  { icon: '⚠', text: 'Hawthorne card-on-file failure detected', ageSec: 2 * 3600 },
  { icon: '🔄', text: 'Recurring gift retry succeeded — Marsh family', ageSec: 6 * 3600 },
]

const tickerPool = [
  { icon: '💚', text: 'Recurring gift processed — General Fund' },
  { icon: '💳', text: 'Card-update link clicked — gift retried successfully' },
  { icon: '🏗️', text: 'Building Fund crossed 61% of goal' },
  { icon: '🙏', text: 'Big-gift thank-you delivered — opened in 4 min' },
  { icon: '📈', text: 'Monthly recurring giving up 3.2% MoM' },
  { icon: '⚠', text: 'Stopped-giving flag triggered — auto-drafted reactivation' },
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
    <!-- Privacy note — sets the tone -->
    <div class="rounded-card bg-warn/5 border border-warn/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <div class="text-sm text-ink">
        <span class="font-semibold">🔒 Restricted view:</span>
        Aggregate trends + drift flags only — no individual gift amounts. Visible to senior pastor + finance team only.
      </div>
    </div>

    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Giving signals — auto-updates from the merchant + your stack"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="4"
      heading="Stewardship queue"
      subtitle="Card-updates, big-gift thank-yous, reactivation — all drafted with restraint. Approve to send."
      @approved="onApproved"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Giving</h2>
        <p class="text-sm text-ink-muted">
          Stewardship at-a-glance — monthly trend, designated fund mix, and households that have stopped giving.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">This month</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.current_month_cents, { compact: true }) }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.mom_change >= 0 ? 'text-success' : 'text-warn'">
          {{ stats.mom_change >= 0 ? '↑' : '↓' }} {{ pct(stats.mom_change, { signed: true }) }} vs last month
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">YTD</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.ytd_cents, { compact: true }) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(stats.ytd_cents / stats.ytd_goal_cents) }} of {{ money(stats.ytd_goal_cents, { compact: true }) }} annual goal</div>
      </div>
      <div class="card">
        <div class="kpi-label">Giving households</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.giving_households }} <span class="text-base text-ink-muted">/ {{ stats.total_households }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(stats.recurring_pct) }} on recurring</div>
      </div>
      <div class="card">
        <div class="kpi-label">Stopped giving</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.stopped_priority > 0 ? 'text-warn' : 'text-ink'">{{ stats.stopped_count }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.stopped_priority > 0 ? 'text-danger font-semibold' : 'text-ink-disabled'">
          {{ stats.stopped_priority }} multi-flag (priority)
        </div>
      </div>
    </div>

    <!-- Per-giver health (honest health metrics, not just topline $) -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Per-giver health</span>
          <span class="text-xs text-ink-muted">— who's giving, how often, how much each</span>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div class="kpi-label">Active givers (this month)</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ perGiverMetrics.cur_givers }}</div>
          <div class="text-[11px] mt-0.5" :class="perGiverMetrics.givers_delta >= 0 ? 'text-success' : 'text-warn'">
            {{ perGiverMetrics.givers_delta >= 0 ? '↑' : '↓' }} {{ Math.abs(perGiverMetrics.givers_delta) }} vs last month
          </div>
        </div>
        <div>
          <div class="kpi-label">% of households giving</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ pct(perGiverMetrics.pct_of_households) }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">{{ perGiverMetrics.cur_givers }} of {{ stats.total_households }} households</div>
        </div>
        <div>
          <div class="kpi-label">Avg gift / giving household</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ money(perGiverMetrics.avg_per_household_cents) }}</div>
          <div class="text-[11px] mt-0.5" :class="perGiverMetrics.avg_change >= 0 ? 'text-success' : 'text-warn'">
            {{ perGiverMetrics.avg_change >= 0 ? '↑' : '↓' }} {{ pct(Math.abs(perGiverMetrics.avg_change)) }} vs last month
          </div>
        </div>
        <div>
          <div class="kpi-label">Recurring vs one-time</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ pct(perGiverMetrics.recurring_pct) }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">on recurring · {{ pct(perGiverMetrics.one_time_pct) }} one-time</div>
        </div>
      </div>
      <!-- Visual: recurring/one-time split bar -->
      <div>
        <div class="kpi-label mb-1.5">Giving mix this month</div>
        <div class="h-3 w-full rounded-full overflow-hidden bg-canvas flex">
          <div class="h-full bg-brand" :style="{ width: (perGiverMetrics.recurring_pct * 100) + '%' }" :title="`${pct(perGiverMetrics.recurring_pct)} recurring`"></div>
          <div class="h-full bg-accent" :style="{ width: (perGiverMetrics.one_time_pct * 100) + '%' }" :title="`${pct(perGiverMetrics.one_time_pct)} one-time`"></div>
        </div>
        <div class="flex justify-between text-[10px] text-ink-disabled mt-1">
          <span>🔁 Recurring (predictable)</span>
          <span>One-time (variable)</span>
        </div>
      </div>
    </section>

    <!-- Monthly giving trend -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Monthly Giving</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 12 months</span>
        </div>
        <div class="text-[11px] text-ink-disabled">
          December spike from Christmas Eve giving · summer months typically softer
        </div>
      </div>
      <div class="h-72">
        <Bar :data="trendData" :options="trendOpts" />
      </div>
    </section>

    <!-- Designated funds + Stopped giving -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Designated funds donut + progress -->
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Designated Funds</span>
          <span class="text-xs text-ink-muted">YTD vs annual goal</span>
        </div>
        <div class="grid grid-cols-1 gap-4">
          <div class="relative flex items-center justify-center min-h-[200px]">
            <div class="relative w-full max-w-[220px] aspect-square">
              <Doughnut :data="fundsDonutData" :options="fundsDonutOpts" />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div class="text-xl font-bold text-ink leading-none tracking-tight">{{ money(totalYtd, { compact: true }) }}</div>
                <div class="mt-1 kpi-label">Total YTD</div>
              </div>
            </div>
          </div>

          <ul class="space-y-2.5">
            <li
              v-for="(f, i) in designatedFunds"
              :key="f.key"
            >
              <div class="flex items-baseline justify-between gap-2 mb-1">
                <span class="flex items-center gap-2 text-xs">
                  <span class="h-2.5 w-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: ['#1E40AF', '#10B981', '#A855F7', '#F59E0B'][i] }"></span>
                  <span class="text-ink font-medium">{{ f.label }}</span>
                </span>
                <span class="text-[11px] text-ink-muted tabular-nums">
                  {{ money(f.ytd_cents, { compact: true }) }}
                  <span class="text-ink-disabled">/ {{ money(f.goal_cents, { compact: true }) }}</span>
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{
                    width: Math.min((f.ytd_cents / f.goal_cents) * 100, 100) + '%',
                    backgroundColor: ['#1E40AF', '#10B981', '#A855F7', '#F59E0B'][i],
                  }"
                ></div>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- Stopped giving households -->
      <section class="card lg:col-span-7">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Stopped Giving</span>
          <span
            class="chip !py-0.5 !px-2 !text-[10px]"
            :class="stats.stopped_priority > 0 ? '!bg-danger/15 !text-danger' : '!bg-surface-elevated'"
          >{{ stats.stopped_count }} households</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="h in sortedStopped"
            :key="h.household_id"
            class="rounded-md border p-3"
            :class="(h.also_kids_flag || h.also_serving_flag)
              ? 'border-danger/30 bg-danger/5'
              : 'border-divider bg-surface'"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold text-ink">{{ h.household_name }}</span>
                  <span
                    v-if="h.also_kids_flag || h.also_serving_flag"
                    class="rounded-full bg-danger text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  >Multi-flag — priority</span>
                  <span
                    v-if="h.also_kids_flag"
                    class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  >+ kids drift</span>
                  <span
                    v-if="h.also_serving_flag"
                    class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  >+ stopped serving</span>
                </div>
                <div class="text-[11px] text-ink-muted mt-0.5">
                  Last gift {{ fmtDays(h.days_silent) }} ago · prior typical {{ money(h.prior_year_avg_monthly_cents) }}/mo
                </div>
                <div class="text-[11px] mt-1" :class="h.reason === 'card_expired_no_update' ? 'text-warn' : 'text-ink-muted'">
                  📝 {{ STOP_REASON_LABEL[h.reason] }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                <button
                  v-if="h.reason === 'card_expired_no_update'"
                  type="button"
                  class="rounded-md bg-brand text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 whitespace-nowrap"
                >Send card-update reminder</button>
                <button
                  v-else
                  type="button"
                  class="rounded-md bg-brand/10 text-brand px-2.5 py-1 text-[11px] font-semibold hover:bg-brand/20 whitespace-nowrap"
                >View household</button>
                <span class="text-[10px] text-ink-disabled italic">Add to Care queue?</span>
              </div>
            </div>
          </article>
        </div>
        <div class="mt-3 text-[11px] text-ink-disabled italic">
          Stopped-giving alone isn\'t a problem — life happens, cards expire. The signal is when it lines up with kids drift or stopped serving. Those rows are highlighted.
        </div>
      </section>
    </div>
  </div>
</template>
