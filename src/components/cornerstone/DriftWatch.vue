<script setup lang="ts">
/**
 * Focal Point - real Drift Watch.
 * Families whose children stopped checking into Kids Point for 3+ Sundays
 * after attending regularly. Real signal from Planning Center Check-Ins.
 * Giving-lapse and group-absence signals connect once those PCO scopes
 * are enabled; attendance drift stands on its own until then.
 */
import { computed, ref } from 'vue'
import { driftData } from '@/lib/clients/church/careDataLoader'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregation'
import { familyFlag } from '@/lib/clients/focal-point/flags'

const care = useCareActions()
const lens = useCongregationLens()
const COLLAPSED = 12
const showAll = ref(false)
const inScope = (family: string) => lens.scope === 'all' || congregationOf(family) === lens.scope
const props = defineProps<{ clientName: string }>()
const drift = computed(() => driftData())
// The live payload is already current against the latest check-ins, so no
// separate reconciliation pass is needed here (unlike the old static snapshot).
const activeFamilies = computed(() =>
  drift.value.families.filter((f) => !care.isHidden(`family:${f.family}`) && inScope(f.family)),
)
// No separate "returned" list in the live payload: a family drops off the
// active list on its own once check-ins put it back under the threshold.
const reconnected = computed(() => 0)
const visibleFamilies = computed(() =>
  showAll.value ? activeFamilies.value : activeFamilies.value.slice(0, COLLAPSED),
)
const unplaced = computed(() =>
  lens.scope === 'all'
    ? 0
    : drift.value.families.filter((f) => !care.isHidden(`family:${f.family}`) && congregationOf(f.family) === null).length,
)

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${d}`
}


// Names, so gated to full permission scope. Exports the whole flagged list in
// the current lens, not just the rows rendered, and carries the tenure figures
// the table shows so the file stands on its own away from the dashboard.
function onExport() {
  exportCsv(
    activeFamilies.value,
    [
      { header: 'Family', value: (f) => `The ${f.family} family` },
      { header: 'Kids at Kids Point', value: (f) => f.kids.join('; ') },
      { header: 'Months attending', value: (f) => f.monthsAttending },
      { header: 'Sundays attended', value: (f) => f.totalSundays },
      { header: 'Last checked in', value: (f) => f.lastSeen },
      { header: 'Sundays missed', value: (f) => f.sundaysMissed },
    ],
    { client: props.clientName, dataset: 'families-drifting', scope: lens.scope },
  )
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <span class="eyebrow">Drift Watch</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ activeFamilies.length }} families to reach out to
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ drift.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      {{ drift.onboardingExcluded }} first-time or occasional families are excluded (they belong in the welcome funnel, not here).
      Giving-lapse and group-absence signals connect once those Planning Center scopes are enabled.
    </p>
    <p v-if="unplaced" class="mt-1 text-[11px] text-warn">
      Showing the {{ lens.scope }} congregation. {{ unplaced }} {{ unplaced === 1 ? 'family has' : 'families have' }} no service on record to place them, hidden in this view.
    </p>
    <p v-if="reconnected" class="mt-1 inline-flex items-center gap-1.5 text-[11px] text-success">
      <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
      {{ reconnected }} {{ reconnected === 1 ? 'family' : 'families' }} checked back in on recent Sundays and cleared off this list overnight.
    </p>
  </section>

  <!-- The full flagged list -->
  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Flagged families</span>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-ink-muted">most-established families first</span>
        <ExportButton label="Download list" sensitive :count="activeFamilies.length" @export="onExport" />
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-divider text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="pb-2 font-medium">Family</th>
            <th class="pb-2 font-medium">Kids at Kids Point</th>
            <th class="pb-2 font-medium">Regular for</th>
            <th class="pb-2 font-medium">Last checked in</th>
            <th class="pb-2 text-right font-medium">Sundays missed</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="f in visibleFamilies"
            :key="f.family"
            class="cursor-pointer border-b border-divider/60 transition-colors hover:bg-surface-elevated/50"
            @click="care.openDetail(familyFlag(f))"
          >
            <td class="py-2 font-medium text-ink">The {{ f.family }} family</td>
            <td class="py-2 text-ink-muted">{{ f.kids.join(', ') }}</td>
            <td class="py-2 text-ink-muted">~{{ f.monthsAttending }}mo · {{ f.totalSundays }} Sundays</td>
            <td class="py-2 text-ink-muted">{{ fmtDate(f.lastSeen) }}</td>
            <td class="py-2 text-right font-semibold" :class="f.sundaysMissed >= 5 ? 'text-danger' : 'text-warn'">
              {{ f.sundaysMissed }}
            </td>
          </tr>
          <tr v-if="!drift.families.length">
            <td colspan="5" class="py-4 text-center text-ink-muted">
              Family list loads from the local Planning Center pull.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center justify-between">
      <button
        v-if="activeFamilies.length > COLLAPSED"
        class="text-xs font-semibold text-brand hover:underline"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${activeFamilies.length} flagged families` }}
      </button>
      <span class="text-[11px] text-ink-disabled">Click a row to see why, or to dismiss / snooze.</span>
    </div>
  </section>
</template>
