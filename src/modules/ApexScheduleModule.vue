<script setup lang="ts">
/**
 * Apex Schedule — today's dispatch board (tech rows × time blocks)
 * plus a week-ahead grouped list. Statuses (complete / on_site /
 * en_route / scheduled) read at a glance via color-coded job cards.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  todayJobs,
  upcomingJobs,
  scheduleStats,
  techMeta,
  type ScheduledJob,
  type JobStatus,
} from '@/lib/clients/apex/schedule'
import SourceIndicator from '@/components/SourceIndicator.vue'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => scheduleStats())
const view = ref<'today' | 'week'>('today')

const techIds = Object.keys(techMeta)

function jobsForTech(tid: string): ScheduledJob[] {
  return todayJobs
    .filter((j) => j.assigned_tech_id === tid)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

// Time slots — 8 AM to 6 PM in 1-hour columns.
const HOURS: number[] = Array.from({ length: 11 }, (_, i) => 8 + i)

function jobStartHour(j: ScheduledJob): number {
  return new Date(j.start).getHours() + new Date(j.start).getMinutes() / 60
}

// Position + width as percentages of the 8-18 range.
function jobStyle(j: ScheduledJob): Record<string, string> {
  const startH = jobStartHour(j)
  const endH = startH + j.est_duration_min / 60
  const range = HOURS[HOURS.length - 1] - HOURS[0] + 1  // 11 hours total grid
  const left = ((startH - HOURS[0]) / range) * 100
  const width = Math.max(((endH - startH) / range) * 100, 4)  // floor for visibility
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

function statusColor(s: JobStatus): string {
  switch (s) {
    case 'complete':  return '#94A3B8'  // slate
    case 'on_site':   return '#10B981'  // emerald
    case 'en_route':  return '#F59E0B'  // amber
    case 'cancelled': return '#EF4444'  // red
    default:          return 'rgb(var(--color-brand))'  // brand for scheduled
  }
}
function statusLabel(s: JobStatus): string {
  if (s === 'on_site')  return 'On site'
  if (s === 'en_route') return 'En route'
  if (s === 'complete') return 'Done'
  if (s === 'cancelled') return 'Cancelled'
  return 'Scheduled'
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const am = h < 12
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:${m.toString().padStart(2, '0')} ${am ? 'AM' : 'PM'}`
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function money(cents: number): string {
  if (cents === 0) return 'Free / included'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

// Week-ahead grouping by date.
interface DayGroup { dateLabel: string; jobs: ScheduledJob[] }
const weekGroups = computed<DayGroup[]>(() => {
  const groups = new Map<string, ScheduledJob[]>()
  for (const j of upcomingJobs) {
    const d = new Date(j.start)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(j)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, jobs]) => {
      const d = new Date(key + 'T12:00:00')
      const label = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
      })
      return { dateLabel: label, jobs: jobs.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()) }
    })
})

// ── Approval queue: scheduling decisions Ada needs your eyes on ──────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'sch-conflict-fri',
    icon: '🔀',
    badge: 'Conflict',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Tech swap proposed — Friday 11 AM',
    recipient: 'Marcus double-booked · suggesting Tony for the Patterson job',
    preview: 'Marcus has the Coronado emergency overrun blocking the Patterson 11 AM slot. Tony has the slot open and worked on the Patterson system 3 months ago — minimal context loss. Customer would get a heads-up text from me automatically.',
    approved_response: "Done — Tony assigned, Patterson texted with the swap heads-up. He just got Tony's bio + photo so it doesn't feel cold. Marcus stays on Coronado.",
    ticker_after_approval: 'Friday 11 AM swapped — Tony now on Patterson',
  },
  {
    id: 'sch-overtime-sat',
    icon: '💰',
    badge: 'Overtime ask',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Saturday overtime — new customer wants Sat AM',
    recipient: 'Mendoza Family · no cooling · willing to pay $40 weekend surcharge',
    preview: 'They\'re a brand-new customer and the AC just died Friday afternoon. Tony is technically off Saturday but has said yes to OT before. Want me to ping Tony with the offer (incl. his standard OT cut)?',
    approved_response: "Pinged Tony with the OT offer. He's a fast yes on emergencies — usually responds within 10 min. I'll surface his answer the moment it lands.",
    ticker_after_approval: 'OT ask sent to Tony — Sat AM Mendoza emergency',
  },
  {
    id: 'sch-cancel-batch',
    icon: '📵',
    badge: 'Cancellations',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Reschedule outreach — 3 cancellations today',
    recipient: 'All 3 cited weather + work · Hsu, Foster, Rios',
    preview: 'Drafted personalized "no problem, here\'s next week\'s availability" texts to all three. None are at-risk customers — just bad-luck day. Want me to send them all at once or hold for tomorrow?',
    approved_response: "Sent. They got specific available slots already filtered to their preferred days/times based on past bookings. I'll surface any rebooking the moment it lands.",
    ticker_after_approval: '3 reschedule outreach sent — Hsu, Foster, Rios',
  },
  {
    id: 'sch-photo-prompt',
    icon: '📸',
    badge: 'Photo nudge',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Completion photo prompt — Marcus',
    recipient: '3 jobs from yesterday still missing photos · warranty + marketing both want them',
    preview: '"Hey Marcus — 3 jobs from yesterday still showing as no-photos in the system. Warranty needs them and they\'re also great for the website. Want me to ping you each one or just send one batch reminder?"',
    approved_response: "Pinged Marcus directly. He's responsive when I tag specific jobs vs send a generic ask. Photos usually trickle in within an hour.",
    ticker_after_approval: 'Photo nudge sent to Marcus — 3 jobs pending',
  },
]

const tickerSeed = [
  { icon: '🚐', text: 'Marcus en-route to Coronado emergency · ETA 18 min', ageSec: 4 * 60 },
  { icon: '✅', text: 'Tony arrived at Patterson — clocked in', ageSec: 12 * 60 },
  { icon: '📨', text: '12 first-slot reminder texts sent — 2 confirmed', ageSec: 38 * 60 },
  { icon: '📵', text: '3rd cancellation today — weather impact', ageSec: 2 * 3600 },
]
const tickerPool = [
  { icon: '🚐', text: 'Tech dispatched — en-route to next appointment' },
  { icon: '✅', text: 'Job complete — invoice auto-sent + review request queued' },
  { icon: '📨', text: '"Tech is 15 min out" text sent to next customer' },
  { icon: '📸', text: 'Completion photo received — uploaded to job ticket' },
  { icon: '🔀', text: 'Schedule auto-rebalanced — overrun adjusted next 2 slots' },
  { icon: '⏰', text: 'After-hours emergency caught — on-call dispatched' },
  { icon: '📅', text: 'New booking confirmed — slotted into open window' },
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
      subtitle="Live dispatch — techs, jobs, ETAs. Auto-updates."
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="6"
      heading="Schedule decisions"
      subtitle="Conflicts, OT asks, reschedule outreach. Approve to send."
      @approved="onApproved"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Schedule</h2>
        <p class="text-sm text-ink-muted">
          Live dispatch — who's where, what's done, what's still ahead today.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <SourceIndicator source="Tech mobile app + Google Calendar" :synced-at="new Date(Date.now() - 90 * 1000).toISOString()" />
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="chip"
            :class="view === 'today' ? 'chip-active' : ''"
            @click="view = 'today'"
          >Today</button>
          <button
            type="button"
            class="chip"
            :class="view === 'week' ? 'chip-active' : ''"
            @click="view = 'week'"
          >Week ahead</button>
        </div>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Jobs Today</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.today_total }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Done · In-Progress · Left</div>
        <div class="mt-1 text-2xl font-bold tabular-nums text-ink">
          <span class="text-ink-muted">{{ stats.today_complete }}</span> ·
          <span class="text-success">{{ stats.today_in_progress }}</span> ·
          <span class="text-brand">{{ stats.today_remaining }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Today's Revenue</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.today_revenue_cents) }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Week Pipeline</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.week_revenue_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.week_jobs }} jobs total</div>
      </div>
    </div>

    <!-- TODAY view: tech-row dispatch grid -->
    <section v-if="view === 'today'" class="card overflow-hidden">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Today's Board</span>
        <span class="text-xs text-ink-muted">{{ HOURS[0] }} AM – {{ HOURS[HOURS.length - 1] - 12 }} PM</span>
      </div>

      <!-- Time scale ruler -->
      <div class="relative ml-32 border-b border-divider mb-1.5 h-5">
        <div
          v-for="h in HOURS"
          :key="h"
          class="absolute -translate-x-1/2 text-[10px] text-ink-disabled tabular-nums"
          :style="{ left: ((h - HOURS[0]) / (HOURS[HOURS.length - 1] - HOURS[0] + 1)) * 100 + '%' }"
        >
          {{ h > 12 ? h - 12 : h }}{{ h >= 12 ? 'p' : 'a' }}
        </div>
      </div>

      <!-- One row per tech -->
      <div class="space-y-2">
        <div
          v-for="tid in techIds"
          :key="tid"
          class="flex items-stretch gap-3"
        >
          <!-- Tech label -->
          <div class="w-28 flex-shrink-0 flex items-center gap-2 pr-2">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: techMeta[tid].color }"></span>
            <div class="min-w-0">
              <div class="text-xs font-semibold text-ink truncate">{{ techMeta[tid].name }}</div>
              <div class="text-[10px] text-ink-disabled">{{ jobsForTech(tid).length }} jobs</div>
            </div>
          </div>

          <!-- Lane -->
          <div class="relative flex-1 h-12 rounded-md bg-surface-elevated/40 border border-divider/50">
            <!-- Hour gridlines -->
            <div
              v-for="h in HOURS"
              :key="h"
              class="absolute top-0 bottom-0 w-px bg-divider/40"
              :style="{ left: ((h - HOURS[0]) / (HOURS[HOURS.length - 1] - HOURS[0] + 1)) * 100 + '%' }"
            ></div>
            <!-- Job blocks -->
            <article
              v-for="j in jobsForTech(tid)"
              :key="j.id"
              class="absolute top-1 bottom-1 rounded px-1.5 py-0.5 overflow-hidden text-[10px] font-medium text-white shadow-sm cursor-pointer hover:ring-2 hover:ring-white/40 transition-all"
              :style="{ ...jobStyle(j), backgroundColor: statusColor(j.status), opacity: j.status === 'complete' ? 0.6 : 1 }"
              :title="`${j.customer} — ${j.job_type}`"
            >
              <div class="truncate leading-tight">{{ j.customer.split(' ')[0] }}</div>
              <div class="truncate leading-tight opacity-90 text-[9px]">{{ j.job_type }}</div>
            </article>
          </div>
        </div>
      </div>

      <!-- Status legend -->
      <div class="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-ink-muted">
        <div class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: statusColor('complete') }"></span>
          Done
        </div>
        <div class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: statusColor('on_site') }"></span>
          On site
        </div>
        <div class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: statusColor('en_route') }"></span>
          En route
        </div>
        <div class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: statusColor('scheduled') }"></span>
          Scheduled
        </div>
      </div>
    </section>

    <!-- TODAY view: detail list -->
    <section v-if="view === 'today'" class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Today's Jobs</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ todayJobs.length }} jobs</span>
      </div>
      <div class="divide-y divide-divider">
        <article
          v-for="j in todayJobs"
          :key="j.id"
          class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <!-- Time + status pill -->
          <div class="w-24 flex-shrink-0">
            <div class="text-sm font-semibold text-ink tabular-nums">{{ fmtTime(j.start) }}</div>
            <div class="text-[10px] text-ink-disabled">{{ fmtDuration(j.est_duration_min) }}</div>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
            :style="{ backgroundColor: statusColor(j.status) }"
          >{{ statusLabel(j.status) }}</span>

          <!-- Customer + job -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <div class="text-sm font-semibold text-ink">{{ j.customer }}</div>
              <span v-if="j.tag" class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{{ j.tag }}</span>
            </div>
            <div class="text-xs text-ink-muted">{{ j.job_type }}</div>
            <div class="text-[11px] text-ink-disabled mt-0.5">{{ j.address }} · {{ j.zip }}</div>
            <div v-if="j.note" class="text-[11px] italic text-ink-muted mt-0.5">📝 {{ j.note }}</div>
          </div>

          <!-- Tech -->
          <div v-if="j.assigned_tech_id" class="flex-shrink-0 flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: techMeta[j.assigned_tech_id].color }"></span>
            <span class="text-xs text-ink-muted">{{ techMeta[j.assigned_tech_id].name.split(' ')[0] }}</span>
          </div>

          <!-- Value -->
          <div class="w-24 text-right flex-shrink-0">
            <div class="text-sm font-semibold text-ink tabular-nums">{{ money(j.est_value_cents) }}</div>
          </div>
        </article>
      </div>
    </section>

    <!-- WEEK view: grouped by day -->
    <section v-if="view === 'week'" class="space-y-4">
      <div
        v-for="g in weekGroups"
        :key="g.dateLabel"
        class="card"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-ink">{{ g.dateLabel }}</h3>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ g.jobs.length }} jobs</span>
        </div>
        <div class="divide-y divide-divider">
          <article
            v-for="j in g.jobs"
            :key="j.id"
            class="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div class="w-20 flex-shrink-0 text-sm font-semibold text-ink tabular-nums">{{ fmtTime(j.start) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-sm font-medium text-ink">{{ j.customer }}</span>
                <span v-if="j.tag" class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{{ j.tag }}</span>
              </div>
              <div class="text-xs text-ink-muted">{{ j.job_type }} · {{ fmtDuration(j.est_duration_min) }}</div>
            </div>
            <div v-if="j.assigned_tech_id" class="flex items-center gap-1.5 flex-shrink-0">
              <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: techMeta[j.assigned_tech_id].color }"></span>
              <span class="text-xs text-ink-muted">{{ techMeta[j.assigned_tech_id].name.split(' ')[0] }}</span>
            </div>
            <div class="w-24 text-right flex-shrink-0 text-sm tabular-nums text-ink">{{ money(j.est_value_cents) }}</div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
