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

const COLLAPSED = 12
const showAll = ref(false)
const visible = computed(() =>
  showAll.value ? focalPointServing.people : focalPointServing.people.slice(0, COLLAPSED),
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
      {{ focalPointServing.flaggedPeople }} people to check in with
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ focalPointServing.signal }}</p>
    <p class="mt-1 text-[11px] text-ink-muted">
      Serving is live now. Giving and group-attendance signals light up once those Planning Center scopes are enabled.
    </p>
  </section>

  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Flagged individuals</span>
      <span class="text-[11px] text-ink-muted">longest-serving first</span>
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
          <tr v-for="p in visible" :key="p.name" class="border-b border-divider/60">
            <td class="py-2 font-medium text-ink">{{ p.name }}</td>
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
    <button
      v-if="focalPointServing.people.length > COLLAPSED"
      class="mt-3 text-xs font-semibold text-brand hover:underline"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show fewer' : `Show all ${focalPointServing.flaggedPeople} flagged people` }}
    </button>
    <p class="mt-3 text-[11px] text-ink-muted">
      The dim <span class="font-medium">Giving</span> and <span class="font-medium">Groups</span> flags light up once those Planning Center scopes are connected.
    </p>
  </section>
</template>
