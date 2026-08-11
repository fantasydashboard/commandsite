<script setup lang="ts">
/**
 * Focal Point - "How the load is spread" (Serving).
 *
 * The cheat code for this page. Every church leader suspects a handful of people
 * carry most of the serving; almost none can prove it, because the roster shows
 * who is on this Sunday, never how often the same names recur.
 *
 * Live from the burnout payload: `activeVolunteers` is everyone who served in
 * the season, and `people` is those already past the load threshold, each with
 * `perMonth` and the teams they are on.
 *
 * HONEST LIMIT, stated in the UI: the payload carries the flagged volunteers in
 * full but only a COUNT for everyone else, so this cannot claim "12 people do
 * 60% of all serving". It shows the distribution among those carrying the most,
 * and what share of the volunteer base they are. That is still the argument, and
 * it is one the roster cannot make.
 *
 * The bars are shifts-per-month buckets rather than a per-person list: the list
 * already exists directly below in Burnout Watch, and repeating it as a chart
 * would just be a fourth view of the same names.
 */
import { computed } from 'vue'
import { burnoutData } from '@/lib/clients/church/careDataLoader'
import { useCongregationLens } from '@/stores/congregationLens'
import { useCareActions } from '@/stores/careActions'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'
import { heavyLoad, spreadThin, HEAVY_PER_MONTH } from '@/lib/clients/church/burnoutSplit'

const props = defineProps<{ clientName: string }>()

const lens = useCongregationLens()
const care = useCareActions()

// Below this the buckets are noise; the list below says it better.
const MIN_PEOPLE = 6

const inCampus = (c: string) => lens.scope === 'all' || c === 'both' || c === lens.scope

const payload = computed(() => burnoutData())
const people = computed(() =>
  payload.value.people.filter((p) => !care.isHidden(`burnout:${p.name}`) && inCampus(p.campus)),
)

const activeVolunteers = computed(() => payload.value.activeVolunteers ?? 0)

// The headline counts the people actually carrying frequency. The rest of the
// flagged set is on 2+ teams at one or two shifts a month, which is a much
// softer signal and was inflating this number roughly threefold.
const heavy = computed(() => heavyLoad(people.value))
const spread = computed(() => spreadThin(people.value))

// Share of the volunteer base carrying a heavy load. Only meaningful at 'all'
// scope: activeVolunteers is a church-wide count with no campus breakdown, so
// dividing a campus-filtered numerator by it would overstate every time.
const heavyShare = computed(() => {
  if (lens.scope !== 'all' || !activeVolunteers.value) return null
  return Math.round((heavy.value.length / activeVolunteers.value) * 100)
})

const BUCKETS = [
  // Flagged for BREADTH rather than frequency: computeBurnout includes anyone on
  // 2+ teams even at one or two shifts. Omitting them made the bars sum to a
  // third of the headline count.
  { label: '1-2x/month', min: 0, max: 2 },
  { label: '3x/month', min: 3, max: 3 },
  { label: '4x/month', min: 4, max: 4 },
  { label: '5x/month', min: 5, max: 5 },
  { label: '6x+/month', min: 6, max: Number.MAX_SAFE_INTEGER },
]

const buckets = computed(() => {
  const rows = BUCKETS.map((b) => ({
    label: b.label,
    count: people.value.filter((p) => p.perMonth >= b.min && p.perMonth <= b.max).length,
  }))
  const max = Math.max(1, ...rows.map((r) => r.count))
  return rows.map((r) => ({ ...r, pctOfMax: Math.round((r.count / max) * 100) }))
})

// Multi-team is the other half of the load story: four shifts on one team is a
// rhythm, four shifts across four teams is four sets of expectations.
const multiTeam = computed(() => people.value.filter((p) => p.areas.length >= 3).length)
const busiest = computed(() => [...people.value].sort((a, b) => b.perMonth - a.perMonth)[0] ?? null)

function onExport() {
  exportCsv(
    [...people.value].sort((a, b) => b.perMonth - a.perMonth || b.areas.length - a.areas.length),
    [
      { header: 'Name', value: (p) => p.name },
      { header: 'Shifts per month', value: (p) => p.perMonth },
      { header: 'Teams', value: (p) => p.areas.join('; ') },
      { header: 'Team count', value: (p) => p.areas.length },
      { header: 'Risk', value: (p) => p.tier },
      { header: 'Campus', value: (p) => p.campus },
    ],
    { client: props.clientName, dataset: 'serving-load', scope: lens.scope },
  )
}
</script>

<template>
  <section v-if="people.length >= MIN_PEOPLE" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">How the load is spread</span>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
          Live from Planning Center
        </span>
        <ExportButton label="Download list" sensitive :count="people.length" @export="onExport" />
      </div>
    </div>

    <h3 class="mt-1 text-base font-semibold text-ink">
      <template v-if="heavyShare !== null">
        {{ heavy.length }} of your {{ activeVolunteers }} volunteers are carrying the heavy weeks
      </template>
      <template v-else>{{ heavy.length }} volunteers are carrying the heavy weeks</template>
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      The roster shows who is on this Sunday. It never shows how often the same names come
      back around, which is the thing that actually costs you volunteers.
    </p>

    <div class="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div class="space-y-2">
        <div v-for="b in buckets" :key="b.label" class="flex items-center gap-3">
          <span class="w-24 shrink-0 text-[11px] text-ink-muted">{{ b.label }}</span>
          <div class="h-2.5 w-full max-w-[22rem] overflow-hidden rounded-full bg-surface-elevated">
            <div
              class="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
              :style="{ width: Math.max(b.count ? 2 : 0, b.pctOfMax) + '%' }"
            ></div>
          </div>
          <span class="shrink-0 text-xs font-semibold tabular-nums text-ink">{{ b.count }}</span>
        </div>
        <p class="pt-1 text-[11px] text-ink-disabled">
          Shifts per month, this season. The 1-2x row is people flagged for serving on
          several teams rather than for frequency.
        </p>
      </div>

      <div class="space-y-3 text-[12px] leading-relaxed">
        <div v-if="heavyShare !== null" class="rounded-lg border border-brand/20 bg-surface-elevated/60 px-3 py-2.5">
          <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
          <p class="mt-1 text-ink">
            That is <span class="font-semibold">{{ heavyShare }}%</span> of everyone who serves,
            at {{ HEAVY_PER_MONTH }}+ shifts a month, absorbing the weeks nobody else covers.
            Check this list before you add anyone to a rota.
          </p>
        </div>
        <div v-if="multiTeam" class="rounded-lg border border-divider px-3 py-2.5">
          <p class="text-ink-muted">
            <span class="font-semibold text-ink">{{ multiTeam }}</span> serve on three or more
            teams. Four shifts on one team is a rhythm; four shifts across four teams is four
            sets of expectations.
            <template v-if="spread.length">
              <span class="font-semibold text-ink">{{ spread.length }}</span> of those are spread
              that wide while only serving once or twice a month, which is a softer signal than
              the heavy-load group above.
            </template>
          </p>
        </div>
        <p v-if="busiest" class="text-[11px] text-ink-disabled">
          Heaviest right now: {{ busiest.name }}, {{ busiest.perMonth }}x/month across
          {{ busiest.areas.length }} {{ busiest.areas.length === 1 ? 'team' : 'teams' }}.
        </p>
      </div>
    </div>

    <p class="mt-4 text-[11px] leading-relaxed text-ink-disabled">
      Bars cover everyone the burnout rule flags, which includes people on two teams at one
      or two shifts a month. The headline deliberately counts only the {{ HEAVY_PER_MONTH }}+
      a month group, because "serving too often" is not true of the rest. Volunteers below the
      flag are in the {{ activeVolunteers }} total but not broken out, so this shows where the
      weight sits rather than a full share-of-all-shifts figure.
    </p>
  </section>
</template>
