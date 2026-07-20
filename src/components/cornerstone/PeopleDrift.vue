<script setup lang="ts">
/**
 * Focal Point - People Drift Watch (individual signals).
 * Serving / giving / groups are per-person signals: the check-in goes to the
 * individual, not the household (that's the family Drift Watch). Serving is
 * real now from volunteer check-ins; giving and groups light up once those
 * Planning Center scopes are enabled.
 */
import { computed, ref } from 'vue'
import { focalPointServing } from '@/lib/clients/focal-point/serving'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { servingFlag } from '@/lib/clients/focal-point/flags'
import { duplicateInfo } from '@/lib/clients/focal-point/duplicates'
import DuplicateBadge from '@/components/cornerstone/DuplicateBadge.vue'

const care = useCareActions()
const lens = useCongregationLens()
const COLLAPSED = 12
const showAll = ref(false)
const dupOnly = ref(false)
// Serving scopes by CAMPUS (which teams they served): the Brazilian ministry runs
// its own teams. People who served both campuses show in both views.
const inCampus = (c: string) => lens.scope === 'all' || c === 'both' || c === lens.scope
const active = computed(() =>
  focalPointServing.people.filter((p) => !care.isHidden(`serving:${p.name}`) && inCampus(p.campus)),
)
const dups = computed(() => active.value.filter((p) => duplicateInfo(p.name)))
const visible = computed(() =>
  dupOnly.value ? dups.value : showAll.value ? active.value : active.value.slice(0, COLLAPSED),
)

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${d}`
}
const servingTone = (weeks: number) =>
  weeks >= 9 ? 'bg-danger/12 text-danger' : 'bg-warn/15 text-warn'
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <span class="eyebrow">People Drift Watch</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Serving live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ active.length }} people to check in with
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ focalPointServing.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      These route to the ministry leader, not the person: Grace emails each leader their team's list every Monday, so the person who knows them reaches out. Scoped by the teams they served, so the lens shows the {{ lens.scope === 'all' ? 'whole church' : lens.scope + ' ministry' }}.
    </p>
  </section>

  <section class="card">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Flagged individuals</span>
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
      <span class="text-[11px] text-ink-muted">{{ dupOnly ? 'possible duplicates only' : 'longest-serving first' }}</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-divider text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="pb-2 font-medium">Person</th>
            <th class="pb-2 font-medium">Serves in</th>
            <th class="pb-2 font-medium">Signals</th>
            <th class="pb-2 font-medium">Served</th>
            <th class="pb-2 text-right font-medium">Last served</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visible" :key="p.name" class="cursor-pointer border-b border-divider/60 transition-colors hover:bg-surface-elevated/50" @click="care.openDetail(servingFlag(p))">
            <td class="py-2 font-medium text-ink">{{ p.name }} <DuplicateBadge :name="p.name" /></td>
            <td class="py-2 text-ink-muted">{{ p.area.trim() }}</td>
            <td class="py-2">
              <div class="flex flex-wrap gap-1">
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold" :class="servingTone(p.weeksSince)">Serving</span>
                <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">Giving</span>
                <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">Groups</span>
              </div>
            </td>
            <td class="py-2 text-ink-muted">{{ p.totalServed }}x · ~{{ p.monthsServing }}mo</td>
            <td class="py-2 text-right">
              <span class="text-ink-muted">{{ fmtDate(p.lastServed) }}</span>
              <span class="ml-1 font-semibold" :class="p.weeksSince >= 9 ? 'text-danger' : 'text-warn'">{{ p.weeksSince }}w</span>
            </td>
          </tr>
          <tr v-if="!focalPointServing.people.length">
            <td colspan="5" class="py-4 text-center text-ink-muted">Individual list loads from the local Planning Center pull.</td>
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
        Show all flagged people
      </button>
      <button
        v-else-if="active.length > COLLAPSED"
        class="text-xs font-semibold text-brand hover:underline"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${active.length} flagged people` }}
      </button>
      <span class="text-[11px] text-ink-disabled">Click a row to see why, or to dismiss / snooze.</span>
    </div>
    <p class="mt-3 text-[11px] text-ink-muted">
      The dim <span class="font-medium">Giving</span> and <span class="font-medium">Groups</span> flags light up once those Planning Center scopes are connected.
    </p>
  </section>
</template>
