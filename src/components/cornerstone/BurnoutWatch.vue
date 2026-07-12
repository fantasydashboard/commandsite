<script setup lang="ts">
/**
 * Focal Point - Burnout Watch. Volunteers serving too often (more than twice
 * a month, often across several ministries) and still going. Catch them before
 * they burn out and drop. Real, from Planning Center volunteer check-ins.
 */
import { computed, ref } from 'vue'
import { focalPointBurnout as fb } from '@/lib/clients/focal-point/burnout'

const COLLAPSED = 12
const showAll = ref(false)
const visible = computed(() => (showAll.value ? fb.people : fb.people.slice(0, COLLAPSED)))

function areaText(areas: string[]): string {
  if (areas.length <= 2) return areas.join(', ')
  return `${areas.slice(0, 2).join(', ')} +${areas.length - 2} more`
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <span class="eyebrow">Burnout Watch</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ fb.flaggedPeople }} volunteers serving too often
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ fb.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      Of {{ fb.activeVolunteers }} active volunteers, {{ fb.flaggedPeople }} serve more than twice a month and {{ fb.highRisk }} are in the high-load zone. These route to each ministry leader in Monday's digest, so the person who knows them can give them a breather.
    </p>
  </section>

  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Highest serving load</span>
      <span class="text-[11px] text-ink-muted">most-at-risk first</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-divider text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="pb-2 font-medium">Person</th>
            <th class="pb-2 font-medium">Serves in</th>
            <th class="pb-2 font-medium">Load</th>
            <th class="pb-2 text-right font-medium">Risk</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visible" :key="p.name" class="border-b border-divider/60">
            <td class="py-2 font-medium text-ink">{{ p.name }}</td>
            <td class="py-2 text-ink-muted">{{ areaText(p.areas) }}</td>
            <td class="py-2 tabular-nums text-ink-muted">~{{ p.perMonth }}x / month</td>
            <td class="py-2 text-right">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                :class="p.tier === 'high' ? 'bg-danger/12 text-danger' : 'bg-warn/15 text-warn'"
              >{{ p.tier === 'high' ? 'High' : 'Watch' }}</span>
            </td>
          </tr>
          <tr v-if="!fb.people.length">
            <td colspan="4" class="py-4 text-center text-ink-muted">List loads from the local Planning Center pull.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="fb.people.length > COLLAPSED"
      class="mt-3 text-xs font-semibold text-brand hover:underline"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show fewer' : `Show all ${fb.flaggedPeople} at-risk volunteers` }}
    </button>
  </section>
</template>
