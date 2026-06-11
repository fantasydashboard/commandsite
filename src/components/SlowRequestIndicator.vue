<script setup lang="ts">
/**
 * Floating "still working..." indicator. Shows when at least one request
 * has been pending for 5+ seconds. Removes the "is this frozen or just
 * slow?" anxiety by giving users visual confirmation that something IS
 * happening.
 *
 * Hard to be alarming or distracting:
 *  - Tucked into the bottom-right corner
 *  - Subtle brand-tinted background, no shake or pulse
 *  - Auto-clears the moment all pending requests resolve
 *
 * The slow-request counter lives in `requestStatus.ts` so any fetch
 * wrapper (not just Supabase) can participate.
 */
import { slowRequestCount } from '@/lib/requestStatus'
import { computed } from 'vue'

const visible = computed(() => slowRequestCount.value > 0)
const label = computed(() => {
  const n = slowRequestCount.value
  if (n <= 1) return 'Still working…'
  return `Still working… (${n} requests)`
})
</script>

<template>
  <Transition
    enter-active-class="transition-[opacity,transform] duration-300 ease-out-quart"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-[opacity,transform] duration-200 ease-out-quart"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        class="flex items-center gap-2 rounded-full bg-brand/15 border border-brand/30 px-3 py-1.5 backdrop-blur-sm shadow-sm"
      >
        <span class="relative flex h-2 w-2" aria-hidden="true">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
        </span>
        <span class="text-xs font-medium text-brand">{{ label }}</span>
      </div>
    </div>
  </Transition>
</template>
