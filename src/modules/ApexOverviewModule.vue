<script setup lang="ts">
/**
 * Apex Heating & Air — Overview module.
 *
 * Mirrors the visual language of the UFD Admin Metrics + Revenue
 * modules (donut + breakdown + sub-stats + trend chart + recent feed)
 * but reads from /lib/clients/apex/ dummy data. Same Kpi component,
 * same chartTheme, same card/typography stack — feels like a sibling
 * to the UFD modules rather than a separate app.
 *
 * Phase 1 scope: this Overview only. Calls / Quotes / Reviews etc. are
 * separate modules built in subsequent phases.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  Filler,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import type { Client } from '@/types/database'
import { adaRoles, ROLE_STATUS_META } from '@/lib/clients/apex/roles'
import adaMark from '@/assets/ada-mark.png'

import { calls, callStats } from '@/lib/clients/apex/calls'
import { quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import { recentActivity } from '@/lib/clients/apex/recentActivity'
import { revenueRecovered } from '@/lib/clients/apex/revenueRecovered'

import { brandAreaDataset, lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler,
)

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── Ada persona + chat ─────────────────────────────────────────────────
const router = useRouter()
function goToRole(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'apex-heating-and-air', tab } })
}

const adaGreeting = computed(() => {
  const hr = new Date().getHours()
  const name = 'Brett'
  if (hr < 12) return `Good morning, ${name}`
  if (hr < 17) return `Good afternoon, ${name}`
  return `Good evening, ${name}`
})

interface ChatMessage { role: 'user' | 'ada'; text: string }
interface SuggestedQuestion { q: string; a: string }
const suggestedQuestions: SuggestedQuestion[] = [
  { q: 'What did you handle while I was on the truck?',
    a: "Today so far: caught 12 calls, booked 4 service appts (incl. one no-cooling emergency I escalated to Marcus), sent 3 quote follow-ups (one already replied — Rodriguez wants to schedule), and texted yesterday's customers for reviews (got 2 five-stars back already). Two things flagged for your eyes — see Front Desk & Quotes." },
  { q: "How's revenue this week vs last?",
    a: "$48,920 booked this week vs $43,210 last week — up 13%. Service calls drove most of the lift (storms last week + I caught 8 weekend calls that would've gone to voicemail). Quote close rate is 87% on the ones I followed up. Full breakdown's on Insights." },
  { q: 'Which customers should I be worried about?',
    a: "Three to flag: The Hendersons (recurring AC tune-up overdue 6 weeks, normally schedule Mar — sent a reminder, no response), Coronado Property Mgmt (3 service calls in 60 days, last tech notes mentioned 'system at end of life' — possible replace job), and Mike Patel (paid late twice, last invoice 31 days out). Details on Customer Care." },
  { q: 'Which quotes are stale?',
    a: "Six quotes past 7 days with no movement. The big one: Riverpoint Condos — $14,800 commercial RTU replace, sent 11 days ago, opened twice. I drafted a soft check-in for your review. Five smaller residential quotes ($800-$2,400 range) are at day 5-7, scheduled to send Day-7 nudges automatically tomorrow morning. See Front Desk & Quotes." },
  { q: 'What did the reviews say last week?',
    a: "11 new reviews — avg 4.8 stars. Standout: Maria Chen (5★) called out Tony by name for explaining her thermostat options without pressure. One 3-star from Jim Castellanos (technician was late + didn't call) — I drafted an apology reply for your review before it goes live. See Reputation & Marketing." },
  { q: "Who hasn't called us in over a year?",
    a: "47 dormant customers (last service > 365 days). I've already contacted 24 with personalized re-engagement messages this month — 5 booked jobs back ($6,840 in recovered revenue). 23 still on the do list. Want me to send the next batch this week or hold off? See Customer Care." },
]

const chatMessages = ref<ChatMessage[]>([
  { role: 'ada', text: "Hi Brett — I'm Ada. Ask me anything about the shop. Try one of the questions below." },
])
const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)

async function askSuggested(q: SuggestedQuestion) {
  chatMessages.value.push({ role: 'user', text: q.q })
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({ role: 'ada', text: q.a })
    nextTick(scrollChatToBottom)
  }, 600)
}

async function askCustom() {
  const text = customQuestion.value.trim()
  if (!text) return
  chatMessages.value.push({ role: 'user', text })
  customQuestion.value = ''
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({
      role: 'ada',
      text: "Let me check on that. Give me a moment to pull what I have for the shop — I'll draft something for your review and queue it on the right page based on what fits.",
    })
    nextTick(scrollChatToBottom)
  }, 700)
}

function scrollChatToBottom() {
  if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
}

const adaSummaryLine = computed(() =>
  `I've handled 84 calls, 18 quote follow-ups, and 24 reactivations this week — a few things flagged for your eyes.`,
)

// ── Data ────────────────────────────────────────────────────────────────
const stats = computed(() => callStats())
const followups = computed(() => quoteFollowupCounts())
const revenue = computed(() => revenueRecovered())
const activity = computed(() => recentActivity)

// Suppress unused-import warning while we keep `calls` available for
// future Phase 2 modules importing from this file's data layer.
void calls

// ── Donut: Calls Handled breakdown ─────────────────────────────────────
// Brand + accent come from CSS vars so per-client theme cascades; the
// other two stay fixed because they carry semantic meaning (after-hours
// = soft cool, emergency = red regardless of client palette).
const DONUT_SEGMENTS = computed(() => [
  { key: 'ai_handled' as const,           label: 'AI-Handled',           color: chartColors.brand()  },
  { key: 'booked' as const,               label: 'Booked Jobs',          color: chartColors.accent() },
  { key: 'after_hours' as const,          label: 'After-Hours',          color: '#A0D8F8'            },
  { key: 'emergency_dispatched' as const, label: 'Emergency Dispatched', color: '#EF4444'            },
])

const donutData = computed(() => ({
  labels: DONUT_SEGMENTS.value.map((s) => s.label),
  datasets: [
    {
      data: DONUT_SEGMENTS.value.map((s) => stats.value[s.key]),
      backgroundColor: DONUT_SEGMENTS.value.map((s) => s.color),
      borderWidth: 3,
      borderColor: '#FFFFFF',
      hoverOffset: 8,
    },
  ],
}))

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
        label: (ctx: { parsed: number; label: string }) => ` ${ctx.parsed} ${ctx.label.toLowerCase()}`,
      },
    },
  },
}

// ── Calls captured trend (line) ────────────────────────────────────────
const callsLineData = computed(() => ({
  labels: stats.value.daily.map((d) => d.date.slice(5)),
  datasets: [brandAreaDataset('Calls', stats.value.daily.map((d) => d.calls))],
}))
const callsLineOpts = lineDefaults()

// ── Quote follow-ups by sequence step (bar) ────────────────────────────
const followupBarData = computed(() => ({
  labels: followups.value.map((d) => d.day),
  datasets: [
    {
      label: 'Sent',
      data: followups.value.map((d) => d.sent),
      backgroundColor: chartColors.brand(),
    },
  ],
}))
const followupBarOpts = barDefaults()

// ── Revenue recovered chart ────────────────────────────────────────────
const revenueLineData = computed(() => ({
  labels: revenue.value.daily.map((d) => d.date.slice(5)),
  datasets: [
    brandAreaDataset(
      'Recovered',
      revenue.value.daily.map((d) => d.cents / 100),
      { color: chartColors.accent() },
    ),
  ],
}))
const revenueLineOpts = (() => {
  // deno-lint-ignore no-explicit-any
  const base: any = lineDefaults()
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  base.plugins.tooltip = {
    ...base.plugins.tooltip,
    callbacks: { label: (ctx: { parsed: { y: number } }) => ' ' + fmt.format(ctx.parsed.y) },
  }
  base.scales.y.ticks = {
    ...base.scales.y.ticks,
    callback: (v: number | string) =>
      typeof v === 'number' && v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`,
  }
  return base
})()

// ── Helpers ────────────────────────────────────────────────────────────
function money(cents: number, opts: { decimals?: number } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function activityIcon(kind: string): string {
  if (kind === 'call') return '📞'
  if (kind === 'quote') return '💬'
  if (kind === 'review') return '⭐'
  if (kind === 'reactivation') return '🔁'
  if (kind === 'dispatch') return '🚐'
  return '·'
}

// ── Today pulse strip ───────────────────────────────────────────────────
// Live snapshot of just-today numbers. Designed to be the first thing
// the owner reads in the morning — "what's already happened today?"
const today = {
  calls: 11,
  booked: 3,
  revenue_cents: 124_700,
  on_call_tech: 'Marcus Reyes',
  on_call_status: 'available',
} as const

// ── This Week digest ────────────────────────────────────────────────────
// Last 7 days of automation outcomes — the "what did CommandSite do
// for me this week" answer in 5 lines.
const thisWeek = [
  { metric: '89 calls answered', detail: '12 after-hours · 4 weekend' },
  { metric: '27 jobs booked', detail: '$14,200 estimated revenue' },
  { metric: '43 quote follow-ups sent', detail: '11 replies · 6 booked' },
  { metric: '9 review requests', detail: '7 received · 4.9★ average' },
  { metric: '3 dormant customers reactivated', detail: '$820 revenue from won-back' },
] as const

</script>

<template>
  <div class="space-y-4">
    <!-- Demo mode banner -->
    <div class="rounded-card bg-accent/10 border border-accent/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <div class="text-sm text-ink">
        <span class="font-semibold">Demo mode:</span>
        Sample data for Apex Heating & Air — illustrating what CommandSite looks like for a home-services business.
      </div>
      <a href="#" class="text-xs text-brand font-semibold hover:underline">Book a real walkthrough →</a>
    </div>

    <!-- ── Ada persona panel + chat ───────────────────────────────── -->
    <section class="card overflow-hidden p-0">
      <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-ink-inverse px-5 py-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
          <img :src="adaMark" alt="Ada" class="h-full w-full object-contain" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-base font-semibold">Ada</span>
            <span class="rounded-full bg-success/30 text-ink-inverse px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full" style="background-color:#86efac"></span>
              Online
            </span>
            <span class="text-[11px] opacity-80 hidden sm:inline">your AI employee · named for Ada Lovelace</span>
          </div>
          <p class="text-sm opacity-90 mt-0.5">{{ adaGreeting }}. {{ adaSummaryLine }}</p>
        </div>
      </div>

      <div class="flex flex-col">
        <div ref="chatScrollEl" class="max-h-[280px] overflow-y-auto px-5 py-4 space-y-3 bg-canvas/40">
          <div
            v-for="(m, i) in chatMessages"
            :key="i"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed"
              :class="m.role === 'user'
                ? 'bg-ink text-ink-inverse rounded-br-sm'
                : 'bg-surface-raised text-ink border border-divider rounded-bl-sm'"
            >
              {{ m.text }}
            </div>
          </div>
        </div>

        <div class="border-t border-divider bg-surface-raised px-5 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Try asking</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(q, i) in suggestedQuestions"
              :key="i"
              type="button"
              class="rounded-full border border-divider bg-surface px-3 py-1 text-[11px] font-medium text-ink-muted hover:text-ink hover:border-brand hover:bg-brand/5 transition-colors"
              @click="askSuggested(q)"
            >{{ q.q }}</button>
          </div>
        </div>

        <form
          class="flex items-center gap-2 border-t border-divider bg-surface-raised px-5 py-3"
          @submit.prevent="askCustom"
        >
          <input
            v-model="customQuestion"
            type="text"
            placeholder="Ask Ada anything..."
            class="flex-1 rounded-full border border-divider bg-canvas px-4 py-2 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            class="rounded-full bg-brand text-ink-inverse px-4 py-2 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
            :disabled="!customQuestion.trim()"
          >Send</button>
        </form>
      </div>
    </section>

    <!-- ── Ada's Roles status grid ────────────────────────────────── -->
    <section class="card">
      <div class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Ada's roles</span>
          <span class="text-xs text-ink-muted">— what she handles for Apex</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ adaRoles.filter((r) => r.status === 'active').length }} of {{ adaRoles.length }} active · click any to drill in</span>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          v-for="role in adaRoles"
          :key="role.key"
          type="button"
          class="flex flex-col items-start gap-2 rounded-card border border-divider bg-surface-raised p-3 text-left hover:border-brand hover:shadow-card transition-all"
          @click="goToRole(role.tab)"
        >
          <div class="flex items-center gap-2 w-full">
            <span class="text-2xl flex-shrink-0">{{ role.icon }}</span>
            <span
              class="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              :class="ROLE_STATUS_META[role.status].pillClass"
            >{{ ROLE_STATUS_META[role.status].label }}</span>
          </div>
          <div class="text-sm font-semibold text-ink leading-snug">{{ role.name }}</div>
          <div class="text-[11px] text-ink-muted leading-snug">{{ role.description }}</div>
          <div class="mt-auto pt-2 border-t border-divider/60 text-[10px] text-ink-disabled font-medium w-full">
            {{ role.this_week_snippet }}
          </div>
        </button>
      </div>
    </section>

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Apex Heating & Air · Dashboard</h2>
        <p class="text-sm text-ink-muted">
          What CommandSite is doing for the business — captured calls, quote follow-ups, reviews, reactivation, recovered revenue.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in ['Today', '7 Days', '15 Days', '30 Days', '90 Days', '1 Year', 'All Time']"
          :key="w"
          type="button"
          :class="['chip', w === '30 Days' ? 'chip-active' : '']"
        >
          {{ w }}
        </button>
      </div>
    </div>

    <!-- Today pulse strip — what's already happened today -->
    <div class="rounded-card bg-brand text-ink-inverse px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold opacity-90">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        Today
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ today.calls }}</span>
        <span class="text-xs opacity-80">calls</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ today.booked }}</span>
        <span class="text-xs opacity-80">booked</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ money(today.revenue_cents) }}</span>
        <span class="text-xs opacity-80">captured</span>
      </div>
      <div class="ml-auto flex items-center gap-2 text-xs">
        <span class="opacity-80">On-call:</span>
        <span class="font-semibold">{{ today.on_call_tech }}</span>
        <span class="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
          {{ today.on_call_status }}
        </span>
      </div>
    </div>

    <!-- Calls Handled — donut + breakdown -->
    <section class="card">
      <div class="mb-4 flex items-center gap-2">
        <span class="eyebrow">Key Metrics</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        <span class="text-xs text-ink-muted ml-1">Click a segment to drill in</span>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Donut + center label -->
        <div class="lg:col-span-5 relative flex items-center justify-center min-h-[260px]">
          <div class="relative w-full max-w-[280px] aspect-square">
            <Doughnut :data="donutData" :options="donutOptions" />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-[44px] font-bold text-ink leading-none tracking-tight">
                {{ stats.total }}
              </div>
              <div class="mt-1.5 kpi-label">Calls Handled</div>
              <div class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
                ↑ +89 new
              </div>
            </div>
          </div>
        </div>

        <!-- Breakdown legend -->
        <div class="lg:col-span-7 space-y-1.5">
          <div
            v-for="row in DONUT_SEGMENTS"
            :key="row.key"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5"
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
                {{ stats[row.key] }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trends row: Calls captured + Quote follow-ups -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ink">Calls Captured</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        </div>
        <div class="h-56">
          <Line :data="callsLineData" :options="callsLineOpts" />
        </div>
      </section>

      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-ink">Quote Follow-Ups Sent</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">30 Days</span>
        </div>
        <div class="h-56">
          <Bar :data="followupBarData" :options="followupBarOpts" />
        </div>
      </section>
    </div>

    <!-- Revenue Recovered + Recent Activity -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Revenue card mirrors UFD Revenue's structure -->
      <section class="card lg:col-span-5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Revenue Recovered</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">This Month</span>
        </div>

        <div class="space-y-4">
          <div class="text-center py-2">
            <div class="text-[44px] font-bold text-brand leading-none tracking-tight">
              {{ money(revenue.this_month_cents) }}
            </div>
            <div class="mt-1.5 kpi-label">Recovered this month</div>
            <div class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
              ↑ from after-hours, follow-up, and reactivation
            </div>
          </div>

          <div class="h-32">
            <Line :data="revenueLineData" :options="revenueLineOpts" />
          </div>

          <div class="grid grid-cols-2 gap-3 border-t border-divider pt-3">
            <div>
              <div class="kpi-label">Avg Ticket</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(revenue.avg_ticket_cents) }}
              </div>
            </div>
            <div>
              <div class="kpi-label">Projected Annual</div>
              <div class="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {{ money(revenue.projected_annual_cents) }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Recent Activity feed -->
      <section class="card lg:col-span-7">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Recent Activity</span>
          <span class="text-xs text-ink-muted ml-1">Live across last 24h</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="ev in activity"
            :key="ev.id"
            class="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors"
          >
            <div class="text-base flex-shrink-0 leading-tight pt-0.5">{{ activityIcon(ev.kind) }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-ink leading-snug">{{ ev.text }}</div>
              <div class="text-[11px] text-ink-disabled mt-0.5">{{ fmtAgo(ev.at) }}</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- This Week digest — renamed from "What CommandSite did" to match Ada framing -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What Ada Did This Week</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">Last 7 Days</span>
      </div>
      <ul class="divide-y divide-divider">
        <li
          v-for="row in thisWeek"
          :key="row.metric"
          class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div class="text-sm font-semibold text-ink">{{ row.metric }}</div>
          <div class="text-xs text-ink-muted text-right">{{ row.detail }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>
