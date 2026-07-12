<script setup lang="ts">
/**
 * Focal Point - real Insights (metrics tab).
 * Combines Planning Center data (first-time visitor flow, serving) with Focal
 * Point's own weekly summary sheet (adult service attendance, online, youth)
 * which lives outside PCO. Each card labels its source. Giving and group
 * attendance connect once those scopes are enabled.
 */
import { computed } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import { lineDefaults, barDefaults, chartColors } from '@/lib/chartTheme'
import { focalPointInsights as fp } from '@/lib/clients/focal-point/insights'

const kpis = [
  { label: 'Avg weekend', value: fp.kpis.avgWeekend, sub: 'all services, 2026' },
  { label: 'Members', value: fp.kpis.members, sub: 'on the rolls' },
  { label: 'Visitors on file', value: fp.kpis.visitors, sub: 'all-time' },
  { label: 'Volunteers serving', value: fp.kpis.volunteers, sub: 'distinct, 6 mo' },
  { label: 'YouTube subs', value: fp.kpis.youtubeSubscribers, sub: 'and climbing' },
]

const weekendData = computed(() => ({
  labels: [...fp.weekendAttendance.labels],
  datasets: [{
    label: 'Weekend attendance', data: [...fp.weekendAttendance.counts],
    borderColor: chartColors.brand(), backgroundColor: chartColors.brand(0.1),
    fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
  }],
}))
const weekendOpts = lineDefaults({ legend: false })

const adultsKidsData = computed(() => ({
  labels: [...fp.adultsKids.labels],
  datasets: [
    { label: 'Adults', data: [...fp.adultsKids.adults], backgroundColor: chartColors.brand(), stack: 'a' },
    { label: 'Kids', data: [...fp.adultsKids.kids], backgroundColor: '#10B981', stack: 'a' },
  ],
}))
const adultsKidsOpts = barDefaults({ legend: true, stacked: true })

const youthData = computed(() => ({
  labels: [...fp.youth.labels],
  datasets: [{ label: 'Youth', data: [...fp.youth.counts], backgroundColor: '#A855F7' }],
}))
const youthOpts = barDefaults({ legend: false })

const subsData = computed(() => ({
  labels: [...fp.online.subscribers.labels],
  datasets: [{
    label: 'YouTube subscribers', data: [...fp.online.subscribers.counts],
    borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
  }],
}))
const subsOpts = lineDefaults({ legend: false })

const flowData = computed(() => ({
  labels: [...fp.visitorFlow.labels],
  datasets: [{ label: 'First-time', data: [...fp.visitorFlow.counts], backgroundColor: chartColors.brand() }],
}))
const flowOpts = barDefaults({ legend: false })

const maxSvc = Math.max(...fp.services.map((s) => s.avg))
</script>

<template>
  <!-- Real KPIs -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
    <div v-for="k in kpis" :key="k.label" class="card">
      <div class="kpi-label">{{ k.label }}</div>
      <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ k.value.toLocaleString() }}</div>
      <div class="mt-0.5 text-[11px] text-ink-disabled">{{ k.sub }}</div>
    </div>
  </div>

  <!-- Weekend attendance (their sheet) -->
  <section class="card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Weekend attendance</span>
      <span class="text-[11px] text-ink-muted">all services · from your weekly summary</span>
    </div>
    <div class="h-56"><Line :data="weekendData" :options="weekendOpts" /></div>
    <p class="mt-2 text-[11px] text-ink-muted">
      Every service, every weekend of 2026 (that Easter spike to 1,782 is real). This lives in your summary sheet today; Grace can read it weekly or take it off your plate with a 60-second input.
    </p>
  </section>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <!-- Adults vs kids -->
    <section class="card lg:col-span-8">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Adults vs Kids</span>
        <span class="text-[11px] text-ink-muted">weekly, from your summary</span>
      </div>
      <div class="h-52"><Bar :data="adultsKidsData" :options="adultsKidsOpts" /></div>
    </section>

    <!-- Service mix -->
    <section class="card lg:col-span-4">
      <span class="eyebrow">Service sizes</span>
      <p class="mt-0.5 text-[11px] text-ink-muted">avg attendance, 2026</p>
      <ul class="mt-3 space-y-2.5">
        <li v-for="s in fp.services" :key="s.name">
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">{{ s.name }}</span>
            <span class="text-xs tabular-nums text-ink-muted">{{ s.avg }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div class="h-full rounded-full bg-brand/80" :style="{ width: Math.round((s.avg / maxSvc) * 100) + '%' }"></div>
          </div>
        </li>
      </ul>
    </section>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <!-- Online / YouTube -->
    <section class="card lg:col-span-7">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Online reach</span>
        <span class="text-[11px] text-ink-muted">YouTube subscribers · from your summary</span>
      </div>
      <div class="h-44"><Line :data="subsData" :options="subsOpts" /></div>
    </section>

    <!-- Youth -->
    <section class="card lg:col-span-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="eyebrow">Youth attendance</span>
        <span class="text-[11px] text-ink-muted">weekly · from your summary</span>
      </div>
      <div class="h-44"><Bar :data="youthData" :options="youthOpts" /></div>
    </section>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <!-- First-time visitor flow (PCO) -->
    <section class="card lg:col-span-8">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">First-time visitor flow</span>
          <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span class="h-1.5 w-1.5 rounded-full bg-success"></span>Live from Planning Center
          </span>
        </div>
        <span class="text-[11px] text-ink-muted">Starting Point sign-ins / week</span>
      </div>
      <div class="h-44"><Bar :data="flowData" :options="flowOpts" /></div>
    </section>

    <!-- Engagement: serving live, giving/groups pending -->
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
