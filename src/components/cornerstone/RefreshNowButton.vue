<script setup lang="ts">
/**
 * Refresh-now button for live churches. Triggers a Planning Center sync via
 * refreshCareData() then reloads the care/drift store in place, so the tab
 * and DataFreshnessBadge pick up the new computed_at without a page refresh.
 */
import { ref } from 'vue'
import { refreshCareData } from '@/lib/clients/church/careDataLoader'
const props = defineProps<{ slug: string }>()
const busy = ref(false)
const note = ref<string | null>(null)
async function run() {
  if (busy.value) return
  busy.value = true; note.value = null
  try { await refreshCareData(props.slug); note.value = 'Updated just now' }
  catch (e) { note.value = e instanceof Error ? e.message : 'Refresh failed' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="flex items-center gap-2">
    <button type="button" :disabled="busy" @click="run"
      class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50">
      {{ busy ? 'Refreshing...' : 'Refresh now' }}
    </button>
    <span v-if="note" class="text-[11px] text-ink-muted">{{ note }}</span>
  </div>
</template>
