<script setup lang="ts">
/**
 * Focal Point - Guest pipeline board. The front-door mirror of the Care pipeline:
 * every first-time guest walked from first visit to belonging, with a "Cooled"
 * column for the ones who signed in once and stalled. Real guests from the two
 * Starting Point workflows, tagged by congregation, so it scopes by the lens.
 * Auto-advance (return detection from check-ins) is the week-one build.
 */
import { computed } from 'vue'
import { guestPipeline, guestKpis, GUEST_STAGES, type GuestCase } from '@/lib/clients/focal-point/guestPipeline'
import { useCongregationLens } from '@/stores/congregationLens'

const lens = useCongregationLens()
const CAP = 6
const inScope = (c: GuestCase) => lens.scope === 'all' || c.campus === lens.scope
const scoped = (stage: string) => guestPipeline.cases.filter((c) => c.stage === stage && inScope(c))
const casesFor = (stage: string) => scoped(stage).slice(0, CAP)
const moreIn = (stage: string) => Math.max(0, scoped(stage).length - CAP)
const kpis = computed(() => guestKpis(lens.scope))

function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Guest pipeline</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">Where every first-time guest is on the way to belonging</h3>

    <!-- lifecycle strip -->
    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      <span class="rounded bg-brand/12 px-2 py-0.5 font-medium text-brand">New guest</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-brand/12 px-2 py-0.5 font-medium text-brand">Welcomed</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-brand/12 px-2 py-0.5 font-medium text-brand">Connecting</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-success/15 px-2 py-0.5 font-medium text-success">Belongs</span>
      <span class="ml-1 text-ink-muted">This is the front door. Care &amp; Drift is the back door. Grace watches both.</span>
    </div>

    <p class="mt-2 text-[12px] text-ink">
      <span class="font-semibold">{{ kpis.stillVisitors }} of your {{ kpis.recentGuests }}</span> most recent guests are still just visitors. This board is how you close that gap instead of hoping they come back.
    </p>
  </section>

  <section class="card">
    <div class="overflow-x-auto">
      <div class="min-w-[820px]">
        <!-- stage headers -->
        <div class="grid grid-cols-5 gap-2 border-b border-divider pb-2">
          <div
            v-for="s in GUEST_STAGES"
            :key="s.key"
            class="px-1 text-[10px] font-semibold uppercase tracking-wide"
            :class="s.positive ? 'text-success' : s.leak ? 'text-warn' : 'text-ink-muted'"
          >{{ s.label }} <span class="text-ink-disabled tabular-nums">{{ scoped(s.key).length }}</span></div>
        </div>

        <!-- cards -->
        <div class="grid grid-cols-5 gap-2 pt-2">
          <div
            v-for="s in GUEST_STAGES"
            :key="s.key"
            class="space-y-2 rounded-lg p-1"
            :class="s.positive ? 'bg-success/[0.04]' : s.leak ? 'bg-warn/[0.05]' : ''"
          >
            <article
              v-for="c in casesFor(s.key)"
              :key="c.id"
              class="rounded-lg border bg-surface-raised p-2"
              :class="s.leak ? 'border-warn/40' : 'border-divider'"
            >
              <div class="flex items-center gap-2">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{{ initials(c.name) }}</div>
                <div class="min-w-0">
                  <div class="truncate text-[12px] font-semibold leading-tight text-ink">{{ c.name }}</div>
                </div>
              </div>
              <p class="mt-1 text-[10px] leading-snug text-ink-muted">{{ c.detail }}</p>
              <p v-if="c.note" class="mt-1.5 text-[10px] leading-snug text-ink">{{ c.note }}</p>
              <div class="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-ink-disabled">
                <span class="truncate">{{ c.owner }}</span>
                <span class="shrink-0">{{ c.age }}</span>
              </div>
            </article>

            <p v-if="moreIn(s.key)" class="px-1 py-1 text-[10px] text-ink-disabled">+{{ moreIn(s.key) }} more</p>
            <p v-else-if="!scoped(s.key).length" class="px-1 py-2 text-[10px] text-ink-disabled">
              {{ s.positive ? 'graduates to Insights' : 'clear' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <p class="mt-3 text-[11px] text-ink-disabled">
      The process on your real guests. Automatic return detection (Grace sees the 2nd check-in and advances the card) is the week-one build. Guests who reach Belongs join the New Member funnel on Insights.
    </p>
  </section>
</template>
