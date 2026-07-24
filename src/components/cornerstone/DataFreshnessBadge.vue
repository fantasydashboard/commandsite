<script setup lang="ts">
/**
 * Focal Point - "data current through {date}" badge. For live churches this
 * reads the real sync metadata (careMeta('serving').computedAt) and shows a
 * relative "Updated Nh ago" label, with a quiet stale note if the last sync
 * is old or errored. Churches without live data (the demo) keep the baked
 * "data current through {date}" label from a single as-of source so every
 * surface reports the same freshness.
 */
import { computed } from 'vue'
import { asOfLabel } from '@/lib/clients/focal-point/dataFreshness'
import { careMeta } from '@/lib/clients/church/careDataLoader'
import { fmtAgo } from '@/lib/format'

const STALE_MS = 36 * 60 * 60 * 1000

const meta = computed(() => careMeta('serving'))
const isLive = computed(() => !!meta.value?.computedAt)
const isStale = computed(() => {
  const m = meta.value
  if (!m) return false
  if (m.status === 'error') return true
  if (!m.computedAt) return false
  return Date.now() - new Date(m.computedAt).getTime() > STALE_MS
})
const label = computed(() => {
  const m = meta.value
  if (m?.computedAt) return `Updated ${fmtAgo(m.computedAt)}`
  return `Data current through ${asOfLabel()}`
})
const hoverText = computed(() =>
  isStale.value
    ? 'Grace has not synced with Planning Center recently. Use Refresh now to pull the latest.'
    : "Grace re-checks every flag after each weekend's check-ins. When someone comes back, they clear off your lists on the next refresh.",
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
    :title="hoverText"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="isStale ? 'bg-warn' : 'bg-success'"></span>
    {{ label }}
    <span v-if="isLive && isStale" class="text-warn">· data may be stale</span>
  </span>
</template>
