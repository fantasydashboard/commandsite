<script setup lang="ts">
/**
 * Focal Point - "Who to ask to serve" (Serving).
 *
 * The answer to the question the rest of this page only ever raises. Every
 * other section says a team is short; none of them says who to call, and that
 * is the actual work.
 *
 * Ranked by the two signals that predict a yes:
 *   Tier 1  in a Growth Group AND dropping kids off   they are already here, weekly, and connected
 *   Tier 2  in a Growth Group
 *   Tier 3  dropping kids off
 * Within a tier, more Sundays present ranks higher.
 *
 * TIER 1 IS THE ONLY ONE SHOWN BY NAME, on purpose. It is 43 people, each with a
 * counted number of Sundays behind them, so every row is defensible. Tier 2 is
 * 568 people whose only signal is group membership, with no attendance measure
 * at all: showing that by name would be a directory, not a worklist, and would
 * repeat exactly the mistake the guest and care windows just fixed. Its size is
 * reported, and it is in the export.
 *
 * Everyone here is already excluded from serving, and the same over-serving rule
 * the burnout signal uses is applied upstream, so a name suggested here can
 * never also be a name the church is being told to protect.
 */
import { computed, ref } from 'vue'
import type { ServeCandidate } from '@/lib/clients/focal-point/serveCandidates'
import { serveCandidatesData } from '@/lib/clients/church/careDataLoader'
import { exportCsv } from '@/lib/exportCsv'
import { useCongregationLens } from '@/stores/congregationLens'
import { useCareActions } from '@/stores/careActions'
import { askFlag, flagId } from '@/lib/clients/focal-point/flags'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

const props = defineProps<{ clientName: string }>()

const SHOWN = 8
const showAll = ref(false)

// Live row when present, baked (anonymised in git) otherwise.
const d = computed(() => serveCandidatesData())

// This panel ignored the congregation lens entirely, so picking "English" left
// it recommending people whose only listed connection was "FPC Brasil -
// Reginaldo & Jane" or "Juan Pablo & Jackie's Spanish Group", under a header
// that says "Showing the english congregation".
const lens = useCongregationLens()
const inScope = (p: ServeCandidate) => lens.scope === 'all' || congregationOf(p.name) === lens.scope
// Same hide as every other list: staff, or anyone the church already knows not
// to ask, come off here for the whole team and can be put back in Settings.
const care = useCareActions()
const hiddenFrom = (p: ServeCandidate) => care.isHidden(flagId('ask', p.name))
const tier1 = computed(() => d.value.people.filter((p) => p.tier === 1 && inScope(p) && !hiddenFrom(p)))
const hiddenTier1 = computed(() => d.value.people.filter((p) => p.tier === 1 && hiddenFrom(p)).length)
// Church-wide when unscoped; otherwise the list's own length, because the
// payload's totals cannot be split by congregation. Hidden people come off the
// church-wide total too, or the headline and the rows disagree by exactly the
// people you just removed.
const tier1Count = computed(() =>
  lens.scope === 'all' ? Math.max(0, d.value.totals.tier1 - hiddenTier1.value) : tier1.value.length,
)
/**
 * People the lens could not place at all.
 *
 * congregationOf returns null for anyone missing from the congregation map,
 * and every caller treats null as "All scope only". So a scoped view silently
 * mixes two populations it excluded for completely different reasons: people
 * who belong to the other congregation, and people we simply have no record
 * for. Going 46 to 17 looked like a clean filter and was partly a data gap.
 */
const unplaced = computed(() =>
  lens.scope === 'all' ? 0 : d.value.people.filter((p) => p.tier === 1 && congregationOf(p.name) === null).length,
)

/** How many of a tier we actually hold names for. The wider pools are counts,
 *  not rows, so "In the download" was promising 540 people in a file with 166. */
const namedIn = (tier: number) => d.value.people.filter((p) => p.tier === tier).length
const visible = computed(() => (showAll.value ? tier1.value : tier1.value.slice(0, SHOWN)))

const ageDays = computed(() => {
  const t = Date.parse(`${d.value.generated}T00:00:00Z`)
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((Date.now() - t) / 864e5))
})

function groupText(c: ServeCandidate): string {
  if (!c.groups.length) return ''
  return c.groups.length === 1 ? c.groups[0] : `${c.groups[0]} +${c.groups.length - 1} more`
}

function onExport() {
  exportCsv(
    d.value.people.filter((p) => !hiddenFrom(p)),
    [
      { header: 'Name', value: (c) => c.name },
      { header: 'Tier', value: (c) => c.tier },
      {
        header: 'Why',
        value: (c) => (c.tier === 1 ? 'In a group and drops kids off' : c.tier === 2 ? 'In a group' : 'Drops kids off'),
      },
      { header: 'Sundays present', value: (c) => c.sundays },
      { header: 'Groups', value: (c) => c.groups.join('; ') },
    ],
    { client: props.clientName, dataset: 'who-to-ask-to-serve' },
  )
}
</script>

<template>
  <section class="card border-2 border-brand/40 bg-brand/[0.03]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Who to ask</span>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-ink-muted">
          Last {{ d.windowDays }} days<template v-if="ageDays > 7"> · pulled {{ ageDays }} days ago</template>
        </span>
        <ExportButton label="Download all" sensitive :count="d.people.length" @export="onExport" />
      </div>
    </div>

    <h3 class="mt-1 text-lg font-bold text-ink">
      {{ tier1Count }} people who are here every week and not serving
    </h3>
    <p v-if="unplaced" class="mt-1 text-[11px] text-warn">
      {{ unplaced }} more are not shown because we have no congregation on file for them, not because
      they are in the other one. They are in the All view.
    </p>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      In a Growth Group <span class="font-semibold text-ink">and</span> dropping kids off, so they are
      already connected and already in the building on a Sunday. Nobody here serves on any team
      right now, and anyone already at high load has been filtered out.
    </p>

    <ul class="mt-4 divide-y divide-divider border-t border-divider">
      <li
        v-for="c in visible"
        :key="c.name"
        class="flex cursor-pointer flex-wrap items-center gap-3 rounded-md py-2.5 transition-colors hover:bg-surface-elevated/50"
        @click="care.openDetail(askFlag(c))"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
          {{ c.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-ink">{{ c.name }}</div>
          <div class="truncate text-[11px] text-ink-muted">{{ groupText(c) }}</div>
        </div>
        <span class="shrink-0 rounded-full bg-success/12 px-2.5 py-0.5 text-[11px] font-semibold text-success">
          {{ c.sundays }} Sundays here
        </span>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <button
        v-if="tier1.length > SHOWN"
        type="button"
        class="text-xs font-semibold text-brand hover:underline"
        @click="showAll = !showAll"
      >{{ showAll ? 'Show fewer' : `Show all ${tier1.length}` }}</button>
      <span v-else></span>
      <span class="text-[11px] text-ink-disabled">
        Click a name to see why, or to take them off this list.
        <template v-if="hiddenTier1"> {{ hiddenTier1 }} removed; put them back in Settings.</template>
      </span>
    </div>

    <!-- The wider pools, by count only. Naming 568 people whose only signal is
         "is in a group" would be a directory, not a list anyone can work. -->
    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-divider bg-surface px-3 py-2.5">
        <div class="text-sm font-semibold text-ink">{{ d.totals.tier2 }} more in a Growth Group<template v-if="lens.scope !== 'all'">, church-wide</template></div>
        <p class="mt-0.5 text-[11px] text-ink-muted">
          Connected, but we have no attendance record for them, so they are not ranked.
          {{ namedIn(2) }} of them are named in the download.
        </p>
      </div>
      <div class="rounded-lg border border-divider bg-surface px-3 py-2.5">
        <div class="text-sm font-semibold text-ink">{{ d.totals.tier3 }} more dropping kids off<template v-if="lens.scope !== 'all'">, church-wide</template></div>
        <p class="mt-0.5 text-[11px] text-ink-muted">
          Here on Sundays but not in a group yet. A group invite may land better than a serving ask.
        </p>
      </div>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-ink-disabled">
      {{ d.totals.all }} people in total are connected to the church and serving on nothing, church-wide. Sundays
      counted are recorded kids drop-offs, so someone who attends without children will undercount
      here. Adult service attendance is not tracked in Planning Center, which is the one gap in this.
    </p>
  </section>
</template>
