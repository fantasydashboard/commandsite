<script setup lang="ts">
/**
 * Focal Point - "Drifted a long time" review (Care & Drift).
 *
 * Families past the working window (LONG_DRIFTED_SUNDAYS). Two jobs:
 *
 * 1. Keep the weekly board honest. Family drift had no upper bound, so a family
 *    four Sundays out and one forty Sundays out sat in the same lane looking
 *    equally actionable. They are not. Moving the long-gone here leaves the
 *    board as a list someone can actually finish.
 *
 * 2. Not lose them. The alternative to a cluttered board is usually a silent
 *    cutoff, which is worse: these are real families who quietly stopped coming
 *    and nobody decided anything about them. This is a decide-what-to-do list,
 *    not a this-week list.
 *
 * The bucket bars are the drift curve. They exist because time-since-last-seen
 * is the single most useful thing to know about this group and a flat directory
 * hides it completely.
 *
 * TENURE IS THE OTHER HALF. A family that attended for two years before going
 * quiet is a different pastoral event from one that came a handful of times, so
 * "was established" is called out per row and summarised up top. That distinction
 * is invisible in every other view on this page.
 */
import { computed } from 'vue'
import {
  longDriftedFamilies,
  LONG_DRIFT_BUCKETS,
  LONG_DRIFTED_SUNDAYS,
  type LongDriftedFamily,
} from '@/lib/clients/focal-point/familyPipeline'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

const props = defineProps<{ clientName: string }>()

const care = useCareActions()
const lens = useCongregationLens()

const inScope = (family: string) =>
  lens.scope === 'all' || congregationOf(family) === lens.scope

const families = computed<LongDriftedFamily[]>(() =>
  longDriftedFamilies().filter((f) => inScope(f.family) && !care.isHidden(f.key)),
)

const established = computed(() => families.value.filter((f) => f.established))

const buckets = computed(() => {
  const rows = families.value
  const counts = LONG_DRIFT_BUCKETS.map((b) => ({
    label: b.label,
    count: rows.filter((f) => f.sundaysMissed >= b.min && f.sundaysMissed <= b.max).length,
  }))
  const max = Math.max(1, ...counts.map((c) => c.count))
  return counts.map((c) => ({ ...c, pctOfMax: Math.round((c.count / max) * 100) }))
})

// Below this the bar chart says nothing a sentence does not; see the template.
const CHART_MIN = 10

// Show a workable slice; the rest are in the export rather than an endless scroll.
const CAP = 12
const visible = computed(() => families.value.slice(0, CAP))
const hiddenCount = computed(() => Math.max(0, families.value.length - CAP))

// Match the date style used everywhere else on the page ("Jul 19"), not raw ISO.
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const thisYear = new Date().getUTCFullYear()
  return y === thisYear ? `${MON[m - 1]} ${d}` : `${MON[m - 1]} ${d}, ${y}`
}

function months(f: LongDriftedFamily): string {
  const m = Math.round(f.sundaysMissed / 4.345)
  return m >= 12 ? `${(m / 12).toFixed(m % 12 === 0 ? 0 : 1)} yr` : `${m} mo`
}

function onExport() {
  exportCsv(
    families.value,
    [
      { header: 'Family', value: (f) => f.family },
      { header: 'Children', value: (f) => f.kids.join('; ') },
      { header: 'Last seen', value: (f) => f.lastSeen },
      { header: 'Sundays missed', value: (f) => f.sundaysMissed },
      { header: 'Months attending before', value: (f) => f.monthsAttending },
      { header: 'Sundays attended before', value: (f) => f.totalSundays },
      { header: 'Was established', value: (f) => (f.established ? 'yes' : 'no') },
    ],
    { client: props.clientName, dataset: 'long-drifted-families', scope: lens.scope },
  )
}
</script>

<template>
  <section v-if="families.length" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Drifted a long time</span>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-ink-muted">Off the weekly board</span>
        <ExportButton label="Download list" sensitive :count="families.length" @export="onExport" />
      </div>
    </div>

    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ families.length }} families who came for a while, then faded
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      These are past the {{ LONG_DRIFTED_SUNDAYS }}-Sunday mark, so they sit here rather than in
      this week's queue. Not because they stopped mattering, but because a
      "we missed you the last few Sundays" note lands wrong after this long.
      This is a decide-what-to-do list.
    </p>

    <!-- The drift curve, but only once there is enough to see a shape. At four
         families the bars were two identical full-width blocks and an empty one,
         which is decoration rather than information: with max=2 every non-zero
         bucket renders at 100%. Below the threshold the sentence above already
         says everything the chart would. -->
    <div v-if="families.length >= CHART_MIN" class="mt-5 space-y-2">
      <div v-for="b in buckets" :key="b.label" class="flex items-center gap-3">
        <span class="w-28 shrink-0 text-[11px] text-ink-muted">{{ b.label }}</span>
        <div class="h-2.5 w-full max-w-[22rem] overflow-hidden rounded-full bg-surface-elevated">
          <div
            class="h-full rounded-full bg-warn transition-[width] duration-500 ease-out"
            :style="{ width: Math.max(b.count ? 2 : 0, b.pctOfMax) + '%' }"
          ></div>
        </div>
        <span class="shrink-0 text-xs font-semibold tabular-nums text-ink">{{ b.count }}</span>
      </div>
    </div>

    <div
      v-if="established.length"
      class="mt-5 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3"
    >
      <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
      <p class="mt-1 text-[13px] leading-relaxed text-ink">
        <span class="font-semibold">{{ established.length }}</span> of these were established
        families, regular for months before they went quiet, not visitors who tried you once.
        Those are worth a different conversation from the rest of this list: not a check-in note,
        but a real call from someone who knew them.
      </p>
    </div>

    <ul class="mt-5 divide-y divide-divider border-t border-divider">
      <li v-for="f in visible" :key="f.key" class="flex flex-wrap items-center gap-3 py-2.5">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-ink">The {{ f.family }} family</span>
            <span
              v-if="f.established"
              class="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand"
            >Was established</span>
          </div>
          <div class="text-[11px] text-ink-muted">
            Last seen {{ shortDate(f.lastSeen) }} · gone {{ months(f) }} ({{ f.sundaysMissed }} Sundays) ·
            came {{ f.totalSundays }} Sundays over {{ f.monthsAttending }} months
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            class="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-brand hover:text-brand"
            @click="care.snooze(f.key, 12)"
          >Snooze 3 mo</button>
          <button
            type="button"
            class="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-danger hover:text-danger"
            @click="care.dismiss(f.key, 'Moved on / no longer attending')"
          >Moved on</button>
        </div>
      </li>
    </ul>

    <p v-if="hiddenCount" class="mt-3 text-[11px] text-ink-disabled">
      {{ hiddenCount }} more in the download. The list shows the longest-gone first.
    </p>
    <p class="mt-2 text-[11px] leading-relaxed text-ink-disabled">
      Nobody is removed by being here: this list and the board together are always every
      flagged family. Snooze and "moved on" are saved in this browser only for now, so they
      will not follow you to another device until case state moves server-side.
    </p>
  </section>
</template>
