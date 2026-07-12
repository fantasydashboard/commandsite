<script setup lang="ts">
/**
 * Focal Point - real Drift Watch.
 * Families whose children stopped checking into Kids Point for 3+ Sundays
 * after attending regularly. Real signal from Planning Center Check-Ins.
 * Giving-lapse and group-absence signals connect once those PCO scopes
 * are enabled; attendance drift stands on its own until then.
 */
import { computed, ref } from 'vue'
import { focalPointDrift } from '@/lib/clients/focal-point/drift'

const COLLAPSED = 12
const showAll = ref(false)
const visibleFamilies = computed(() =>
  showAll.value ? focalPointDrift.families : focalPointDrift.families.slice(0, COLLAPSED),
)

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${d}`
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
      {{ focalPointDrift.flaggedFamilies }} families to reach out to
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ focalPointDrift.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      {{ focalPointDrift.onboardingExcluded }} first-time or occasional families are excluded (they belong in the welcome funnel, not here).
      Giving-lapse and group-absence signals connect once those Planning Center scopes are enabled.
    </p>
  </section>

  <!-- The full flagged list -->
  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Flagged families</span>
      <span class="text-[11px] text-ink-muted">most-established families first</span>
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
          <tr v-for="f in visibleFamilies" :key="f.family" class="border-b border-divider/60">
            <td class="py-2 font-medium text-ink">The {{ f.family }} family</td>
            <td class="py-2 text-ink-muted">{{ f.kids.join(', ') }}</td>
            <td class="py-2 text-ink-muted">~{{ f.monthsAttending }}mo · {{ f.totalSundays }} Sundays</td>
            <td class="py-2 text-ink-muted">{{ fmtDate(f.lastSeen) }}</td>
            <td class="py-2 text-right font-semibold" :class="f.sundaysMissed >= 5 ? 'text-danger' : 'text-warn'">
              {{ f.sundaysMissed }}
            </td>
          </tr>
          <tr v-if="!focalPointDrift.families.length">
            <td colspan="5" class="py-4 text-center text-ink-muted">
              Family list loads from the local Planning Center pull.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="focalPointDrift.families.length > COLLAPSED"
      class="mt-3 text-xs font-semibold text-brand hover:underline"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show fewer' : `Show all ${focalPointDrift.flaggedFamilies} flagged families` }}
    </button>
  </section>
</template>
