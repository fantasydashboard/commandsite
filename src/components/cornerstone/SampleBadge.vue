<script setup lang="ts">
/**
 * Small "Sample" pill for demo/illustrative sections that are not yet wired
 * to a client's real data. Used on the Focal Point dashboard during setup so
 * the room can tell real (live PCO) data from representative content at a
 * glance. Pair with an isFocalPoint (or similar) v-if at the call site.
 */
withDefaults(defineProps<{ label?: string }>(), { label: 'Sample' })
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-warn align-middle"
    title="Representative sample data during setup, not this church's real records yet"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
    {{ label }}
  </span>
</template>
