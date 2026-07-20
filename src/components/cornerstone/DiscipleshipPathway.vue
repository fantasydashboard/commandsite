<script setup lang="ts">
/**
 * Focal Point - Discipleship Pathway funnel.
 * Priority #1 from the intake: visibility into how people move from Starting
 * Point through membership, baptism, and into a Growth Group. Real counts
 * pulled from Planning Center Workflows + Lists (aggregate, no PII).
 */
import { pathwayStages, pathwayContext } from '@/lib/clients/focal-point/pathway'
import { useCongregationLens } from '@/stores/congregationLens'

const lens = useCongregationLens()
const top = pathwayStages[0].count
const maxCount = Math.max(...pathwayStages.map((s) => s.count))
function pctOfTop(n: number): number {
  return Math.round((n / top) * 100)
}
function barWidth(n: number): number {
  return Math.max(8, Math.round((n / maxCount) * 100))
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="eyebrow">Discipleship Pathway</span>
        <span v-if="lens.scope !== 'all'" class="rounded bg-surface-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-disabled">church-wide</span>
      </div>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">Where people are on the journey</h3>
    <p class="mt-1 text-sm text-ink-muted">
      Of everyone who has come through Starting Point,
      <span class="font-semibold text-ink">{{ pathwayContext.startingPointToMember }}%</span>
      have reached a New Member Class. The rest are the follow-up opportunity.
    </p>

    <div class="mt-4 space-y-3">
      <div v-for="(s, i) in pathwayStages" :key="s.key">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium text-ink">{{ s.label }}</span>
          <span class="shrink-0 text-xs text-ink-muted">
            {{ s.count.toLocaleString() }}
            <template v-if="i > 0"> · {{ pctOfTop(s.count) }}% of Starting Point</template>
          </span>
        </div>
        <div class="h-7 overflow-hidden rounded-lg bg-surface-elevated">
          <div
            class="h-full rounded-lg bg-brand/80 transition-all"
            :style="{ width: barWidth(s.count) + '%' }"
          ></div>
        </div>
        <p v-if="s.mark" class="mt-1 text-[11px] text-ink-muted">
          toward <span class="text-brand">{{ s.mark }}</span>
        </p>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-3">
      <div>
        <div class="text-lg font-semibold text-ink">{{ pathwayContext.startingPointToMember }}%</div>
        <div class="text-xs text-ink-muted">Starting Point reach membership</div>
      </div>
      <div>
        <div class="text-lg font-semibold text-ink">{{ pathwayContext.groupLeaders }}</div>
        <div class="text-xs text-ink-muted">Group leaders (multiplying disciplers)</div>
      </div>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-ink-muted">{{ pathwayStages[3].note }}</p>
  </section>
</template>
