<script setup lang="ts">
/**
 * Focal Point - Insights, rebuilt as a scorecard with a verdict (not a chart
 * wall). Three layers:
 *   1. This Weekend  - the Monday recap they build by hand, with Grace's read.
 *   2. Are We Growing - trends with year-over-year and a plain-English verdict.
 *   3. The Full Scorecard - the rest of their weekly sheet, mirrored.
 * Data: their weekly summary sheet (attendance, online, youth, volunteers) plus
 * Planning Center (first-time visitor flow, serving, groups). The sheet and the
 * Metrics workbook are exported by hand and stop at fp.sheetThrough; the
 * Planning Center pulls are dated in their own files. Nothing on this page is
 * the nightly sync except the volunteer count, so nothing else wears the live
 * dot. It used to: a Jul 5 weekend sat under a green dot in September.
 */
import { computed, onMounted } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import { lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import { focalPointInsights as fp } from '@/lib/clients/focal-point/insights'
import { focalPoint2025 as fp25 } from '@/lib/clients/focal-point/insights2025'
import { focalPointServiceMix as smix } from '@/lib/clients/focal-point/serviceMix'
import { focalPointGroupInsights as ggi } from '@/lib/clients/focal-point/groupInsights'
import { useCongregationLens } from '@/stores/congregationLens'
import { startingPoint } from '@/lib/clients/focal-point/startingPoint'
import { burnoutData, loadCareData } from '@/lib/clients/church/careDataLoader'
import GettingConnected from '@/components/cornerstone/GettingConnected.vue'
import DiscipleshipPathway from '@/components/cornerstone/DiscipleshipPathway.vue'

const lens = useCongregationLens()
// Proper-noun form for copy. Interpolating lens.scope printed "brazilian".
const lensLabel = computed(() => (lens.scope === 'brazilian' ? 'Brazilian' : 'English'))
const SHEET_THROUGH = fp.sheetThrough
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtAsOf = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${MON[m - 1]} ${d}` }
const spAsOf = fmtAsOf(startingPoint.asOf)
// "-7.2%" -> "down 7.2% on"; "+3%" -> "up 3% on"; "" -> "level with".
const vs = (p: string) => (p.startsWith('-') ? `down ${p.slice(1)} on` : p ? `up ${p.slice(1)} on` : 'level with')
// The volunteer tile is the one number here the nightly sync feeds, so it can
// be live. Idempotent and cheap; Serving and Care & Drift call it too.
onMounted(() => { loadCareData('focal-point-church') })
const liveVolunteers = computed(() => burnoutData().activeVolunteers ?? 0)

const YOUTH_PURPLE = '#A855F7'
const VIEW_RED = '#EF4444'

// Distinct per-service palette for the attendance-by-service stack.
const SERVICE_COLORS: Record<string, string> = {
  'Sun 9:00': chartColors.brand(),
  'Sun 10:30': '#0EA5E9',
  'Sun 12:00': '#14B8A6',
  'Sun 6:00': '#8B5CF6',
  Spanish: '#F59E0B',
}
const OTHER_COLOR = '#64748B' // Saturday (discontinued in spring), shown for history
// Resolve a service's color for the Service Sizes bars, matching the chart.
// The sizes panel uses the display name "Brazilian" for the Sun 6:00 service.
function serviceColor(name: string): string {
  if (name === 'Brazilian') return SERVICE_COLORS['Sun 6:00']
  return SERVICE_COLORS[name] ?? OTHER_COLOR
}

function pct(now: number, base: number): string {
  if (!base) return ''
  const d = ((now - base) / base) * 100
  return `${d >= 0 ? '+' : ''}${d.toFixed(d >= 10 || d <= -10 ? 0 : 1)}%`
}

// ---- Layer 1: This Weekend ----
const tw = fp.thisWeekend
const yoyWeekend = pct(tw.grand, fp25.counts[fp25.counts.length - 1]) // vs same weekend 2025 (real)

// ---- Layer 2: Are We Growing ----
const avgYoY = pct(fp.kpis.avgWeekend, fp25.avgWeekend)

// Avg weekend scopes by congregation (from the service sizes); the roll-based
// KPIs (members, visitors, volunteers, subs) are church-wide with no split.
const kpis = computed(() => [
  {
    label: 'Avg weekend',
    value: avgWeekendScoped.value,
    sub: lens.scope === 'all' ? `all services, 2026 through ${SHEET_THROUGH}` : `${lensLabel.value} services, 2026 through ${SHEET_THROUGH}`,
    // "vs last year" read as the 2025 full-year average, which sits 300px
    // below at 983 and gives +2.5%. The comparison is the same 27 weeks.
    delta: lens.scope === 'all' ? `${avgYoY} vs same weeks of 2025` : '',
  },
  { label: 'Members', value: fp.kpis.members, sub: `on the Members list · church-wide, ${spAsOf}`, delta: '' },
  {
    label: 'Visitors on file',
    value: visitorsOnFileScoped.value,
    sub: lens.scope === 'all' ? `Starting Point, all-time · ${spAsOf}` : `${lensLabel.value}, all-time · ${spAsOf}`,
    delta: '',
  },
  {
    // Live from the nightly sync (the same count Serving shows), church-wide:
    // the payload has no campus split. The old 385 was typed into this file.
    label: 'Volunteers',
    value: liveVolunteers.value || volunteersByCampus.all,
    sub: liveVolunteers.value ? 'scheduled, last 6 mo · church-wide, live' : 'scheduled, last 6 mo · church-wide',
    delta: '',
  },
  {
    label: 'Avg visitors',
    value: avgVisitorsScoped.value,
    sub: lens.scope === 'all' ? `first-timers / week, 2026 · ${spAsOf}` : `${lensLabel.value}, first-timers / week · ${spAsOf}`,
    delta: '',
  },
])

const weekendData = computed(() => ({
  labels: [...fp.weekendAttendance.labels],
  datasets: [
    {
      label: '2025', data: [...fp25.counts], order: 2,
      borderColor: chartColors.brand(0.35), backgroundColor: 'transparent',
      borderDash: [5, 4], fill: false, tension: 0.4, pointRadius: 0, borderWidth: 1.5,
    },
    {
      label: '2026', data: [...fp.weekendAttendance.counts], order: 1,
      borderColor: chartColors.brand(), backgroundColor: chartColors.brand(0.1),
      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
    },
  ],
}))
const weekendOpts = lineDefaults({ legend: true })

// Sun 6:00 PM is the Brazilian service; the sparse standalone service is Spanish.
const displayName = (n: string) => (n === 'Sun 6:00' ? 'Brazilian' : n)
// Attendance by service, scoped: only the services in the selected congregation.
// English scope keeps Saturday (a main service); Brazilian drops it.
const scopedMixServices = computed(() => smix.services.filter((s) => serviceInScope(s.name)))
const showSaturday = computed(() => serviceInScope('Saturday'))
const serviceMixData = computed(() => ({
  labels: [...smix.labels],
  datasets: [
    ...scopedMixServices.value.map((s) => ({
      label: displayName(s.name),
      data: [...s.total],
      backgroundColor: SERVICE_COLORS[s.name] ?? OTHER_COLOR,
      stack: 'mix',
      borderWidth: 0,
    })),
    ...(showSaturday.value
      ? [{ label: 'Saturday', data: [...smix.other], backgroundColor: OTHER_COLOR, stack: 'mix', borderWidth: 0 }]
      : []),
  ],
}))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serviceMixOpts = computed<any>(() => {
  const base = barDefaults({ legend: true, stacked: true })
  const svc = scopedMixServices.value
  return {
    ...base,
    interaction: { mode: 'nearest', intersect: true },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...(base.plugins?.tooltip ?? {}),
        callbacks: {
          label: (ctx: { datasetIndex: number; dataIndex: number; parsed: { y: number } }) => {
            const s = svc[ctx.datasetIndex]
            if (!s) return ` Saturday: ${ctx.parsed.y}`
            return ` ${displayName(s.name)}: ${ctx.parsed.y}`
          },
          afterLabel: (ctx: { datasetIndex: number; dataIndex: number }) => {
            const s = svc[ctx.datasetIndex]
            if (!s) return ''
            const i = ctx.dataIndex
            const serving = Math.max(0, s.total[i] - s.adults[i] - s.kids[i])
            return `${s.adults[i]} adults · ${s.kids[i]} kids · ${serving} serving`
          },
        },
      },
    },
  }
})
// Service sizes filtered by the congregation lens: Brazilian is the 6:00 service,
// everything else is the English congregation (incl. the Spanish service).
const isBrazilianService = (name: string) => name === 'Brazilian' || name === 'Sun 6:00'
const servicesScoped = computed(() => {
  if (lens.scope === 'all') return fp.services
  return fp.services.filter((s) =>
    lens.scope === 'brazilian' ? isBrazilianService(s.name) : !isBrazilianService(s.name),
  )
})
const maxSvc = computed(() => Math.max(...servicesScoped.value.map((s) => s.avg), 1))

// A service is in scope when its congregation matches the lens. English scope =
// all main services (everything not Brazilian, incl. Spanish + Saturday).
const serviceInScope = (name: string) =>
  lens.scope === 'all' || (lens.scope === 'brazilian' ? isBrazilianService(name) : !isBrazilianService(name))

// This Weekend, scoped: the grand total + week-over-week recompute from just the
// services in the selected congregation. Year-over-year is church-wide (no
// per-service 2025 data), so it hides when scoped.
const twScoped = computed(() => {
  const services = tw.servicesMet.filter((s) => serviceInScope(s.name))
  const grand = services.reduce((n: number, s) => n + s.now, 0)
  const prevGrand = services.reduce((n: number, s) => n + s.prev, 0)
  return { grand, prevGrand, services, wow: pct(grand, prevGrand) }
})
// The one service that grew, for the read. Computed, because the typed-in
// sentence said "6% ahead of last year" beside a tile computing -2.2%.
const grewMost = computed(() => {
  const up = tw.servicesMet.filter((s) => s.now > s.prev).sort((a, b) => b.now / b.prev - a.now / a.prev)
  return up[0] ?? null
})
// Avg weekend, scoped: sum of the in-scope service sizes.
const avgWeekendScoped = computed(() =>
  lens.scope === 'all'
    ? fp.kpis.avgWeekend
    : servicesScoped.value.map((s) => s.avg).reduce((n, m) => n + m, 0),
)
// Fallback only, for the moment before the sync payload lands (Jul 2026 pull).
const volunteersByCampus = { all: 385 } as const
// First-time visitors from the two Starting Point workflows, scoped by campus.
const avgVisitorsScoped = computed(() => startingPoint.avgPerWeek[lens.scope])
const visitorsOnFileScoped = computed(() => startingPoint.total[lens.scope])
const visitorYears = computed(() => startingPoint.byYear[lens.scope])
const maxVisitorYear = computed(() => Math.max(...visitorYears.value.map((y) => y.count), 1))

// ---- Body health: engagement penetration + age profile ----
const bh = fp.bodyHealth
const gs = fp.bodyHealth.groupSnapshot
// Growth Groups filtered by the congregation lens. byType carries English /
// Brazilian / Youth, so the scope reshapes the headline numbers honestly.
const gsByType = computed(() => {
  if (lens.scope === 'all') return gs.byType
  if (lens.scope === 'brazilian') return gs.byType.filter((t) => t.type === 'Brazilian')
  return gs.byType.filter((t) => t.type !== 'Brazilian')
})
const gsScoped = computed(() => {
  const rows = gsByType.value
  const people = rows.reduce((n, t) => n + t.members, 0)
  const groups = rows.reduce((n, t) => n + t.groups, 0)
  const withAtt = rows.filter((t) => t.avgAtt)
  const attMembers = withAtt.reduce((n, t) => n + t.members, 0)
  const avg = attMembers
    ? Math.round(withAtt.reduce((n, t) => n + (t.avgAtt || 0) * t.members, 0) / attMembers)
    : gs.avgAttendance
  return { people, groups, avg }
})
const maxGroupType = computed(() => Math.max(...gsByType.value.map((t) => t.members), 1))
const lastMonth = ggi.monthly[ggi.monthly.length - 1]
const groupMonthlyData = computed(() => ({
  labels: ggi.monthly.map((m) => m.label + (m.partial ? ' (to date)' : '')),
  datasets: [{ label: 'Group attendance', data: ggi.monthly.map((m) => m.total), backgroundColor: chartColors.brand(0.8) }],
}))
const groupMonthlyOpts = barDefaults({ legend: false })
// draw each bar's value above it, so the number reads without hovering
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const barValuePlugin = {
  id: 'barValue',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    meta.data.forEach((bar: any, i: number) => {
      const v = chart.data.datasets[0].data[i] as number
      ctx.save()
      ctx.fillStyle = '#475569'
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(v.toLocaleString(), bar.x, bar.y - 5)
      ctx.restore()
    })
  },
}
const servingNotPct = 100 - bh.serving.pct
// "About 1 in 4" was typed in beside a computed 29%. 1 in 3 is the honest round.
const servingOneIn = Math.round(100 / Math.max(1, bh.serving.pct))
const age = fp.ageProfile
const maxAge = Math.max(...age.bands.map((b) => b.pct))

// Four-year growth (real, from their Metrics workbooks).
const years = fp.yearlyAttendance
const maxYear = Math.max(...years.map((y) => y.avg ?? 0))
const growthSince2022 = Math.round(((fp.kpis.avgWeekend - 602) / 602) * 100)

// Salvation responses (real, from the Metrics workbooks)
const sv = fp.salvations
const maxSalv = Math.max(...sv.byYear.map((y) => y.total))

// ---- Layer 3: The full scorecard ----
const liveViewsData = computed(() => ({
  labels: [...fp.online.liveViews.labels],
  datasets: [{
    label: 'Live viewers', data: [...fp.online.liveViews.counts],
    borderColor: VIEW_RED, backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
  }],
}))
const liveViewsOpts = lineDefaults({ legend: false })
const firstView = fp.online.liveViews.counts[0]
const lastView = fp.online.liveViews.counts[fp.online.liveViews.counts.length - 1]

const youthData = computed(() => ({
  labels: [...fp.youth.labels],
  datasets: [{ label: 'Youth', data: [...fp.youth.counts], backgroundColor: YOUTH_PURPLE }],
}))
const youthOpts = barDefaults({ legend: false })

</script>

<template>
  <!-- Congregation lens lives in the chrome; this notes what it reshapes here. -->
  <p v-if="lens.scope !== 'all'" class="px-1 text-[11px] leading-relaxed text-warn">
    Showing the {{ lensLabel }} congregation. The latest weekend, avg weekend, attendance by service, service sizes, and Growth Groups reflect it. Multi-year growth, salvations, age profile, online, youth, and the roll counts are church-wide totals with no per-congregation split, and are tagged as such.
  </p>

  <!-- ===================== LAYER 1: THIS WEEKEND ===================== -->
  <section class="card bg-brand/[0.03]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow text-brand">Latest weekend on file</span>
      <span class="text-[11px] text-ink-muted">Weekend of {{ tw.date }} · from your weekly summary, which runs through {{ SHEET_THROUGH }}</span>
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4">
      <!-- headline -->
      <div>
        <div class="flex items-baseline gap-3">
          <span class="text-5xl font-bold tabular-nums text-ink">{{ twScoped.grand.toLocaleString() }}</span>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-semibold" :class="twScoped.wow.startsWith('-') ? 'text-ink-muted' : 'text-success'">
              {{ twScoped.wow }} vs last week
            </span>
            <span v-if="lens.scope === 'all'" class="text-xs font-semibold" :class="yoyWeekend.startsWith('-') ? 'text-ink-muted' : 'text-success'">
              {{ yoyWeekend }} vs last year
            </span>
          </div>
        </div>
        <div class="mt-2 flex gap-5 text-[13px]">
          <span class="text-ink-muted"><span class="font-semibold text-ink">{{ tw.firstTimers }}</span> first-time guests</span>
          <span class="text-ink-muted"><span class="font-semibold text-ink">{{ tw.volunteers }}</span> serving</span>
        </div>
      </div>

      <!-- per-service now vs last week -->
      <div class="min-w-[240px] flex-1">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div v-for="s in twScoped.services" :key="s.name">
            <div class="text-[11px] text-ink-muted">{{ s.name }}</div>
            <div class="flex items-baseline gap-1.5">
              <span class="text-lg font-semibold tabular-nums text-ink">{{ s.now }}</span>
              <span class="text-[11px] font-medium" :class="pct(s.now, s.prev).startsWith('-') ? 'text-ink-disabled' : 'text-success'">{{ pct(s.now, s.prev) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Grace's read (church-wide narrative; hidden when a congregation is scoped) -->
    <div v-if="lens.scope === 'all'" class="mt-4 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3">
      <div class="mb-1 flex items-center gap-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
      </div>
      <p class="text-[13px] leading-relaxed text-ink">
        {{ twScoped.grand.toLocaleString() }} in the room the weekend of {{ tw.date }}, {{ vs(twScoped.wow) }} the week before and {{ vs(yoyWeekend) }} the same weekend in 2025. {{ tw.note }}<template v-if="grewMost"> {{ grewMost.name }} was the one service that grew, up {{ pct(grewMost.now, grewMost.prev) }}.</template>
      </p>
    </div>
    <p v-else class="mt-3 text-[11px] text-ink-muted">
      {{ twScoped.grand.toLocaleString() }} across the {{ lensLabel }} services the weekend of {{ tw.date }}. First-time guests and total serving are church-wide.
    </p>
  </section>

  <!-- ===================== LAYER 2: ARE WE GROWING ===================== -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
    <div v-for="k in kpis" :key="k.label" class="card">
      <div class="kpi-label">{{ k.label }}</div>
      <div class="mt-1 text-2xl font-bold tabular-nums text-ink">{{ k.value.toLocaleString() }}</div>
      <div v-if="k.delta" class="mt-0.5 text-[11px] font-semibold" :class="k.delta.startsWith('-') ? 'text-ink-muted' : 'text-success'">{{ k.delta }}</div>
      <div class="mt-0.5 text-[11px] text-ink-disabled">{{ k.sub }}</div>
    </div>
  </div>

  <!-- Getting Connected (assimilation, scopes) then Discipleship Pathway (growth,
       church-wide): connect first, then grow. Both priorities from the intake. -->
  <GettingConnected />
  <DiscipleshipPathway />

  <section class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Are we growing?</span>
        <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
      </div>
      <span class="text-[11px] text-ink-muted">weekend attendance, 2026 vs 2025 · through {{ SHEET_THROUGH }}</span>
    </div>
    <div class="h-56"><Line :data="weekendData" :options="weekendOpts" /></div>
    <div class="mt-3 rounded-lg border border-divider bg-surface-elevated/40 px-4 py-3">
      <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
      <p class="mt-1 text-[13px] leading-relaxed text-ink">
        Averaging {{ fp.kpis.avgWeekend.toLocaleString() }} a weekend through {{ SHEET_THROUGH }}, up {{ avgYoY }} over the same stretch of 2025. The two lines cross in mid-April only because Easter moved, 2026's was two weeks earlier; measured Easter to Easter you were up about 13%. And zoom out: you were averaging {{ years[0].avg }} a weekend in 2022. This is real, sustained growth, not a one-off.
      </p>
    </div>
  </section>

  <!-- Four-year growth (real, from their Metrics workbooks) -->
  <section class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Annual growth</span>
        <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
      </div>
      <span class="text-[11px] text-ink-muted">avg weekend by year, from your records</span>
    </div>
    <div class="flex items-baseline gap-2">
      <span class="text-3xl font-bold tabular-nums text-success">+{{ growthSince2022 }}%</span>
      <span class="text-sm text-ink-muted">since 2022</span>
    </div>
    <ul class="mt-4 space-y-2.5">
      <li v-for="y in years" :key="y.year">
        <div class="mb-1 flex items-baseline justify-between">
          <span class="text-sm font-medium text-ink">{{ y.year }}<span v-if="y.partial" class="ml-1 text-[11px] font-normal text-ink-muted">YTD</span></span>
          <span v-if="y.avg" class="text-xs tabular-nums text-ink-muted">{{ y.avg.toLocaleString() }}</span>
          <span v-else class="text-[11px] text-ink-disabled">pending</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div class="h-full rounded-full" :class="y.partial ? 'bg-brand' : 'bg-brand/70'" :style="{ width: Math.round(((y.avg ?? 0) / maxYear) * 100) + '%' }"></div>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-[11px] text-ink-disabled">Every year up. 2026 is year to date through {{ SHEET_THROUGH }}.</p>
  </section>

  <!-- Salvations (church-wide) + First-time visitors by year (scopes), half and half -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Salvations</span>
        <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
      </div>
      <span class="text-[11px] text-ink-muted">hands raised for Jesus, from your records</span>
    </div>
    <div class="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
      <div>
        <div class="text-4xl font-bold tabular-nums text-brand">{{ sv.thisYearTotal }}</div>
        <div class="text-[11px] text-ink-muted">responded for salvation in 2026, through {{ sv.through }}</div>
      </div>
      <!-- "18 weeks in" rendered in week 37. The count is fixed at the week the
           workbook was last exported, so the copy says which week that was. -->
      <div class="pb-1 text-sm text-ink-muted">
        Through week {{ sv.thisYearWeeks }}, on pace for about <span class="font-semibold text-ink">{{ sv.pace }}</span> this year, ahead of last.
      </div>
    </div>
    <ul class="mt-4 space-y-2.5">
      <li v-for="y in sv.byYear" :key="y.year">
        <div class="mb-1 flex items-baseline justify-between">
          <span class="text-sm font-medium text-ink">{{ y.year }}<span v-if="y.partial" class="ml-1 text-[11px] font-normal text-ink-muted">YTD</span></span>
          <span class="text-xs tabular-nums text-ink-muted">{{ y.total }}</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div class="h-full rounded-full" :class="y.partial ? 'bg-brand' : 'bg-brand/70'" :style="{ width: Math.round((y.total / maxSalv) * 100) + '%' }"></div>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-[11px] text-ink-disabled">This is the number behind everything else. Every person here is someone to welcome, connect, and disciple.</p>
  </section>

  <!-- First-time visitors by year (Starting Point workflows). Scopes by congregation. -->
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">First-time visitors</span>
        <span class="text-[11px] text-ink-muted">Planning Center, pulled {{ spAsOf }}</span>
      </div>
      <span class="text-[11px] text-ink-muted">Starting Point, by year</span>
    </div>
    <div class="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
      <div>
        <div class="text-4xl font-bold tabular-nums text-brand">{{ visitorYears[visitorYears.length - 1].count }}</div>
        <div class="text-[11px] text-ink-muted">first-timers in 2026 through {{ spAsOf }}{{ lens.scope === 'all' ? '' : `, ${lensLabel}` }}</div>
      </div>
      <div class="pb-1 text-sm text-ink-muted">
        Averaging <span class="font-semibold text-ink">{{ avgVisitorsScoped }}</span> a week through Starting Point.
      </div>
    </div>
    <ul class="mt-4 space-y-2.5">
      <li v-for="y in visitorYears" :key="y.year">
        <div class="mb-1 flex items-baseline justify-between">
          <span class="text-sm font-medium text-ink">{{ y.year }}<span v-if="y.partial" class="ml-1 text-[11px] font-normal text-ink-muted">YTD</span></span>
          <span class="text-xs tabular-nums text-ink-muted">{{ y.count }}</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div class="h-full rounded-full" :class="y.partial ? 'bg-brand' : 'bg-brand/70'" :style="{ width: Math.round((y.count / maxVisitorYear) * 100) + '%' }"></div>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-[11px] text-ink-disabled">
      {{ lens.scope === 'brazilian' ? 'The Brazilian Starting Point began April 2025. High first-timer volume for the congregation size.' : 'Everyone who signed in at Starting Point. 2026 is year to date.' }}
    </p>
  </section>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <section class="card lg:col-span-8">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Attendance by service</span>
        <span class="text-[11px] text-ink-muted">weekly through {{ SHEET_THROUGH }} · hover for the adult / kid split</span>
      </div>
      <div class="h-52"><Bar :data="serviceMixData" :options="serviceMixOpts" /></div>
    </section>

    <section class="card lg:col-span-4">
      <span class="eyebrow">Service sizes</span>
      <p class="mt-0.5 text-[11px] text-ink-muted">avg attendance, 2026 through {{ SHEET_THROUGH }}</p>
      <ul class="mt-3 space-y-2.5">
        <li v-for="s in servicesScoped" :key="s.name">
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">{{ s.name }}</span>
            <span class="text-xs tabular-nums text-ink-muted">{{ s.avg }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div class="h-full rounded-full" :style="{ width: Math.round((s.avg / maxSvc) * 100) + '%', backgroundColor: serviceColor(s.name) }"></div>
          </div>
        </li>
      </ul>
    </section>
  </div>

  <!-- ===================== BODY HEALTH ===================== -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <!-- Engagement penetration -->
    <section class="card lg:col-span-6">
      <div class="mb-1 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Body health</span>
          <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
        </div>
        <span class="text-[11px] text-ink-muted">of your committed core · pulled Jul 12</span>
      </div>
      <p class="text-[11px] text-ink-muted">
        Not the {{ (12000).toLocaleString() }}+ records in Planning Center, the {{ bh.coreAdults.toLocaleString() }} adults who are members or regular attenders.
      </p>

      <div class="mt-4 space-y-4">
        <!-- Serving (live) -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">Serving</span>
            <span class="text-sm font-bold tabular-nums text-brand">{{ bh.serving.pct }}%</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
            <div class="h-full rounded-full bg-brand" :style="{ width: bh.serving.pct + '%' }"></div>
          </div>
          <p class="mt-1 text-[11px] text-ink-muted">{{ bh.serving.count }} of {{ bh.coreAdults.toLocaleString() }} adults served in the six months to Jul 12, by volunteer check-ins. {{ servingNotPct }}% have not yet.</p>
        </div>

        <!-- Groups (live: real membership; attendance drift resumes in fall) -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">In a group</span>
            <span class="text-[11px] text-ink-muted">Groups, pulled {{ bh.groups.asOf }}</span>
          </div>
          <div class="text-lg font-bold tabular-nums text-ink">{{ bh.groups.count.toLocaleString() }}</div>
          <p class="mt-0.5 text-[11px] text-ink-muted">people in an active group, {{ bh.groups.memberships.toLocaleString() }} memberships across {{ bh.groups.groupCount }} groups. Attendance trend below, drift on Care and Drift.</p>
        </div>

        <!-- Giving (pending) -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink-muted">Giving</span>
            <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">pending</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-surface-elevated"></div>
          <p class="mt-1 text-[11px] text-ink-muted">Lights up with Giving access. Participation only, no dollar figures.</p>
        </div>
      </div>

      <div class="mt-4 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3">
        <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
        <p class="mt-1 text-[13px] leading-relaxed text-ink">
          About 1 in {{ servingOneIn }} of your committed core serve. That is healthy, and it means the other {{ servingNotPct }}% are an activation pool, not a problem. The people already attending who have never been asked. That list is on Serving, under Who to Ask.
        </p>
      </div>
    </section>

    <!-- Age profile -->
    <section class="card lg:col-span-6">
      <div class="mb-1 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Age profile</span>
          <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
        </div>
        <span class="text-[11px] text-ink-muted">core adults · Planning Center, pulled Jul 12</span>
      </div>
      <p class="text-[11px] text-ink-muted">Of the roughly half of your core adults with a birthdate on file.</p>

      <ul class="mt-4 space-y-2.5">
        <li v-for="b in age.bands" :key="b.band">
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium" :class="b.band === '18-24' ? 'text-warn' : 'text-ink'">{{ b.band }}<span v-if="b.band === '18-24'" class="ml-1.5 rounded bg-warn/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-warn">thin</span></span>
            <span class="text-xs tabular-nums text-ink-muted">{{ b.pct }}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div class="h-full rounded-full" :class="b.band === '18-24' ? 'bg-warn/70' : 'bg-brand/80'" :style="{ width: Math.round((b.pct / maxAge) * 100) + '%' }"></div>
          </div>
        </li>
      </ul>

      <div class="mt-4 rounded-lg border border-divider bg-surface-elevated/40 px-4 py-3">
        <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
        <p class="mt-1 text-[13px] leading-relaxed text-ink">
          You are a strong 35 to 54 church, that is half your core. The thin band is 18 to 24 at under 4%. If reaching young adults is a goal this year, this is the gap to watch and the number to move.
        </p>
      </div>
    </section>
  </div>

  <!-- Growth Groups snapshot (real, live from the Groups API) -->
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Growth Groups</span>
      <span class="text-[11px] text-ink-muted">Planning Center Groups, pulled {{ gs.asOf }}</span>
    </div>
    <div class="mt-3 grid grid-cols-3 gap-4">
      <div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ (lens.scope === 'all' ? gs.people : gsScoped.people).toLocaleString() }}</div>
        <div class="text-[11px] text-ink-muted">{{ lens.scope === 'all' ? 'people in a group' : 'memberships' }}</div>
      </div>
      <div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ gsScoped.groups }}</div>
        <div class="text-[11px] text-ink-muted">active groups</div>
      </div>
      <div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ gsScoped.avg }}</div>
        <div class="text-[11px] text-ink-muted">avg attendance / group</div>
      </div>
    </div>
    <ul class="mt-4 space-y-2.5">
      <li v-for="t in gsByType" :key="t.type">
        <div class="mb-1 flex items-baseline justify-between gap-2">
          <span class="text-sm font-medium text-ink">{{ t.label }}</span>
          <span class="text-xs tabular-nums text-ink-muted">
            {{ t.groups }} {{ t.groups === 1 ? 'group' : 'groups' }} · {{ t.members }} memberships ·
            <span v-if="t.avgAtt" class="font-semibold text-ink">{{ t.avgAtt }} attend</span>
            <span v-else class="text-ink-disabled">attendance not logged</span>
          </span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div class="h-full rounded-full" :class="t.avgAtt ? 'bg-brand/80' : 'bg-ink-disabled/40'" :style="{ width: Math.round((t.members / maxGroupType) * 100) + '%' }"></div>
        </div>
      </li>
    </ul>
    <p class="mt-2 text-[11px] leading-relaxed text-ink-muted">
      Rosters run about twice actual attendance. Averages are attended per logged meeting from Aug 1 to {{ gs.asOf }}; Youth groups have logged one meeting so far this fall. A person in two groups counts once in the headline and once per group in the rows.
    </p>

    <div class="mt-5">
      <div class="mb-2 flex items-center justify-between">
        <span class="eyebrow">Attendance by month</span>
        <span class="text-[11px] text-ink-muted">total across all groups · {{ lastMonth.label }} is month to date</span>
      </div>
      <div class="h-40"><Bar :data="groupMonthlyData" :options="groupMonthlyOpts" :plugins="[barValuePlugin]" /></div>
      <p class="mt-2 text-[11px] leading-relaxed text-ink-muted">
        Strong through fall and spring, a holiday dip, a July break, and groups back from August. The people who went quiet over the break are on Care and Drift under Groups.
      </p>
    </div>
  </section>

  <!-- ===================== LAYER 3: THE FULL SCORECARD =====================
       Online reach + Youth are the English/main channel. Brazilian runs its own
       channel (@fpcBrasil) with only a public subscriber count available. -->
  <div class="flex items-center gap-3 pt-1">
    <span class="eyebrow">The rest of your sheet</span>
    <span class="h-px flex-1 bg-divider"></span>
  </div>

  <!-- English / all: live viewers + youth -->
  <div v-if="lens.scope !== 'brazilian'" class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <section class="card lg:col-span-7">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Online reach</span>
        <span class="text-[11px] text-ink-muted">Sunday live viewers · from your summary, through {{ fp.onlineThrough }}</span>
      </div>
      <div class="h-44"><Line :data="liveViewsData" :options="liveViewsOpts" /></div>
      <p class="mt-2 text-[11px] leading-relaxed text-ink-muted">
        Subscribers keep climbing to {{ fp.kpis.youtubeSubscribers.toLocaleString() }}, but that number only goes up. Live viewers are the honest signal, and they slipped from {{ firstView }} in January to {{ lastView }} by the end of May. If online reach is a priority this season, this is the one to watch.
      </p>
    </section>

    <section class="card lg:col-span-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Youth attendance</span>
        <span class="text-[11px] text-ink-muted">weekly through {{ fp.youthThrough }} · from your summary</span>
      </div>
      <div class="h-44"><Bar :data="youthData" :options="youthOpts" /></div>
    </section>
  </div>

  <!-- Brazilian: only the public subscriber count is available for @fpcBrasil -->
  <section v-else class="card">
    <div class="flex items-center justify-between gap-2">
      <span class="eyebrow">Online reach</span>
      <span class="text-[11px] text-ink-muted">Brazilian channel</span>
    </div>
    <div class="mt-3 flex items-baseline gap-2">
      <!-- 1,210 was the members-on-the-rolls figure pasted here. YouTube's
           public count for @fpcBrasil on Sep 11 2026 was 1.52K. -->
      <span class="text-3xl font-bold tabular-nums text-ink">1,520</span>
      <span class="text-sm text-ink-muted">subscribers, public count Sep 11</span>
    </div>
    <a href="https://www.youtube.com/@fpcBrasil" target="_blank" rel="noopener" class="mt-1 inline-block text-[12px] font-medium text-brand hover:underline">@fpcBrasil</a>
    <p class="mt-2 max-w-xl text-[11px] leading-relaxed text-ink-muted">
      Weekly live-viewer tracking lights up once the Brazilian team logs it, like the English channel's summary. Subscribers only go up; live viewers are the honest signal.
    </p>
  </section>

</template>
