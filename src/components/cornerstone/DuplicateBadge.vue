<script setup lang="ts">
/**
 * Small inline warning shown next to a flagged person's name when they may have
 * duplicate profiles in Planning Center. The point: their check-ins could be split
 * across profiles, so the flag might be a false alarm. Full explanation is in the
 * detail drawer. Planning Center owns the actual merge.
 */
import { computed } from 'vue'
import { duplicateInfo } from '@/lib/clients/focal-point/duplicateReview'

const props = defineProps<{ name: string }>()
const dup = computed(() => duplicateInfo(props.name))
</script>

<template>
  <span
    v-if="dup"
    class="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warn align-middle"
    title="Possible duplicate profile in Planning Center. Their check-ins may be split, so this flag could be a false alarm."
  >
    <svg viewBox="0 0 16 16" class="h-2.5 w-2.5" fill="currentColor" aria-hidden="true"><path d="M8 1.5 15 14H1z" /></svg>
    possible dup
  </span>
</template>
