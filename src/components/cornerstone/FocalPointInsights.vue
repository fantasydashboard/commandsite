<script setup lang="ts">
/**
 * Focal Point - real Insights (metrics tab).
 * Real aggregate data from Planning Center: congregation KPIs, Kids Point
 * weekly attendance (the live attendance signal, since adults do not check
 * in), and first-time visitor flow from the Starting Point workflow. Giving
 * and group-attendance connect once those scopes are enabled.
 */
import { computed } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import { lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import { focalPointInsights as fp } from '@/lib/clients/focal-point/insights'

const kpis = [
  { label: 'Members', value: fp.kpis.members, sub: 'on the rolls' },
  { label: 'Visitors on file', value: fp.kpis.visitors, sub: 'all-time' },
  { label: 'Kids / Sunday', value: fp.kpis.kidsAvg, sub: 'avg last 26 wks' },
  { label: 'Volunteers serving', value: fp.kpis.volunteers, sub: 'distinct, 6 mo' },
  { label: 'Baptism pathway', value: fp.kpis.baptisms, sub: 'through Baptism Class' },
]

const kidsData = computed(() => ({
  labels: [...fp.kidsAttendance.labels],
  datasets: [
    {
      label: 'Kids Point',
      data: [...fp.kidsAttendance.counts],
      borderColor: chartColors.brand(),
      backgroundColor: chartColors.brand(0.1),
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    },
  ],
}))
const kidsOpts = lineDefaults({ legend: false })

const flowData = computed(() => ({
  labels: [...fp.visitorFlow.labels],
  datasets: [{ label: 'First-time', data: [...fp.visitorFlow.counts], backgroundColor: chartColors.brand() }],
}))
const flowOpts = barDefaults({ legend: false })
</script>

<template>
  <!-- Real congregation KPIs -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
    <div v-for="k in kpis" :key="k.label" class="card">
      <div class="kpi-label">{{ k.label }}</div>
      <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ k.value.toLocaleString() }}</div>
      <div class="mt-0.5 text-[11px] text-ink-disabled">{{ k.sub }}</div>
    </div>
  </div>

  <!-- Kids Point attendance (the live attendance signal) -->
  <section class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Kids Point attendance</span>
        <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
          Live from Planning Center
        </span>
      </div>
      <span class="text-[11px] text-ink-muted">last 26 Sundays</span>
    </div>
    <div class="h-56">
      <Line :data="kidsData" :options="kidsOpts" />
    </div>
    <p class="mt-2 text-[11px] leading-relaxed text-ink-muted">
      Adult worship headcount is not tracked in Planning Center (adults do not check in), so Kids Point is the live attendance signal. It is also the leading indicator: when kids stop coming, the family is drifting. A weekly adult count can be added in week one.
    </p>
  </section>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <!-- First-time visitor flow -->
    <section class="card lg:col-span-8">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">First-time visitor flow</span>
        <span class="text-[11px] text-ink-muted">Starting Point sign-ins / week</span>
      </div>
      <div class="h-52">
        <Bar :data="flowData" :options="flowOpts" />
      </div>
    </section>

    <!-- Engagement breadth: serving live, giving/groups pending -->
    <section class="card lg:col-span-4">
      <span class="eyebrow">Engagement</span>
      <ul class="mt-3 space-y-3">
        <li>
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">Serving</span>
            <span class="rounded bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success">live</span>
          </div>
          <div class="mt-0.5 text-lg font-bold tabular-nums text-ink">{{ fp.serving.volunteers.toLocaleString() }}</div>
          <div class="text-[11px] text-ink-muted">volunteers, {{ fp.serving.lapsed }} recently lapsed</div>
        </li>
        <li class="border-t border-divider pt-3">
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink-muted">Giving</span>
            <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">pending</span>
          </div>
          <div class="mt-0.5 text-[11px] text-ink-muted">connects with Giving access</div>
        </li>
        <li class="border-t border-divider pt-3">
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink-muted">In a group</span>
            <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">pending</span>
          </div>
          <div class="mt-0.5 text-[11px] text-ink-muted">connects with Groups access</div>
        </li>
      </ul>
    </section>
  </div>
</template>
