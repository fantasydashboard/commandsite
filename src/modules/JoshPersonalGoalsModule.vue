<script setup lang="ts">
/**
 * Josh Personal — Goals tab.
 *
 * Goal cards with progress bars + per-goal Sage narrative explaining
 * what the data is telling her about each goal. The narrative is the
 * value-add over a vanilla goal tracker — Sage connects the goal to
 * the metrics driving it.
 */
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import { goals, goalToneClass } from '@/lib/clients/josh-personal/health'

defineProps<{ client: Client; config: Record<string, unknown> }>()

function statusLabel(status: string): string {
  if (status === 'on-track')  return 'On track'
  if (status === 'off-track') return 'Off track'
  return 'At risk'
}
function statusBadgeClass(status: string): string {
  if (status === 'on-track')  return 'bg-success/15 text-success'
  if (status === 'off-track') return 'bg-danger/15 text-danger'
  return 'bg-warn/15 text-warn'
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Goals</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          What you're working toward. Sage tracks progress against these and shapes your weekly plan around them.
        </p>
      </div>
      <button class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90">
        + Add goal
      </button>
    </div>

    <!-- Goal cards -->
    <div class="space-y-3">
      <section
        v-for="g in goals"
        :key="g.label"
        class="card p-4"
      >
        <div class="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-ink">{{ g.label }}</h3>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                :class="statusBadgeClass(g.status)"
              >
                {{ statusLabel(g.status) }}
              </span>
            </div>
            <p class="text-xs text-ink-muted mt-0.5">{{ g.detail }}</p>
          </div>
          <button class="text-xs text-brand font-medium hover:underline shrink-0">Edit</button>
        </div>

        <!-- Progress bar -->
        <div class="h-1.5 w-full bg-brand/10 rounded-full overflow-hidden mb-3">
          <div
            class="h-full rounded-full transition-all"
            :class="goalToneClass(g.status)"
            :style="{ width: `${Math.max(g.progress * 100, 4)}%` }"
          />
        </div>

        <!-- Sage narrative -->
        <div class="rounded-card bg-brand/5 border border-brand/15 p-3">
          <div class="flex items-start gap-2">
            <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">
                Sage's read
              </div>
              <p class="text-[13px] text-ink leading-relaxed">{{ g.sageNarrative }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
