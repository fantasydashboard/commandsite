<script setup lang="ts">
/**
 * Josh Personal — "Now" hero card.
 *
 * One sentence that adapts to the hour, plus 0-3 tap-chip actions.
 * Reads from personal_now_state (cached); refresh triggers Sage to
 * regenerate via the generate-now-state edge function.
 */
import { computed } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import type { NowState, NowAction } from '@/lib/clients/josh-personal/nowStateApi'

const props = defineProps<{
  state: NowState | null
  loading: boolean
  refreshing: boolean
  refreshedAgo: string
  isStale: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'action', action: NowAction): void
}>()

const timeBucketLabel = computed(() => {
  switch (props.state?.time_bucket) {
    case 'morning': return 'This morning'
    case 'midday':  return 'Midday'
    case 'evening': return 'This evening'
    case 'late':    return 'Tonight'
    default:        return 'Right now'
  }
})

function chipClasses(kind: NowAction['kind']): string {
  switch (kind) {
    case 'log_water': return 'bg-brand/10 text-brand border-brand/30 hover:bg-brand/20'
    case 'log_weight':
    case 'log_mood':  return 'bg-success/10 text-success border-success/30 hover:bg-success/20'
    case 'open_plan': return 'bg-canvas text-ink border-divider hover:border-brand hover:text-brand'
    case 'open_chat': return 'bg-canvas text-ink border-divider hover:border-brand hover:text-brand'
    default:          return 'bg-canvas text-ink border-divider'
  }
}
</script>

<template>
  <section class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden">
    <header class="px-5 py-3 border-b border-brand/20 bg-brand/10 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <AssistantMark class="h-5 w-5 text-brand" />
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          {{ timeBucketLabel }}
          <span v-if="state" class="text-ink-muted font-normal normal-case ml-1">· refreshed {{ refreshedAgo }}</span>
        </span>
        <span v-if="isStale" class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">stale</span>
      </div>
      <button
        type="button"
        class="text-[11px] text-brand font-semibold hover:underline disabled:opacity-50 inline-flex items-center gap-1"
        :disabled="refreshing"
        @click="emit('refresh')"
      >
        <span v-if="refreshing">Sage is thinking…</span>
        <span v-else>Refresh</span>
      </button>
    </header>

    <div v-if="!state && !loading && !refreshing" class="px-5 py-4">
      <p class="text-sm text-ink-muted">
        Sage hasn't generated a now-state yet. Tap refresh to get a read on where you are right now.
      </p>
    </div>

    <div v-else-if="loading" class="px-5 py-4 text-sm text-ink-muted">Loading…</div>

    <div v-else-if="state" class="px-5 py-4">
      <p class="text-base font-semibold text-ink leading-snug">{{ state.hero_text }}</p>
      <p v-if="state.secondary_text" class="text-[13px] text-ink-muted leading-snug mt-1.5">
        {{ state.secondary_text }}
      </p>
      <div v-if="state.suggested_actions.length > 0" class="flex flex-wrap gap-2 mt-3">
        <button
          v-for="(a, i) in state.suggested_actions"
          :key="i"
          type="button"
          class="rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors"
          :class="chipClasses(a.kind)"
          @click="emit('action', a)"
        >{{ a.label }}</button>
      </div>
    </div>
  </section>
</template>
