<script setup lang="ts">
/**
 * Toast container — mounted once at the layout level.
 * Reads from the global useToasts composable.
 */
import { useToasts } from './useToasts'

const { toasts } = useToasts()
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      <TransitionGroup
        tag="div"
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-300 ease-out absolute"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="rounded-lg shadow-lg px-4 py-3 text-sm font-medium pointer-events-auto"
          :class="t.tone === 'success' ? 'bg-success text-white' : t.tone === 'warn' ? 'bg-warn text-white' : 'bg-brand text-white'"
        >{{ t.text }}</div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
