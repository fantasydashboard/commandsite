<script setup lang="ts">
/**
 * Focal Point - Guest pipeline board. The front-door mirror of the Care pipeline:
 * every first-time guest walked from first visit to belonging, with a "Cooled"
 * column for the ones who signed in once and stalled. Real guests from the two
 * Starting Point workflows, tagged by congregation, so it scopes by the lens.
 *
 * THREE LISTS, NOT ONE. Christina's breakdown of the 149 people on week 2 put
 * 42 inside a month and 107 waiting longer, 62 of them past four months, and she
 * separately found 9 people sitting there for months who were plainly active in
 * the church (a child checked in, a group joined). So the board shows the live
 * worklist (inside six weeks), then "already active, clear the card", then
 * "waiting on a decision". Same workflow, nothing moves in Planning Center; it
 * just stops reading as 149 people to chase.
 */
import { computed } from 'vue'
// Stage vocabulary from the tracked leaf. It used to come from
// focal-point/guestPipeline.ts, which is skip-worktree, so relabelling there
// would never have shipped.
import { GUEST_STAGES, normalizeStage, normalizeDetail, normalizeOwner } from '@/lib/clients/church/guestStages'
import { type GuestCase } from '@/lib/clients/focal-point/guestPipeline'
import { guestPipelineData } from '@/lib/clients/church/careDataLoader'
import { useCongregationLens } from '@/stores/congregationLens'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

const lens = useCongregationLens()
const props = defineProps<{ clientName: string }>()
const CAP = 6
/**
 * Triage fields from the live payload. Declared here rather than on the shared
 * GuestCase type because lib/clients/focal-point/guestPipeline.ts is
 * skip-worktree. A payload written before the transform carried them has
 * neither field, and reads as one working list with nobody active, which is
 * exactly what it showed before.
 */
type Triaged = GuestCase & {
  daysWaiting?: number
  bucket?: 'working' | 'decision' | 'clear'
  active?: { kind: 'kids' | 'group' | 'serving'; date: string; detail: string }
}
const inScope = (c: GuestCase) => lens.scope === 'all' || c.campus === lens.scope
const all = computed(() => (guestPipelineData().cases as Triaged[]).filter(inScope))
const isOpen = (c: Triaged) => normalizeStage(c.stage) !== 'finished'
// Everyone Planning Center recorded doing something, though nobody marked
// them returned. Clearing these is the church's call; Grace only points.
const alreadyActive = computed(() => all.value.filter((c) => isOpen(c) && c.active))
// Past six weeks with no return and no recorded activity.
const decision = computed(() => all.value.filter((c) => isOpen(c) && !c.active && (c.bucket === 'decision' || c.bucket === 'clear')))
const pastClear = computed(() => decision.value.filter((c) => c.bucket === 'clear').length)
// The board proper: the live worklist. Finished cards stay so the column reads.
const working = computed(() => all.value.filter((c) => !isOpen(c) || (!c.active && (c.bucket ?? 'working') === 'working')))
// normalizeStage so the board works whether or not the payload has been
// recomputed since the stage rename. See guestStages.ts.
const scoped = (stage: string) => working.value.filter((c) => normalizeStage(c.stage) === stage)
const casesFor = (stage: string) => scoped(stage).slice(0, CAP)
const moreIn = (stage: string) => Math.max(0, scoped(stage).length - CAP)
const kpis = computed(() => guestPipelineData().kpis[lens.scope])
const weeksOf = (c: Triaged) => Math.round((c.daysWaiting ?? 0) / 7)
const bucketOf = (c: Triaged) => (c.active ? 'already active' : c.bucket ?? 'working')

// The only export on this page that carries NAMES, so ExportButton is marked
// sensitive and gates it to full permission scope. Exports every guest in the
// current lens, not just the six per column the board renders, because a
// worklist you can only see the top of is not a worklist.
const allScoped = computed(() =>
  GUEST_STAGES.flatMap((s) => all.value.filter((c) => normalizeStage(c.stage) === s.key).map((c) => ({ ...c, stageLabel: s.label }))),
)
function onExport() {
  exportCsv(
    allScoped.value,
    [
      { header: 'Name', value: (c) => c.name },
      { header: 'Congregation', value: (c) => (c.campus === 'brazilian' ? 'Brazilian' : 'English') },
      { header: 'Stage', value: (c) => c.stageLabel },
      { header: 'Status', value: (c) => normalizeDetail(c.detail, c.campus) },
      { header: 'Owner', value: (c) => normalizeOwner(c.owner) },
      { header: 'First visit', value: (c) => c.age },
      { header: 'Days waiting', value: (c) => c.daysWaiting ?? '' },
      { header: 'List', value: (c) => bucketOf(c) },
      { header: 'Seen active', value: (c) => c.active?.detail ?? '' },
      { header: 'Awaiting approval', value: (c) => (c.draft ? 'yes' : 'no') },
    ],
    { client: props.clientName, dataset: 'guest-pipeline', scope: lens.scope },
  )
}

function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Guest pipeline</span>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
          Live from Planning Center
        </span>
        <ExportButton
          label="Download guest list"
          sensitive
          :count="allScoped.length"
          @export="onExport"
        />
      </div>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">Where every first-time guest is on the way to belonging</h3>

    <!-- Lifecycle strip, rendered FROM GUEST_STAGES. It used to be hardcoded to
         the old names, so after the rename it read New guest -> Welcomed ->
         Connecting -> Belongs directly above columns labelled Signed in ->
         Welcome call -> Week 2 -> Week 3 -> Finished. -->
    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      <template v-for="(s, i) in GUEST_STAGES" :key="s.key">
        <span v-if="i" class="text-ink-disabled">→</span>
        <span
          class="rounded px-2 py-0.5 font-medium"
          :class="s.positive ? 'bg-success/15 text-success' : 'bg-brand/12 text-brand'"
        >{{ s.label }}</span>
      </template>
      <span class="ml-1 text-ink-muted">These are your Starting Point steps. This is the front door. Care &amp; Drift is the back door.</span>
    </div>

    <p class="mt-2 text-[12px] text-ink">
      <span class="font-semibold">{{ kpis.stillVisitors }} of your {{ kpis.recentGuests }}</span> most recent guests have not finished Starting Point yet. The board is the ones inside six weeks; the two lists under it are the rest.
    </p>
  </section>

  <section class="card">
    <div class="overflow-x-auto">
      <div class="min-w-[820px]">
        <!-- stage headers -->
        <div class="grid grid-cols-5 gap-2 border-b border-divider pb-2">
          <div
            v-for="s in GUEST_STAGES"
            :key="s.key"
            class="px-1"
          >
            <div
              class="text-[10px] font-semibold uppercase tracking-wide"
              :class="s.positive ? 'text-success' : 'text-ink-muted'"
            >{{ s.label }} <span class="text-ink-disabled tabular-nums">{{ scoped(s.key).length }}</span></div>
            <div class="mt-0.5 text-[10px] leading-tight text-ink-disabled">{{ s.sub }}</div>
          </div>
        </div>

        <!-- cards -->
        <div class="grid grid-cols-5 gap-2 pt-2">
          <div
            v-for="s in GUEST_STAGES"
            :key="s.key"
            class="space-y-2 rounded-lg p-1"
            :class="s.positive ? 'bg-success/[0.04]' : ''"
          >
            <article
              v-for="c in casesFor(s.key)"
              :key="c.id"
              class="rounded-lg border border-divider bg-surface-raised p-2"
            >
              <div class="flex items-center gap-2">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{{ initials(c.name) }}</div>
                <div class="min-w-0">
                  <div class="truncate text-[12px] font-semibold leading-tight text-ink">{{ c.name }}</div>
                </div>
              </div>
              <p class="mt-1 text-[10px] leading-snug text-ink-muted">{{ normalizeDetail(c.detail, c.campus) }}</p>
              <p v-if="c.note" class="mt-1.5 text-[10px] leading-snug text-ink">{{ c.note }}</p>
              <div class="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-ink-disabled">
                <span class="truncate">{{ normalizeOwner(c.owner) }}</span>
                <span class="shrink-0">{{ c.age }}</span>
              </div>
            </article>

            <p v-if="moreIn(s.key)" class="px-1 py-1 text-[10px] text-ink-disabled">+{{ moreIn(s.key) }} more</p>
            <p v-else-if="!scoped(s.key).length" class="px-1 py-2 text-[10px] text-ink-disabled">
              {{ s.positive ? 'graduates to Insights' : 'clear' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <p class="mt-3 text-[11px] text-ink-disabled">
      Your real guests, on your own Starting Point steps. A card moves when someone at the church advances it in Planning Center, so these columns are your team's work, not Grace's. Grace cannot see an adult come back to a service, but she can see a child checked in, a group joined, or a serving shift; those cards go to the list below instead of sitting here. Guests who reach Finished join the New Member funnel on Insights.
    </p>
  </section>

  <!-- Already active: recorded somewhere in Planning Center, never marked
       returned. Christina's 9. -->
  <section v-if="alreadyActive.length" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Already active, clear the card</span>
      <span class="text-[11px] text-ink-muted">{{ alreadyActive.length }} {{ alreadyActive.length === 1 ? 'person' : 'people' }}</span>
    </div>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Still on a Starting Point step, but Planning Center has them doing something since: a child checked in, a group joined, a shift served. They did not stop coming; they stopped signing in at the table. Clear these in the workflow.
    </p>
    <ul class="mt-3 divide-y divide-divider border-t border-divider">
      <li v-for="c in alreadyActive" :key="c.id" class="flex flex-wrap items-center gap-3 py-2">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/12 text-[10px] font-bold text-success">{{ initials(c.name) }}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-semibold text-ink">{{ c.name }} <span class="ml-1 text-[10px] font-normal text-ink-disabled">{{ c.campus === 'brazilian' ? 'Brazilian' : 'English' }}</span></div>
          <div class="text-[11px] text-ink-muted">{{ c.active?.detail }} · on {{ GUEST_STAGES.find((s) => s.key === normalizeStage(c.stage))?.label }} for {{ weeksOf(c) }}w</div>
        </div>
      </li>
    </ul>
  </section>

  <!-- Waiting on a decision: past six weeks, nothing recorded. -->
  <section v-if="decision.length" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Waiting on a decision</span>
      <span class="text-[11px] text-ink-muted">{{ decision.length }} past six weeks<template v-if="pastClear"> · {{ pastClear }} past 90 days</template></span>
    </div>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      No return recorded and nothing else seen. Of everyone who has finished Starting Point since January 2025, 85% did it inside six weeks and nobody after six months. Reach out once, or clear the card; either is a decision, and leaving them here is not.
    </p>
    <ul class="mt-3 divide-y divide-divider border-t border-divider">
      <li v-for="c in decision" :key="c.id" class="flex flex-wrap items-center gap-3 py-2">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{{ initials(c.name) }}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-semibold text-ink">{{ c.name }} <span class="ml-1 text-[10px] font-normal text-ink-disabled">{{ c.campus === 'brazilian' ? 'Brazilian' : 'English' }}</span></div>
          <div class="text-[11px] text-ink-muted">{{ GUEST_STAGES.find((s) => s.key === normalizeStage(c.stage))?.label }} · first visit {{ weeksOf(c) }} weeks ago</div>
        </div>
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          :class="c.bucket === 'clear' ? 'bg-danger/12 text-danger' : 'bg-warn/15 text-warn'"
        >{{ c.bucket === 'clear' ? 'clear' : 'reach out or clear' }}</span>
      </li>
    </ul>
  </section>
</template>
