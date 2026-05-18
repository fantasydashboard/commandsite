<script setup lang="ts">
/**
 * LiveActivityFeed — renders the LIVE header strip + auto-updating
 * event list with role chips per row. Pair with useLiveActivity to
 * supply the events + fmtAgo reactivity.
 *
 * On Today this lives inside the "Today snapshot" card as its bottom
 * half; on every sub-tab it lives at the bottom of the page scoped
 * to that tab's roles.
 */
import type { LiveEvent } from '@/composables/useLiveActivity'
import type { EmployeeRole } from '@/lib/types/employeeRole'
import AdaIcon from './AdaIcon.vue'

defineProps<{
  events: LiveEvent[]
  fmtAgo: (iso: string) => string
  /** Header copy, e.g. "Recent activity" */
  title?: string
  /** Sub-text after the title, e.g. "Ada's stream — auto-updates" */
  subtitle?: string
  /** Role lookup function — each persona passes its own catalog (apex
   *  or cornerstone). Returns undefined if key doesn't match a known
   *  role; chip render is suppressed. */
  getRole?: (key: string | undefined) => EmployeeRole | undefined
}>()
</script>

<template>
  <section class="card overflow-hidden">
    <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
        </span>
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Live</span>
        <span v-if="title" class="text-sm font-semibold text-ink">{{ title }}</span>
      </div>
      <span v-if="subtitle" class="text-[11px] text-ink-muted">{{ subtitle }}</span>
    </div>

    <TransitionGroup
      tag="ul"
      class="relative space-y-1"
      aria-live="polite"
      aria-atomic="false"
      enter-active-class="transition-[opacity,transform,background-color] duration-[280ms] ease-out-quart"
      enter-from-class="opacity-0 -translate-y-3 bg-success/15"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-opacity duration-200 ease-out-quart absolute"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <li
        v-for="ev in events"
        :key="ev.id"
        class="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors duration-200"
      >
        <AdaIcon :name="ev.icon" class="h-4 w-4 text-ink-muted flex-shrink-0 mt-1" />
        <div class="flex-1 min-w-0">
          <div class="text-sm text-ink leading-snug">{{ ev.text }}</div>
          <div class="flex items-center gap-2 mt-1">
            <span
              v-if="ev.role && getRole && getRole(ev.role)"
              class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            >{{ getRole?.(ev.role)?.name }}</span>
            <span class="text-[11px] text-ink-disabled">{{ fmtAgo(ev.at) }}</span>
          </div>
        </div>
      </li>
    </TransitionGroup>
  </section>
</template>
