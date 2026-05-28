<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Insights tab.
 *
 * Performance Reporting role. Post-impeccable-critique full rewrite:
 *   - All 4 KPIs now show trend deltas
 *   - YoY overlay on revenue chart (current year solid, prior year ghost)
 *   - Ada's read section: 3 contextual observations with implied actions
 *   - Close rate trend (blended) + close rate by source breakdown
 *   - Avg ticket trend
 *   - Project type mix
 *   - Specific narrative copy (not "spring has been strong" — actual numbers)
 *
 * The job of this page: answer "is my business getting healthier or
 * sicker?" Trends + comparisons + actionable interpretation.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { fmtMoney } from '@/lib/clients/heritage/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── Revenue trend with YoY ────────────────────────────────────────────
interface MonthData {
  month: string
  current: number  // cents
  prior: number    // cents
}

const revenueTrend: MonthData[] = [
  { month: 'Dec', current: 18400000, prior: 15800000 },
  { month: 'Jan', current: 22100000, prior: 19200000 },
  { month: 'Feb', current: 19800000, prior: 17600000 },
  { month: 'Mar', current: 24600000, prior: 21100000 },
  { month: 'Apr', current: 31200000, prior: 26400000 },
  { month: 'May', current: 36400000, prior: 29800000 },
]

const maxRev = computed(() =>
  Math.max(...revenueTrend.flatMap((m) => [m.current, m.prior])),
)

const yoyGrowthPct = computed(() => {
  const currentTotal = revenueTrend.reduce((sum, m) => sum + m.current, 0)
  const priorTotal = revenueTrend.reduce((sum, m) => sum + m.prior, 0)
  return Math.round(((currentTotal - priorTotal) / priorTotal) * 100)
})

// ── Close rate trend (blended) ────────────────────────────────────────
const closeRateTrend = [
  { month: 'Dec', rate: 27 },
  { month: 'Jan', rate: 28 },
  { month: 'Feb', rate: 29 },
  { month: 'Mar', rate: 30 },
  { month: 'Apr', rate: 32 },
  { month: 'May', rate: 33 },
]

// SVG path for the close rate line chart
const closeRateLinePath = computed(() => {
  const w = 600
  const h = 80
  const padX = 20
  const padY = 10
  const innerW = w - padX * 2
  const innerH = h - padY * 2
  const minRate = Math.min(...closeRateTrend.map((p) => p.rate))
  const maxRate = Math.max(...closeRateTrend.map((p) => p.rate))
  const range = Math.max(1, maxRate - minRate)
  return closeRateTrend
    .map((p, i) => {
      const x = padX + (i / (closeRateTrend.length - 1)) * innerW
      const y = padY + ((maxRate - p.rate) / range) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
})

// ── Close rate by source (current) ────────────────────────────────────
const closeRateBySource = [
  { label: 'Customer Referrals', rate: 63, tone: 'success' },
  { label: 'Direct / Word of Mouth', rate: 40, tone: 'success' },
  { label: 'Houzz Pro', rate: 33, tone: 'brand' },
  { label: 'Instagram', rate: 33, tone: 'brand' },
  { label: 'Google Reviews', rate: 27, tone: 'brand' },
  { label: 'NextDoor', rate: 25, tone: 'muted' },
  { label: 'Google LSA', rate: 21, tone: 'warn' },
]

// ── Avg ticket trend ──────────────────────────────────────────────────
const avgTicketTrend: MonthData[] = [
  { month: 'Dec', current: 2200000, prior: 0 },
  { month: 'Jan', current: 2400000, prior: 0 },
  { month: 'Feb', current: 2300000, prior: 0 },
  { month: 'Mar', current: 2600000, prior: 0 },
  { month: 'Apr', current: 2800000, prior: 0 },
  { month: 'May', current: 2800000, prior: 0 },
]
const maxAvgTicket = Math.max(...avgTicketTrend.map((m) => m.current))

// ── Project type mix (this year) ──────────────────────────────────────
const projectMix = [
  { type: 'Bath remodels', count: 14, revenue: 28400000, color: 'brand' },
  { type: 'Kitchen renovations', count: 12, revenue: 52600000, color: 'success' },
  { type: 'Powder / half-baths', count: 9, revenue: 9800000, color: 'warn' },
  { type: 'Specialty (wet rooms, etc.)', count: 5, revenue: 8200000, color: 'accent' },
]
const totalProjects = projectMix.reduce((s, p) => s + p.count, 0)
const totalProjectRevenue = projectMix.reduce((s, p) => s + p.revenue, 0)

function fmtPct(value: number): string {
  return `${value}%`
}

function toneTextClass(tone: string): string {
  if (tone === 'success') return 'text-success'
  if (tone === 'warn') return 'text-warn'
  if (tone === 'danger') return 'text-danger'
  if (tone === 'brand') return 'text-brand'
  if (tone === 'accent') return 'text-accent'
  return 'text-ink-muted'
}

function toneBgClass(tone: string): string {
  if (tone === 'success') return 'bg-success'
  if (tone === 'warn') return 'bg-warn'
  if (tone === 'danger') return 'bg-danger'
  if (tone === 'brand') return 'bg-brand'
  if (tone === 'accent') return 'bg-accent'
  return 'bg-ink-muted'
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Performance Reporting
      </div>
      <h2 class="text-xl font-semibold text-ink">Insights</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Trends Ada watches so you don't have to. The question this page answers: is your business getting healthier or sicker?
      </p>
    </header>

    <!-- KPI strip — every card now has a trend -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Revenue · this month</div>
        <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">$587K</div>
        <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> 17% vs last month · <span aria-hidden="true">↗</span> 22% YoY</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Close rate</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">33%</div>
        <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> 5 pts vs last quarter</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Avg ticket</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">$28K</div>
        <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> $6K vs Q1</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Total leads · 30d</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">51</div>
        <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> 8 vs prior 30d</div>
      </div>
    </div>

    <!-- Ada's read — 3 insights with implied actions -->
    <section class="card bg-brand/[0.04] border-brand/30">
      <header class="mb-3">
        <div class="flex items-baseline gap-2">
          <span class="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
            Ada's read
          </span>
          <span class="text-xs text-ink-muted">3 trends worth knowing about your business right now</span>
        </div>
      </header>

      <div class="space-y-3">
        <article class="rounded-card border border-divider bg-surface-raised p-3">
          <div class="flex items-baseline gap-2 mb-1">
            <strong class="text-sm text-ink">This is real growth, not just seasonal</strong>
            <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success">Year over year</span>
          </div>
          <p class="text-[12.5px] text-ink-muted leading-snug">
            May 2026 revenue beats May 2025 by <strong class="text-success">22%</strong>. Spring is always your strongest period — but the YoY gap is what tells you this growth is genuine, not seasonal pattern.
            <span class="block mt-1 italic">Implication: confidently plan for sustained higher capacity through Q3. The growth isn't a fluke.</span>
          </p>
        </article>

        <article class="rounded-card border border-divider bg-surface-raised p-3">
          <div class="flex items-baseline gap-2 mb-1">
            <strong class="text-sm text-ink">Your sales process is getting better</strong>
            <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-brand/15 text-brand">Conversion lift</span>
          </div>
          <p class="text-[12.5px] text-ink-muted leading-snug">
            Close rate climbed from <strong class="text-ink">27%</strong> in December to <strong class="text-success">33%</strong> in May. Quote Chaser's day-7/14 cadence is doing the work — referrals close at 63%, even LSA leads close better than they used to.
            <span class="block mt-1 italic">Implication: more quote volume is now worth pursuing. Your conversion rate can handle it.</span>
          </p>
        </article>

        <article class="rounded-card border border-divider bg-surface-raised p-3">
          <div class="flex items-baseline gap-2 mb-1">
            <strong class="text-sm text-ink">You're winning bigger projects</strong>
            <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success">Ticket size up</span>
          </div>
          <p class="text-[12.5px] text-ink-muted leading-snug">
            Avg ticket is up <strong class="text-success">$6K</strong> vs Q1 ($22K → $28K). Kitchen renovations are 30% of your project count but driving <strong class="text-ink">53%</strong> of revenue.
            <span class="block mt-1 italic">Implication: doubling down on kitchen-specific marketing (Email + Houzz portfolio + Instagram reels) would compound this trend.</span>
          </p>
        </article>
      </div>
    </section>

    <!-- Revenue trend with YoY overlay -->
    <section class="card">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold text-ink">Revenue trend · last 6 months</h3>
          <p class="text-xs text-ink-muted">
            May 2026 ({{ fmtMoney(revenueTrend[revenueTrend.length - 1].current) }}) beats May 2025 ({{ fmtMoney(revenueTrend[revenueTrend.length - 1].prior) }}) by 22%. Kitchen renovations are driving the gap.
          </p>
        </div>
        <div class="flex items-center gap-3 text-[11px]">
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-brand"></span>
            <span class="text-ink">2026</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-brand/25"></span>
            <span class="text-ink-muted">2025</span>
          </span>
        </div>
      </header>

      <div class="grid grid-cols-6 gap-3 mt-4">
        <div v-for="(m, i) in revenueTrend" :key="m.month" class="flex flex-col items-center gap-2">
          <!-- Stacked bar: prior year as ghost (background), current year as solid (foreground) -->
          <div class="relative w-full" style="height: 160px;">
            <!-- Prior year (light, behind) -->
            <div
              class="absolute inset-x-0 bottom-0 bg-brand/20 rounded-t bar-reveal-y"
              :style="{ height: `${(m.prior / maxRev) * 100}%`, '--bar-i': i }"
            ></div>
            <!-- Current year (solid, in front, slightly narrower) -->
            <div
              class="absolute inset-x-1.5 bottom-0 bg-brand rounded-t bar-reveal-y"
              :style="{ height: `${(m.current / maxRev) * 100}%`, '--bar-i': i + 0.5 }"
            ></div>
          </div>
          <div class="text-[11px] text-ink-muted">{{ m.month }}</div>
          <div class="text-[11px] font-semibold text-ink tabular-nums">{{ fmtMoney(m.current) }}</div>
          <div class="text-[10px] text-ink-disabled tabular-nums">
            +{{ Math.round(((m.current - m.prior) / m.prior) * 100) }}% YoY
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-divider text-[12px] text-ink-muted">
        Total trailing 6 months: <strong class="text-ink tabular-nums">{{ fmtMoney(revenueTrend.reduce((s, m) => s + m.current, 0)) }}</strong>
        · same period last year: <strong class="text-ink-muted tabular-nums">{{ fmtMoney(revenueTrend.reduce((s, m) => s + m.prior, 0)) }}</strong>
        · YoY growth: <strong class="text-success tabular-nums">+{{ yoyGrowthPct }}%</strong>
      </div>
    </section>

    <!-- Close rate: trend + source breakdown -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Close rate · trend + by source</h3>
        <p class="text-xs text-ink-muted">
          Blended close rate climbed 6 points in 6 months. Source variance is huge — referrals close at 3× the rate of LSA.
        </p>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Trend line -->
        <div>
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Blended trend · last 6 months</h4>
          <svg viewBox="0 0 600 100" class="w-full" preserveAspectRatio="none" style="height: 100px;">
            <!-- Gridlines -->
            <line x1="20" y1="20" x2="580" y2="20" stroke="currentColor" class="text-divider" stroke-width="1" stroke-dasharray="2,3" />
            <line x1="20" y1="50" x2="580" y2="50" stroke="currentColor" class="text-divider" stroke-width="1" stroke-dasharray="2,3" />
            <line x1="20" y1="80" x2="580" y2="80" stroke="currentColor" class="text-divider" stroke-width="1" stroke-dasharray="2,3" />
            <!-- Line -->
            <path :d="closeRateLinePath" fill="none" stroke="currentColor" class="text-brand" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <!-- Dots -->
            <circle
              v-for="(p, i) in closeRateTrend"
              :key="p.month"
              :cx="20 + (i / (closeRateTrend.length - 1)) * 560"
              :cy="10 + ((Math.max(...closeRateTrend.map((q) => q.rate)) - p.rate) / Math.max(1, Math.max(...closeRateTrend.map((q) => q.rate)) - Math.min(...closeRateTrend.map((q) => q.rate)))) * 80"
              r="3.5"
              class="fill-brand"
            />
          </svg>
          <div class="grid grid-cols-6 gap-0 mt-2 text-center">
            <div v-for="p in closeRateTrend" :key="p.month" class="text-[10px] text-ink-muted">
              {{ p.month }}<br/>
              <span class="text-ink font-semibold tabular-nums">{{ p.rate }}%</span>
            </div>
          </div>
        </div>

        <!-- By source -->
        <div>
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">By source · current 30d</h4>
          <ul class="space-y-2">
            <li v-for="(s, i) in closeRateBySource" :key="s.label" class="text-[12px]">
              <div class="flex items-baseline justify-between mb-0.5">
                <span class="text-ink">{{ s.label }}</span>
                <span :class="toneTextClass(s.tone)" class="font-bold tabular-nums">{{ fmtPct(s.rate) }}</span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-divider/40 overflow-hidden">
                <div
                  class="h-full rounded-full bar-reveal-x"
                  :class="toneBgClass(s.tone)"
                  :style="{ width: `${s.rate}%`, '--bar-i': i }"
                ></div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Avg ticket trend + Project mix (side-by-side) -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <header class="mb-3">
          <h3 class="text-base font-semibold text-ink">Avg ticket · last 6 months</h3>
          <p class="text-xs text-ink-muted">$22K (Dec) → $28K (May). Kitchen renos pulling the avg up.</p>
        </header>
        <div class="grid grid-cols-6 gap-2 mt-2">
          <div v-for="(m, i) in avgTicketTrend" :key="m.month" class="flex flex-col items-center gap-1.5">
            <div class="w-full bg-brand/10 rounded-t flex items-end overflow-hidden" style="height: 90px;">
              <div
                class="w-full bg-brand bar-reveal-y"
                :style="{ height: `${(m.current / maxAvgTicket) * 100}%`, '--bar-i': i }"
              ></div>
            </div>
            <div class="text-[10px] text-ink-muted">{{ m.month }}</div>
            <div class="text-[10px] font-semibold text-ink tabular-nums">{{ fmtMoney(m.current) }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <header class="mb-3">
          <h3 class="text-base font-semibold text-ink">Project mix · year to date</h3>
          <p class="text-xs text-ink-muted">
            {{ totalProjects }} projects · {{ fmtMoney(totalProjectRevenue) }} total revenue. Kitchens are 30% of projects, 53% of revenue.
          </p>
        </header>
        <ul class="space-y-2.5 mt-2">
          <li v-for="(p, i) in projectMix" :key="p.type" class="text-[12px]">
            <div class="flex items-baseline justify-between mb-1 gap-2">
              <span class="text-ink font-semibold">{{ p.type }}</span>
              <span class="text-ink-muted tabular-nums">{{ p.count }} · {{ fmtMoney(p.revenue) }}</span>
            </div>
            <div class="h-2 w-full rounded-full bg-divider/40 overflow-hidden">
              <div
                class="h-full rounded-full bar-reveal-x"
                :class="toneBgClass(p.color)"
                :style="{ width: `${(p.revenue / totalProjectRevenue) * 100}%`, '--bar-i': i }"
              ></div>
            </div>
            <div class="text-[10px] text-ink-disabled mt-0.5 tabular-nums">
              {{ Math.round((p.count / totalProjects) * 100) }}% of projects · {{ Math.round((p.revenue / totalProjectRevenue) * 100) }}% of revenue
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- Lead source ROI summary (defers to Lead Sources tab for detail) -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Lead source ROI · summary</h3>
        <p class="text-xs text-ink-muted">Detailed breakdown is on the Lead Sources tab.</p>
      </header>
      <div class="space-y-2">
        <div class="flex items-baseline justify-between text-sm border-b border-divider pb-2">
          <span class="text-ink">Customer Referrals</span>
          <span class="font-bold text-success tabular-nums">+$188K · 0 CAC</span>
        </div>
        <div class="flex items-baseline justify-between text-sm border-b border-divider pb-2">
          <span class="text-ink">Google Reviews → Organic Search</span>
          <span class="font-bold text-success tabular-nums">+$98K · 0 CAC</span>
        </div>
        <div class="flex items-baseline justify-between text-sm border-b border-divider pb-2">
          <span class="text-ink">Google LSA</span>
          <span class="font-bold text-success tabular-nums">+$111K · $735 spend</span>
        </div>
        <div class="flex items-baseline justify-between text-sm border-b border-divider pb-2">
          <span class="text-ink">Houzz Pro Directory</span>
          <span class="font-bold text-success tabular-nums">+$76K · $129 spend</span>
        </div>
        <div class="flex items-baseline justify-between text-sm">
          <span class="text-ink-muted text-[12px]">Other (Direct + Instagram + NextDoor)</span>
          <span class="font-semibold text-ink-muted tabular-nums">+$95K</span>
        </div>
      </div>
    </section>
  </div>
</template>
