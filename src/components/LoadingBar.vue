<script setup lang="ts">
/**
 * Indeterminate progress bar for any async operation that takes more
 * than ~2 seconds. CSS-only animation; no JS state needed.
 *
 * Usage:
 *   <LoadingBar v-if="loading" message="Ada reviewing 56 leads…" />
 *
 * Renders a slim brand-colored bar that slides left-to-right inside
 * a tinted track. Optional message + sub-message slot below.
 */
defineProps<{
  /** Optional one-line label shown above the bar */
  message?: string
  /** Optional dim sub-line below the bar (e.g. estimated time) */
  hint?: string
}>()
</script>

<template>
  <div class="space-y-2">
    <p v-if="message" class="text-xs font-medium text-ink">{{ message }}</p>
    <div class="relative h-1 w-full bg-brand/15 rounded-full overflow-hidden">
      <div class="loading-bar-indicator absolute inset-y-0 w-1/3 bg-brand rounded-full" />
    </div>
    <p v-if="hint" class="text-[11px] text-ink-muted italic">{{ hint }}</p>
  </div>
</template>

<style scoped>
.loading-bar-indicator {
  animation: loading-bar-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  left: -33%;
}

@keyframes loading-bar-slide {
  0% { left: -33%; }
  60% { left: 100%; }
  100% { left: 100%; }
}

/* Honor reduced-motion: drop the slide, show a steady tinted track */
@media (prefers-reduced-motion: reduce) {
  .loading-bar-indicator {
    animation: none;
    width: 100%;
    left: 0;
    opacity: 0.5;
  }
}
</style>
