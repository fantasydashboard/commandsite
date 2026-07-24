<script setup lang="ts">
/**
 * Focal Point - Burnout Watch. Volunteers serving too often (more than twice
 * a month, often across several ministries) and still going. Catch them before
 * they burn out and drop. Real, from Planning Center volunteer check-ins.
 */
import { computed, ref } from 'vue'
import { burnoutData } from '@/lib/clients/church/careDataLoader'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { burnoutFlag } from '@/lib/clients/focal-point/flags'
import { duplicateInfo } from '@/lib/clients/focal-point/duplicates'
import DuplicateBadge from '@/components/cornerstone/DuplicateBadge.vue'

const care = useCareActions()
const lens = useCongregationLens()
const COLLAPSED = 12
const showAll = ref(false)
const dupOnly = ref(false)
// Serving scopes by CAMPUS (which teams a person serves): the Brazilian ministry
// runs its own teams. People who serve both campuses show in both views.
const inCampus = (c: string) => lens.scope === 'all' || c === 'both' || c === lens.scope
const fb = computed(() => burnoutData())
const active = computed(() => fb.value.people.filter((p) => !care.isHidden(`burnout:${p.name}`) && inCampus(p.campus)))
const highRiskShown = computed(() => active.value.filter((p) => p.tier === 'high').length)
const dups = computed(() => active.value.filter((p) => duplicateInfo(p.name)))
const visible = computed(() =>
  dupOnly.value ? dups.value : showAll.value ? active.value : active.value.slice(0, COLLAPSED),
)

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
      {{ active.length }} volunteers serving too often
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ fb.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      <template v-if="lens.scope === 'all'">Of {{ fb.activeVolunteers }} active volunteers, {{ active.length }} serve often and {{ highRiskShown }} are in the high-load zone.</template>
      <template v-else>In the {{ lens.scope }} ministry's teams, {{ active.length }} serve often and {{ highRiskShown }} are in the high-load zone.</template>
      These route to each ministry leader in Monday's digest, so the person who knows them can give them a breather.
    </p>
  </section>

  <section class="card">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Highest serving load</span>
        <button
          v-if="dups.length"
          class="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn transition-colors hover:bg-warn/25"
          :class="dupOnly ? 'ring-1 ring-warn/50' : ''"
          @click="dupOnly = !dupOnly"
        >
          <svg viewBox="0 0 16 16" class="h-2.5 w-2.5" fill="currentColor" aria-hidden="true"><path d="M8 1.5 15 14H1z" /></svg>
          {{ dups.length }} possible duplicate{{ dups.length > 1 ? 's' : '' }}
        </button>
      </div>
      <span class="text-[11px] text-ink-muted">{{ dupOnly ? 'possible duplicates only' : 'most-at-risk first' }}</span>
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
          <tr v-for="p in visible" :key="p.name" class="cursor-pointer border-b border-divider/60 transition-colors hover:bg-surface-elevated/50" @click="care.openDetail(burnoutFlag(p))">
            <td class="py-2 font-medium text-ink">{{ p.name }} <DuplicateBadge :name="p.name" /></td>
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
    <div class="mt-3 flex items-center justify-between">
      <button
        v-if="dupOnly"
        class="text-xs font-semibold text-brand hover:underline"
        @click="dupOnly = false"
      >
        Show all at-risk volunteers
      </button>
      <button
        v-else-if="active.length > COLLAPSED"
        class="text-xs font-semibold text-brand hover:underline"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${active.length} at-risk volunteers` }}
      </button>
      <span class="text-[11px] text-ink-disabled">Click a row to see why, or to dismiss / snooze.</span>
    </div>
  </section>
</template>
