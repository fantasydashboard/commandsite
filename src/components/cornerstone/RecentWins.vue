<script setup lang="ts">
/**
 * Focal Point - "came back this week" wins. The other side of Care & Drift: the
 * families who returned to Sunday and the volunteers who started serving again
 * since they were flagged. These cleared off the drift lists on the last refresh;
 * this surface makes that visible so the pastor sees the good news, not just the
 * to-do list. Real, from the same reconciliation (driftLive + servingLive).
 */
import { computed } from 'vue'
import { returnedFamilies } from '@/lib/clients/focal-point/driftLive'
import { servingResumers } from '@/lib/clients/focal-point/servingLive'
import { congregationOf } from '@/lib/clients/focal-point/congregation'
import { useCongregationLens } from '@/stores/congregationLens'

const lens = useCongregationLens()
const inScope = (name: string) => lens.scope === 'all' || congregationOf(name) === lens.scope

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}

interface Win { key: string; name: string; kind: 'family' | 'serving'; detail: string; date: string }
const wins = computed<Win[]>(() => {
  const fam: Win[] = returnedFamilies()
    .filter((f) => inScope(f.family))
    .map((f) => ({
      key: `f-${f.family}`,
      name: `The ${f.family} family`,
      kind: 'family',
      detail: 'kids checked back in at Kids Point',
      date: f.lastSeen,
    }))
  const serve: Win[] = servingResumers()
    .filter((r) => inScope(r.name))
    .map((r) => ({
      key: `s-${r.name}`,
      name: r.name,
      kind: 'serving',
      detail: `serving again in ${r.area}`,
      date: r.resumedOn,
    }))
  return [...fam, ...serve].sort((a, b) => (a.date < b.date ? 1 : -1))
})
</script>

<template>
  <section v-if="wins.length" class="card border border-success/25 bg-success/[0.03]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-success">Came back</span>
      <span class="text-[11px] text-ink-muted">cleared off your lists on the last refresh</span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ wins.length }} {{ wins.length === 1 ? 'person or family' : 'people and families' }} reconnected
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Grace watches for the return too. These were flagged, then came back on their own, so you never had to chase them. Nothing to do here, just good news.
    </p>

    <ul class="mt-3 divide-y divide-success/15">
      <li v-for="w in wins" :key="w.key" class="flex items-center gap-3 py-2">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 10l4 4 8-9" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-ink">{{ w.name }}</div>
          <div class="truncate text-[12px] text-ink-muted">{{ w.detail }}</div>
        </div>
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          :class="w.kind === 'family' ? 'bg-warn/15 text-warn' : 'bg-accent/12 text-accent'"
        >{{ w.kind === 'family' ? 'Returned' : 'Serving again' }}</span>
        <span class="w-12 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">{{ fmtDate(w.date) }}</span>
      </li>
    </ul>
  </section>
</template>
