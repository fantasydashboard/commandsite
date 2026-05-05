<script setup lang="ts">
/**
 * Tiny "Synced from X · 4m ago" pill for read-only dashboards.
 * Conveys that the data is alive without the owner having to do
 * anything — counters the implicit "did Marcus log all this?" doubt
 * a small-business owner has when looking at a dashboard.
 */
withDefaults(
  defineProps<{
    /** Source label — "Twilio", "Stripe", "Google Reviews", etc. */
    source: string
    /** When the sync last ran (ISO). If omitted, shows "synced live". */
    syncedAt?: string
    /** Optional sync interval label — "every 5 min" */
    interval?: string
  }>(),
  { syncedAt: undefined, interval: undefined },
)

function fmtAgo(iso?: string): string {
  if (!iso) return 'live'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-ink-muted">
    <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
    <span class="font-semibold text-ink">{{ source }}</span>
    <span class="text-ink-disabled">·</span>
    <span>{{ fmtAgo(syncedAt) }}</span>
    <span v-if="interval" class="text-ink-disabled">· {{ interval }}</span>
  </span>
</template>
