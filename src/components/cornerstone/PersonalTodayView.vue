<script setup lang="ts">
/**
 * Focal Point - one staff member's Today. Filters the shared work (approval
 * drafts + care cases) down to what this person owns, so a staffer logging in
 * sees only their tasks. Ministry leaders act from the Monday email digest, not
 * a dashboard, so their view shows exactly what lands in their inbox. Respects
 * the congregation lens like every other surface.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { StaffView } from '@/lib/clients/focal-point/staff'
import { carePipeline, type CareCase } from '@/lib/clients/focal-point/carePipeline'
import { focalPointApproval } from '@/lib/clients/focal-point/today'
import { focalPointRoster } from '@/lib/clients/focal-point/roster'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregation'
import { careCaseFlag } from '@/lib/clients/focal-point/flags'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import LeaderDigestPreview from '@/components/cornerstone/LeaderDigestPreview.vue'
import DuplicatesTodayCard from '@/components/cornerstone/DuplicatesTodayCard.vue'
import FlagDetailDrawer from '@/components/cornerstone/FlagDetailDrawer.vue'

const props = defineProps<{ staff: StaffView; slug: string }>()
const router = useRouter()
const care = useCareActions()
const lens = useCongregationLens()

const ACTIONABLE = ['flagged', 'reaching', 'escalated']
const TRACK_LABEL: Record<string, string> = { family: 'Family drifting', serving: 'Stopped serving', burnout: 'Burnout risk', groups: 'Group drift' }
const TRACK_CLS: Record<string, string> = { family: 'bg-warn/15 text-warn', serving: 'bg-accent/15 text-accent', burnout: 'bg-danger/12 text-danger', groups: 'bg-brand/12 text-brand' }

const inScope = (c: CareCase) => lens.scope === 'all' || congregationOf(c.name) === lens.scope

const myApprovals = computed<ApprovalQueueItem[]>(() => {
  const roles = props.staff.approvalRoles ?? []
  return focalPointApproval.filter((i) => i.role && roles.includes(i.role))
})
const myCases = computed<CareCase[]>(() =>
  carePipeline.cases.filter(
    (c) =>
      props.staff.ownsCase?.(c.owner) &&
      ACTIONABLE.includes(c.stage) &&
      !care.isHidden(careCaseFlag(c).id) &&
      inScope(c),
  ),
)
const needCount = computed(() => myApprovals.value.length + myCases.value.length)

function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}
function toSundays() {
  router.push({ name: 'dashboard.tab', params: { slug: props.slug, tab: 'sundays-comms' } })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Personal header -->
    <section class="card flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand">{{ staff.initials }}</div>
        <div>
          <div class="flex items-baseline gap-2">
            <h2 class="text-lg font-semibold text-ink">{{ staff.name }}</h2>
            <span class="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{{ staff.role }}</span>
          </div>
          <p class="text-[12.5px] text-ink-muted">{{ staff.blurb }}</p>
        </div>
      </div>
      <div v-if="!staff.viaDigest" class="text-right">
        <div class="text-2xl font-bold tabular-nums" :class="needCount ? 'text-brand' : 'text-ink-muted'">{{ needCount }}</div>
        <div class="text-[11px] text-ink-muted">{{ needCount === 1 ? 'thing needs you' : 'things need you' }}</div>
      </div>
    </section>

    <!-- Ministry leaders: they act from the email digest, not a login -->
    <template v-if="staff.viaDigest">
      <div class="rounded-card border border-divider bg-surface-elevated px-4 py-3 text-[12.5px] leading-relaxed text-ink">
        Ministry and group leaders do not log in here. Every Monday Grace emails each leader their own team's list, serving lapses and burnout, so the person who knows them reaches out. This is what one leader receives.
      </div>
      <LeaderDigestPreview />
    </template>

    <template v-else>
      <!-- Their approval drafts -->
      <GraceApprovalQueue
        v-if="myApprovals.length"
        :items="myApprovals"
        :initial-resolved="0"
        heading="To approve and send"
        :subtitle="`Drafted in your voice. Co-sign to send, edit to revise, skip to resurface tomorrow.`"
      />

      <!-- Their care cases -->
      <section v-if="myCases.length" class="card">
        <span class="eyebrow">Your care list</span>
        <h3 class="mt-1 text-base font-semibold text-ink">{{ myCases.length }} {{ myCases.length === 1 ? 'person' : 'people' }} routed to you</h3>
        <ul class="mt-3 divide-y divide-divider/70">
          <li
            v-for="c in myCases"
            :key="c.id"
            class="flex cursor-pointer items-center gap-3 py-2 transition-colors hover:bg-surface-elevated/50"
            @click="care.openDetail(careCaseFlag(c))"
          >
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{{ initials(c.name) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="TRACK_CLS[c.track]">{{ TRACK_LABEL[c.track] }}</span>
                <span class="text-sm font-semibold text-ink">{{ c.name }}</span>
              </div>
              <div class="truncate text-[12px] text-ink-muted">{{ c.detail }}</div>
            </div>
            <span class="shrink-0 text-[11px] font-medium capitalize text-ink-muted">{{ c.stage === 'escalated' ? 'To call' : c.stage }}</span>
          </li>
        </ul>
        <p class="mt-2 text-[11px] text-ink-disabled">Click a person to see why Grace flagged them, or to dismiss / snooze.</p>
      </section>

      <!-- Christina: scheduling gaps + data cleanup -->
      <section v-if="staff.showSchedule" class="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="eyebrow">Sunday scheduling</span>
          <h3 class="mt-1 text-base font-semibold text-ink">
            {{ focalPointRoster.totalShort }} spots short across {{ focalPointRoster.teamsShort }} teams
          </h3>
          <p class="text-[12.5px] text-ink-muted">Grace has who to ask ready and steers clear of anyone near burnout.</p>
        </div>
        <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand" @click="toSundays">
          Open Serving
        </button>
      </section>
      <DuplicatesTodayCard v-if="staff.showDuplicates" :slug="slug" />

      <!-- Nothing for this person right now -->
      <section v-if="!needCount && !staff.showSchedule && !staff.showDuplicates" class="card text-center text-sm text-ink-muted">
        Nothing needs {{ staff.name }} right now. Grace will surface work here as it comes in.
      </section>
    </template>

    <FlagDetailDrawer />
  </div>
</template>
