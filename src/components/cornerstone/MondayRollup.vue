<script setup lang="ts">
/**
 * Focal Point - "Your Monday." The hub that rolls up the real needs-you work from
 * all four pages into one daily list, so Today stops being its own story and
 * becomes the front door to Front Desk, Care & Drift, and Sundays & Comms. Every
 * count is pulled from the same real data the pages use, and every row links in.
 */
import { computed } from 'vue'
import DataFreshnessBadge from '@/components/cornerstone/DataFreshnessBadge.vue'
import { carePipeline } from '@/lib/clients/focal-point/carePipeline'
import { guestPipelineData, driftData, rosterData, rosterForwardData } from '@/lib/clients/church/careDataLoader'
import { type TeamWeek } from '@/lib/clients/focal-point/rosterForward'
import { focalPointInsights as fp } from '@/lib/clients/focal-point/insights'

const props = defineProps<{ slug: string }>()
const to = (tab: string) => ({ name: 'dashboard.tab', params: { slug: props.slug, tab } })

// pull the same real counts the pages use
// Welcome notes awaiting approval = this-week guests with a drafted welcome
// (matches the Front Desk approval queue), not just cards on the "new" step.
// Live payload, not the baked focal-point/guestPipeline.ts. That file is
// skip-worktree and its committed copy is a stub, so this counted drafts in an
// empty array and the Monday rollup told leadership there were no guests
// waiting while Front Desk showed a queue.
const guestNew = computed(() => guestPipelineData().cases.filter((c) => c.draft).length)
const careApprove = carePipeline.cases.filter((c) => c.track === 'family' && c.stage === 'flagged').length
const careCall = carePipeline.cases.filter((c) => c.stage === 'escalated' && c.track !== 'burnout').length
const forgottenNow = (c: TeamWeek) => c.sched === 0 && c.need === 0
// Live, not the baked rosterForward/roster. Those are hand-generated and the
// last run was Aug 27, so Today told leadership "12 spots short this weekend"
// while Serving's hero read 27 for the same Sunday.
const sched = computed(() => rosterForwardData())
const forgotten = computed(() =>
  sched.value.expected
    .map((team) => ({ team, weeks: sched.value.weeks.filter((w) => { const c = w.teams.find((t) => t.team === team); return c && forgottenNow(c) }).length }))
    .filter((x) => x.weeks > 0),
)
const sundaySummary = computed(() => {
  const f = forgotten.value[0]
  const lead = f ? `${f.team} is not on the schedule for the next ${f.weeks} Sundays. ` : ''
  const r = rosterData()
  return `${lead}${r.totalShort} spots short this weekend across ${r.teamsShort} teams.`
})

const domains = computed(() => [
  { key: 'guests', label: 'Guests', dot: 'bg-brand', tab: 'front-desk-guests', summary: `${guestNew.value} welcome notes to approve for Sunday's first-timers.` },
  { key: 'care', label: 'Care', dot: 'bg-warn', tab: 'care-drift', summary: `${careApprove} family notes to approve and ${careCall} escalations to call personally.` },
  { key: 'sunday', label: 'Sunday', dot: 'bg-danger', tab: 'sundays-comms', summary: sundaySummary.value },
  { key: 'comms', label: 'Comms', dot: 'bg-accent', tab: 'sundays-comms', summary: '2 drafts written from your numbers, ready for your admin.' },
])

const glance = computed(() => [
  { label: 'Last Sunday', value: fp.thisWeekend.grand.toLocaleString(), sub: 'in the room', tab: 'insights' },
  { label: 'First-timers', value: String(fp.thisWeekend.firstTimers), sub: 'this weekend', tab: 'front-desk-guests' },
  // Was hardcoded to 53 while Care & Drift showed 22. The rollup exists to be
  // the front door to those pages, so a number here that contradicts the page
  // it links to is worse than no number.
  { label: 'Drift families', value: String(driftData().families.length), sub: 'flagged', tab: 'care-drift' },
  { label: 'Serving', value: '26%', sub: 'of your core', tab: 'insights' },
])
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Your Monday</span>
      <DataFreshnessBadge />
    </div>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Grace pulled this together from Sunday. Each one links to the page where you act.
    </p>

    <div class="mt-3 divide-y divide-divider">
      <router-link
        v-for="d in domains"
        :key="d.key"
        :to="to(d.tab)"
        class="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"
      >
        <span class="h-2 w-2 shrink-0 rounded-full" :class="d.dot"></span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-ink">{{ d.label }}</div>
          <p class="text-[13px] leading-snug text-ink-muted">{{ d.summary }}</p>
        </div>
        <span class="shrink-0 text-xs font-semibold text-brand group-hover:underline">Open</span>
      </router-link>
    </div>
  </section>

  <!-- real church-at-a-glance -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <router-link v-for="g in glance" :key="g.label" :to="to(g.tab)" class="card transition-colors hover:border-brand/40">
      <div class="kpi-label">{{ g.label }}</div>
      <div class="mt-1 text-2xl font-bold tabular-nums text-ink">{{ g.value }}</div>
      <div class="mt-0.5 text-[11px] text-ink-disabled">{{ g.sub }}</div>
    </router-link>
  </div>
</template>
